import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  let keyHex = process.env.PRESTASHOP_ENCRYPTION_KEY;

  if (!keyHex) {
    try {
      const envPath = path.join(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
        const match = envContent.match(/PRESTASHOP_ENCRYPTION_KEY\s*=\s*["']?([a-f0-9]{64})["']?/i);
        if (match && match[1]) {
          keyHex = match[1];
          process.env.PRESTASHOP_ENCRYPTION_KEY = keyHex;
        }
      }
    } catch (e) {
      console.error("[Crypto] Errore lettura file .env:", e);
    }
  }

  if (!keyHex) {
    keyHex = crypto.randomBytes(32).toString("hex");
    process.env.PRESTASHOP_ENCRYPTION_KEY = keyHex;

    try {
      const envPath = path.join(process.cwd(), ".env");
      const line = `\nPRESTASHOP_ENCRYPTION_KEY="${keyHex}"\n`;
      fs.appendFileSync(envPath, line, "utf8");
      console.log("[Crypto] Generata chiave di cifratura Prestashop ed aggiunta a .env");
    } catch (e) {
      console.error("[Crypto] Impossibile scrivere nel file .env, utilizzata chiave in memoria:", e);
    }
  }

  return Buffer.from(keyHex, "hex");
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(cipherText: string): string {
  const parts = cipherText.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato di cifratura non valido.");
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
