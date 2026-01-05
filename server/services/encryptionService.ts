import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be set to a 64-character hex string for token encryption");
  }
  return Buffer.from(keyHex.slice(0, 64), "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptToken(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

export function isEncryptionEnabled(): boolean {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  return !!(keyHex && keyHex.length >= 64);
}

export function isEncrypted(data: string): boolean {
  const parts = data.split(":");
  return parts.length === 3 && 
         parts[0].length === IV_LENGTH * 2 && 
         parts[1].length === AUTH_TAG_LENGTH * 2;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
