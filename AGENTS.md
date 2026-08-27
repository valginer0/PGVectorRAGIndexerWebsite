# Agent Instructions — PGVectorRAGIndexerWebsite

Small Vite static site (marketing + demo) with a thin Vercel serverless API
layer for Stripe checkout. No subsystem here is large enough to need its
own AGENTS.md — this file is the whole contract.

## Layout

- `index.html` / `demo.html` — Vite multi-page entries (see
  `vite.config.js` rollupOptions.input); most copy lives inline in
  `index.html` (1400+ lines), not componentized.
- `src/main.js`, `src/style.css` — page JS/CSS (`style.css` is the bulk,
  ~2200 lines).
- `api/checkout.js`, `api/webhook.js`, `api/lib/webhook-logic.js` — Stripe
  checkout/webhook handlers, each with a matching `*.test.js`. Keep
  business logic in `webhook-logic.js`, not the Vercel handler files, so
  it stays testable outside the Vercel runtime — that split is already
  the convention here.
- `public/` — static assets served as-is, incl. `install.bat` /
  `install.command` stubs and standalone pages (`confirmed.html`,
  `enable-virtualization.html`).
- `tests/` — Vitest content/integration checks on the built site,
  separate from the `api/*.test.js` unit tests.

## Deploy & release

- CI: `.github/workflows/deploy.yml` (GitHub Pages on push to main),
  `content-checks.yml` (`npm test` on push/PR). Also deploys to Vercel.
- Download links on this site point at specific PGVectorRAGIndexer
  release tags — when that project cuts a release, verify these links
  aren't stale (`PGVectorRAGIndexer/scripts/verify_release.sh` checks
  this as part of `/cut-release`).
- See `README.md` / `DEPLOYMENT.md` for local dev and deploy commands.
