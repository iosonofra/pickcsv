import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDbSchema, prisma } from "@/lib/db";
import { deleteDocumentsByIds, getBatchRelatedDocumentIds } from "@/lib/cleanup";

export const runtime = "nodejs";

const bodySchema = z.object({
  ids: z.array(z.string()).min(1, "Seleziona almeno un batch")
});

export async function POST(req: Request) {
  await ensureDbSchema();

  try {
    const payload = bodySchema.parse(await req.json());
    const ids = [...new Set(payload.ids)];

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.importBatch.findMany({
        where: { id: { in: ids } },
        select: { id: true }
      });
      const existingIds = existing.map((b) => b.id);
      const docIds = await getBatchRelatedDocumentIds(tx, existingIds);
      const deletedFiles = await deleteDocumentsByIds(tx, docIds);
      const deletedBatches = await tx.importBatch.deleteMany({
        where: { id: { in: existingIds } }
      });
      return {
        deletedBatches: deletedBatches.count,
        deletedDocuments: docIds.length,
        deletedFiles
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore cancellazione massiva batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
