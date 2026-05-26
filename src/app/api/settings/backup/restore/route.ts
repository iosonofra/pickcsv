import { NextResponse } from "next/server";
import { restoreDatabase } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { filename?: unknown };
    const filename = body.filename;

    if (typeof filename !== "string" || !filename) {
      return NextResponse.json({ error: "Nome file del backup mancante" }, { status: 400 });
    }

    await restoreDatabase(filename);

    return NextResponse.json({
      success: true,
      message: `Database SQLite ripristinato con successo dal backup ${filename}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore durante il ripristino del database";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
