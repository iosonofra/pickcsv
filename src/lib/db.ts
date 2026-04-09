import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

let schemaReadyPromise: Promise<void> | null = null;

const ensureSqliteSchemaInternal = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ImportBatch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sourceFile" TEXT NOT NULL,
      "totalRows" INTEGER NOT NULL DEFAULT 0,
      "skippedRows" INTEGER NOT NULL DEFAULT 0,
      "duplicateRows" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Order" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "batchId" TEXT NOT NULL,
      "orderReference" TEXT NOT NULL,
      "clientName" TEXT,
      "carrierName" TEXT,
      "notes" TEXT,
      "barcodeValue" TEXT NOT NULL,
      "isPrinted" INTEGER NOT NULL DEFAULT 0,
      "printedCount" INTEGER NOT NULL DEFAULT 0,
      "lastPrintedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Order_batchId_fkey"
        FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OrderLine" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "productName" TEXT,
      "quantity" INTEGER NOT NULL DEFAULT 0,
      "note" TEXT,
      "ean" TEXT,
      "productId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OrderLine_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ImportError" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "batchId" TEXT NOT NULL,
      "rowNumber" INTEGER NOT NULL,
      "message" TEXT NOT NULL,
      "rawData" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ImportError_batchId_fkey"
        FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GeneratedDocument" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "batchId" TEXT,
      "orderId" TEXT,
      "fileName" TEXT NOT NULL,
      "filePath" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GeneratedDocument_batchId_fkey"
        FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "GeneratedDocument_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Order_batchId_orderReference_key" ON "Order"("batchId", "orderReference")`
  );
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Order_orderReference_idx" ON "Order"("orderReference")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Order_clientName_idx" ON "Order"("clientName")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Order_carrierName_idx" ON "Order"("carrierName")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt")`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GeneratedDocument_type_idx" ON "GeneratedDocument"("type")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GeneratedDocument_createdAt_idx" ON "GeneratedDocument"("createdAt")`
  );
};

export const ensureDbSchema = async (): Promise<void> => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureSqliteSchemaInternal();
  }
  await schemaReadyPromise;
};
