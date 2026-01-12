import { createHmac, timingSafeEqual } from "crypto";
import { httpAction } from "./_generated/server";
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

const ANET_SIGNATURE_HEADER = "x-anet-signature";

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

const isAuthorizeNetSignatureValid = (
  payload: Buffer,
  header: string,
  signatureKey: string
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

  const expectedSignature = createHmac("sha512", signatureKey)
    .update(payload)
    .digest("hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(signatureBuffer, expectedBuffer);
};

const normalizeAuthorizeNetEvent = (
  eventType?: string
): NormalizedProviderEventType | null => {
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
  nestedKey: string
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

export const authorizeNetWebhook = httpAction(async (ctx, request) => {
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

  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!isAuthorizeNetSignatureValid(rawBody, signatureHeader, signatureKey)) {
    return new Response("Invalid Authorize.Net signature.", { status: 400 });
  }

  let event: AuthorizeNetEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as AuthorizeNetEvent;
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
    occurredAt,
    payloadSummaryJson,
  });

  return new Response("ok", { status: 200 });
});
