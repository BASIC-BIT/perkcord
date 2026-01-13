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

Note: The admin page fetches Convex data server-side, so you won't see these requests in the browser's Network tab. Check the Next.js server logs instead.

## Playwright browsers (for E2E)

```bash
npm run playwright:install
```

## Checks

```bash
npm run check
```

## Visual snapshots (optional)

```bash
npm run test:e2e:visual:update
```
