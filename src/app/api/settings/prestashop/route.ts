import { NextResponse } from "next/server";
import { prisma, ensureDbSchema } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

export const runtime = "nodejs";

export async function GET() {
  await ensureDbSchema();
  try {
    const urlSetting = await prisma.appSetting.findUnique({
      where: { key: "prestashop_url" }
    });
    const keySetting = await prisma.appSetting.findUnique({
      where: { key: "prestashop_api_key" }
    });

    return NextResponse.json({
      url: urlSetting?.value ?? "",
      hasApiKey: Boolean(keySetting?.value)
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Errore lettura impostazioni Prestashop";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  await ensureDbSchema();
  try {
    const body = await req.json();
    const { url, apiKey } = body as { url?: string; apiKey?: string };

    if (url !== undefined) {
      let normalizedUrl = url.trim().replace(/\/+$/, "");
      if (normalizedUrl !== "") {
        if (!normalizedUrl.toLowerCase().endsWith("/api")) {
          normalizedUrl = `${normalizedUrl}/api`;
        }
      }
      await prisma.appSetting.upsert({
        where: { key: "prestashop_url" },
        update: { value: normalizedUrl },
        create: { key: "prestashop_url", value: normalizedUrl }
      });
    }

    if (apiKey !== undefined && apiKey.trim() !== "") {
      const encryptedKey = encrypt(apiKey.trim());
      await prisma.appSetting.upsert({
        where: { key: "prestashop_api_key" },
        update: { value: encryptedKey },
        create: { key: "prestashop_api_key", value: encryptedKey }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Errore salvataggio impostazioni Prestashop";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
