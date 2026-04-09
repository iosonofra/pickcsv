import { Prisma } from "@prisma/client";
import { ensureDbSchema, prisma } from "@/lib/db";
import { parseOrdersFile } from "@/lib/excel";

type ImportInput = {
  fileName: string;
  buffer: Buffer;
};

export const previewOrdersWorkbook = ({ fileName, buffer }: ImportInput) => {
  const parsed = parseOrdersFile(fileName, buffer);
  return {
    fileName,
    summary: {
      totalRows: parsed.totalRows,
      importedOrders: parsed.orders.length,
      skippedRows: parsed.skippedRows,
      duplicateRows: parsed.duplicateRows,
      errors: parsed.errors.length
    },
    previewOrders: parsed.orders.slice(0, 6).map((order) => ({
      orderReference: order.orderReference,
      clientName: order.clientName ?? "-",
      carrierName: order.carrierName ?? "-",
      lines: order.lines.length
    }))
  };
};

export const importOrdersFromWorkbook = async ({ fileName, buffer }: ImportInput) => {
  await ensureDbSchema();
  const parsed = parseOrdersFile(fileName, buffer);

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        sourceFile: fileName,
        totalRows: parsed.totalRows,
        skippedRows: parsed.skippedRows,
        duplicateRows: parsed.duplicateRows
      }
    });

    for (const group of parsed.orders) {
      const order = await tx.order.create({
        data: {
          batchId: batch.id,
          orderReference: group.orderReference,
          clientName: group.clientName,
          carrierName: group.carrierName,
          notes: group.notes.join(" | "),
          barcodeValue: group.orderReference
        }
      });

      if (group.lines.length > 0) {
        await tx.orderLine.createMany({
          data: group.lines.map((line) => ({
            orderId: order.id,
            productName: line.productName,
            quantity: line.quantity,
            note: line.note,
            ean: line.ean,
            productId: line.productId
          }))
        });
      }
    }

    if (parsed.errors.length > 0) {
      await tx.importError.createMany({
        data: parsed.errors.map((err) => ({
          batchId: batch.id,
          rowNumber: err.rowNumber,
          message: err.message,
          rawData: err.rawData
        }))
      });
    }

    const createdOrders = await tx.order.findMany({
      where: { batchId: batch.id },
      include: {
        lines: true
      },
      orderBy: {
        orderReference: "asc"
      }
    });

    return { batch, createdOrders };
  });

  return {
    batch: result.batch,
    orders: result.createdOrders,
    summary: {
      totalRows: parsed.totalRows,
      importedOrders: result.createdOrders.length,
      skippedRows: parsed.skippedRows,
      duplicateRows: parsed.duplicateRows,
      errors: parsed.errors.length
    }
  };
};

export type OrderSearchParams = {
  search?: string;
  carrier?: string;
  dateFrom?: string;
  dateTo?: string;
};

export const findOrders = async (params: OrderSearchParams) => {
  await ensureDbSchema();
  const where: Prisma.OrderWhereInput = {};
  const andFilters: Prisma.OrderWhereInput[] = [];

  if (params.search) {
    andFilters.push({
      OR: [
        { orderReference: { contains: params.search } },
        { clientName: { contains: params.search } }
      ]
    });
  }

  if (params.carrier) {
    andFilters.push({ carrierName: { equals: params.carrier } });
  }

  if (params.dateFrom || params.dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (params.dateFrom) {
      createdAt.gte = new Date(params.dateFrom);
    }
    if (params.dateTo) {
      const end = new Date(params.dateTo);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    andFilters.push({ createdAt });
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  return prisma.order.findMany({
    where,
    include: {
      _count: {
        select: {
          lines: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 300
  });
};
