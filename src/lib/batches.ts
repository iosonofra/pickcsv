import { ensureDbSchema, prisma } from "@/lib/db";

export type BatchScope = "recent" | "history";

export const listBatchesWithPrintStatus = async (scope: BatchScope) => {
  await ensureDbSchema();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where =
    scope === "history"
      ? {
          createdAt: { lt: cutoff }
        }
      : {
          createdAt: { gte: cutoff }
        };

  const batches = await prisma.importBatch.findMany({
    where,
    orderBy: {
      createdAt: "desc"
    },
    include: {
      _count: {
        select: {
          orders: true,
          errors: true
        }
      }
    },
    take: scope === "history" ? 500 : 50
  });

  if (batches.length === 0) {
    return [];
  }

  const batchIds = batches.map((b) => b.id);
  const printDocs = await prisma.generatedDocument.groupBy({
    by: ["batchId"],
    where: {
      type: "BATCH",
      batchId: {
        in: batchIds
      }
    },
    _count: {
      _all: true
    },
    _max: {
      createdAt: true
    }
  });

  const metaByBatch = new Map<string, { count: number; lastPrintedAt: Date | null }>();
  for (const item of printDocs) {
    if (!item.batchId) {
      continue;
    }
    metaByBatch.set(item.batchId, {
      count: item._count._all,
      lastPrintedAt: item._max.createdAt ?? null
    });
  }

  return batches.map((batch) => {
    const meta = metaByBatch.get(batch.id);
    return {
      ...batch,
      batchPrintCount: meta?.count ?? 0,
      batchLastPrintedAt: meta?.lastPrintedAt ?? null
    };
  });
};
