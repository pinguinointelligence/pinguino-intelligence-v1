/**
 * PINGÜINO services — unconfigured-backend READ policy (Agent 5, E2E authenticity).
 *
 * Problem it closes: WRITE paths in every service already refuse loudly when the
 * Supabase env is absent (`throw new Error(UNAVAILABLE)`), but READ paths silently
 * returned `[]` / `null` — indistinguishable from "you really have no data". In a
 * misbuilt production bundle (env vars missing) every list surface would render an
 * empty-but-plausible state: a SILENT fake output produced without any backend.
 *
 * Policy (mirrors the repositorySelector honesty rules):
 *   • DEV build  → the read may resolve empty so local acceptance keeps working,
 *     but it is EXPLICIT: logged once per surface (never silent);
 *   • production build → the read THROWS `BackendNotConfiguredReadError` (stable
 *     `code: 'backend_not_configured'`) and logs the surface — the same loud
 *     refusal the write paths already have. A correctly built staging/production
 *     bundle always configures Supabase, so this branch can only fire in a
 *     misconfigured build, where loud failure is the honest behaviour.
 *
 * The pure decision (`chooseUnconfiguredReadBehavior`) is separated from the env
 * read so it is fully tested; `import.meta.env.PROD` is only the default input.
 */

/** Stable state-contract code for an unconfigured-backend read refusal. */
export const BACKEND_NOT_CONFIGURED = 'backend_not_configured' as const;

/** Thrown (production builds only) when a read is attempted without a configured backend. */
export class BackendNotConfiguredReadError extends Error {
  readonly code = BACKEND_NOT_CONFIGURED;
  constructor(surface: string) {
    super(
      `[${surface}] Backend is not configured in this build — refusing to fake an empty read. ` +
        'A configured VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY is required.',
    );
    this.name = 'BackendNotConfiguredReadError';
  }
}

export type UnconfiguredReadBehavior = 'empty_dev' | 'throw_production';

/** PURE policy: production fails loudly; DEV resolves empty but is logged (never silent). */
export function chooseUnconfiguredReadBehavior(isProdBuild: boolean): UnconfiguredReadBehavior {
  return isProdBuild ? 'throw_production' : 'empty_dev';
}

/** Surfaces already warned about in this session (one log line per surface, not per call). */
const warnedSurfaces = new Set<string>();

/** Testing seam — reset the warn-once memory between cases. */
export function __resetUnconfiguredReadWarnings(): void {
  warnedSurfaces.clear();
}

/**
 * Resolve an UNCONFIGURED-backend read explicitly. `surface` names the module and
 * function (e.g. `products.listMyProducts`) so the log/error is attributable.
 *
 *   • production → throws `BackendNotConfiguredReadError` (after a console.error);
 *   • DEV/test   → logs once per surface and returns the caller's honest empty value.
 *
 * Never call this when the backend IS configured — it is only the `!supabase` branch.
 */
export function emptyUnconfiguredRead<T>(
  surface: string,
  empty: T,
  isProdBuild: boolean = import.meta.env.PROD,
): T {
  if (chooseUnconfiguredReadBehavior(isProdBuild) === 'throw_production') {
    // Logged as well as thrown: even a caller that swallows the error (fail-safe
    // stores) leaves evidence of the misconfigured build in the console.
    console.error(
      `[PINGÜINO] ${surface}: backend not configured in a production build — read refused.`,
    );
    throw new BackendNotConfiguredReadError(surface);
  }
  if (!warnedSurfaces.has(surface)) {
    warnedSurfaces.add(surface);
    console.warn(
      `[PINGÜINO] ${surface}: backend not configured — resolving an explicit empty DEV read ` +
        '(a production build would refuse loudly).',
    );
  }
  return empty;
}
