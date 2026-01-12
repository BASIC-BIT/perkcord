Yep — this is the stuff that separates “cute demo” from “production money system.” The good news is: our **entitlements-as-source-of-truth** design is exactly how you survive refunds/chargebacks/support chaos. The bad news is: each provider exposes different levers, so we need a *billing-ops layer* that’s provider-agnostic.

### The universal approach (works across Stripe / NMI / Authorize.Net)

Treat payments as an **event stream** that updates a small internal state machine, and make Discord roles a pure projection of that internal state.

Concretely, we store:

* **Payment records** (one-time or “invoice-like” payments)
* **Subscription records** (if applicable)
* **Adjustments** (refunds, credits, manual comps)
* **Dispute records** (chargebacks + outcomes, if provider supports them)
* **Audit events** (who/what changed access, and why)

Then we compute “effective entitlements” deterministically and sync roles idempotently.

This lets you handle:

* Refund issued in provider dashboard → webhook arrives → entitlement shortened/ended → roles removed.
* Chargeback opened → access suspended immediately → if won later, restore (optional).
* Manual comp → entitlement granted regardless of provider state.
* “I paid but got no role” → admin sees the full timeline and can force-sync.

### Provider differences that matter

#### Stripe

Stripe gives you the most complete “dispute” surface:

