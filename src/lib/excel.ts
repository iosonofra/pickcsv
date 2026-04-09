import * as XLSX from "xlsx";
import { ParsedOrderGroup, ParsedWorkbookResult } from "@/lib/types";
import iconv from "iconv-lite";

const HEADER_KEYS = {
  orderReference: "riferimento ordine",
  clientName: "cliente",
  firstNameShipping: "nome cliente (spedizione)",
  lastNameShipping: "cognome cliente (spedizione)",
  productName: "nome del prodotto",
  quantity: "quantita del prodotto",
  notes: "note",
  ean: "ean",
  carrierName: "nome corriere",
  productId: "id prodotto"
} as const;

const normalizeHeader = (value: unknown): string => {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const asString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const asQuantity = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
};

const parseSemicolonCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ";" && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((value) => value.trim());
};

const parseCsvMatrix = (buffer: Buffer): (string | number | null)[][] => {
  const utf8 = iconv.decode(buffer, "utf8");
  const latin1 = iconv.decode(buffer, "latin1");
  const rawText = utf8.includes("\uFFFD") ? latin1 : utf8;
  const lines = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  return lines.map((line) => parseSemicolonCsvLine(line));
};

const parseWorkbookMatrix = (buffer: Buffer): (string | number | null)[][] => {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Nessun foglio trovato nel file Excel.");
  }
  return XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: null
  });
};

const buildParsedOrders = (matrix: (string | number | null)[][], sourceType: "xlsx" | "csv"): ParsedWorkbookResult => {
  if (matrix.length < 2) {
    return {
      totalRows: 0,
      skippedRows: 0,
      duplicateRows: 0,
      orders: [],
      errors: []
    };
  }

  const headers = matrix[0].map((cell) => normalizeHeader(cell));
  const indexByKey = {
    orderReference: headers.indexOf(HEADER_KEYS.orderReference),
    clientName: headers.indexOf(HEADER_KEYS.clientName),
    firstNameShipping: headers.indexOf(HEADER_KEYS.firstNameShipping),
    lastNameShipping: headers.indexOf(HEADER_KEYS.lastNameShipping),
    productName: headers.indexOf(HEADER_KEYS.productName),
    quantity: headers.indexOf(HEADER_KEYS.quantity),
    notes: headers.indexOf(HEADER_KEYS.notes),
    ean: headers.indexOf(HEADER_KEYS.ean),
    carrierName: headers.indexOf(HEADER_KEYS.carrierName),
    productId: headers.indexOf(HEADER_KEYS.productId)
  };

  if (indexByKey.orderReference === -1) {
    throw new Error("Colonna obbligatoria mancante: Riferimento ordine");
  }

  const groups = new Map<string, ParsedOrderGroup>();
  const signatures = new Set<string>();
  const errors: ParsedWorkbookResult["errors"] = [];

  let skippedRows = 0;
  let duplicateRows = 0;
  let lastOrderReference: string | undefined;
  let lastClientName: string | undefined;
  let lastCarrierName: string | undefined;

  for (let i = 1; i < matrix.length; i += 1) {
    const row = matrix[i];
    const rowNumber = i + 1;

    const rawOrderReference = asString(row[indexByKey.orderReference]);
    const rawClientName = indexByKey.clientName >= 0 ? asString(row[indexByKey.clientName]) : undefined;
    const firstNameShipping =
      indexByKey.firstNameShipping >= 0 ? asString(row[indexByKey.firstNameShipping]) : undefined;
    const lastNameShipping =
      indexByKey.lastNameShipping >= 0 ? asString(row[indexByKey.lastNameShipping]) : undefined;
    const csvCombinedClient =
      sourceType === "csv"
        ? asString([firstNameShipping, lastNameShipping].filter(Boolean).join(" ").trim())
        : undefined;
    const rawCarrierName =
      indexByKey.carrierName >= 0 ? asString(row[indexByKey.carrierName]) : undefined;
    const note = indexByKey.notes >= 0 ? asString(row[indexByKey.notes]) : undefined;
    const productName =
      indexByKey.productName >= 0 ? asString(row[indexByKey.productName]) : undefined;
    const quantity = indexByKey.quantity >= 0 ? asQuantity(row[indexByKey.quantity]) : sourceType === "csv" && productName ? 1 : 0;
    const ean = indexByKey.ean >= 0 ? asString(row[indexByKey.ean]) : undefined;
    const productId = indexByKey.productId >= 0 ? asString(row[indexByKey.productId]) : undefined;

    const hasLineData = Boolean(productName || quantity > 0 || ean || productId || note);

    let orderReference = rawOrderReference;
    let clientName = rawClientName ?? csvCombinedClient;
    let carrierName = sourceType === "csv" ? undefined : rawCarrierName;

    // Supporta righe "accorpate" in Excel: se il riferimento ordine e vuoto
    // ma la riga contiene dati prodotto, eredita il riferimento precedente.
    if (!orderReference && hasLineData && lastOrderReference) {
      orderReference = lastOrderReference;
      clientName = clientName ?? lastClientName;
      carrierName = carrierName ?? lastCarrierName;
    }

    if (!orderReference) {
      skippedRows += 1;
      errors.push({
        rowNumber,
        message: "Riga scartata: Riferimento ordine mancante",
        rawData: JSON.stringify(row)
      });
      continue;
    }

    lastOrderReference = orderReference;
    if (clientName) {
      lastClientName = clientName;
    }
    if (carrierName) {
      lastCarrierName = carrierName;
    }

    const signature = [
      orderReference.toLowerCase(),
      (productName ?? "").toLowerCase(),
      quantity,
      (ean ?? "").toLowerCase(),
      (productId ?? "").toLowerCase(),
      (note ?? "").toLowerCase()
    ].join("|");

    if (signatures.has(signature)) {
      duplicateRows += 1;
      errors.push({
        rowNumber,
        message: "Riga duplicata nello stesso import",
        rawData: JSON.stringify(row)
      });
      continue;
    }
    signatures.add(signature);

    const current =
      groups.get(orderReference) ??
      ({
        orderReference,
        clientName,
        carrierName,
        notes: [],
        lines: []
      } satisfies ParsedOrderGroup);

    if (!current.clientName && clientName) {
      current.clientName = clientName;
    }
    if (!current.carrierName && carrierName) {
      current.carrierName = carrierName;
    }
    if (note && !current.notes.includes(note)) {
      current.notes.push(note);
    }

    current.lines.push({
      productName,
      quantity,
      note,
      ean,
      productId,
      signature
    });
    groups.set(orderReference, current);
  }

  return {
    totalRows: Math.max(0, matrix.length - 1),
    skippedRows,
    duplicateRows,
    orders: [...groups.values()],
    errors
  };
};

export const parseOrdersWorkbook = (buffer: Buffer): ParsedWorkbookResult => {
  return buildParsedOrders(parseWorkbookMatrix(buffer), "xlsx");
};

export const parseOrdersFile = (fileName: string, buffer: Buffer): ParsedWorkbookResult => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) {
    return buildParsedOrders(parseCsvMatrix(buffer), "csv");
  }
  return buildParsedOrders(parseWorkbookMatrix(buffer), "xlsx");
};
