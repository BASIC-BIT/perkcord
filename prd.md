## PRD — Paid Roles & Access Automation (comprehensive draft)

### 1) Summary

Paid Roles & Access Automation is a hosted SaaS that automates membership access for communities. It connects payments (Stripe + Authorize.Net first; NMI later) to an internal entitlements engine and projects those entitlements into Discord roles. It includes an admin portal for tier setup, role mapping, manual grants, and audit trails. It also supports an optional Discord-native verification layer via Role Connections / Linked Roles.

### 2) Background and motivation

Community monetization breaks in predictable ways:

* Identity mismatch (payer ≠ Discord user)
* Webhook drift (events missed, retries, out-of-order)
* Role hierarchy and permission misconfiguration
* No audit trail for “why does this person have access?”
* Admins need comp/revoke tools and predictable lifecycle policies

Existing tools can cover the Stripe→Discord happy path, but many assume Stripe forever and hide operational complexity. We’re building an ops-first product with a provider-agnostic core.

### 3) Goals

**Phase 1**

* Hosted SaaS with tenant model anchored on Discord guilds
* Member flow: tier selection → Discord connect (OAuth) → payment → success/celebration
* Support **subscriptions + one-time payments** for **Stripe + Authorize.Net** (NMI later)
* Entitlements engine as source of truth with audit trail
* Discord bot assigns/removes roles idempotently
* Admin portal (Discord OAuth) for:

  * Tier creation and mapping to roles
  * Member lookup and audit timeline
  * Manual grants/revokes
  * Admin-only “force sync”
* Reliability: webhook idempotency + reconciliation jobs
* Platform surface: outbound webhooks + minimal REST API

**Phase 1.5**

* Role Connections metadata write + guidance for admins to configure Linked Roles in Discord
* Position as optional “Verified Member” badge/role, not primary gating

### 4) Non-goals

* Running an on-platform item marketplace or facilitating direct commerce
* Self-hosted deployments
* End-user self-serve resync button
* Building a full accounting system (we provide operational metrics, not bookkeeping)

### 5) Personas

* **Server Owner**: wants monetization and control
* **Server Admin/Mod**: wants tools to resolve issues quickly
* **Member**: wants one-time setup and invisible automation

### 6) Core concepts

* **Tenant**: a Discord guild (server). (We may add orgs later; Phase 1 is guild-centric.)
* **Tier**: a named access level with role mappings and payment products
* **EntitlementGrant**: a time-bounded or lifetime access record
* **ProviderRef**: pointer to the payment provider object(s) that created the entitlement
* **Projection**:

  * Discord roles (primary)
  * Role Connections metadata (optional)
  * Outbound webhooks (platform)
  * REST API consumers (platform)

### 7) Member experience requirements

**7.1 Subscribe flow**

1. Landing page → “Pick your tier”
2. “Connect Discord” (OAuth)

   * Always request `role_connections.write`
   * Store Discord user id linkage
   * Store refresh token securely (needed for role connection metadata updates)
3. Payment step

   * Stripe: subscription or one-time checkout
   * Authorize.Net: subscription or one-time checkout (tokenized; no card data stored)
   * NMI: follow after Phase 1 (same normalized event model)
4. Celebration page

   * Show “You’re all set”
   * Provide Discord deep link back to server
   * Provide support CTA if access doesn’t appear quickly (no user resync button)

**7.2 Access timing**

* After successful payment, role assignment should occur within seconds (best effort).
* If Discord API errors occur, system retries and repairs via reconciliation.

### 8) Admin experience requirements

**8.1 Admin portal login**

* Discord OAuth login for admins
* Admin chooses guild to manage (guild where bot is installed / authorized)

**8.2 Onboarding diagnostics**

* Validate bot permissions
* Validate role hierarchy (bot role above managed roles)
* Validate that configured roles exist

**8.3 Tier management**

