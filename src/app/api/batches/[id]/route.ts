import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ensureDbSchema, prisma } from "@/lib/db";
import { deleteDocumentsByIds, getBatchRelatedDocumentIds } from "@/lib/cleanup";

export const runtime = "nodejs";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Params) {
  await ensureDbSchema();
  const batch = await prisma.importBatch.findUnique({
    where: { id: params.id },
    include: {
      errors: {
        orderBy: {
          rowNumber: "asc"
        },
        take: 500
      },
      _count: {
        select: {
          orders: true,
          errors: true
        }
      }
    }
  });

  if (!batch) {
    return NextResponse.json({ error: "Batch non trovato" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}

export async function DELETE(_: Request, { params }: Params) {
  await ensureDbSchema();

  const batch = await prisma.importBatch.findUnique({
    where: { id: params.id },
    select: { id: true }
  });
  if (!batch) {
    return NextResponse.json({ error: "Batch non trovato" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const docIds = await getBatchRelatedDocumentIds(tx, [params.id]);
    const deletedFiles = await deleteDocumentsByIds(tx, docIds);
    await tx.importBatch.delete({ where: { id: params.id } });
    return { deletedFiles, deletedDocuments: docIds.length };
  });

  return NextResponse.json({
    deleted: 1,
    deletedDocuments: result.deletedDocuments,
    deletedFiles: result.deletedFiles
  });
}
