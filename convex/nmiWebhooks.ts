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

type NmiEvent = Record<string, unknown>;

const NMI_SIGNATURE_HEADER = "x-nmi-signature";

const parseSignatureHeader = (header: string) => {
  const trimmed = header.trim();
  if (!trimmed) {
    return null;
  }
  const v1Match = /v1=([^,]+)/i.exec(trimmed);
  if (v1Match) {
    return v1Match[1].trim();
  }
  const match = /^(?:sha256=)?(.+)$/i.exec(trimmed);
  if (!match) {
    return null;
  }
  const signature = match[1]?.trim();
  return signature ? signature : null;
};

const normalizeBase64 = (value: string) => {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) {
    normalized += "=";
  }
  return normalized;
};

const isNmiSignatureValid = (
  payload: Buffer,
  header: string,
  secret: string
) => {
  const signature = parseSignatureHeader(header);
  if (!signature) {
    return false;
  }

  const isHex = /^[0-9a-fA-F]+$/.test(signature);
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest(isHex ? "hex" : "base64");
  const expectedBuffer = Buffer.from(expected, isHex ? "hex" : "base64");
  const providedValue = isHex ? signature : normalizeBase64(signature);
  const providedBuffer = Buffer.from(providedValue, isHex ? "hex" : "base64");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
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

const toOptionalUnixMs = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed < 1e12 ? parsed * 1000 : parsed;
    }
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }
  return undefined;
};

const toRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const collectRecords = (event: NmiEvent) => {
  const records: Record<string, unknown>[] = [];
  const push = (value: unknown) => {
    const record = toRecord(value);
    if (record) {
      records.push(record);
    }
  };
  push(event);
  const data = toRecord(event.data);
  push(data);
  push(event.transaction);
  push(event.chargeback);
  push(event.subscription);
  if (data) {
    push(data.transaction);
    push(data.subscription);
    push(data.customer);
    push(data.order);
  }
  return records;
};

const pickFromRecords = (
  records: Record<string, unknown>[],
  keys: string[]
) => {
  for (const record of records) {
    for (const key of keys) {
      const value = toOptionalString(record[key]);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
};

const collectFromRecords = (
  records: Record<string, unknown>[],
  keys: string[]
) => {
  const values = new Set<string>();
  for (const record of records) {
    for (const key of keys) {
      const raw = record[key];
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          const value = toOptionalString(entry);
          if (value) {
            values.add(value);
          }
        }
        continue;
      }
      const value = toOptionalString(raw);
      if (value) {
        values.add(value);
      }
    }
  }
  return values;
};

const normalizeNmiEventType = (
  eventType?: string
): NormalizedProviderEventType | null => {
  if (!eventType) {
    return null;
  }
  const normalized = eventType.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("transaction.refund")) {
    return "REFUND_ISSUED";
  }
  if (normalized.startsWith("transaction.void")) {
    return "REFUND_ISSUED";
  }
  if (normalized.includes("chargeback")) {
    if (
      normalized.includes("closed") ||
      normalized.includes("resolved") ||
      normalized.includes("won") ||
      normalized.includes("lost")
    ) {
      return "CHARGEBACK_CLOSED";
    }
    return "CHARGEBACK_OPENED";
  }

  if (normalized.includes("subscription") || normalized.includes("recurring")) {
    if (
      normalized.includes("cancel") ||
      normalized.includes("canceled") ||
      normalized.includes("cancelled") ||
      normalized.includes("expired")
    ) {
      return "SUBSCRIPTION_CANCELED";
    }
    if (
      normalized.includes("past_due") ||
      normalized.includes("failed") ||
      normalized.includes("declined")
    ) {
      return "SUBSCRIPTION_PAST_DUE";
    }
    return "SUBSCRIPTION_ACTIVE";
  }

  if (
    normalized.includes("payment") ||
    normalized.includes("sale") ||
    normalized.includes("capture")
  ) {
    if (
      normalized.includes("failed") ||
      normalized.includes("declined") ||
      normalized.includes("error")
    ) {
      return "PAYMENT_FAILED";
    }
    if (
      normalized.includes("success") ||
      normalized.includes("approved") ||
      normalized.includes("paid")
    ) {
      return "PAYMENT_SUCCEEDED";
    }
  }

  return null;
};

