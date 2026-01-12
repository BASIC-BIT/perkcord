import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ENCRYPTION_KEY_ENV = "PERKCORD_OAUTH_ENCRYPTION_KEY";
const IV_LENGTH = 12;

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
};

const encodeBase64Url = (value: Buffer) => value.toString("base64url");

const getEncryptionKey = () => {
  const raw = process.env[ENCRYPTION_KEY_ENV]?.trim();
  if (!raw) {
    throw new Error(`${ENCRYPTION_KEY_ENV} is not configured.`);
  }
  const key = decodeBase64Url(raw);
  if (key.length !== 32) {
    throw new Error(`${ENCRYPTION_KEY_ENV} must be a base64-encoded 32-byte key.`);
  }
  return key;
};

export const encryptSecret = (value: string) => {
  if (!value) {
    throw new Error("Cannot encrypt an empty value.");
  }
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}.${encodeBase64Url(tag)}`;
};

export const decryptSecret = (payload: string) => {
  const [ivEncoded, dataEncoded, tagEncoded] = payload.split(".");
  if (!ivEncoded || !dataEncoded || !tagEncoded) {
    throw new Error("Invalid encrypted payload format.");
  }
  const key = getEncryptionKey();
  const iv = decodeBase64Url(ivEncoded);
  const data = decodeBase64Url(dataEncoded);
  const tag = decodeBase64Url(tagEncoded);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return plaintext;
};
