import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { Order, OrderLine } from "@prisma/client";
import { buildCode128Barcode, buildQrCode } from "@/lib/barcode";
import { buildPickingBaseName, documentsDir, ensureStorage, makeUniqueDocumentName } from "@/lib/storage";

type PrintableOrder = Order & { lines: OrderLine[] };
type PdfOutput = { fileName: string; filePath: string };
type FontNames = { regular: string; bold: string };
export type PdfCodeType = "CODE128" | "QRCODE";

const truncate = (value: string, max: number): string => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
};

const resolveFontNames = (doc: PDFKit.PDFDocument): FontNames => {
  const windir = process.env.WINDIR ?? "C:\\Windows";
  const regularPath = path.join(windir, "Fonts", "arial.ttf");
  const boldPath = path.join(windir, "Fonts", "arialbd.ttf");

  if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
    doc.registerFont("app-regular", regularPath);
    doc.registerFont("app-bold", boldPath);
    return { regular: "app-regular", bold: "app-bold" };
  }

  return { regular: "Helvetica", bold: "Helvetica-Bold" };
};

const buildCodeImage = async (value: string, codeType: PdfCodeType): Promise<Buffer> => {
  if (codeType === "QRCODE") {
    return buildQrCode(value);
  }
  return buildCode128Barcode(value);
};

const drawOrderCard = async (
  doc: PDFKit.PDFDocument,
  fonts: FontNames,
  order: PrintableOrder,
  index: number,
  total: number,
  codeType: PdfCodeType
): Promise<void> => {
  const codeBuffer = await buildCodeImage(order.orderReference, codeType);
  const marginX = 48;
  let y = 50;

  doc.fontSize(11).fillColor("#5c6a7a").text(`Scheda ${index + 1}/${total}`, marginX, y);
  y += 20;
  doc
    .fontSize(20)
    .fillColor("#0b1834")
    .font(fonts.bold)
    .text(`Ordine: ${order.orderReference}`, marginX, y);
  y += 34;

  doc
    .fontSize(11)
    .font(fonts.regular)
    .fillColor("#1d2a42")
    .text(`Cliente: ${order.clientName ?? "-"}`, marginX, y);
  y += 18;
  doc.text(`Corriere: ${order.carrierName ?? "-"}`, marginX, y);
  y += 18;
  doc.text(`Note: ${order.notes ?? "-"}`, marginX, y, { width: 500 });
  y += 45;

  if (codeType === "QRCODE") {
    doc.image(codeBuffer, marginX, y, {
      fit: [140, 140],
      align: "left",
      valign: "top"
    });
    y += 150;
  } else {
    doc.image(codeBuffer, marginX, y, {
      width: 280,
      height: 74
    });
    y += 90;
  }

  doc
    .fontSize(10)
    .fillColor("#5c6a7a")
    .text("Prodotto", marginX, y)
    .text("Qta", 390, y)
    .text("EAN", 440, y);
  y += 12;
  doc.moveTo(marginX, y).lineTo(560, y).stroke("#a9bacf");
  y += 10;

  doc.font(fonts.regular).fontSize(10).fillColor("#0b1834");
  for (const line of order.lines) {
    const product = line.productName ?? "-";
    const ean = line.ean ?? "-";
    const startY = y;
    doc.text(product, marginX, startY, { width: 330 });
    doc.text(String(line.quantity), 390, startY, { width: 40 });
    doc.text(ean, 440, startY, { width: 120 });
    y = Math.max(doc.y, startY) + 10;
    if (y > 730) {
      doc.addPage({ size: "A4", margin: 40 });
      y = 48;
    }
  }
};

