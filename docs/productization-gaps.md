# Productization Gaps and Test Ideas

This document captures the highest-value productionization gaps and a targeted test plan for Perkcord. It is intentionally practical: what to build next to reduce risk and increase confidence.

## Productionization gaps (priority order)

### 1) Tier management UX and configuration clarity
- Add explicit provider enable/disable toggles per guild so the UI hides irrelevant fields.
- Improve inline help text for provider fields (what value to use, where to find it, test vs live).
- Add validation feedback that maps to concrete fields (slug format, purchase type exclusivity, missing provider config).
- Introduce a "preview tier" experience to verify public-facing copy before going live.

### 2) Onboarding flow for admins
- Add a setup checklist: connect bot, verify role hierarchy, configure tiers, add provider keys, run test checkout.
- Provide one-click deep links to Discord bot settings and role hierarchy docs.
- Make setup status visible on the admin dashboard.

### 3) Diagnostics and health visibility
- Show Discord bot permission/role hierarchy status in the UI (not just logs).
- Add webhook health indicators per provider (last success, last failure, retry count).
- Add a "last role sync" status for each guild and for a given user.

### 4) Webhook verification and replay tooling
- Confirm and surface signature validation status for every provider webhook.
- Add admin tooling to replay webhooks or re-run entitlement reconciliation for a provider customer.
- Add clearer error messages for invalid/mismatched provider IDs.

### 5) Entitlement reconciliation and drift repair UX
- Add admin actions to force sync a user or a whole guild (already supported in backend).
- Add visual indicators for detected drift (roles do not match entitlements).
- Add a "repair queue" view for failed role sync requests.

### 6) Provider-specific gaps
- Stripe: confirm one-time vs subscription price IDs are mapped correctly per tier.
- Authorize.Net: clarify whether subscription ID vs one-time key is expected for each tier, and whether hosted forms are required.
- NMI: define the hosted payment flow and confirm webhook mapping.

### 7) Upgrade/downgrade policies
- Define how multiple entitlements interact (highest tier wins, additive roles, or exclusive).
- Define proration behavior (if any) for subscription upgrades/downgrades.
- Define overlap handling (existing one-time + subscription, or multiple subscriptions).

### 8) Security and compliance hygiene
- Add key rotation guidance and support (docs + UI hints).
- Provide audit log export (CSV/JSON) for admins.
- Confirm OAuth scopes are minimal and documented.

### 9) Observability and supportability
- Add structured logging with correlation IDs for checkout/webhook events.
- Add alerting hooks for repeated provider errors and role sync failures.
- Add an "environment status" page (Convex connectivity, provider keys, Discord bot status).

### 10) Documentation polish
- Expand SETUP with per-provider test flow instructions and common failure modes.
- Add glossary to clarify "tier," "entitlement," "grant," "source," "projection."

## Test ideas (highest ROI)

### A) Entitlements engine unit tests
Focus: validation rules and normalization behavior.
- Create/update tier validation:
  - slug uniqueness per guild.
  - purchase type exclusivity (subscription vs one_time vs lifetime).
  - enforce durationDays vs isLifetime mutually exclusive.
  - validate checkoutConfig format per purchase type.
- Provider refs normalization:
  - mixed subscription + one_time provider refs rejected.
  - empty arrays are removed.
  - input trimming and dedupe.

Target files:
- `convex/entitlements.ts`

### B) Webhook normalization + idempotency tests
Focus: external input safety and correct event translation.
- Stripe: subscription active, payment failed, cancellation, refund.
- Authorize.Net: payment success, subscription updates, failure.
- NMI: payment success/failure mapping.
- Idempotency: same provider event ID is processed once.

Target files:
- `convex/stripeWebhooks.ts`
- `convex/authorizeNetWebhooks.ts`
- `convex/nmiWebhooks.ts`

### C) REST API contract tests
Focus: admin tier create/update error responses.
- Ensure clear field-level errors for invalid payloads.
- Ensure new fields are required and validated.
- Verify purchase type transitions are correct and enforce exclusivity.

Target files:
- `convex/restApi.ts`

### D) Bot role sync tests
Focus: idempotent sync and retry behavior.
- "No-op" when roles already match.
- Proper add/remove delta for managed roles.
- Retry backoff on Discord 429 or 5xx errors.

Target files:
- `apps/bot/src/roleSyncWorker.ts`

### E) E2E tests (smoke + visual)
Focus: core happy paths and high-value rendering.
- Admin tier create/update via UI and via API.
- Member flow: select tier -> connect -> pay stub -> celebrate.
- Visual snapshots for all steps (already in place; keep updated).

Target files:
- `apps/web/e2e/*`

### F) Drift and reconciliation tests
Focus: long-term correctness.
- Simulate stale entitlements and ensure reconciliation fixes them.
- Simulate Discord role drift and confirm bot sync resolves it.

Target files:
- `convex/providerReconciliation.ts`
- `convex/roleSync.ts`