const parseRequestBody = async (request: Request, rawBody: Buffer) => {
  const contentType = request.headers.get("content-type") ?? "";
  const rawText = rawBody.toString("utf8");
  if (!rawText.trim()) {
    throw new Error("Empty webhook payload.");
  }
  try {
    return JSON.parse(rawText) as NmiEvent;
  } catch (error) {
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("application/x-www-form-urlencoded;")
    ) {
      const params = new URLSearchParams(rawText);
      const payload: Record<string, string> = {};
      for (const [key, value] of params.entries()) {
        payload[key] = value;
      }
      return payload;
    }
    throw new Error("Invalid JSON payload.");
  }
};

export const nmiWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed.", { status: 405 });
  }

  const signatureKey = process.env.NMI_WEBHOOK_SIGNATURE_KEY?.trim();
  if (!signatureKey) {
    return new Response("NMI webhook signature key not configured.", {
      status: 500,
    });
  }

  const signatureHeader =
    request.headers.get(NMI_SIGNATURE_HEADER) ??
    request.headers.get("x-webhook-signature");
  if (!signatureHeader) {
    return new Response("Missing NMI signature.", { status: 400 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!isNmiSignatureValid(rawBody, signatureHeader, signatureKey)) {
    return new Response("Invalid NMI signature.", { status: 400 });
  }

  let event: NmiEvent;
  try {
    event = await parseRequestBody(request, rawBody);
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Invalid payload.",
      { status: 400 }
    );
  }

  const records = collectRecords(event);
  const eventType =
    pickFromRecords(records, ["event_type", "eventType", "type", "event"]) ??
    toOptionalString(event.event_type ?? event.eventType ?? event.type);
  const eventId = pickFromRecords(records, [
    "event_id",
    "eventId",
    "notification_id",
    "notificationId",
    "id",
  ]);

  if (!eventType || !eventId) {
    return new Response("Invalid NMI event payload.", { status: 400 });
  }

  const normalizedEventType = normalizeNmiEventType(eventType);
  if (!normalizedEventType) {
    return new Response("Event ignored.", { status: 200 });
  }

  const providerObjectId = pickFromRecords(records, [
    "transaction_id",
    "transactionId",
    "trans_id",
    "chargeback_id",
    "chargebackId",
    "subscription_id",
    "subscriptionId",
    "invoice_id",
    "invoiceId",
    "order_id",
    "orderId",
  ]);
  const providerCustomerId = pickFromRecords(records, [
    "customer_id",
    "customerId",
    "customer_vault_id",
    "customerVaultId",
    "vault_id",
    "vaultId",
    "member_id",
    "memberId",
  ]);
  const priceIds = collectFromRecords(records, [
    "plan_id",
    "planId",
    "product_id",
    "productId",
    "item_id",
    "itemId",
    "price_id",
    "priceId",
    "sku",
    "tier_key",
    "tierKey",
  ]);
  const providerPriceIds =
    priceIds.size > 0 ? Array.from(priceIds) : undefined;
  const providerPeriodEnd = toOptionalUnixMs(
    pickFromRecords(records, [
      "period_end",
      "current_period_end",
      "next_billing_date",
      "nextBillingDate",
      "next_charge_date",
      "nextChargeDate",
    ])
  );
  const occurredAt = toOptionalUnixMs(
    pickFromRecords(records, [
      "created",
      "created_at",
      "timestamp",
      "event_date",
      "eventDate",
      "occurred_at",
      "occurredAt",
    ])
  );

  const payloadSummaryJson = JSON.stringify({
    id: eventId,
    type: eventType,
    objectId: providerObjectId ?? null,
    customerId: providerCustomerId ?? null,
    priceIds: providerPriceIds,
    periodEnd: providerPeriodEnd ?? null,
  });

  await ctx.runMutation(api.providerEvents.recordProviderEvent, {
    provider: "nmi",
    providerEventId: eventId,
    providerEventType: eventType,
    normalizedEventType,
    providerObjectId,
    providerCustomerId,
    providerPriceIds,
    providerPeriodEnd,
    occurredAt,
    payloadSummaryJson,
  });

  return new Response("ok", { status: 200 });
});
