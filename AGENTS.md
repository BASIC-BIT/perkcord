# AGENTS.md — Paid Roles & Access Automation

This repo is a hosted SaaS that automates paid access for communities by converting payment events into entitlements and projecting entitlements into Discord roles (and optional Discord-native verification via Role Connections / Linked Roles).

## Mission
Build a reliable, ops-friendly system that:
- Links a Discord user to a purchase (subscription or one-time)
- Maintains an internal source-of-truth entitlement state
- Syncs Discord roles deterministically based on that entitlement state
- Provides an admin dashboard for tier mapping, manual grants/revokes, and audit trails
- Supports Stripe + Authorize.Net as payment providers from day one (NMI later)
- Ships hosted-only (no self-hosting support)

## Core mental model
- **Entitlement** = “User X should have Access Level Y in Guild G until time T”
- **Source** = where the entitlement comes from (Stripe subscription, Stripe one-time purchase, Authorize.Net subscription, Authorize.Net one-time purchase, NMI subscription, NMI one-time, manual admin grant, API)
- **Projection** = where entitlements are applied (Discord roles; Role Connections metadata; outbound webhooks; REST API consumers)

**Entitlements are the source of truth.** Never infer state from Discord roles or payment provider objects directly. Providers and Discord can drift. We reconcile.

## Product decisions locked in
- Member flow: Pick tier -> Connect Discord (OAuth) -> Pay -> Celebration page (include a Discord deep link back to the server)
- Provider order: Stripe + Authorize.Net first; NMI later (architecture remains provider-agnostic)
- Discord OAuth: Always request `role_connections.write` in the member connect flow
- Linked Roles mode: Optional “Verified Member” badge (bot roles remain primary access control)
- One-time purchases: Support both fixed-duration and lifetime entitlements (configurable per product)
- No self-serve “resync roles” for members; admin-only “force sync” + background repair
- Hosted SaaS only; Convex backend; Next.js + shadcn UI; TypeScript everywhere

## Repo structure (suggested)
- /apps/web
  - Next.js app (landing, subscribe flow, admin portal)
- /apps/bot
  - Discord bot service (role sync + diagnostics; reads entitlements from Convex)
- /packages/shared
  - Shared types, event taxonomy, provider adapter interfaces
- /convex
  - Convex schema + functions (entitlements engine, webhook endpoints, scheduled jobs)

## Invariants (do not break)
1) Entitlement state is authoritative and append-audited.
2) Role sync is idempotent and safe to retry.
3) Webhook processing is idempotent (dedupe by provider event id).
4) Never store raw card data. Always tokenize (Stripe handles this; Authorize.Net via Accept.js/Accept Hosted; NMI via Collect.js/hosted/token flow).
5) Never log secrets, OAuth tokens, or full webhook bodies with PII.

## Provider adapter interface (conceptual)
All providers should map into a normalized event stream:

- Create checkout/subscription/payment intent (as needed)
- Parse webhooks into normalized ProviderEvents:
  - PAYMENT_SUCCEEDED
  - PAYMENT_FAILED
  - SUBSCRIPTION_ACTIVE
  - SUBSCRIPTION_PAST_DUE
  - SUBSCRIPTION_CANCELED
  - REFUND_ISSUED (if supported)
  - CHARGEBACK_OPENED/CLOSED (if supported)
- Reconcile: given a provider ref, fetch the “current truth” and re-emit normalized state updates

Provider adapters should not mutate Discord directly. They update entitlements only.

## Discord integration guidelines
- Bot assigns/removes roles based on computed desired roles for each user in each guild.
- Bot role hierarchy must be validated in onboarding diagnostics (bot role must be above managed roles).
- Provide admin-only “Force sync” for a user and for a guild.
- Linked Roles (Role Connections) is optional:
  - Maintain metadata fields: is_active (bool-ish), tier (int), member_since_days (int)
  - Update user role-connection metadata on entitlement changes (requires user OAuth token and refresh token storage)

## Webhook and job hygiene
- Verify webhook signatures for each provider.
- Store raw webhook id + processed timestamp; dedupe replays.
- Use Convex scheduled jobs to:
  - Reconcile subscriptions periodically
  - Repair drift (role sync and entitlement status)
  - Retry failed outbound webhooks

## Code quality gates (day one)
- TypeScript strict mode
- ESLint + Prettier
- CI:
  - lint
  - typecheck
  - unit tests
  - basic e2e smoke test (admin login + member flow stub)
- Security hygiene:
  - dependency update automation (Dependabot/Renovate)
  - secret scanning
  - minimal logging of PII

## What agents should do when implementing changes
1) Confirm affected invariants.
2) Prefer small, testable slices.
3) When touching payments:
   - implement in provider adapter layer
   - add webhook tests + idempotency tests
4) When touching Discord:
   - keep bot operations idempotent
   - add diagnostics and failure visibility
5) Update PRD notes / event taxonomy if behavior changes.
6) When making UI changes, run `npm --prefix apps/web run test:e2e:visual:update`, run `npm --prefix apps/web run test:e2e`, and review the generated Playwright screenshots with a VLM.

## Default assumptions if not specified
- Tenant = guild (Discord server)
- 3 tiers by default (configurable)
- Failed payment grace period defaults to 7 days (configurable)
- Cancel at period end (configurable)