* Create/edit tiers:

  * name, description
  * role mappings (one or more roles per tier)
  * provider product mapping:

    * Stripe subscription price id(s)
    * Stripe one-time product/price id(s)
    * Authorize.Net ARB subscription id(s)
    * Authorize.Net one-time “product” config (authCaptureTransaction)
    * NMI plan id(s) or recurring config (later)
    * NMI one-time “product” config (later)
  * entitlement policy:

    * subscription: active through billing period end
    * one-time: fixed duration OR lifetime
* Optionally configure grace/cancel behavior per tier (defaults exist)

**8.4 Member operations**

* Search by Discord user
* View:

  * current entitlements
  * provider refs
  * last entitlement changes
  * role sync history
* Actions:

  * manual grant (duration or lifetime; with note)
  * revoke
  * admin-only force sync (user or guild)

**8.5 Reporting**

* Active members by tier
* Recent lifecycle events feed
* Basic revenue indicators (derived from provider events) with “not accounting” disclaimer

### 9) Entitlements engine requirements

**9.1 Data model (conceptual)**

* `Guild`
* `Tier`
* `MemberIdentity`

  * discord_user_id
  * oauth tokens (encrypted) + refresh data
* `EntitlementGrant`

  * tier_id, discord_user_id, guild_id
  * status (active, pending, past_due, canceled, expired)
  * valid_from, valid_through (nullable for lifetime)
  * source (stripe_subscription | stripe_one_time | authorize_net_subscription | authorize_net_one_time | nmi_subscription | nmi_one_time | manual | api)
  * source_ref (provider object ids)
* `AuditEvent`

  * timestamp
  * actor (system/admin)
  * event_type
  * correlation_id
  * payload (minimal; avoid sensitive info)

**9.2 Rules**

* Entitlements are authoritative; projections are derived.
* Multiple grants may exist; “effective access” is computed deterministically (e.g., highest tier active, or union of roles—define policy).
* Manual grants can override provider grants (explicit precedence rules).

### 10) Discord projection requirements

**10.1 Bot-managed roles**

* Compute desired roles per member based on effective entitlement
* Apply delta:

  * add missing roles
  * remove roles no longer desired
* Idempotent and retry-safe
* Handle rate limiting and Discord API errors gracefully (retry/backoff)

**10.2 Role Connections metadata (Phase 1.5)**

* Metadata schema (max 5 fields; Phase 1.5 uses 3):

  * `is_active` (bool-ish)
  * `tier` (int)
  * `member_since_days` (int)
* Always request `role_connections.write` in Discord OAuth to enable updates
* Update metadata whenever entitlements change
* Admin guidance: how to create Linked Roles in Discord’s UI using these fields
* Linked Role remains optional; bot roles remain primary gating

### 11) Payments requirements (Stripe + Authorize.Net first)

**11.1 Authorize.Net (Phase 1)**

* Positioning:

  * Authorize.Net is a payment gateway (not a unified platform like Stripe).
  * Tokenization is required; we never handle raw card data.
* Checkout/tokenization:

  * Preferred: Accept.js (in-page tokenization) returning `opaqueData`.
  * Alternative: Accept Hosted (redirect/iframe).
  * `opaqueData` tokens expire after ~15 minutes; backend must use promptly.
* One-time payments:

  * Use `createTransactionRequest` with `authCaptureTransaction`.
  * Treat a successful auth+capture as the entitlement activation trigger.
* Subscriptions (ARB) - operational gotcha:

  * ARB may not be enabled by default and can have account-level fees.
  * ARB runs transactions in a batch window (docs indicate around 2:00 a.m. PST).
  * Creating a subscription does not guarantee a successful charge.
* "Instant access" pattern for subscriptions:

  * Perform an immediate one-time `authCaptureTransaction` at signup.
  * Create the ARB subscription for renewals (start date aligned to the next
    billing period).
  * Entitlement becomes active on the immediate charge; renewals update via
    webhooks.
