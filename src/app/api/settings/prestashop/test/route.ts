import { NextResponse } from "next/server";
import { prisma, ensureDbSchema } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await ensureDbSchema();
  try {
    const body = await req.json();
    let { url, apiKey } = body as { url?: string; apiKey?: string };

    // 1. Fallback url
    if (!url || url.trim() === "") {
      const urlSetting = await prisma.appSetting.findUnique({
        where: { key: "prestashop_url" }
      });
      url = urlSetting?.value ?? "";
    }

    // 2. Fallback api key (if empty or masked placeholder)
    if (!apiKey || apiKey.trim() === "" || apiKey.includes("••••")) {
      const keySetting = await prisma.appSetting.findUnique({
        where: { key: "prestashop_api_key" }
      });
      if (keySetting?.value) {
        apiKey = decrypt(keySetting.value);
      } else {
        apiKey = "";
      }
    }

    if (!url || !url.trim()) {
      return NextResponse.json({ error: "URL PrestaShop non specificato." }, { status: 400 });
    }

    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json({ error: "Chiave API PrestaShop non specificata." }, { status: 400 });
    }

    // Normalize URL: strip trailing slashes, ensure it ends with /api
    let normalizedUrl = url.trim().replace(/\/+$/, "");
    if (!normalizedUrl.toLowerCase().endsWith("/api")) {
      normalizedUrl = `${normalizedUrl}/api`;
    }

    // Normalize base domain for display
    let baseDomain = normalizedUrl;
    if (baseDomain.toLowerCase().endsWith("/api")) {
      baseDomain = baseDomain.slice(0, -4).replace(/\/+$/, "");
    }

    // Basic authentication header
    const authHeader = "Basic " + Buffer.from(apiKey.trim() + ":").toString("base64");

    // Attempt to contact PrestaShop API
    const testUrl = `${normalizedUrl}/orders?limit=1&output_format=JSON`;
    
    const response = await fetch(testUrl, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(10000) // 10s timeout
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json({ 
          error: "Errore di autenticazione: Chiave API non valida o non autorizzata." 
        }, { status: 401 });
      }
      if (response.status === 403) {
        return NextResponse.json({ 
          error: "Errore autorizzazione: La chiave API non ha i permessi di lettura per la risorsa 'orders'." 
        }, { status: 403 });
      }
      return NextResponse.json({ 
        error: `Il webservice di PrestaShop ha risposto con codice HTTP ${response.status}.` 
      }, { status: 400 });
    }

    // Try parsing json to make sure it's valid response
    const data = await response.json().catch(() => null);
    if (!data) {
      return NextResponse.json({ 
        error: "Risposta ricevuta dal webservice, ma non in formato JSON valido." 
      }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Connessione stabilita con successo! Il webservice e la risorsa degli ordini sono accessibili." 
    });
  } catch (error: any) {
    console.error("[PrestaShop Test Connection Error]:", error);
    let errorMsg = "Impossibile contattare il server. Verifica l'URL e la connessione.";
    if (error.name === "TimeoutError") {
      errorMsg = "Tempo di connessione scaduto. Il server PrestaShop non risponde.";
    } else if (error instanceof Error) {
      errorMsg = error.message;
    }
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
