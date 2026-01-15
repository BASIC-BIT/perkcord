import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAuthorizeNetWebhook } from "../authorizeNetWebhooks";
import { handleNmiWebhook } from "../nmiWebhooks";
import { handleStripeWebhook } from "../stripeWebhooks";

const signStripe = (payload: string, secret: string, timestamp: number) => {
  const signed = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${timestamp},v1=${signature}`;
};

const signAuthorizeNet = (payload: Uint8Array, secret: string) =>
  `sha512=${createHmac("sha512", secret).update(payload).digest("hex")}`;

const signNmiHex = (payload: Uint8Array, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("hex");

describe("webhooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-13T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.AUTHORIZE_NET_SIGNATURE_KEY;
    delete process.env.NMI_WEBHOOK_SIGNATURE_KEY;
  });

  it("processes Stripe webhooks with valid signature", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({
      id: "evt_1",
      type: "invoice.payment_succeeded",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "in_1",
          customer: "cus_1",
          price: { id: "price_1" },
          current_period_end: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    });
    const signature = signStripe(
      payload,
      process.env.STRIPE_WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000),
    );
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "stripe",
        providerEventId: "evt_1",
        normalizedEventType: "PAYMENT_SUCCEEDED",
      }),
    );
  });

  it("handles Stripe subscription updates and ignored events", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({
      id: "evt_sub",
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "sub_1",
          status: "past_due",
          customer: { id: "cus_obj" },
          lines: { data: [{ price: "price_line" }] },
          items: {
            data: [{ price: { id: "price_item" } }, { plan: { id: "plan_item" } }],
          },
        },
      },
    });
    const signature = signStripe(
      payload,
      process.env.STRIPE_WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000),
    );
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        normalizedEventType: "SUBSCRIPTION_PAST_DUE",
        providerCustomerId: "cus_obj",
      }),
    );

    const ignoredPayload = JSON.stringify({ id: "evt_ignore", type: "unknown.event" });
    const ignoredSignature = signStripe(
      ignoredPayload,
      process.env.STRIPE_WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000),
    );
    const ignored = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": ignoredSignature },
        body: ignoredPayload,
      }),
    );
    expect(ignored.status).toBe(200);
  });

  it("handles additional Stripe event types", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const ctx = { runMutation: vi.fn() };

    const failurePayload = JSON.stringify({
      id: "evt_fail",
      type: "invoice.payment_failed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "in_fail", customer: "cus_fail" } },
    });
    const failureSig = signStripe(
      failurePayload,
      process.env.STRIPE_WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000),
    );
    await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": failureSig },
        body: failurePayload,
      }),
    );

    const canceledPayload = JSON.stringify({
      id: "evt_cancel",
      type: "customer.subscription.deleted",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "sub_cancel", customer: "cus_cancel" } },
    });
    const canceledSig = signStripe(
      canceledPayload,
      process.env.STRIPE_WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000),
    );
    await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": canceledSig },
        body: canceledPayload,
      }),
    );

    const disputePayload = JSON.stringify({
      id: "evt_dispute",
      type: "charge.dispute.closed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "ch_dispute", customer: "cus_dispute" } },
    });
    const disputeSig = signStripe(
      disputePayload,
      process.env.STRIPE_WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000),
    );
    await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": disputeSig },
        body: disputePayload,
      }),
    );
    expect(ctx.runMutation).toHaveBeenCalledTimes(3);
  });

  it("processes Stripe events with multiple signatures and line-based period ends", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_multi",
      type: "customer.subscription.updated",
      created: timestamp,
      data: {
        object: {
          id: "sub_multi",
          status: "canceled",
          customer: "cus_multi",
          items: {
            data: [
              null,
              { period: { end: timestamp + 600 } },
              { period: { end: timestamp + 1200 } },
            ],
          },
        },
      },
    });
    const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    const header = `t=${timestamp},v1=bad,v1=${signature}`;
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": header },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        normalizedEventType: "SUBSCRIPTION_CANCELED",
        providerPeriodEnd: expect.any(Number),
      }),
    );
  });

  it("handles Stripe refunds, chargebacks, and payment intents", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const ctx = { runMutation: vi.fn() };
    const timestamp = Math.floor(Date.now() / 1000);

    const intentPayload = JSON.stringify({
      id: "evt_intent",
      type: "payment_intent.succeeded",
      created: timestamp,
      data: { object: { id: "pi_1", customer: { id: "cus_pi" } } },
    });
    const intentSig = signStripe(intentPayload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
    await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": intentSig },
        body: intentPayload,
      }),
    );

    const refundPayload = JSON.stringify({
      id: "evt_refund",
      type: "charge.refunded",
      created: timestamp,
      data: { object: { id: "ch_refund", customer: "cus_refund" } },
    });
    const refundSig = signStripe(refundPayload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
    await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": refundSig },
        body: refundPayload,
      }),
    );

    const disputeOpenPayload = JSON.stringify({
      id: "evt_dispute_open",
      type: "charge.dispute.created",
      created: timestamp,
      data: { object: { id: "ch_dispute_open", customer: "cus_cb" } },
    });
    const disputeOpenSig = signStripe(
      disputeOpenPayload,
      process.env.STRIPE_WEBHOOK_SECRET,
      timestamp,
    );
    await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": disputeOpenSig },
        body: disputeOpenPayload,
      }),
    );

    expect(ctx.runMutation).toHaveBeenCalledTimes(3);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "PAYMENT_SUCCEEDED" }),
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "REFUND_ISSUED" }),
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "CHARGEBACK_OPENED" }),
    );
  });

  it("handles Stripe subscription creation and payment failures", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const ctx = { runMutation: vi.fn() };
    const timestamp = Math.floor(Date.now() / 1000);

    const subscriptionPayload = JSON.stringify({
      id: "evt_sub_create",
      type: "customer.subscription.created",
      created: timestamp,
      data: {
        object: {
          id: "sub_created",
          status: "trialing",
          customer: "cus_trial",
          lines: {
            data: [{ period: { end: timestamp + 1200 }, price: { id: "price_line" } }],
          },
        },
      },
    });
    const subSig = signStripe(subscriptionPayload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
    await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": subSig },
        body: subscriptionPayload,
      }),
    );

    const failurePayload = JSON.stringify({
      id: "evt_intent_fail",
      type: "payment_intent.payment_failed",
      created: timestamp,
      data: { object: { id: "pi_fail", customer: "cus_fail" } },
    });
    const failureSig = signStripe(failurePayload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
    await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": failureSig },
        body: failurePayload,
      }),
    );

    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "SUBSCRIPTION_ACTIVE" }),
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "PAYMENT_FAILED" }),
    );
  });

  it("records Stripe events with sparse objects and junk signature parts", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_sparse",
      type: "invoice.payment_succeeded",
      created: "1234",
      data: {
        object: {
          id: 123,
          customer: {},
          object: 123,
          price: 123,
          lines: { data: "not-an-array" },
          items: { data: [null] },
        },
      },
    });
    const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    const header = `t=${timestamp},junk,v1=${signature}`;
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": header },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerObjectId: undefined,
        providerCustomerId: undefined,
        providerPriceIds: undefined,
        occurredAt: undefined,
      }),
    );
  });

  it("processes Stripe events without object data", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_no_object",
      type: "invoice.payment_succeeded",
      created: timestamp,
      data: {},
    });
    const signature = signStripe(payload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerObjectId: undefined,
        providerCustomerId: undefined,
        providerPriceIds: undefined,
        providerPeriodEnd: undefined,
      }),
    );
  });

  it("accepts Stripe events with string period end values", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_string_period",
      type: "invoice.payment_succeeded",
      created: timestamp,
      data: {
        object: {
          id: "in_string",
          customer: "cus_string",
          current_period_end: String(timestamp + 3600),
        },
      },
    });
    const signature = signStripe(payload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerPeriodEnd: expect.any(Number) }),
    );
  });

  it("defaults Stripe subscription status when status is not a string", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_status_default",
      type: "customer.subscription.updated",
      created: timestamp,
      data: { object: { id: "sub_default", status: 123, customer: "cus_default" } },
    });
    const signature = signStripe(payload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "SUBSCRIPTION_ACTIVE" }),
    );
  });

  it("treats incomplete Stripe subscriptions as active", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_incomplete",
      type: "customer.subscription.updated",
      created: timestamp,
      data: { object: { id: "sub_incomplete", status: "incomplete" } },
    });
    const signature = signStripe(payload, process.env.STRIPE_WEBHOOK_SECRET, timestamp);
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "SUBSCRIPTION_ACTIVE" }),
    );
  });

  it("rejects Stripe webhooks with invalid signature", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({ id: "evt_2", type: "invoice.payment_failed" });
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "t=0,v1=bad" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Stripe signatures without v1 component", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({ id: "evt_no_v1", type: "invoice.payment_succeeded" });
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "t=123" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Stripe signatures outside tolerance window", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({ id: "evt_old", type: "invoice.payment_succeeded" });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 60 * 60;
    const signature = signStripe(payload, process.env.STRIPE_WEBHOOK_SECRET, oldTimestamp);
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Stripe signatures with non-hex characters", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({ id: "evt_non_hex", type: "invoice.payment_failed" });
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "t=123,v1=gg" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Stripe signatures with invalid length", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({ id: "evt_short_sig", type: "invoice.payment_failed" });
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "t=123,v1=00" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Stripe signatures that do not match the payload", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({ id: "evt_wrong_sig", type: "invoice.payment_failed" });
    const timestamp = Math.floor(Date.now() / 1000);
    const badSignature = signStripe(payload, "wrong-secret", timestamp);
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": badSignature },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Stripe signatures with non-numeric timestamps", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({ id: "evt_bad_time", type: "invoice.payment_succeeded" });
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "t=not-a-number,v1=deadbeef" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Stripe webhooks with bad payloads", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const badPayload = "{not-json";
    const signature = signStripe(
      badPayload,
      process.env.STRIPE_WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000),
    );
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: badPayload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Stripe webhooks with missing required fields", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({ type: "invoice.payment_succeeded" });
    const signature = signStripe(
      payload,
      process.env.STRIPE_WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000),
    );
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("fails Stripe webhook when secret or signature is missing", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const ctx = { runMutation: vi.fn() };
    const missingSecret = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(missingSecret.status).toBe(500);
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const missingSig = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(missingSig.status).toBe(400);
  });

  it("returns 405 for non-POST Stripe webhook requests", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const ctx = { runMutation: vi.fn() };
    const response = await handleStripeWebhook(
      ctx as never,
      new Request("http://localhost", { method: "GET" }),
    );
    expect(response.status).toBe(405);
  });

  it("processes Authorize.Net webhooks with valid signature", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({
      notificationId: "notif_1",
      eventType: "net.authorize.customer.subscription.updated",
      eventDate: Date.now(),
      payload: {
        id: "sub_1",
        merchantReferenceId: "plan_1",
        order: { invoiceNumber: "inv_1" },
      },
    });
    const raw = new TextEncoder().encode(payload);
    const signature = signAuthorizeNet(raw, process.env.AUTHORIZE_NET_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "authorize_net",
        providerEventId: "notif_1",
        normalizedEventType: "SUBSCRIPTION_ACTIVE",
      }),
    );
  });

  it("rejects Authorize.Net webhooks with invalid signature", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({
      notificationId: "notif_2",
      eventType: "net.authorize.payment.authcapture.created",
    });
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": "sha512=bad" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("handles Authorize.Net refunds and ignored events", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({
      notificationId: "notif_refund",
      eventType: "net.authorize.payment.refund.created",
      eventDate: "2026-01-13T00:00:00Z",
      payload: { transId: "txn_1", customerProfileId: "cust_1" },
    });
    const raw = new TextEncoder().encode(payload);
    const signature = signAuthorizeNet(raw, process.env.AUTHORIZE_NET_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        normalizedEventType: "REFUND_ISSUED",
        providerObjectId: "txn_1",
        providerCustomerId: "cust_1",
      }),
    );

    const ignoredPayload = JSON.stringify({
      notificationId: "notif_ignore",
      eventType: "net.authorize.unknown",
    });
    const ignoredRaw = new TextEncoder().encode(ignoredPayload);
    const ignoredSignature = signAuthorizeNet(ignoredRaw, process.env.AUTHORIZE_NET_SIGNATURE_KEY);
    const ignored = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": ignoredSignature },
        body: ignoredPayload,
      }),
    );
    expect(ignored.status).toBe(200);
  });

  it("handles Authorize.Net subscription failures and cancellations", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const ctx = { runMutation: vi.fn() };

    const failedPayload = JSON.stringify({
      notificationId: "notif_fail",
      eventType: "net.authorize.customer.subscription.failed",
      payload: { subscriptionId: "sub_fail" },
    });
    const failedRaw = new TextEncoder().encode(failedPayload);
    const failedSignature = createHmac("sha512", process.env.AUTHORIZE_NET_SIGNATURE_KEY)
      .update(failedRaw)
      .digest("hex");
    await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": failedSignature },
        body: failedPayload,
      }),
    );

    const canceledPayload = JSON.stringify({
      notificationId: "notif_cancel",
      eventType: "net.authorize.customer.subscription.cancelled",
      payload: { subscriptionId: "sub_cancel" },
    });
    const canceledRaw = new TextEncoder().encode(canceledPayload);
    const canceledSignature = createHmac("sha512", process.env.AUTHORIZE_NET_SIGNATURE_KEY)
      .update(canceledRaw)
      .digest("hex");
    await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": canceledSignature },
        body: canceledPayload,
      }),
    );

    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
  });

  it("handles Authorize.Net void events with nested payload fields", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({
      notificationId: "notif_void",
      eventType: "net.authorize.payment.void.created",
      eventDate: "1234",
      payload: {
        subscription: { id: "sub_nested" },
        customer: { id: "cust_nested" },
        order: { invoiceNumber: "inv_nested" },
        merchantReferenceId: "plan_nested",
      },
    });
    const raw = new TextEncoder().encode(payload);
    const signature = createHmac("sha512", process.env.AUTHORIZE_NET_SIGNATURE_KEY)
      .update(raw)
      .digest("hex");
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": `  ${signature} ` },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        normalizedEventType: "REFUND_ISSUED",
        providerObjectId: "sub_nested",
        providerCustomerId: "cust_nested",
        providerPriceIds: ["plan_nested", "inv_nested"],
      }),
    );
  });

  it("processes Authorize.Net subscription created events", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({
      notificationId: "notif_created",
      eventType: "net.authorize.customer.subscription.created",
      eventDate: Date.now(),
      payload: {
        subscriptionId: "sub_created",
        profileId: "profile_created",
      },
    });
    const raw = new TextEncoder().encode(payload);
    const signature = signAuthorizeNet(raw, process.env.AUTHORIZE_NET_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        normalizedEventType: "SUBSCRIPTION_ACTIVE",
        providerObjectId: "sub_created",
        providerCustomerId: "profile_created",
      }),
    );
  });

  it("handles Authorize.Net events with numeric identifiers and empty payloads", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({
      notificationId: 12345,
      eventType: "net.authorize.payment.authcapture.created",
      payload: undefined,
    });
    const raw = new TextEncoder().encode(payload);
    const signature = signAuthorizeNet(raw, process.env.AUTHORIZE_NET_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerObjectId: undefined,
        providerCustomerId: undefined,
      }),
    );
  });

  it("rejects Authorize.Net requests missing signature header", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Authorize.Net signatures with non-hex characters", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({
      notificationId: "notif_bad_sig",
      eventType: "net.authorize.payment.authcapture.created",
    });
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": "sha512=not-a-hex" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Authorize.Net signatures that are empty after trimming", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({
      notificationId: "notif_empty_sig",
      eventType: "net.authorize.payment.authcapture.created",
    });
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": "   " },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Authorize.Net signatures with only whitespace after prefix", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({
      notificationId: "notif_whitespace",
      eventType: "net.authorize.payment.authcapture.created",
    });
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": "sha512=   " },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects Authorize.Net requests with invalid JSON", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = "{bad-json";
    const raw = new TextEncoder().encode(payload);
    const signature = signAuthorizeNet(raw, process.env.AUTHORIZE_NET_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid Authorize.Net payloads", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const payload = JSON.stringify({ eventType: "net.authorize.payment.authcapture.created" });
    const raw = new TextEncoder().encode(payload);
    const signature = signAuthorizeNet(raw, process.env.AUTHORIZE_NET_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-anet-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 405 when Authorize.Net webhook uses non-POST", async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = "anet_key";
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", { method: "GET" }),
    );
    expect(response.status).toBe(405);
  });

  it("returns 500 when Authorize.Net signature key is missing", async () => {
    delete process.env.AUTHORIZE_NET_SIGNATURE_KEY;
    const ctx = { runMutation: vi.fn() };
    const response = await handleAuthorizeNetWebhook(
      ctx as never,
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(500);
  });

  it("processes NMI webhooks with fallback event id", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = JSON.stringify({
      event_type: "subscription.updated",
      transaction_id: "txn_1",
      customer_id: "cust_1",
      plan_id: "plan_1",
      next_billing_date: Date.now(),
    });
    const raw = new TextEncoder().encode(payload);
    const signature = signNmiHex(raw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "nmi",
        providerEventId: expect.stringMatching(/^fallback:/),
        normalizedEventType: "SUBSCRIPTION_ACTIVE",
      }),
    );
  });

  it("processes NMI webhooks with explicit event id and base64 signature", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = "event_type=payment.success&event_id=evt_1&transaction_id=txn";
    const raw = new TextEncoder().encode(payload);
    const signature = createHmac("sha256", process.env.NMI_WEBHOOK_SIGNATURE_KEY)
      .update(raw)
      .digest("base64");
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-nmi-signature": `v1=${signature}`,
        },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerEventId: "evt_1",
        normalizedEventType: "PAYMENT_SUCCEEDED",
      }),
    );
  });

  it("handles NMI chargeback events", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const ctx = { runMutation: vi.fn() };
    const openPayload = JSON.stringify({
      event_type: "chargeback.opened",
      event_id: "evt_cb_open",
      chargeback_id: "cb_1",
    });
    const openRaw = new TextEncoder().encode(openPayload);
    const openSig = signNmiHex(openRaw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": `sha256=${openSig}` },
        body: openPayload,
      }),
    );

    const closedPayload = JSON.stringify({
      event_type: "chargeback.closed",
      event_id: "evt_cb_closed",
      chargeback_id: "cb_2",
    });
    const closedRaw = new TextEncoder().encode(closedPayload);
    const closedSig = signNmiHex(closedRaw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": closedSig },
        body: closedPayload,
      }),
    );

    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
  });

  it("handles additional NMI event types and signatures", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const ctx = { runMutation: vi.fn() };
    const timestamp = Date.now().toString();

    const refundPayload = JSON.stringify({
      event_type: "transaction.refund.created",
      event_id: "evt_refund",
      transaction_id: "txn_refund",
      event_date: "2026-01-13T00:00:00Z",
    });
    const refundRaw = new TextEncoder().encode(refundPayload);
    const refundSig = signNmiHex(refundRaw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-webhook-signature": `sha256=${refundSig}` },
        body: refundPayload,
      }),
    );

    const cancelPayload = JSON.stringify({
      event_type: "subscription.cancelled",
      event_id: "evt_cancel",
      subscription_id: "sub_cancel",
      customer_id: "cust_cancel",
      price_id: ["tier_a", "tier_b"],
      event_date: timestamp,
    });
    const cancelRaw = new TextEncoder().encode(cancelPayload);
    const cancelSig = signNmiHex(cancelRaw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": cancelSig },
        body: cancelPayload,
      }),
    );

    const failedPayload = JSON.stringify({
      event_type: "payment.failed",
      event_id: "evt_failed",
      transaction_id: "txn_failed",
    });
    const failedRaw = new TextEncoder().encode(failedPayload);
    const failedSig = signNmiHex(failedRaw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": `sha256=${failedSig}` },
        body: failedPayload,
      }),
    );

    const pastDuePayload = JSON.stringify({
      event_type: "recurring.failed",
      event_id: "evt_past_due",
      subscription_id: "sub_past_due",
    });
    const pastDueRaw = new TextEncoder().encode(pastDuePayload);
    const pastDueSig = signNmiHex(pastDueRaw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": pastDueSig },
        body: pastDuePayload,
      }),
    );

    expect(ctx.runMutation).toHaveBeenCalledTimes(4);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "REFUND_ISSUED" }),
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "SUBSCRIPTION_CANCELED" }),
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "PAYMENT_FAILED" }),
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ normalizedEventType: "SUBSCRIPTION_PAST_DUE" }),
    );
  });

  it("accepts numeric NMI identifiers", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = JSON.stringify({
      event_type: "payment.success",
      event_id: 123,
      transaction_id: 456,
      customer_id: 789,
    });
    const raw = new TextEncoder().encode(payload);
    const signature = signNmiHex(raw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerEventId: "123",
        providerCustomerId: "789",
      }),
    );
  });

  it("rejects NMI signatures with odd-length hex", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = JSON.stringify({
      event_type: "payment.success",
      event_id: "evt_odd",
    });
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": "abc" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects NMI signatures that are just whitespace", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = JSON.stringify({
      event_type: "payment.success",
      event_id: "evt_blank",
    });
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": "   " },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("accepts base64 NMI signatures without padding", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = "event_type=payment.success&event_id=evt_pad";
    const raw = new TextEncoder().encode(payload);
    const signature = createHmac("sha256", process.env.NMI_WEBHOOK_SIGNATURE_KEY)
      .update(raw)
      .digest("base64")
      .replace(/=+$/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-nmi-signature": `v1=${signature}`,
        },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects NMI webhooks without event type", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = JSON.stringify({ transaction_id: "txn_1" });
    const raw = new TextEncoder().encode(payload);
    const signature = signNmiHex(raw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects empty NMI payloads", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = "   ";
    const raw = new TextEncoder().encode(payload);
    const signature = signNmiHex(raw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects NMI events without id or fallback data", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = JSON.stringify({ event_type: "payment.success" });
    const raw = new TextEncoder().encode(payload);
    const signature = signNmiHex(raw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects NMI webhooks with invalid JSON", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = "{bad-json";
    const raw = new TextEncoder().encode(payload);
    const signature = signNmiHex(raw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": signature, "content-type": "application/json" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("ignores unknown NMI events", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = JSON.stringify({ event_type: "something.else", event_id: "evt_x" });
    const raw = new TextEncoder().encode(payload);
    const signature = signNmiHex(raw, process.env.NMI_WEBHOOK_SIGNATURE_KEY);
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": signature },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects NMI webhooks with missing signature", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects NMI webhooks with invalid signature", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const payload = JSON.stringify({ event_type: "payment.success", event_id: "evt" });
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-nmi-signature": "bad" },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 405 for non-POST NMI webhook requests", async () => {
    process.env.NMI_WEBHOOK_SIGNATURE_KEY = "nmi_key";
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", { method: "GET" }),
    );
    expect(response.status).toBe(405);
  });

  it("returns 500 when NMI signature key is missing", async () => {
    delete process.env.NMI_WEBHOOK_SIGNATURE_KEY;
    const ctx = { runMutation: vi.fn() };
    const response = await handleNmiWebhook(
      ctx as never,
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(500);
  });
});
