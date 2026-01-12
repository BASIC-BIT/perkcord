import { createHmac, timingSafeEqual } from "crypto";

export const MEMBER_SESSION_COOKIE = "perkcord_member_session";
export const MEMBER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 6;
const MEMBER_SESSION_MAX_AGE_MS = MEMBER_SESSION_MAX_AGE_SECONDS * 1000;

export type MemberSession = {
  discordUserId: string;
  discordGuildId: string;
  issuedAt: number;
  expiresAt: number;
};

type CookieStore = {
  get: (name: string) => { value: string } | undefined;
};

const encodeBase64Url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");
const decodeBase64Url = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8");

export const encodeMemberSession = (session: MemberSession, secret: string) => {
  const payload = encodeBase64Url(JSON.stringify(session));
  const signature = createHmac("sha256", secret).update(payload).digest();
  const signatureEncoded = encodeBase64Url(signature);
  return `${payload}.${signatureEncoded}`;
};

export const decodeMemberSession = (token: string, secret: string) => {
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
    const parsed = JSON.parse(decodeBase64Url(payload)) as MemberSession;
    if (
      !parsed?.discordUserId ||
      !parsed?.discordGuildId ||
      !parsed?.issuedAt ||
      !parsed?.expiresAt
    ) {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      return null;
    }
    if (parsed.expiresAt - parsed.issuedAt > MEMBER_SESSION_MAX_AGE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const createMemberSession = (
  discordUserId: string,
  discordGuildId: string
): MemberSession => {
  const issuedAt = Date.now();
  return {
    discordUserId,
    discordGuildId,
    issuedAt,
    expiresAt: issuedAt + MEMBER_SESSION_MAX_AGE_MS,
  };
};

export const getMemberSessionFromCookies = (
  cookieStore: CookieStore,
  secret: string
) => {
  const raw = cookieStore.get(MEMBER_SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  return decodeMemberSession(raw, secret);
};
