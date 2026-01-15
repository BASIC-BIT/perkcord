import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";

type NormalizedProviderEventType =
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "SUBSCRIPTION_ACTIVE"
  | "SUBSCRIPTION_PAST_DUE"
  | "SUBSCRIPTION_CANCELED"
  | "REFUND_ISSUED"
  | "CHARGEBACK_OPENED"
  | "CHARGEBACK_CLOSED";

type AuthorizeNetEvent = {
  notificationId?: string;
  eventType?: string;
  eventDate?: string | number;
  payload?: Record<string, unknown>;
};

type WebhookContext = Pick<ActionCtx, "runMutation">;

const ANET_SIGNATURE_HEADER = "x-anet-signature";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const fromHex = (hex: string) => {
  if (hex.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const parsed = Number.parseInt(hex.slice(index, index + 2), 16);
    if (Number.isNaN(parsed)) {
      return null;
    }
    bytes[index / 2] = parsed;
  }
  return bytes;
};

const timingSafeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
};

const hmacSha512 = async (payload: Uint8Array, secret: string) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("crypto.subtle is not available for webhook verification.");
  }
  const key = await subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", key, payload);
  return new Uint8Array(signature);
};

const parseAuthorizeNetSignature = (header: string) => {
  const trimmed = header.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^sha512=(.+)$/i.exec(trimmed);
  const signature = match ? match[1] : trimmed;
  const normalized = signature.trim();
  if (!normalized) {
    return null;
  }
  return normalized;
};

const isAuthorizeNetSignatureValid = async (
  payload: Uint8Array,
  header: string,
  signatureKey: string,
) => {
  const signature = parseAuthorizeNetSignature(header);
  if (!signature) {
    return false;
  }
  if (!/^[0-9a-fA-F]+$/.test(signature)) {
    return false;
  }
  if (signature.length !== 128) {
    return false;
  }

  const expected = await hmacSha512(payload, signatureKey);
  const signatureBuffer = fromHex(signature);
  if (!signatureBuffer) {
    return false;
  }
  if (signatureBuffer.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(signatureBuffer, expected);
};

const normalizeAuthorizeNetEvent = (eventType?: string): NormalizedProviderEventType | null => {
  switch (eventType) {
    case "net.authorize.payment.authcapture.created":
      return "PAYMENT_SUCCEEDED";
    case "net.authorize.payment.refund.created":
    case "net.authorize.payment.void.created":
      return "REFUND_ISSUED";
    case "net.authorize.customer.subscription.created":
    case "net.authorize.customer.subscription.updated":
      return "SUBSCRIPTION_ACTIVE";
    case "net.authorize.customer.subscription.failed":
      return "SUBSCRIPTION_PAST_DUE";
    case "net.authorize.customer.subscription.cancelled":
      return "SUBSCRIPTION_CANCELED";
    default:
      return null;
  }
};

const toOptionalString = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const toOptionalNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const parseAuthorizeNetEventDate = (value: unknown) => {
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }
  const numeric = toOptionalNumber(value);
  if (numeric !== undefined) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  return undefined;
};

const getPayloadField = (payload: Record<string, unknown> | undefined, key: string) => {
  if (!payload) {
    return undefined;
  }
  return toOptionalString(payload[key]);
};

const getNestedPayloadField = (
  payload: Record<string, unknown> | undefined,
  key: string,
  nestedKey: string,
) => {
  if (!payload) {
    return undefined;
  }
  const nested = payload[key];
  if (!nested || typeof nested !== "object") {
    return undefined;
  }
  return toOptionalString((nested as Record<string, unknown>)[nestedKey]);
};

const getAuthorizeNetObjectId = (payload?: Record<string, unknown>) => {
  return (
    getPayloadField(payload, "id") ??
    getPayloadField(payload, "transactionId") ??
    getPayloadField(payload, "transId") ??
    getPayloadField(payload, "subscriptionId") ??
    getNestedPayloadField(payload, "subscription", "id")
  );
};

const getAuthorizeNetCustomerId = (payload?: Record<string, unknown>) => {
  return (
    getPayloadField(payload, "customerProfileId") ??
    getPayloadField(payload, "profileId") ??
    getNestedPayloadField(payload, "customer", "id")
  );
};

export const handleAuthorizeNetWebhook = async (ctx: WebhookContext, request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed.", { status: 405 });
  }

  const signatureKey = process.env.AUTHORIZE_NET_SIGNATURE_KEY?.trim();
  if (!signatureKey) {
    return new Response("Authorize.Net signature key not configured.", {
      status: 500,
    });
  }

  const signatureHeader = request.headers.get(ANET_SIGNATURE_HEADER);
  if (!signatureHeader) {
    return new Response("Missing Authorize.Net signature.", { status: 400 });
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (!(await isAuthorizeNetSignatureValid(rawBody, signatureHeader, signatureKey))) {
    return new Response("Invalid Authorize.Net signature.", { status: 400 });
  }

  let event: AuthorizeNetEvent;
  let rawText = "";
  try {
    rawText = textDecoder.decode(rawBody);
    event = JSON.parse(rawText) as AuthorizeNetEvent;
  } catch (error) {
    return new Response("Invalid JSON payload.", { status: 400 });
  }

  const notificationId = toOptionalString(event.notificationId);
  const eventType = toOptionalString(event.eventType);
  if (!notificationId || !eventType) {
    return new Response("Invalid Authorize.Net event payload.", { status: 400 });
  }

  const normalizedEventType = normalizeAuthorizeNetEvent(eventType);
  if (!normalizedEventType) {
    return new Response("Event ignored.", { status: 200 });
  }

  const payload = event.payload;
  const providerObjectId = getAuthorizeNetObjectId(payload);
  const providerCustomerId = getAuthorizeNetCustomerId(payload);
  const merchantReferenceId = getPayloadField(payload, "merchantReferenceId");
  const invoiceNumber =
    getPayloadField(payload, "invoiceNumber") ??
    getNestedPayloadField(payload, "order", "invoiceNumber");
  const priceIdSet = new Set<string>();
  if (merchantReferenceId) {
    priceIdSet.add(merchantReferenceId);
  }
  if (invoiceNumber) {
    priceIdSet.add(invoiceNumber);
  }
  const providerPriceIds = priceIdSet.size > 0 ? Array.from(priceIdSet) : undefined;
  const occurredAt = parseAuthorizeNetEventDate(event.eventDate);

  const payloadSummaryJson = JSON.stringify({
    id: notificationId,
    type: eventType,
    eventDate: event.eventDate ?? null,
    payloadId: providerObjectId ?? null,
    customerProfileId: providerCustomerId ?? null,
    merchantReferenceId: merchantReferenceId ?? null,
  });

  await ctx.runMutation(api.providerEvents.recordProviderEvent, {
    provider: "authorize_net",
    providerEventId: notificationId,
    providerEventType: eventType,
    normalizedEventType,
    providerObjectId,
    providerCustomerId,
    providerPriceIds,
    occurredAt,
    payloadSummaryJson,
  });

  return new Response("ok", { status: 200 });
};

export const authorizeNetWebhook = httpAction(async (ctx, request) =>
  handleAuthorizeNetWebhook(ctx, request),
);