* A dispute (chargeback) typically **immediately reverses the payment and debits dispute fees** from your Stripe balance. ([Stripe Docs][1])
* Stripe notifies you via Dashboard/email/**webhooks** and guides dispute response with evidence. ([Stripe Docs][1])
* Stripe has explicit evidence best practices (chronological, grouped, concise) and notes that the more info your integration collects/passes, the better your ability to prevent/defend disputes. ([Stripe Docs][2])
  Implementation implication: we should subscribe to dispute-related events (e.g., `charge.dispute.created`, `charge.dispute.closed`) and treat them as first-class entitlement-affecting events. ([Stripe Docs][3])

Refunds: Stripe will also emit refund events; we map full/partial refunds into entitlement adjustments.

#### NMI

NMI’s webhook taxonomy is very “gateway-y” and operational:

* You can subscribe to transaction events including **voids and refunds** (`transaction.void.*`, `transaction.refund.*`) and treat those as entitlement updates. ([NMI Developer Documentation][4])
* NMI also has **chargeback events**, but with a caveat: chargebacks are delivered as events *if your processor supports chargeback reporting*. ([NMI Developer Documentation][5])
* Their documented chargeback event is `chargeback.batch.complete`, and the payload can include per-chargeback details (id/date/amount/reason). ([NMI Developer Documentation][6])

Implementation implication: NMI can feed both refunds and (sometimes) chargebacks into our system cleanly via webhooks.

#### Authorize.Net

Authorize.Net is solid, but you need to understand refunds + chargebacks as separate beasts.

**Refunds & voids:**

* Authorize.Net webhooks support events including `net.authorize.payment.refund.created` and `net.authorize.payment.void.created`, plus subscription lifecycle events. ([Authorize.net Developer Center][7])
* Webhook signatures are HMAC-SHA512 in the `X-ANET-Signature` header, and they explicitly recommend pairing webhooks with reporting APIs (e.g., `getTransactionDetails`) for current status. ([Authorize.net Developer Center][7])
* Operational constraints matter a lot:

  * Only **settled** transactions can be refunded; **unsettled** must be voided/canceled. ([Authorize.net Support Center][8])
  * Refunds generally only work for transactions settled within the past **180 days** unless the account is approved for Expanded Credit Capabilities (ECC). ([Authorize.net Support Center][8])

**Chargebacks/disputes:**

* In the webhook event type list Authorize.Net shows (subscriptions, auth/capture, fraud, refund, void), there’s **no explicit “chargeback/dispute” webhook event**. ([Authorize.net Developer Center][7])
  That strongly suggests you can fully automate refunds/voids via webhooks, but chargeback visibility may require other mechanisms (merchant interface, acquirer notifications, or add-on services).
* Authorize.Net also offers a **Chargeback Management Service with Verifi CDRN** meant to streamline dispute resolution and reduce downstream impact. ([Authorize.net Support Center][9])

Implementation implication: with Authorize.Net we can automatically respond to refunds/voids and subscription failures, but chargebacks may be “best effort” unless the merchant has a dispute-management add-on and/or we integrate another signal source.

---

## So what should *our* system do about refunds/chargebacks?

### Default policy recommendations (sane, conservative)

You can make these configurable per tenant, but defaults matter:

**Refunds**

* **Full refund** of the purchase that granted access → end the entitlement immediately and remove roles.
* **Partial refund**:

  * For one-time duration entitlements: reduce `valid_through` proportionally or treat as a “manual adjustment” and require admin selection (partial refunds are ambiguous in memberships).
  * For subscriptions: keep access unless the subscription is canceled; record the refund event and show it in the timeline.

Authorize.Net’s settled-vs-unsettled rules mean we should model “void” as “refund-equivalent before settlement.” ([Authorize.net Support Center][8])

**Chargebacks / disputes**

* When a dispute/chargeback is detected (Stripe always; NMI if supported; Authorize.Net maybe via add-ons):

  * immediately move entitlement to `suspended_dispute`
  * remove roles
  * flag the user in the admin UI
* When dispute closes:

  * `won` → optionally restore access *if* the underlying subscription is still active and not canceled
  * `lost` → keep revoked; optionally block future access until admin overrides

Stripe explicitly describes the dispute lifecycle and notes pre-dispute phases; acting early reduces pain. ([Stripe Docs][10])

### “Comping” (manual overrides)

This is the easiest part:

* Manual grant is just an entitlement with `source=manual`, a note, and an expiry (or lifetime).
* Manual grants should have **priority rules** (e.g., “manual overrides payment state” or “manual is additive”).
  Given your ops goals, I’d default to **additive** (manual grants are separate; they can keep access even if payments fail).

### Complaints + support workflow (the real-world playbook)

What admins actually need at 2am is:

1. **Member timeline**

* Discord linked at
* purchase created
* payment succeeded/failed
* refund/void happened
* dispute opened/closed
* entitlement state changes
* role sync attempts + results

2. **Admin actions**

* Force sync user
* Grant comp (30/90 days)
* Revoke access
* Mark as “do not restore automatically” (useful in abuse cases)
* For providers where we have API access: cancel subscription, issue refund (optional; see below)

3. **Evidence pack (optional later, but powerful)**
   Stripe’s dispute best practices emphasize clear, chronological evidence and relevant communications/policies. ([Stripe Docs][2])
   Even if we don’t automate dispute responses, we can generate an “evidence pack” that includes:

* user’s membership timeline
* terms accepted timestamp/version
* Discord connect timestamp
* receipts/notifications sent (if any)

That kind of thing materially helps merchants defend disputes.

---

## Big product decision hiding inside this: do we *execute* refunds/cancellations or just *reflect* them?

Two modes:

**Mode A (simpler / Phase 1-friendly): “Read-only ops”**

* Admins do refunds/cancels in Stripe/NMI/Authorize.Net dashboards.
* We listen to webhooks + reconcile to reflect reality and adjust entitlements/roles accordingly.
* Pros: less scope, fewer secrets stored, fewer “we broke your billing” risks.
* Cons: admin has to context-switch into provider dashboards.

**Mode B: “Actionable ops”**

* We store provider credentials and allow actions from our portal:

  * cancel subscription
  * refund transaction (within provider constraints)
* Pros: huge “ops delight”
* Cons: credential storage, permission scoping, liability of mistakes

Given your Phase 1 goal (ship fast, prove the engine), I’d start with **Mode A**, but structure the provider adapter so Mode B can be added later without redesign.

---

## Concrete mapping we should implement (minimum viable ops coverage)

### Stripe (easy wins)

* Ingest:

  * subscription/payment success/failure/canceled
  * dispute created/closed ([Stripe Docs][3])
  * refunds
* Policy:

  * disputes suspend access immediately
* UI:

  * dispute status visible with timestamps and amounts

### NMI

* Ingest:

  * `transaction.refund.*`, `transaction.void.*`, etc. ([NMI Developer Documentation][4])
  * `chargeback.batch.complete` if available ([NMI Developer Documentation][5])
* Policy:

  * chargeback batch entries suspend access for associated member(s) if we can correlate transaction IDs to users

### Authorize.Net

* Ingest:

  * `net.authorize.payment.refund.created`, `net.authorize.payment.void.created`, subscription events ([Authorize.net Developer Center][7])
* Enforce refund semantics:

  * “refund only after settlement; otherwise void” ([Authorize.net Support Center][8])
* Chargebacks:

  * treat as “may be out-of-band” unless merchant enables/discloses a dispute feed; optionally document Verifi CDRN as an add-on path. ([Authorize.net Support Center][9])

---

If you want one crisp sentence: **we handle refunds/chargebacks by modeling them as entitlement adjustments and making Discord roles a derived state**, then we build the admin timeline + manual tools so humans can resolve the weird cases without breaking invariants.

If you’d like, I can fold this into the PRD as a dedicated “Billing Ops & Support” section with:

* the exact entitlement state machine,
* event → state transition tables for Stripe/NMI/Authorize.Net,
* and the admin UI requirements for “timeline + actions + evidence pack.”

[1]: https://docs.stripe.com/disputes "docs.stripe.com"
[2]: https://docs.stripe.com/disputes/best-practices "docs.stripe.com"
[3]: https://docs.stripe.com/api/events/types?utm_source=chatgpt.com "Types of events | Stripe API Reference"
[4]: https://docs.nmi.com/reference/transaction-events "Transaction Events"
[5]: https://docs.nmi.com/reference/overview "Overview"
[6]: https://docs.nmi.com/reference/chargeback-events "Chargeback Events"
[7]: https://developer.authorize.net/api/reference/features/webhooks.html "
               Authorize.net API Documentation -
               Webhooks"
[8]: https://support.authorize.net/knowledgebase/article/000001221/en-us "
	
		How to issue a refund transaction? - Classic Experience (1.0)
		 \| Authorize.net Support Center
"
[9]: https://support.authorize.net/knowledgebase/Knowledgearticle/?code=KA-07774&utm_source=chatgpt.com "What is and how to sign up for Chargeback Management ..."
[10]: https://docs.stripe.com/disputes/how-disputes-work "docs.stripe.com"
