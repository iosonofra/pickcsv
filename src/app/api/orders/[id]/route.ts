import { NextResponse } from "next/server";
import { ensureDbSchema, prisma } from "@/lib/db";
import { deleteDocumentsByIds, getOrderRelatedDocumentIds } from "@/lib/cleanup";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  await ensureDbSchema();
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      batch: true,
      lines: true,
      documents: {
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!order) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  return NextResponse.json({ order });
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  await ensureDbSchema();

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!order) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const docIds = await getOrderRelatedDocumentIds(tx, [id]);
    const deletedFiles = await deleteDocumentsByIds(tx, docIds);
    await tx.order.delete({ where: { id } });
    return { deletedFiles, deletedDocuments: docIds.length };
  });

  return NextResponse.json({
    deleted: 1,
    deletedDocuments: result.deletedDocuments,
    deletedFiles: result.deletedFiles
  });
}
