# Deployment (static SPA host)

PINGÜINO is a **client-only Vite + React + TypeScript SPA**. The build output is a
static bundle (`dist/`) that any static host can serve. There is **no server to run** —
the only backend is Supabase (Postgres + RLS + Edge Functions), reached from the
browser through the public anon key.

## Status

`netlify.toml` and `vercel.json` are committed and **inert** — they take effect only
once you connect a site on that host. They do not affect local dev, CI, tests, or the
`npm run build` output. **Pick one host** (both are free-tier sufficient for a
client-only SPA); the other config can stay or be deleted.

## One-time setup (owner action, when ready to go online)

1. **Choose a host** — Netlify, Vercel, or Cloudflare Pages (all free tier).
2. **Connect the repo** and accept the committed build settings:
   - Build command: `npm run build`
   - Publish/output directory: `dist`
   - Node: 24
   - SPA rewrite: all paths → `/index.html` (already in the config files).
3. **Set the two public env vars** in the host dashboard (these are the ONLY frontend
   env vars; never put the Supabase `service_role` key here — see `.env.example`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   When both are absent the app still builds and runs; auth simply reports as
   unavailable and the demo + Advanced Studio keep working.
4. The resulting `https://<project>.vercel.app` / `.netlify.app` URL becomes the
   staging `APP_BASE_URL` used by Stripe return/refresh URLs and Apple Pay domain
   verification (see the billing docs — those steps stay deferred until launch).

## Notes

- Dev-only tools (`/dev/*` routes) are gated behind `import.meta.env.DEV` and are
  **dead-code-eliminated from the production bundle** — they never ship to a deployed
  site.
- CI (`.github/workflows/ci.yml`) runs typecheck + lint + test + build on every push;
  it deliberately has **no deploy step** (deploys are host-driven from `main`).
