import crypto from "node:crypto";

export function getAuthSecretString(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET environment variable must be configured (minimum 16 characters) in production.",
    );
  }
  return secret || "self-wallet-local-dev-secret-change-me";
}

function getEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(getAuthSecretString()).digest();
}

export function encryptSensitiveText(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (!trimmed) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(trimmed, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSensitiveText(ciphertext: string): string {
  if (!ciphertext) return "";
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return "";
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function maskAccountNumber(accountNumber?: string): string | undefined {
  const cleaned = accountNumber?.trim();
  if (!cleaned) return undefined;
  if (cleaned.length <= 4) {
    return "••••";
  }
  return `•••• ${cleaned.slice(-4)}`;
}
