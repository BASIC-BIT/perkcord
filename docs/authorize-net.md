Authorize.Net is absolutely usable in our model — it just behaves more like “classic gateway plumbing” than “Stripe-as-a-platform,” and it has one **big** subscription gotcha you’ll want to design around.

### What Authorize.Net “is” in our architecture

Authorize.Net is a **payment gateway** (not a unified platform like Stripe), and you integrate by:

* collecting payment info via **tokenization** (so your server never sees card numbers), then
* calling their core API endpoint to create transactions/subscriptions, and
* listening to **webhooks** to drive entitlement state changes.

Their own tutorial literally calls out: *“Authorize.net is a payment gateway”* and points you to their standard HTTPS POST flow. ([Authorize.net Developer Center][1])

---

## Checkout/tokenization options (frontend)

You have two realistic choices:

### Option A: Accept.js (recommended for us)

Accept.js is a JS library that sends the payment details **from the user’s browser directly to Authorize.Net** and returns a **payment nonce / opaqueData token** that you send to your backend for processing. ([Authorize.net Developer Center][2])
It supports two workflows:

* **Your own form** (more PCI scope, SAQ A-EP)
* **Hosted payment information form embedded in your page** (lower PCI scope, SAQ-A) ([Authorize.net Developer Center][2])

It also gives you explicit sandbox vs production script URLs (e.g., `jstest.authorize.net` vs `js.authorize.net`), so local testing is straightforward. ([Authorize.net Developer Center][2])

Key implementation detail: the opaque token (`dataValue`) is valid for **15 minutes**, and you use it anywhere the API would normally accept a card/bank payment type. ([Authorize.net Developer Center][2])

### Option B: Accept Hosted (redirect/iframe)

Accept Hosted is a payment form hosted by Authorize.Net. You call `getHostedPaymentPageRequest` to get a form token, then redirect/embed their form and they return the user to you. It’s also designed to keep you in **SAQ-A** territory. ([Authorize.net Developer Center][3])

**Why I’d pick Accept.js for our product:** it keeps the UX closer to “our checkout page” (tier → connect Discord → pay), while still tokenized.

---

## One-time payments (server)

Authorize.Net’s canonical one-time charge is `createTransactionRequest` with an `authCaptureTransaction` (authorize + capture in one call). ([Authorize.net Developer Center][1])

With Accept.js, you replace the card object with `opaqueData`:

* `dataDescriptor` must be `COMMON.ACCEPT.INAPP.PAYMENT`
* `dataValue` is the token from the browser ([Authorize.net Developer Center][2])

This maps very cleanly into our entitlements model:

* One-time purchase → entitlement grant (either fixed-duration or lifetime)

---

## Subscriptions (ARB) — the big gotcha

Authorize.Net’s subscription product is **Automated Recurring Billing (ARB)**.

Two important facts:

1. **ARB is not necessarily enabled by default and may have fees.** Account owners can enable it via the Merchant Interface marketplace and must review/agree to terms/fees; costs vary by account. ([Authorize.net Support Center][4])

2. **ARB does not process transactions in real time.** Their docs state subscription transactions run at about **2:00 a.m. PST** on scheduled dates, and creating a subscription successfully does **not** guarantee that payments will process successfully. ([Authorize.net Developer Center][5])

This matters for us because we want: “pay → get role immediately.”

### How we handle that in our product

If we rely purely on ARB, a user who signs up at 8pm might not actually get charged until the overnight run. That’s a mismatch for “instant access gating.”

The common pattern to fix this is:

* **Do an immediate one-time `authCaptureTransaction`** at signup (instant charge)
* Then create the ARB subscription for future renewals (start date aligned to the next billing period)

Authorize.Net’s Accept.js docs even show that you can create ARB subscriptions using `opaqueData` (so we can do this without handling raw card data). ([Authorize.net Developer Center][2])

On the entitlement side:

* Immediate transaction success → entitlement active now
* Subscription created → entitlement “renewal source” attached, but we don’t treat it as “paid” until charges actually occur (webhook-driven)

---

## Webhooks (this is where it gets good)

Authorize.Net’s webhook system is strong enough for our “payments are events” architecture.

* Webhooks are managed via a **Webhooks REST API** (create/update webhooks, event type list, history). ([Authorize.net Developer Center][6])
* The management API uses **HTTP Basic auth** built from `APILoginID:TransactionKey` base64-encoded. ([Authorize.net Developer Center][6])
* To receive notifications you must configure a **Signature Key**, and notifications include an `X-ANET-Signature` header. ([Authorize.net Developer Center][6])
* Signature verification is **HMAC-SHA512** over the raw request body using the Signature Key. ([Authorize.net Developer Center][6])
* Retry behavior is explicit: up to **10 retries** with staged delays, and if it keeps failing they can mark the webhook inactive; they recommend returning HTTP 200 ASAP and processing asynchronously. ([Authorize.net Developer Center][6])

