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

type StripeEvent = {
  id?: string;
  type?: string;
  created?: number;
  livemode?: boolean;
  data?: {
    object?: Record<string, unknown>;
  };
};

const STRIPE_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const parseStripeSignatureHeader = (header: string) => {
  const parts = header.split(",");
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!key || !value) {
      continue;
    }
    if (key === "t") {
      timestamp = value;
    }
    if (key === "v1") {
      signatures.push(value);
    }
  }
  if (!timestamp || signatures.length === 0) {
    return null;
  }
  return { timestamp, signatures };
};

const isStripeSignatureValid = (
  payload: Buffer,
  header: string,
  secret: string
) => {
  const parsed = parseStripeSignatureHeader(header);
  if (!parsed) {
    return false;
  }

  const timestampSeconds = Number(parsed.timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const now = Date.now();
  const timestampMs = timestampSeconds * 1000;
  if (Math.abs(now - timestampMs) > STRIPE_SIGNATURE_TOLERANCE_MS) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${payload.toString("utf8")}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expectedSignature);

  for (const signature of parsed.signatures) {
    const signatureBuffer = Buffer.from(signature);
    if (signatureBuffer.length !== expectedBuffer.length) {
      continue;
    }
    if (timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return true;
    }
  }
  return false;
};

const normalizeStripeSubscriptionStatus = (
  status?: string
): NormalizedProviderEventType => {
  switch (status) {
    case "past_due":
    case "unpaid":
      return "SUBSCRIPTION_PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "SUBSCRIPTION_CANCELED";
    case "trialing":
    case "active":
    case "incomplete":
    default:
      return "SUBSCRIPTION_ACTIVE";
  }
};

const normalizeStripeEvent = (
  event: StripeEvent
): NormalizedProviderEventType | null => {
  switch (event.type) {
    case "invoice.payment_succeeded":
    case "payment_intent.succeeded":
      return "PAYMENT_SUCCEEDED";
    case "invoice.payment_failed":
    case "payment_intent.payment_failed":
      return "PAYMENT_FAILED";
    case "customer.subscription.created":
      return "SUBSCRIPTION_ACTIVE";
    case "customer.subscription.updated": {
      const status =
        typeof event.data?.object?.status === "string"
          ? (event.data?.object?.status as string)
          : undefined;
      return normalizeStripeSubscriptionStatus(status);
    }
    case "customer.subscription.deleted":
      return "SUBSCRIPTION_CANCELED";
    case "charge.refunded":
      return "REFUND_ISSUED";
    case "charge.dispute.created":
      return "CHARGEBACK_OPENED";
    case "charge.dispute.closed":
      return "CHARGEBACK_CLOSED";
    default:
      return null;
  }
};

const toOptionalUnixMs = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed < 1e12 ? parsed * 1000 : parsed;
    }
  }
  return undefined;
};

const extractPeriodEndFromLines = (items: unknown) => {
  if (!Array.isArray(items)) {
    return undefined;
  }
  let max: number | undefined;
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const period = (item as { period?: unknown }).period;
    if (!period || typeof period !== "object") {
      continue;
    }
    const end = toOptionalUnixMs((period as { end?: unknown }).end);
    if (end !== undefined && (max === undefined || end > max)) {
      max = end;
    }
  }
  return max;
};

const getStripePeriodEnd = (obj?: Record<string, unknown>) => {
  if (!obj) {
    return undefined;
  }
  const direct = toOptionalUnixMs(obj.current_period_end ?? obj.period_end);
  if (direct !== undefined) {
    return direct;
  }
  const lines = (obj.lines as { data?: unknown } | undefined)?.data;
  const items = (obj.items as { data?: unknown } | undefined)?.data;
  return extractPeriodEndFromLines(lines) ?? extractPeriodEndFromLines(items);
};

const getStripeObjectId = (obj?: Record<string, unknown>) => {
  return typeof obj?.id === "string" ? (obj.id as string) : undefined;
};

const getStripeCustomerId = (obj?: Record<string, unknown>) => {
  const customer = obj?.customer;
  if (typeof customer === "string") {
    return customer;
  }
  if (typeof customer === "object" && customer) {
    const customerId = (customer as { id?: unknown }).id;
    if (typeof customerId === "string") {
      return customerId;
    }
  }
  return undefined;
};

const addStripePriceId = (priceIds: Set<string>, value: unknown) => {
  if (typeof value === "string") {
    priceIds.add(value);
    return;
  }
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") {
      priceIds.add(id);
    }
  }
};

const collectStripePriceIds = (items: unknown, priceIds: Set<string>) => {
  if (!Array.isArray(items)) {
    return;
  }
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    addStripePriceId(priceIds, record.price);
    addStripePriceId(priceIds, record.plan);
  }
};

const getStripePriceIds = (obj?: Record<string, unknown>) => {
  const priceIds = new Set<string>();
  if (!obj) {
    return [];
  }
  addStripePriceId(priceIds, obj.price);
  addStripePriceId(priceIds, obj.plan);
  const items = (obj.items as { data?: unknown } | undefined)?.data;
  const lines = (obj.lines as { data?: unknown } | undefined)?.data;
  collectStripePriceIds(items, priceIds);
  collectStripePriceIds(lines, priceIds);
  return Array.from(priceIds);
};

export const stripeWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed.", { status: 405 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return new Response("Stripe webhook secret not configured.", { status: 500 });
  }

  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return new Response("Missing Stripe signature.", { status: 400 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!isStripeSignatureValid(rawBody, signatureHeader, secret)) {
    return new Response("Invalid Stripe signature.", { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as StripeEvent;
  } catch (error) {
    return new Response("Invalid JSON payload.", { status: 400 });
  }

  if (typeof event.id !== "string" || typeof event.type !== "string") {
    return new Response("Invalid Stripe event payload.", { status: 400 });
  }

  const normalizedEventType = normalizeStripeEvent(event);
  if (!normalizedEventType) {
    return new Response("Event ignored.", { status: 200 });
  }

  const object = event.data?.object;
  const objectId = getStripeObjectId(object);
  const customerId = getStripeCustomerId(object);
  const priceIds = getStripePriceIds(object);
  const periodEnd = getStripePeriodEnd(object);
  const occurredAt =
    typeof event.created === "number" ? event.created * 1000 : undefined;

  const payloadSummaryJson = JSON.stringify({
    id: event.id,
    type: event.type,
    objectType: typeof object?.object === "string" ? object.object : undefined,
    objectId: objectId ?? null,
    customerId: customerId ?? null,
    priceIds: priceIds.length > 0 ? priceIds : undefined,
    periodEnd: periodEnd ?? null,
    livemode: typeof event.livemode === "boolean" ? event.livemode : undefined,
  });

  await ctx.runMutation(api.providerEvents.recordProviderEvent, {
    provider: "stripe",
    providerEventId: event.id,
    providerEventType: event.type,
    normalizedEventType,
    providerObjectId: objectId,
    providerCustomerId: customerId,
    providerPriceIds: priceIds.length > 0 ? priceIds : undefined,
    providerPeriodEnd: periodEnd,
    occurredAt,
    payloadSummaryJson,
  });

  return new Response("ok", { status: 200 });
});
