import fs from "node:fs";
import { NextResponse } from "next/server";
import { ensureDbSchema, prisma } from "@/lib/db";
import type { PdfCodeType } from "@/lib/pdf";
import { generateSingleOrderPdf } from "@/lib/pdf";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  await ensureDbSchema();
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      lines: true
    }
  });

  if (!order) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  let codeType: PdfCodeType = "CODE128";
  try {
    const payload = (await req.json()) as { codeType?: PdfCodeType };
    if (payload?.codeType === "QRCODE") {
      codeType = "QRCODE";
    }
  } catch {
    void 0;
  }

  // Check if a document is already cached on disk and in database
  const cachedDoc = await prisma.generatedDocument.findFirst({
    where: {
      orderId: order.id,
      type: "SINGLE",
      codeType: codeType
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (cachedDoc && fs.existsSync(cachedDoc.filePath)) {
    // Increment printed count of the order
    await prisma.order.update({
      where: { id: order.id },
      data: {
        isPrinted: true,
        printedCount: { increment: 1 },
        lastPrintedAt: new Date()
      }
    });

    return NextResponse.json({
      documentId: cachedDoc.id,
      fileName: cachedDoc.fileName,
      downloadUrl: `/api/documents/${cachedDoc.id}/download`,
      cached: true
    });
  }

  const { fileName, filePath } = await generateSingleOrderPdf(order, codeType);

  const doc = await prisma.generatedDocument.create({
    data: {
      type: "SINGLE",
      orderId: order.id,
      batchId: order.batchId,
      fileName,
      filePath,
      codeType
    }
  });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      isPrinted: true,
      printedCount: { increment: 1 },
      lastPrintedAt: new Date()
    }
  });

  return NextResponse.json({
    documentId: doc.id,
    fileName: doc.fileName,
    downloadUrl: `/api/documents/${doc.id}/download`
  });
}