Event coverage is exactly what we need:

* Subscription lifecycle events like `net.authorize.customer.subscription.created/updated/failed/cancelled/...` ([Authorize.net Developer Center][6])
* Payment events like `net.authorize.payment.authcapture.created`, `refund.created`, `void.created`, etc. ([Authorize.net Developer Center][6])

Also: webhook payloads include fields to help correlate:

* `merchantReferenceId` corresponds to `refId` in the API and is intended for matching notifications to requests ([Authorize.net Developer Center][6])

That maps nicely to our “correlation_id / source_ref” concept.

---

## API endpoints + sandbox

Authorize.Net’s transaction API endpoints are explicitly documented:

* Production: `https://api.authorize.net/xml/v1/request.api`
* Sandbox: `https://apitest.authorize.net/xml/v1/request.api` ([Authorize.net Developer Center][1])

Sandbox accounts are easy to create via their dev center sign-up form. ([Authorize.net Developer Center][7])

---

## Libraries / agent friendliness

Authorize.Net has official SDKs, including:

* **Node.js SDK** (`npm install authorizenet`), defaults to sandbox, and you can switch to production with `setEnvironment`. ([GitHub][8])
* **Python SDK** (`pip install authorizenet`), defaults to sandbox, and switches to production via `setenvironment`. ([GitHub][9])

TypeScript note: the Node SDK is usable from TS, but it’s not “Stripe-quality typed” out of the box. In practice, we either:

* wrap the small subset of SDK calls we use with our own TS types, or
* skip the SDK and do direct HTTPS POSTs to the endpoint with typed request/response payloads.

Authorize.Net does **not** appear to publish an official OpenAPI spec like Stripe does (Stripe’s `stripe/openapi` is unusually nice). For Authorize.Net, the SDKs + docs are the main integration surface.

---

# Bottom-line viability for our product

Authorize.Net fits our architecture well **for one-time payments** and **for subscriptions with the “immediate charge + ARB for renewals” pattern**.

The only truly sharp edge is ARB’s batch timing + “subscription creation doesn’t guarantee payment.” ([Authorize.net Developer Center][5])
But since we already want to support one-time purchases anyway, we can leverage that to make subscriptions behave “instant” from the user’s perspective.

If we decide to add Authorize.Net as a first-class provider in the PRD, it would look like:

* Checkout UI: Accept.js hosted payment form (tokenization)
* Backend: createTransactionRequest + ARBCreateSubscriptionRequest using opaqueData ([Authorize.net Developer Center][2])
* Webhooks: subscription + payment events, verified via X-ANET-Signature HMAC-SHA512 ([Authorize.net Developer Center][6])
* Sandbox: sign up + apitest endpoints ([Authorize.net Developer Center][7])

If you want, I can fold this into the PRD as “Provider: Authorize.Net” with:

* the exact normalized event mapping we’d use (subscription.created → SUBSCRIPTION_CREATED, payment.authcapture.created → PAYMENT_SUCCEEDED, etc.)
* the recommended entitlement policy for “subscription with immediate first payment”
* the minimal set of webhook event types we should subscribe to.

[1]: https://developer.authorize.net/api/reference/features/credit-card-tutorial.html "
               Authorize.net API Documentation -
               Payment Card Payment Tutorial"
[2]: https://developer.authorize.net/api/reference/features/acceptjs.html "
               Authorize.net API Documentation -
               Accept.js"
[3]: https://developer.authorize.net/api/reference/features/accept-hosted.html "
               Authorize.net API Documentation -
               Accept Hosted"
[4]: https://support.authorize.net/knowledgebase/Knowledgearticle/?code=KA-07450&dcid=EBFD0FD8-3E4E-ED11-BBA2-000D3A341FFF "
	
		Knowledge Article Detail Page - Anet
		 \| Authorize.net Support Center
"
[5]: https://developer.authorize.net/api/reference/features/recurring-billing.html "
               Authorize.net API Documentation -
               
            Recurring Billing
        "
[6]: https://developer.authorize.net/api/reference/features/webhooks.html "
               Authorize.net API Documentation -
               Webhooks"
[7]: https://developer.authorize.net/hello_world/sandbox.html "Sandbox account sign up | Authorize.net Developer Center"
[8]: https://github.com/AuthorizeNet/sdk-node "GitHub - AuthorizeNet/sdk-node: Node.js SDK for the Authorize.Net payments platform."
[9]: https://github.com/AuthorizeNet/sdk-python "GitHub - AuthorizeNet/sdk-python: Python SDK for the Authorize.Net API"
