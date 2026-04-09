import fs from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";

type TxClient = Prisma.TransactionClient | PrismaClient;

const tryDeleteFile = async (filePath: string): Promise<void> => {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
};

export const deleteDocumentsByIds = async (tx: TxClient, documentIds: string[]): Promise<number> => {
  if (documentIds.length === 0) {
    return 0;
  }

  const docs = await tx.generatedDocument.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, filePath: true }
  });

  let deletedFiles = 0;
  for (const doc of docs) {
    const references = await tx.generatedDocument.count({
      where: {
        filePath: doc.filePath,
        id: { not: doc.id }
      }
    });
    if (references === 0) {
      await tryDeleteFile(doc.filePath);
      deletedFiles += 1;
    }
  }

  await tx.generatedDocument.deleteMany({
    where: { id: { in: docs.map((d) => d.id) } }
  });

  return deletedFiles;
};

export const getOrderRelatedDocumentIds = async (tx: TxClient, orderIds: string[]): Promise<string[]> => {
  if (orderIds.length === 0) {
    return [];
  }
  const docs = await tx.generatedDocument.findMany({
    where: {
      orderId: { in: orderIds }
    },
    select: { id: true }
  });
  return docs.map((d) => d.id);
};

export const getBatchRelatedDocumentIds = async (tx: TxClient, batchIds: string[]): Promise<string[]> => {
  if (batchIds.length === 0) {
    return [];
  }

  const orders = await tx.order.findMany({
    where: { batchId: { in: batchIds } },
    select: { id: true }
  });
  const orderIds = orders.map((o) => o.id);

  const docs = await tx.generatedDocument.findMany({
    where: {
      OR: [
        { batchId: { in: batchIds } },
        ...(orderIds.length > 0 ? [{ orderId: { in: orderIds } }] : [])
      ]
    },
    select: { id: true }
  });

  return [...new Set(docs.map((d) => d.id))];
};
