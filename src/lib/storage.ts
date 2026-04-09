import fs from "node:fs";
import path from "node:path";

export const documentsDir = path.join(process.cwd(), "data", "documents");

export const ensureStorage = (): void => {
  if (!fs.existsSync(documentsDir)) {
    fs.mkdirSync(documentsDir, { recursive: true });
  }
};

export const safeFileName = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9-_\.]/g, "_");
};

const normalizeToken = (value: string): string => {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();
};

const formatTodayStamp = (date: Date): string => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

export const buildPickingBaseName = (carrierName: string, date = new Date()): string => {
  const carrierToken = normalizeToken(carrierName) || "CORRIERE_SCONOSCIUTO";
  return `PICKING_${carrierToken}_${formatTodayStamp(date)}`;
};

export const makeUniqueDocumentName = (baseName: string, suffix = "pdf"): string => {
  ensureStorage();
  const sanitizedBase = safeFileName(baseName);
  let candidate = `${sanitizedBase}.${suffix}`;
  let index = 2;

  while (fs.existsSync(path.join(documentsDir, candidate))) {
    candidate = `${sanitizedBase}_${index}.${suffix}`;
    index += 1;
  }

  return candidate;
};