const drawCompactOrderCard = async (
  doc: PDFKit.PDFDocument,
  fonts: FontNames,
  order: PrintableOrder,
  index: number,
  total: number,
  x: number,
  y: number,
  width: number,
  height: number,
  codeType: PdfCodeType
): Promise<void> => {
  const codeBuffer = await buildCodeImage(order.orderReference, codeType);
  const pad = 8;
  const bottom = y + height;
  let cursorY = y + pad;
  const contentWidth = width - pad * 2;

  doc.roundedRect(x, y, width, height, 6).lineWidth(0.8).stroke("#c8d6ea");
  doc.font(fonts.bold).fontSize(9).fillColor("#0b1834");
  doc.text(`${index + 1}/${total} - Rif. Ordine: ${order.orderReference}`, x + pad, cursorY, { width: contentWidth });
  cursorY += 14;

  const leftWidth = Math.floor(contentWidth * 0.56);
  const gap = 6;
  const rightWidth = contentWidth - leftWidth - gap;
  const leftX = x + pad;
  const rightX = leftX + leftWidth + gap;
  let leftY = cursorY;

  doc.font(fonts.regular).fontSize(8).fillColor("#244264");
  doc.text(`Cliente: ${truncate(order.clientName ?? "-", 30)}`, leftX, leftY, { width: leftWidth });
  leftY += 11;
  doc.text(`Corriere: ${truncate(order.carrierName ?? "-", 30)}`, leftX, leftY, { width: leftWidth });
  leftY += 12;
  doc.text(`Note: ${truncate(order.notes ?? "-", 34)}`, leftX, leftY, { width: leftWidth });
  leftY += 12;

  const codeBoxHeight = 54;
  const codeY = cursorY - 2;
  if (codeType === "QRCODE") {
    const qrSize = Math.min(rightWidth, codeBoxHeight);
    doc.image(codeBuffer, rightX + Math.max(0, (rightWidth - qrSize) / 2), codeY, {
      fit: [qrSize, qrSize],
      align: "center",
      valign: "top"
    });
    cursorY = Math.max(leftY, codeY + qrSize) + 4;
  } else {
    doc.image(codeBuffer, rightX, codeY, {
      width: rightWidth,
      height: codeBoxHeight,
      fit: [rightWidth, codeBoxHeight]
    });
    cursorY = Math.max(leftY, codeY + codeBoxHeight) + 4;
  }

  doc.font(fonts.bold).fontSize(8).fillColor("#476587").text("Righe", x + pad, cursorY);
  cursorY += 9;

  doc.font(fonts.bold).fontSize(6.8).fillColor("#10253f");
  let lineIndex = 0;
  while (lineIndex < order.lines.length) {
    const line = order.lines[lineIndex];
    const text = `${line.quantity} pz. ${line.productName ?? "-"}`;
    const blockHeight = doc.heightOfString(text, { width: contentWidth });
    if (cursorY + blockHeight > bottom - 11) {
      break;
    }
    doc.text(text, x + pad, cursorY, {
      width: contentWidth
    });
    cursorY += blockHeight + 3;
    lineIndex += 1;
  }

  const remaining = order.lines.length - lineIndex;
  if (remaining > 0 && cursorY <= bottom - 10) {
    doc
      .font(fonts.bold)
      .fontSize(7)
      .fillColor("#8f2020")
      .text(
        `ATTENZIONE: ${remaining} prodotti non visualizzati. Verificare la lista prelievo merce.`,
        x + pad,
        cursorY,
        { width: contentWidth }
      );
  }
};

const writePdf = async (orders: PrintableOrder[], baseName: string, codeType: PdfCodeType): Promise<PdfOutput> => {
  ensureStorage();
  const fileName = makeUniqueDocumentName(baseName);
  const filePath = path.join(documentsDir, fileName);

  await new Promise<void>(async (resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const fonts = resolveFontNames(doc);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    try {
      for (let i = 0; i < orders.length; i += 1) {
        if (i > 0) {
          doc.addPage({ size: "A4", margin: 40 });
        }
        await drawOrderCard(doc, fonts, orders[i], i, orders.length, codeType);
      }
      doc.end();
    } catch (error) {
      reject(error);
      return;
    }

    stream.on("finish", () => resolve());
    stream.on("error", (error) => reject(error));
  });

  return { fileName, filePath };
};

const writeCompactBatchPdf = async (orders: PrintableOrder[], baseName: string, codeType: PdfCodeType): Promise<PdfOutput> => {
  ensureStorage();
  const fileName = makeUniqueDocumentName(baseName);
  const filePath = path.join(documentsDir, fileName);

  await new Promise<void>(async (resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 24 });
    const fonts = resolveFontNames(doc);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 24;
    const gap = 8;
    const columns = 2;
    const rows = 4;
    const cardW = (pageW - margin * 2 - gap) / columns;
    const cardH = (pageH - margin * 2 - gap * (rows - 1)) / rows;
    const perPage = columns * rows;

    try {
      for (let i = 0; i < orders.length; i += 1) {
        if (i > 0 && i % perPage === 0) {
          doc.addPage({ size: "A4", margin: 24 });
        }
        const slot = i % perPage;
        const row = Math.floor(slot / columns);
        const col = slot % columns;
        const x = margin + col * (cardW + gap);
        const y = margin + row * (cardH + gap);
        await drawCompactOrderCard(doc, fonts, orders[i], i, orders.length, x, y, cardW, cardH, codeType);
      }
      doc.end();
    } catch (error) {
      reject(error);
      return;
    }

    stream.on("finish", () => resolve());
    stream.on("error", (error) => reject(error));
  });

  return { fileName, filePath };
};

export const generateSingleOrderPdf = async (order: PrintableOrder, codeType: PdfCodeType = "CODE128"): Promise<PdfOutput> => {
  const baseName = buildPickingBaseName(order.carrierName ?? "CORRIERE_SCONOSCIUTO");
  return writePdf([order], baseName, codeType);
};

export const generateBatchPdf = async (orders: PrintableOrder[], batchId: string, codeType: PdfCodeType = "CODE128"): Promise<PdfOutput> => {
  const carriers = [...new Set(orders.map((o) => (o.carrierName ?? "").trim()).filter((x) => x.length > 0))];
  const carrierName = carriers.length === 1 ? carriers[0] : "MULTI_CORRIERE";
  const baseName = buildPickingBaseName(carrierName);
  return writeCompactBatchPdf(orders, baseName, codeType);
};
