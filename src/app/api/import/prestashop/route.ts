import { NextResponse } from "next/server";
import { prisma, ensureDbSchema } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

// Helper to fetch from PrestaShop API with basic auth and JSON output
async function fetchPrestaShop(url: string, apiKey: string) {
  const authHeader = "Basic " + Buffer.from(apiKey + ":").toString("base64");
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": authHeader,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    // Set a reasonable timeout
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`PrestaShop API returned HTTP ${response.status}`);
  }

  return response.json();
}

type OrderRow = {
  id: string;
  product_id: string;
  product_attribute_id: string;
  product_quantity: string | number;
  product_name: string;
  product_reference: string;
  product_ean13?: string;
};

// Helper to fetch product or combination EAN code as fallback
async function fetchProductEan(baseDomain: string, apiKey: string, productId: string, productAttributeId?: string): Promise<string | undefined> {
  // If productAttributeId is present and not '0', check combination first
  if (productAttributeId && productAttributeId !== "0" && productAttributeId !== "") {
    try {
      const combUrl = `${baseDomain}/api/combinations/${productAttributeId}?output_format=JSON`;
      const combRes = await fetchPrestaShop(combUrl, apiKey);
      if (combRes?.combination?.ean13 && String(combRes.combination.ean13).trim() !== "" && String(combRes.combination.ean13).trim() !== "0") {
        return String(combRes.combination.ean13).trim();
      }
    } catch (err) {
      console.error(`[PrestaShop] Errore lookup combinazione ${productAttributeId}:`, err);
    }
  }

  // Check product
  if (productId && productId !== "0" && productId !== "") {
    try {
      const prodUrl = `${baseDomain}/api/products/${productId}?output_format=JSON`;
      const prodRes = await fetchPrestaShop(prodUrl, apiKey);
      if (prodRes?.product?.ean13 && String(prodRes.product.ean13).trim() !== "" && String(prodRes.product.ean13).trim() !== "0") {
        return String(prodRes.product.ean13).trim();
      }
    } catch (err) {
      console.error(`[PrestaShop] Errore lookup prodotto ${productId}:`, err);
    }
  }

  return undefined;
}

// Helper to extract and prepare full order details from PrestaShop API response
async function prepareOrderDetails(orderData: any, baseDomain: string, apiKey: string) {
  // 1. Fetch Delivery Address for clientName
  let clientName = "Cliente Prestashop";
  if (orderData.id_address_delivery && orderData.id_address_delivery !== "0" && orderData.id_address_delivery !== "") {
    try {
      const addrUrl = `${baseDomain}/api/addresses/${orderData.id_address_delivery}?output_format=JSON`;
      const addrRes = await fetchPrestaShop(addrUrl, apiKey);
      if (addrRes?.address) {
        const addr = addrRes.address;
        const nameParts = [addr.company, addr.firstname, addr.lastname].filter(Boolean).map(s => String(s).trim());
        if (nameParts.length > 0) {
          clientName = nameParts.join(" ");
        }
      }
    } catch (addrErr) {
      console.error(`[Prestashop] Errore lookup indirizzo ${orderData.id_address_delivery}:`, addrErr);
    }
  }

  // 2. Fetch Customer info for customerNote
  let customerNote: string | null = null;
  if (orderData.id_customer && orderData.id_customer !== "0" && orderData.id_customer !== "") {
    try {
      const custUrl = `${baseDomain}/api/customers/${orderData.id_customer}?output_format=JSON`;
      const custRes = await fetchPrestaShop(custUrl, apiKey);
      if (custRes?.customer) {
        const cust = custRes.customer;
        if (cust.note && String(cust.note).trim() !== "" && String(cust.note).trim() !== "0") {
          customerNote = String(cust.note).trim();
        }
        if (clientName === "Cliente Prestashop") {
          const nameParts = [cust.company, cust.firstname, cust.lastname].filter(Boolean).map(s => String(s).trim());
          if (nameParts.length > 0) {
            clientName = nameParts.join(" ");
          }
        }
      }
    } catch (custErr) {
      console.error(`[Prestashop] Errore lookup cliente ${orderData.id_customer}:`, custErr);
    }
  }

  // 3. Fetch Carrier name
  let carrierName = "Corriere Prestashop";
  if (orderData.id_carrier) {
    try {
      const carrUrl = `${baseDomain}/api/carriers/${orderData.id_carrier}?output_format=JSON`;
      const carrRes = await fetchPrestaShop(carrUrl, apiKey);
      if (carrRes?.carrier?.name) {
        carrierName = String(carrRes.carrier.name).trim();
      }
    } catch (carrErr) {
      console.error(`[Prestashop] Errore lookup corriere ${orderData.id_carrier}:`, carrErr);
    }
  }

  // 4. Parse order rows
  const rawRows = orderData.associations?.order_rows?.order_row ?? orderData.associations?.order_rows ?? [];
  const rowsList: OrderRow[] = Array.isArray(rawRows) ? rawRows : [rawRows];

  const lines: any[] = [];
  for (const row of rowsList) {
    const qty = typeof row.product_quantity === "number" 
      ? row.product_quantity 
      : parseInt(String(row.product_quantity || "1"), 10) || 1;

    let ean = row.product_ean13 && String(row.product_ean13).trim() !== "" && String(row.product_ean13).trim() !== "0"
      ? String(row.product_ean13).trim() 
      : undefined;

    if (!ean) {
      ean = await fetchProductEan(baseDomain, apiKey, String(row.product_id), String(row.product_attribute_id));
    }

    lines.push({
      productName: row.product_name || `Prodotto ID: ${row.product_id}`,
      quantity: Math.max(1, qty),
      ean: ean,
      productId: row.product_id ? String(row.product_id) : undefined,
      note: row.product_reference ? `Rif: ${row.product_reference}` : undefined
    });
  }

  const privateNote = orderData.note && String(orderData.note).trim() !== "" ? String(orderData.note).trim() : null;

  return {
    id: String(orderData.id),
    reference: orderData.reference || `PS-#${orderData.id}`,
    clientName,
    carrierName,
    customerNote,
    privateNote,
    lines
  };
}