* Webhooks:

  * Verify `X-ANET-Signature` using HMAC-SHA512 over the raw request body with
    the Signature Key.
  * Manage webhooks via Authorize.Net Webhooks API (HTTP Basic auth).
  * Return HTTP 200 quickly and process asynchronously; expect retry behavior.
* Event mapping (minimum viable set):

  | Authorize.Net event | Normalized event | Notes |
  | --- | --- | --- |
  | `net.authorize.payment.authcapture.created` | PAYMENT_SUCCEEDED | Immediate charge for one-time or first subscription payment |
  | `net.authorize.payment.refund.created` | REFUND_ISSUED | Refund after settlement |
  | `net.authorize.payment.void.created` | REFUND_ISSUED | Void before settlement |
  | `net.authorize.customer.subscription.created` | SUBSCRIPTION_ACTIVE | Subscription created; does not guarantee payment |
  | `net.authorize.customer.subscription.updated` | SUBSCRIPTION_ACTIVE | Status or metadata change |
  | `net.authorize.customer.subscription.failed` | SUBSCRIPTION_PAST_DUE | Charge failed |
  | `net.authorize.customer.subscription.cancelled` | SUBSCRIPTION_CANCELED | Canceled |

* API endpoints:

  * Production: `https://api.authorize.net/xml/v1/request.api`
  * Sandbox: `https://apitest.authorize.net/xml/v1/request.api`
* Reconciliation:

  * Given a provider ref (transaction/subscription id), fetch current status
    and re-emit normalized state updates (same pattern as other providers).

**11.2 Stripe (Phase 1)**

* Support:

  * subscriptions (recurring)
  * one-time payments
* Webhook ingestion:

  * verify signature
  * parse into normalized events
  * idempotency (dedupe by event id)
* Reconciliation:

  * periodically query subscription/payment state and repair entitlements

**11.3 NMI (Phase 2+)**

* Support:

  * subscriptions (recurring)
  * one-time payments
* Checkout:

  * tokenization approach (Collect.js or hosted/token flow)
  * store vault id / customer ref where needed for recurring
* Webhook ingestion:

  * verify signature
  * normalized events
  * idempotency
* Reconciliation:

  * periodic status polling and repair

**11.4 Unified purchase model**
Every purchasable “thing” maps to an entitlement policy:

* Subscription products → entitlement active until period end (subject to grace rules)
* One-time products → entitlement either:

  * fixed duration (configurable, e.g., 30/90/365 days)
  * lifetime (no expiry)

### 12) Platform surface (API + outbound webhooks)

**12.1 Outbound webhooks**
Events emitted to customer-configured endpoints:

* membership/grant lifecycle:

  * `membership.activated`
  * `membership.updated`
  * `membership.canceled`
  * `membership.expired`
  * `grant.created`
  * `grant.revoked`
* operational:

  * `role_sync.succeeded`
  * `role_sync.failed`
* Delivery:

  * signed payloads
  * retries with backoff
  * dead-letter visibility in admin UI

**12.2 REST API (minimal)**

* Read:

  * list tiers
  * list members
  * get member status
  * get audit timeline
* Write (admin):

  * create/revoke manual grants
  * force sync request

### 13) Reliability and correctness

**13.1 Idempotency**

* Provider webhooks deduped by provider event id
* Internal state transitions use correlation ids
* Discord role sync is computed from source-of-truth entitlements each time (no incremental assumptions)

**13.2 Reconciliation**

* Scheduled jobs:

  * reconcile provider state (Stripe + Authorize.Net, later NMI) for active subscriptions
  * repair expired entitlements
  * re-run role sync for members with recent failures

**13.3 Observability**

* Admin-visible diagnostics:

  * last webhook received
  * last role sync per member
  * error counts and reasons
* System logs (PII-minimized)
* Internal metrics:

  * webhook processing latency
  * role sync latency
  * error rate

### 14) Security and privacy

* Store OAuth refresh tokens encrypted
* Never store raw card data
* Secrets in environment configuration (Convex env + deployment secrets)
* Minimal PII: Discord user id is primary identifier; email optional (from provider) and stored only if needed for support/auditing
* Strict log redaction

