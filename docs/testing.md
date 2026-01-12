# Testing and visual review

This repo uses per-package scripts. The commands below assume npm, but the same
script names work with your package manager of choice.

## Web app (apps/web)

From the repo root:

- `cd apps/web`
- Unit tests: `npm run test`
- E2E smoke + full suite: `npm run test:e2e`
- Visual-only E2E: `npm run test:e2e:visual`
- Update Playwright visual snapshots: `npm run test:e2e:visual:update`
- Storybook UI tests: `npm run test:storybook`
- Update Storybook snapshots: `npm run test:storybook:update`

Storybook runner needs the Storybook server running:

- Terminal 1: `npm run storybook`
- Terminal 2: `npm run test:storybook` or `npm run test:storybook:update`

Snapshot locations:

- Playwright visual baselines: `apps/web/e2e/visual.spec.ts-snapshots/`
- Playwright failure artifacts: `apps/web/test-results/`
- Storybook snapshots: `apps/web/storybook-snapshots/`

## Bot (apps/bot)

- `cd apps/bot`
- Lint: `npm run lint`
- Typecheck/build: `npm run typecheck` or `npm run build`

## Convex (convex)

- `cd convex`
- Lint: `npm run lint`

## Code metrics (size + complexity)

From the repo root (bash):
- Install scc: `go install github.com/boyter/scc/v3@latest`
- Install lizard: `python -m pip install lizard`
- Run metrics: `bash scripts/check-metrics.sh`

Ignore allowlist lives in `scripts/metrics-ignore.txt`.

## Visual review workflow (VLM)

- After any UI change, run the visual suites and update snapshots intentionally.
- Compare baseline images in `apps/web/e2e/visual.spec.ts-snapshots/` and any
  diff images under `apps/web/test-results/`.
- Review Storybook snapshots in `apps/web/storybook-snapshots/` for component
  changes.
- Add a short note in PRs describing snapshot changes and why they are expected.
