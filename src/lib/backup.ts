import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";


const BACKUP_ENABLED_KEY = "databaseBackupEnabled";
const LAST_BACKUP_TIME_KEY = "databaseLastBackupTime";
const MAX_BACKUPS = 10;

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
}

// Risolve in modo sicuro il percorso assoluto del database SQLite dev.db
export const getDatabasePath = (): string => {
  const envUrl = process.env.DATABASE_URL || "file:./dev.db";
  let relativePath = "dev.db";
  if (envUrl.startsWith("file:")) {
    relativePath = envUrl.substring(5);
  }

  // Verifica se risiede in prisma/ o nella root del progetto
  const prismaDbPath = path.resolve(process.cwd(), "prisma", relativePath);
  const rootDbPath = path.resolve(process.cwd(), relativePath);

  if (fs.existsSync(prismaDbPath)) {
    return prismaDbPath;
  }
  if (fs.existsSync(rootDbPath)) {
    return rootDbPath;
  }

  // Di fallback assume prisma/dev.db
  return path.resolve(process.cwd(), "prisma", "dev.db");
};

// Risolve la directory dei backup
export const getBackupsDirectory = (): string => {
  const dbPath = getDatabasePath();
  const prismaDir = path.dirname(dbPath);
  const backupsDir = path.join(prismaDir, "backups");
  return backupsDir;
};

// Formatta la dimensione dei file in formato leggibile
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// Verifica lo stato del backup automatico (di base abilitato se non configurato)
export const getBackupEnabled = async (): Promise<boolean> => {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT "value" FROM "AppSetting" WHERE "key" = ? LIMIT 1`,
      BACKUP_ENABLED_KEY
    );
    if (rows.length === 0) return true; // Abilitato di default
    return rows[0].value === "true";
  } catch {
    return true;
  }
};

// Salva lo stato di abilitazione del backup automatico
export const saveBackupEnabled = async (enabled: boolean): Promise<boolean> => {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "AppSetting" ("key", "value", "updatedAt")
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    BACKUP_ENABLED_KEY,
    enabled ? "true" : "false"
  );
  return enabled;
};

// Ottiene la data dell'ultimo backup
export const getLastBackupTime = async (): Promise<string | null> => {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT "value" FROM "AppSetting" WHERE "key" = ? LIMIT 1`,
      LAST_BACKUP_TIME_KEY
    );
    return rows[0]?.value || null;
  } catch {
    return null;
  }
};

// Aggiorna la data dell'ultimo backup
export const saveLastBackupTime = async (timestamp: string): Promise<string> => {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "AppSetting" ("key", "value", "updatedAt")
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    LAST_BACKUP_TIME_KEY,
    timestamp
  );
  return timestamp;
};