### 15) Tech stack (Phase 1)

* Frontend: Next.js + TypeScript + shadcn/ui
* Backend: Convex (schema, functions, HTTP endpoints for webhooks, scheduled jobs)
* Bot: Node/TS Discord bot service, reading/writing via Convex
* Payments: Stripe SDK + Authorize.Net API (Accept.js + server API) in Phase 1; NMI later
* Quality:

  * strict TS
  * ESLint + Prettier
  * CI: lint/typecheck/test
  * dependency update automation + secret scanning

### 16) Rollout plan / milestones

**Milestone 1 — Entitlements core**

* Schema + grants + audit events
* Admin portal skeleton + auth
Progress (2026-01-12): Completed initial Convex schema for entitlements core (guilds, tiers, member identities, entitlement grants, audit events).
Progress (2026-01-12): Added Convex mutation for manual entitlement grants with audit events.
Progress (2026-01-12): Added Convex mutation to revoke entitlement grants with audit events.
Progress (2026-01-12): Added member snapshot query returning entitlements plus audit events, with audit events indexed by subject user for admin lookup.        
Progress (2026-01-12): Added tier management mutations (create/update) and list query with entitlement policy validation plus audit events.
Progress (2026-01-12): Added Convex guild upsert + lookup functions with audit events to support bot/admin onboarding.
Progress (2026-01-12): Added member identity upsert mutation for Discord OAuth linkage, including audit events without logging tokens.
Progress (2026-01-12): Added admin member search query to find linked Discord users by id or username.
Progress (2026-01-12): Added guild audit events feed query with optional member filter for admin timelines.
Progress (2026-01-12): Added provider customer link table plus upsert/lookup mutations to map payment provider customer IDs to Discord users per guild.
Progress (2026-01-12): Added admin portal skeleton Next.js app with Discord OAuth login and signed session cookie.
Progress (2026-01-12): Added admin portal member lookup panels with member search, snapshots, and audit timelines via the Convex REST API.
Progress (2026-01-12): Added admin portal manual grant/revoke forms with Convex REST API proxy routes and tier hints.
Progress (2026-01-12): Added admin tier management REST endpoints plus admin portal forms for creating and updating tier mappings.

**Milestone 2 — Discord bot roles**

* Bot install + onboarding diagnostics
* Role sync worker + admin “force sync”
Progress (2026-01-12): Added role sync request table and admin mutation for force sync requests (guild/user) with audit events.
Progress (2026-01-12): Added role sync request claim/completion mutations for bot workers with audit events.
Progress (2026-01-12): Added Convex query to compute desired role IDs for a member from active entitlements for bot role sync.
Progress (2026-01-12): Added guild diagnostics schema plus upsert/get mutations for onboarding checks with audit events.
Progress (2026-01-12): Added Convex query to list recent role sync requests by guild or user for admin diagnostics.
Progress (2026-01-12): Added Discord bot worker skeleton that upserts guilds, runs onboarding diagnostics, and processes role sync requests by applying role deltas from Convex entitlements.
Progress (2026-01-12): Added admin portal force sync form and API route to request role sync jobs via the Convex REST API.
Progress (2026-01-12): Added REST API endpoint and admin health card to surface guild onboarding diagnostics (permissions, role hierarchy, missing roles).
Progress (2026-01-12): Added REST API endpoint and admin portal card to display role sync request history for member snapshots.

**Milestone 3 — Stripe integration**

