import fs from "node:fs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDbSchema, prisma } from "@/lib/db";
import type { PdfCodeType } from "@/lib/pdf";
import { generateBatchPdf } from "@/lib/pdf";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    batchId: z.string().optional(),
    orderIds: z.array(z.string()).optional(),
    codeType: z.enum(["CODE128", "QRCODE"]).optional()
  })
  .refine((value) => Boolean(value.batchId) || Boolean(value.orderIds?.length), {
    message: "Invia batchId oppure orderIds"
  });

export async function POST(req: Request) {
  await ensureDbSchema();
  try {
    const payload = bodySchema.parse(await req.json());
    const where = payload.orderIds?.length
      ? { id: { in: payload.orderIds } }
      : { batchId: payload.batchId };

    const orders = await prisma.order.findMany({
      where,
      include: {
        lines: true
      },
      orderBy: {
        orderReference: "asc"
      }
    });

    if (orders.length === 0) {
      return NextResponse.json({ error: "Nessun ordine trovato per il batch richiesto" }, { status: 404 });
    }

    const batchId = payload.batchId ?? orders[0].batchId;
    const codeType = (payload.codeType ?? "CODE128") as PdfCodeType;

    // Check if batch is cached (only cache when a full batch is requested, not custom orderIds list)
    if (payload.batchId) {
      const cachedDoc = await prisma.generatedDocument.findFirst({
        where: {
          batchId: payload.batchId,
          type: "BATCH",
          codeType: codeType
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      if (cachedDoc && fs.existsSync(cachedDoc.filePath)) {
        return NextResponse.json({
          documentId: cachedDoc.id,
          fileName: cachedDoc.fileName,
          downloadUrl: `/api/documents/${cachedDoc.id}/download`,
          orderCount: orders.length,
          cached: true
        });
      }
    }

    const { fileName, filePath } = await generateBatchPdf(orders, batchId, codeType);
    const created = await prisma.generatedDocument.create({
      data: {
        type: "BATCH",
        batchId,
        fileName,
        filePath,
        codeType
      }
    });

    return NextResponse.json({
      documentId: created.id,
      fileName: created.fileName,
      downloadUrl: `/api/documents/${created.id}/download`,
      orderCount: orders.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore generazione PDF batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
