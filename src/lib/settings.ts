import { timingSafeEqual } from "crypto";
import { ensureDbSchema, prisma } from "@/lib/db";

const AUTO_IMPORT_TOKEN_KEY = "autoImportApiToken";
const AUTO_IMPORT_OPEN_DASHBOARD_KEY = "autoImportOpenDashboard";

type SettingRow = {
  value: string;
};

export const getAutoImportApiToken = async () => {
  await ensureDbSchema();
  const rows = await prisma.$queryRawUnsafe<SettingRow[]>(
    `SELECT "value" FROM "AppSetting" WHERE "key" = ? LIMIT 1`,
    AUTO_IMPORT_TOKEN_KEY
  );
  return rows[0]?.value?.trim() || process.env.AUTO_IMPORT_API_TOKEN?.trim() || "";
};

export const hasAutoImportApiToken = async () => {
  const token = await getAutoImportApiToken();
  return token.length > 0;
};

export const saveAutoImportApiToken = async (token: string) => {
  const trimmed = token.trim();
  if (trimmed.length < 16) {
    throw new Error("Il token deve contenere almeno 16 caratteri.");
  }

  await ensureDbSchema();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "AppSetting" ("key", "value", "updatedAt")
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    AUTO_IMPORT_TOKEN_KEY,
    trimmed
  );

  return trimmed;
};

export const getAutoImportOpenDashboard = async () => {
  await ensureDbSchema();
  const rows = await prisma.$queryRawUnsafe<SettingRow[]>(
    `SELECT "value" FROM "AppSetting" WHERE "key" = ? LIMIT 1`,
    AUTO_IMPORT_OPEN_DASHBOARD_KEY
  );
  return rows[0]?.value === "true";
};

export const saveAutoImportOpenDashboard = async (enabled: boolean) => {
  await ensureDbSchema();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "AppSetting" ("key", "value", "updatedAt")
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    AUTO_IMPORT_OPEN_DASHBOARD_KEY,
    enabled ? "true" : "false"
  );
  return enabled;
};

export const tokenMatches = (expected: string, actual: string) => {
  if (!expected || !actual) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
};