* subscription + one-time
* webhooks + reconciliation
* end-to-end member flow
Progress (2026-01-12): Added provider event log table plus idempotent record/mark processed mutations to dedupe webhook events across Stripe/Authorize.Net/NMI.
Progress (2026-01-12): Added Stripe webhook HTTP endpoint with signature verification and normalized provider event logging.
Progress (2026-01-12): Captured Stripe price IDs on webhook ingestion and stored them on provider events for downstream entitlement mapping.
Progress (2026-01-12): Added member flow stub pages in the Next.js app (tier selection, Discord connect placeholder, payment placeholder, celebration page with Discord deep link hint).
Progress (2026-01-12): Added member Discord OAuth connect flow with role_connections.write scope, encrypted token storage, and Convex member identity linkage.  
Progress (2026-01-12): Added Stripe checkout session creation API plus member pay page wiring with tier-based Stripe price configuration.
Progress (2026-01-12): Added member session cookie after Discord OAuth and linked Stripe customer IDs to Discord users during checkout for provider-customer mapping.

**Milestone 4 — Authorize.Net integration**

* subscription + one-time
* webhooks + reconciliation
* end-to-end member flow
Progress (2026-01-12): Added Authorize.Net webhook HTTP endpoint with signature verification and normalized provider event logging.
Progress (2026-01-12): Captured Authorize.Net merchantReferenceId on webhook ingestion to map provider events back to tier configuration.
Progress (2026-01-12): Added provider event processing job to map normalized Stripe/Authorize.Net events into entitlement grants with audit trails and outbound membership webhooks.
Progress (2026-01-12): Added Authorize.Net one-time checkout flow in the member pay page using Accept.js tokenization, a server route to submit authCaptureTransaction requests, and webhook parsing fallback for invoiceNumber tier keys.
Progress (2026-01-12): Added Authorize.Net subscription checkout flow with immediate authCaptureTransaction plus ARB subscription creation, with env-driven billing interval config and member pay page labeling.

**Milestone 5 — Platform surface**

* outbound webhooks + minimal REST API
* admin dashboard health panes
Progress (2026-01-12): Added Convex query to report active member counts by tier for admin reporting.
Progress (2026-01-12): Added provider event diagnostics query to surface the latest webhook per provider for a guild (matched by customer or price ids).        
Progress (2026-01-12): Added minimal REST API HTTP endpoints for tier listing, member search, member snapshots, and audit timelines guarded by PERKCORD_REST_API_KEY.
Progress (2026-01-12): Added outbound webhook endpoint schema plus create/update/list mutations with signing secrets and audit events.
Progress (2026-01-12): Added outbound webhook delivery queue with retry/backoff processing, cron dispatch, and enqueue hooks for grant + role sync events.
Progress (2026-01-12): Added REST API admin endpoints to create and revoke manual entitlement grants.
Progress (2026-01-12): Added REST API endpoint to request admin force-sync (guild or user) role sync jobs.
Progress (2026-01-12): Added admin health overview panel plus REST endpoints for active member counts and latest provider events.
Progress (2026-01-12): Added admin portal recent audit events feed for guild lifecycle visibility.
Progress (2026-01-12): Added REST API endpoint and admin health panel to surface failed outbound webhook deliveries for dead-letter visibility.

**Milestone 6 — Phase 1 hardening**

* retries, rate limits, audit UX polish, error handling
Progress (2026-01-12): Added scheduled job to expire entitlement grants past validThrough with audit events.
Progress (2026-01-12): Added scheduled job to retry failed role sync requests with safeguards to avoid duplicate retries.
Progress (2026-01-12): Added Discord bot role sync retry/backoff handling for rate limits and transient Discord API errors.

**Milestone 7 — NMI integration (later)**

* subscription + one-time
* webhooks + reconciliation
* end-to-end member flow

**Milestone 8 — Phase 1.5 (optional)**

* Role Connections metadata schema registration
* role connection updates on entitlement change
* admin setup wizard for Linked Roles

### 17) Success criteria

* New subscriber receives correct role within seconds in the happy path
* Cancellation/expiry behavior matches configured policy with no manual admin intervention
* Admin can resolve “why no role?” via audit timeline without digging through logs
* Webhook failures or Discord API failures self-heal via reconciliation within a bounded window
* Stripe + Authorize.Net both proven end-to-end in sandbox mode (NMI later)

