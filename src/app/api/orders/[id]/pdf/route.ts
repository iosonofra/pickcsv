import { NextResponse } from "next/server";
import { ensureDbSchema, prisma } from "@/lib/db";
import type { PdfCodeType } from "@/lib/pdf";
import { generateSingleOrderPdf } from "@/lib/pdf";

export const runtime = "nodejs";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, { params }: Params) {
  await ensureDbSchema();
  const order = await prisma.order.findUnique({
    where: { id: params.id },
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

  const { fileName, filePath } = await generateSingleOrderPdf(order, codeType);

  const doc = await prisma.generatedDocument.create({
    data: {
      type: "SINGLE",
      orderId: order.id,
      batchId: order.batchId,
      fileName,
      filePath
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
