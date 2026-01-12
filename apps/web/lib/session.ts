import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "perkcord_admin_session";

export type AdminSession = {
  userId: string;
  username: string;
  avatar?: string | null;
  issuedAt: number;
};

type CookieStore = {
  get: (name: string) => { value: string } | undefined;
};

const encodeBase64Url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

const decodeBase64Url = (value: string) => Buffer.from(value, "base64url").toString("utf8");

export const encodeSession = (session: AdminSession, secret: string) => {
  const payload = encodeBase64Url(JSON.stringify(session));
  const signature = createHmac("sha256", secret).update(payload).digest();
  const signatureEncoded = encodeBase64Url(signature);
  return `${payload}.${signatureEncoded}`;
};

export const decodeSession = (token: string, secret: string) => {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payload, signature] = parts;
  if (!payload || !signature) {
    return null;
  }
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length) {
    return null;
  }
  if (!timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as AdminSession;
    if (!parsed?.userId || !parsed?.username || !parsed?.issuedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const getSessionFromCookies = (cookieStore: CookieStore, secret: string) => {
  const raw = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  return decodeSession(raw, secret);
};