function formatBatchSourceName() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const timeStr = now.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `PrestaShop Import (${dateStr} ${timeStr})`;
}

export async function POST(req: Request) {
  await ensureDbSchema();
  try {
    const body = await req.json();
    const { action, query, queries, customNote, orders } = body as {
      action?: "search" | "import";
      query?: string;
      queries?: string[];
      customNote?: string;
      orders?: any[];
    };

    // Load Prestashop config
    const urlSetting = await prisma.appSetting.findUnique({
      where: { key: "prestashop_url" }
    });
    const keySetting = await prisma.appSetting.findUnique({
      where: { key: "prestashop_api_key" }
    });

    if (!urlSetting?.value || !keySetting?.value) {
      return NextResponse.json(
        { error: "PrestaShop non è configurato. Inserisci URL e chiave API nelle Impostazioni dell'app." },
        { status: 400 }
      );
    }

    // Normalize URL
    let baseDomain = urlSetting.value.trim().replace(/\/+$/, "");
    if (baseDomain.toLowerCase().endsWith("/api")) {
      baseDomain = baseDomain.slice(0, -4).replace(/\/+$/, "");
    }
    
    const apiKey = decrypt(keySetting.value);

    // ACTION: SEARCH
    if (action === "search") {
      const searchTerm = query?.trim();
      if (!searchTerm) {
        return NextResponse.json({ error: "Inserisci un ID o Riferimento ordine valido" }, { status: 400 });
      }

      // Split by comma in case of batch paste
      const searchTerms = searchTerm.split(",").map(s => s.trim()).filter(Boolean);
      const results: any[] = [];
      const notFound: string[] = [];

      for (const term of searchTerms) {
        try {
          let orderData: any = null;

          // 1. Try numeric lookup first if it looks like an ID
          const isNumericId = /^\d+$/.test(term);
          if (isNumericId) {
            const url = `${baseDomain}/api/orders/${term}?output_format=JSON`;
            const res = await fetchPrestaShop(url, apiKey);
            if (res?.order) {
              orderData = res.order;
            }
          }

          // 2. Search by reference
          if (!orderData) {
            const url = `${baseDomain}/api/orders?filter[reference]=[${term}]&display=full&output_format=JSON`;
            const res = await fetchPrestaShop(url, apiKey);
            
            let list: any[] = [];
            if (res?.orders) {
              if (Array.isArray(res.orders)) {
                list = res.orders;
              } else if (typeof res.orders === "object") {
                if (res.orders.order) {
                  list = Array.isArray(res.orders.order) ? res.orders.order : [res.orders.order];
                } else {
                  list = [res.orders];
                }
              }
            }
            
            if (list.length > 0) {
              orderData = list[0];
            }
          }

          if (orderData) {
            const detailed = await prepareOrderDetails(orderData, baseDomain, apiKey);
            results.push(detailed);
          } else {
            notFound.push(term);
          }
        } catch (err) {
          console.error(`Errore ricerca per "${term}":`, err);
          notFound.push(term);
        }
      }

      return NextResponse.json({
        success: true,
        orders: results,
        failedQueries: notFound
      });
    }

    // ACTION: IMPORT
    if (action === "import") {
      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        return NextResponse.json({ error: "Nessun ordine fornito per l'importazione" }, { status: 400 });
      }

      const totalLinesCount = orders.reduce((acc, curr) => acc + (curr.lines?.length || 0), 0);

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const batch = await tx.importBatch.create({
          data: {
            sourceFile: formatBatchSourceName(),
            importSource: "prestashop",
            totalRows: totalLinesCount,
            skippedRows: 0,
            duplicateRows: 0
          }
        });

        for (const group of orders) {
          const order = await tx.order.create({
            data: {
              batchId: batch.id,
              orderReference: group.orderReference,
              clientName: group.clientName,
              carrierName: group.carrierName,
              notes: group.notes || null,
              barcodeValue: group.orderReference
            }
          });

          if (group.lines && group.lines.length > 0) {
            await tx.orderLine.createMany({
              data: group.lines.map((line: any) => ({
                orderId: order.id,
                productName: line.productName,
                quantity: line.quantity,
                note: line.note,
                ean: line.ean,
                productId: line.productId
              }))
            });
          }
        }

        const createdOrders = await tx.order.findMany({
          where: { batchId: batch.id },
          include: { lines: true }
        });

        return { batch, createdOrders };
      });

      return NextResponse.json({
        success: true,
        batch: result.batch,
        ordersCount: result.createdOrders.length,
        errorsCount: 0,
        failedQueries: []
      });
    }

    // FALLBACK: Backward compatibility with direct import
    if (queries && Array.isArray(queries) && queries.length > 0) {
      const importedOrders: any[] = [];
      const importErrors: { query: string; message: string }[] = [];

      for (const rawQuery of queries) {
        const term = rawQuery.trim();
        if (!term) continue;

        try {
          let orderData: any = null;
          const isNumericId = /^\d+$/.test(term);
          if (isNumericId) {
            const url = `${baseDomain}/api/orders/${term}?output_format=JSON`;
            const res = await fetchPrestaShop(url, apiKey);
            if (res?.order) {
              orderData = res.order;
            }
          }

          if (!orderData) {
            const url = `${baseDomain}/api/orders?filter[reference]=[${term}]&display=full&output_format=JSON`;
            const res = await fetchPrestaShop(url, apiKey);
            
            let list: any[] = [];
            if (res?.orders) {
              if (Array.isArray(res.orders)) {
                list = res.orders;
              } else if (typeof res.orders === "object") {
                if (res.orders.order) {
                  list = Array.isArray(res.orders.order) ? res.orders.order : [res.orders.order];
                } else {
                  list = [res.orders];
                }
              }
            }
            if (list.length > 0) {
              orderData = list[0];
            }
          }

          if (!orderData) {
            importErrors.push({ query: term, message: `Ordine non trovato su Prestashop per "${term}"` });
            continue;
          }

          const detailed = await prepareOrderDetails(orderData, baseDomain, apiKey);
          
          // Rebuild notes for direct import
          const notesParts: string[] = [];
          if (detailed.customerNote) {
            notesParts.push(detailed.customerNote);
          }
          if (detailed.privateNote) {
            notesParts.push(detailed.privateNote);
          }
          if (customNote && customNote.trim() !== "") {
            notesParts.push(customNote.trim());
          }

          importedOrders.push({
            orderReference: detailed.reference,
            clientName: detailed.clientName,
            carrierName: detailed.carrierName,
            notes: notesParts.join(" | ") || null,
            lines: detailed.lines
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Errore sconosciuto";
          importErrors.push({ query: term, message: `Errore chiamata Prestashop: ${errorMsg}` });
        }
      }

      const failedQueries = importErrors.map((err) => err.query);

      if (importedOrders.length === 0) {
        return NextResponse.json({
          success: false,
          error: "Nessun ordine importato. Verifica gli ID/Riferimenti forniti.",
          errors: importErrors,
          failedQueries
        }, { status: 400 });
      }

      const totalLinesCount = importedOrders.reduce((acc, curr) => acc + curr.lines.length, 0);

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const batch = await tx.importBatch.create({
          data: {
            sourceFile: formatBatchSourceName(),
            importSource: "prestashop",
            totalRows: totalLinesCount,
            skippedRows: importErrors.length,
            duplicateRows: 0
          }
        });

        for (const group of importedOrders) {
          const order = await tx.order.create({
            data: {
              batchId: batch.id,
              orderReference: group.orderReference,
              clientName: group.clientName,
              carrierName: group.carrierName,
              notes: group.notes,
              barcodeValue: group.orderReference
            }
          });

          if (group.lines.length > 0) {
            await tx.orderLine.createMany({
              data: group.lines.map((line: any) => ({
                orderId: order.id,
                productName: line.productName,
                quantity: line.quantity,
                note: line.note,
                ean: line.ean,
                productId: line.productId
              }))
            });
          }
        }

        if (importErrors.length > 0) {
          await tx.importError.createMany({
            data: importErrors.map((err, index) => ({
              batchId: batch.id,
              rowNumber: index + 1,
              message: err.message,
              rawData: JSON.stringify({ query: err.query })
            }))
          });
        }

        const createdOrders = await tx.order.findMany({
          where: { batchId: batch.id },
          include: { lines: true }
        });

        return { batch, createdOrders };
      });

      return NextResponse.json({
        success: true,
        batch: result.batch,
        ordersCount: result.createdOrders.length,
        errorsCount: importErrors.length,
        failedQueries
      });
    }

    return NextResponse.json({ error: "Azione non valida o parametri mancanti" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Errore interno durante l'importazione Prestashop";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
