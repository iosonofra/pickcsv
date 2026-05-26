import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getBackupsDirectory } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("file");

    if (!filename) {
      return NextResponse.json({ error: "Nome file mancante" }, { status: 400 });
    }

    // Controllo di sicurezza Directory Traversal
    if (filename.includes("/") || filename.includes("\\") || !filename.startsWith("backup_") || !filename.endsWith(".db")) {
      return NextResponse.json({ error: "Nome file non valido" }, { status: 400 });
    }

    const backupsDir = getBackupsDirectory();
    const filePath = path.join(backupsDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File di backup non trovato" }, { status: 404 });
    }

    const stats = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    // Convertiamo lo Stream in ReadableStream per Next.js Response
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => controller.enqueue(chunk));
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Length": stats.size.toString(),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore durante il download del backup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
