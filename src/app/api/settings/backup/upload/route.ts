import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getBackupsDirectory, restoreDatabase } from "@/lib/backup";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Nessun file fornito per il caricamento." }, { status: 400 });
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Security Check: Validate SQLite header prefix "SQLite format 3\0"
    const sqliteHeader = "SQLite format 3\0";
    if (buffer.length < 16) {
      return NextResponse.json({ error: "File troppo piccolo per essere un database SQLite valido." }, { status: 400 });
    }
    const headerString = buffer.toString("utf8", 0, 16);
    if (!headerString.startsWith(sqliteHeader)) {
      return NextResponse.json({ 
        error: "Il file caricato non è un database SQLite valido. Deve iniziare con l'intestazione SQLite corretta." 
      }, { status: 400 });
    }

    const backupsDir = getBackupsDirectory();
    if (!fs.existsSync(backupsDir)) {
      await fs.promises.mkdir(backupsDir, { recursive: true });
    }

    // Generate filename for the uploaded database backup
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `backup_uploaded_${timestamp}.db`;
    const destPath = path.join(backupsDir, filename);

    // Save the uploaded file in backups directory
    await fs.promises.writeFile(destPath, buffer);

    // Trigger restore using library function (disconnects prisma, swaps file)
    await restoreDatabase(filename);

    return NextResponse.json({
      success: true,
      message: `Database SQLite caricato e ripristinato con successo dal file: ${file.name}`
    });
  } catch (error: any) {
    console.error("[Database Upload Restore Error]:", error);
    const msg = error instanceof Error ? error.message : "Errore interno durante il ripristino del database.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
