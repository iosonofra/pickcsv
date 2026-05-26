import { NextResponse } from "next/server";
import {
  backupDatabase,
  deleteBackup,
  getBackupEnabled,
  getLastBackupTime,
  listBackups,
  saveBackupEnabled
} from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const enabled = await getBackupEnabled();
    const lastBackup = await getLastBackupTime();
    const backups = await listBackups();

    return NextResponse.json({
      enabled,
      lastBackup,
      backups
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore lettura impostazioni backup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const backup = await backupDatabase();
    const lastBackup = await getLastBackupTime();
    const backups = await listBackups();

    return NextResponse.json({
      success: true,
      message: "Backup eseguito con successo",
      backup,
      lastBackup,
      backups
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore durante l'esecuzione del backup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Parametro 'enabled' non valido" }, { status: 400 });
    }

    const enabled = await saveBackupEnabled(body.enabled);
    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore salvataggio impostazioni backup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("file");

    if (!filename) {
      return NextResponse.json({ error: "Nome file mancante" }, { status: 400 });
    }

    await deleteBackup(filename);
    const backups = await listBackups();

    return NextResponse.json({
      success: true,
      message: `Backup ${filename} eliminato con successo`,
      backups
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore cancellazione backup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
