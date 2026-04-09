export type ParsedOrderLine = {
  productName?: string;
  quantity: number;
  note?: string;
  ean?: string;
  productId?: string;
  signature: string;
};

export type ParsedOrderGroup = {
  orderReference: string;
  clientName?: string;
  carrierName?: string;
  notes: string[];
  lines: ParsedOrderLine[];
};

export type ImportErrorRow = {
  rowNumber: number;
  message: string;
  rawData?: string;
};

export type ParsedWorkbookResult = {
  totalRows: number;
  skippedRows: number;
  duplicateRows: number;
  orders: ParsedOrderGroup[];
  errors: ImportErrorRow[];
};
