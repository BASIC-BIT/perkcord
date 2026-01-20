# Setup

## Prereqs
- Node.js 20+
- npm

## Install dependencies
```bash
npm run install:apps
```

## Configure Convex (required for generated types)
Convex codegen requires a configured deployment. Run this once from the repo root:

```bash
npx convex dev --once
```

If you see a temp directory warning on Windows, set `CONVEX_TMPDIR` to a local
folder (for example `convex/.convex/tmp`) and retry.

Then generate types:

```bash
npm run codegen
```

## Configure Convex environment variables
Convex reads its own environment variables (set in the Convex dashboard or via `npx convex env set`). These are required depending on which features you run:

Required for admin dashboard REST calls:
- `PERKCORD_REST_API_KEY` (must match `apps/web/.env.local`)

Required for Discord role connections (Linked Roles):
- `PERKCORD_OAUTH_ENCRYPTION_KEY` (base64-encoded 32-byte key)
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_MEMBER_REDIRECT_URI`
- `DISCORD_BOT_TOKEN`

Required for provider webhooks:
- `STRIPE_WEBHOOK_SECRET`
- `AUTHORIZE_NET_SIGNATURE_KEY`
- `NMI_WEBHOOK_SIGNATURE_KEY`

Required for provider reconciliation jobs:
- `STRIPE_SECRET_KEY`
- `AUTHORIZE_NET_API_LOGIN_ID`
- `AUTHORIZE_NET_TRANSACTION_KEY`
- `AUTHORIZE_NET_ENV` (e.g. `sandbox` or `production`)
- `AUTHORIZE_NET_API_URL` (optional override)
- `NMI_SECURITY_KEY` or `NMI_API_KEY`
- `NMI_API_URL` (optional override)

Local dev note: Convex runs two local ports. Use `http://127.0.0.1:3210` for `CONVEX_URL` (client/mutations) and `http://127.0.0.1:3211` for HTTP actions like `/api/guilds`. Set `PERKCORD_CONVEX_HTTP_URL` accordingly.

The admin page fetches Convex data server-side, so you won't see these requests in the browser's Network tab. Check the Next.js server logs instead.

## Configure tiers (required for member flow)

Tiers are configured per guild in the admin portal (not via `.env`). Visit `/admin`
after signing in and create tiers with:
- Slug, name, display price, perks, and sort order
- Purchase type (subscription, one_time, or lifetime)
- Provider references (Stripe price IDs, Authorize.Net key, NMI key)
- Provider checkout settings (Authorize.Net amount/interval, NMI hosted URL)

Note: Admin and member flows now use Discord OAuth to pick a guild, so you no longer pass guild IDs in URLs.

## Playwright browsers (for E2E)

```bash
npm run playwright:install
```

## Playwright E2E (Convex)

Playwright will boot (or reuse) a local Convex backend for E2E tests. Defaults:
- `CONVEX_URL` -> `http://127.0.0.1:3210`
- `PERKCORD_CONVEX_HTTP_URL` -> `http://127.0.0.1:3211`

If you already have a Convex local backend running, Playwright will reuse it. If the backend is from another project or missing functions, stop it and re-run tests so Playwright can start a fresh backend.

Optional overrides:
- `PLAYWRIGHT_CONVEX_URL`
- `PLAYWRIGHT_CONVEX_HTTP_URL`
- `PLAYWRIGHT_REUSE_CONVEX` (set to `false` to force a fresh backend)
- `PLAYWRIGHT_REUSE_SERVER` (set to `true` to reuse an existing Next dev server)

## Checks

```bash
npm run check
```

## Visual snapshots (optional)

```bash
npm run test:e2e:visual:update
```