// Esegue fisicamente il backup del database
export const backupDatabase = async (): Promise<BackupInfo> => {
  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database non trovato al percorso: ${dbPath}`);
  }

  const backupsDir = getBackupsDirectory();
  if (!fs.existsSync(backupsDir)) {
    await fs.promises.mkdir(backupsDir, { recursive: true });
  }

  // Genera un nome file timestamped
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `backup_${timestamp}.db`;
  const destPath = path.join(backupsDir, filename);

  // Copia il file in modo asincrono
  await fs.promises.copyFile(dbPath, destPath);

  // Aggiorna metadati dell'ultimo backup
  const nowIso = now.toISOString();
  await saveLastBackupTime(nowIso);

  // Ruota i vecchi backup (tienine al massimo MAX_BACKUPS)
  await rotateBackups(backupsDir);

  const stats = await fs.promises.stat(destPath);
  return {
    filename,
    sizeBytes: stats.size,
    sizeFormatted: formatBytes(stats.size),
    createdAt: nowIso,
  };
};

// Ruota i backup cancellando quelli più vecchi di MAX_BACKUPS
const rotateBackups = async (backupsDir: string): Promise<void> => {
  try {
    const files = await fs.promises.readdir(backupsDir);
    const dbBackups = files
      .filter((f) => f.startsWith("backup_") && f.endsWith(".db"))
      .map((f) => {
        const filePath = path.join(backupsDir, f);
        return {
          name: f,
          filePath,
          mtime: fs.statSync(filePath).mtime.getTime(),
        };
      })
      .sort((a, b) => b.mtime - a.mtime); // Più recenti all'inizio

    if (dbBackups.length > MAX_BACKUPS) {
      const toDelete = dbBackups.slice(MAX_BACKUPS);
      for (const backup of toDelete) {
        await fs.promises.unlink(backup.filePath).catch((err) => {
          console.error(`Errore eliminazione vecchio backup ${backup.name}:`, err);
        });
      }
    }
  } catch (error) {
    console.error("Errore durante la rotazione dei backup:", error);
  }
};

// Elenca tutti i backup disponibili ordinati dal più recente
export const listBackups = async (): Promise<BackupInfo[]> => {
  const backupsDir = getBackupsDirectory();
  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  try {
    const files = await fs.promises.readdir(backupsDir);
    const backups = files
      .filter((f) => f.startsWith("backup_") && f.endsWith(".db"))
      .map((f) => {
        const filePath = path.join(backupsDir, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          sizeBytes: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.birthtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return backups;
  } catch (error) {
    console.error("Errore lettura lista backup:", error);
    return [];
  }
};

// Elimina uno specifico backup
export const deleteBackup = async (filename: string): Promise<void> => {
  // Controllo di sicurezza contro Directory Traversal
  if (filename.includes("/") || filename.includes("\\") || !filename.startsWith("backup_") || !filename.endsWith(".db")) {
    throw new Error("Nome file non valido.");
  }

  const backupsDir = getBackupsDirectory();
  const filePath = path.join(backupsDir, filename);

  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  } else {
    throw new Error(`File di backup non trovato: ${filename}`);
  }
};

// Controlla ed esegue il backup se sono passate più di 24 ore dall'ultimo
export const checkAndRunBackup = async (): Promise<boolean> => {
  try {
    const enabled = await getBackupEnabled();
    if (!enabled) return false;

    const lastBackupStr = await getLastBackupTime();
    const now = new Date();

    if (lastBackupStr) {
      const lastBackup = new Date(lastBackupStr);
      const diffMs = now.getTime() - lastBackup.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // Se non sono ancora passate 24 ore, salta il backup
      if (diffHours < 24) {
        return false;
      }
    }

    // Esegue il backup (il database esiste già poiché ensureDbSchema è stato completato)
    await backupDatabase();
    console.log(`[Backup] Backup automatico ogni 24 ore completato con successo alle ${now.toLocaleString("it-IT", { hour12: false })}`);
    return true;
  } catch (error) {
    console.error("[Backup] Errore durante il backup automatico programmato:", error);
    return false;
  }
};

// Ripristina il database SQLite attivo da un file di backup selezionato
export const restoreDatabase = async (filename: string): Promise<void> => {
  // Controllo di sicurezza Directory Traversal
  if (filename.includes("/") || filename.includes("\\") || !filename.startsWith("backup_") || !filename.endsWith(".db")) {
    throw new Error("Nome file del backup non valido.");
  }

  const dbPath = getDatabasePath();
  const backupsDir = getBackupsDirectory();
  const backupFilePath = path.join(backupsDir, filename);

  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`File di backup non trovato: ${filename}`);
  }

  // 1. Disconnette il client Prisma per liberare i descrittori di file del database SQLite attivo
  await prisma.$disconnect();

  // 2. Rimuove i file journal temporanei di SQLite per evitare conflitti o ripristini incoerenti
  const journalFiles = [
    `${dbPath}-journal`,
    `${dbPath}-shm`,
    `${dbPath}-wal`
  ];

  for (const journal of journalFiles) {
    if (fs.existsSync(journal)) {
      await fs.promises.unlink(journal).catch((err) => {
        console.error(`Impossibile rimuovere il file journal temporaneo ${journal}:`, err);
      });
    }
  }

  // 3. Sovrascrive il database SQLite attivo con il backup
  await fs.promises.copyFile(backupFilePath, dbPath);
  console.log(`[Backup] Database SQLite ripristinato con successo dal backup: ${filename}`);
};
