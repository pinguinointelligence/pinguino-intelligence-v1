/// <reference types="vite/client" />

// Font packages ship CSS only (no type declarations); declared here so
// noUncheckedSideEffectImports stays enabled for everything else.
declare module '@fontsource-variable/hanken-grotesk';

// Frontend env (Phase 2A) — public keys only; optional so the app builds without
// a .env.local (auth degrades gracefully). NEVER add a privileged server-side key here.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Sentry DSN (public by design — ingest-only). Absent → monitoring disabled. */
  readonly VITE_SENTRY_DSN?: string;
  /** Public promotion flags: which list price is offered to new customers. No secret. */
  readonly VITE_OFFER_LAUNCH_ENABLED?: string;
  readonly VITE_OFFER_FOUNDING_ENABLED?: string;
}
