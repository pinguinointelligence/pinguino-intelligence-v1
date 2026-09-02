/**
 * The Product Scanner's typed error model (owner defect v1.4) — PURE, no SDK, no React.
 *
 * The owner screenshot showed the literal string „Edge Function returned a non-2xx status code"
 * under a complete, correct analysis result. That is the backend SDK's generic HTTP-error message:
 * `finalizeProductScan` did `throw new Error(error.message)` without ever reading the function's
 * own JSON body, so a typed server code (`product_ingest_failed`, HTTP 400) reached the user as
 * transport vocabulary and told them nothing about what to do.
 *
 * Contract now:
 *   • every scanner failure is classified into ONE `ScannerErrorCode` with actionable Polish copy;
 *   • the raw transport/PostgREST/stack text is diagnostics only — `diagnostic`, console, telemetry;
 *   • `assertUserSafeScannerMessage` (services/scannerErrorGuard — the layer where vendor
 *     vocabulary is allowed to be named) is the last gate before render: an unrecognized message
 *     that still looks like infrastructure is replaced, never shown.
 */

export type ScannerStage = 'analysis' | 'save';

export type ScannerErrorCode =
  /** The label analysis itself did not complete. Nothing to keep. */
  | 'analysis_failed'
  /** Analysis produced data but a required step could not be confirmed. */
  | 'analysis_incomplete'
  /** Analysis is intact; only persisting the product failed. */
  | 'save_failed'
  /** The product is not yet in a state the save contract accepts. */
  | 'save_not_ready'
  /** A limit was reached (vision calls, cost ceiling, product quota). */
  | 'quota_reached'
  /** Sign-in / ownership. */
  | 'auth_required'
  /** Network or transport. */
  | 'connection'
  /** The scanner is switched off or not configured in this environment. */
  | 'unavailable';

export interface ScannerError {
  code: ScannerErrorCode;
  /** What the user reads. Always actionable, never infrastructure vocabulary. */
  messagePl: string;
  /** Whether analysis data already on screen stays valid and visible. */
  analysisRetained: boolean;
  /** Internal only: the server code / raw message. Console + telemetry, never the UI. */
  diagnostic: string;
}

const COPY: Record<ScannerErrorCode, string> = {
  analysis_failed:
    'Hmm, nie udało się pewnie odczytać etykiety. Dodaj wyraźniejsze zdjęcie i spróbuj ponownie.',
  analysis_incomplete:
    'Brakuje jednego potwierdzenia. Dodaj wskazane ujęcie i ponów analizę.',
  save_failed:
    'Analiza jest bezpieczna na ekranie, ale produktu nie zapisaliśmy. Spróbuj ponownie za chwilę.',
  save_not_ready:
    'Jeszcze jeden krok. Potwierdź brakujące informacje, a produkt będzie można zapisać.',
  quota_reached: 'Limit analiz lub zapisów został wykorzystany. Spróbuj ponownie później.',
  auth_required: 'Zaloguj się ponownie, aby dokończyć skanowanie produktu.',
  connection: 'Nie mamy teraz połączenia. Sprawdź sieć i spróbuj ponownie.',
  unavailable: 'Skaner potrzebuje chwili. Spróbuj ponownie za moment',
};

/** Server error codes → the user-facing category. Anything unlisted falls back per stage. */
const SERVER_CODES: Record<string, ScannerErrorCode> = {
  // transport / configuration
  scanner_disabled: 'unavailable',
  scanner_unavailable: 'unavailable',
  scanner_analysis_not_configured: 'unavailable',
  scanner_openai_project_not_allowed: 'unavailable',
  scanner_model_pricing_not_configured: 'unavailable',
  method_not_allowed: 'unavailable',
  // authentication / ownership
  authentication_required: 'auth_required',
  scan_session_ownership_mismatch: 'auth_required',
  owned_scan_session_not_found: 'auth_required',
  // limits
  session_vision_limit: 'quota_reached',
  scanner_call_cost_limit: 'quota_reached',
  scanner_product_quota_reached: 'quota_reached',
  product_ingest_rate_limited: 'quota_reached',
  // analysis
  scanner_provider_unavailable: 'analysis_failed',
  provider_request_failed: 'analysis_failed',
  scanner_result_validation_failed: 'analysis_failed',
  scanner_cumulative_validation_failed: 'analysis_failed',
  scanner_result_persistence_failed: 'analysis_failed',
  scanner_budget_preflight_failed: 'analysis_failed',
  scan_asset_metadata_failed: 'analysis_failed',
  scan_asset_identity_conflict: 'analysis_failed',
  invalid_scan_image: 'analysis_failed',
  invalid_scan_image_encoding: 'analysis_failed',
  scan_image_too_large: 'analysis_failed',
  scan_payload_too_large: 'analysis_failed',
  scan_session_create_failed: 'analysis_failed',
  scan_session_barcode_conflict: 'analysis_failed',
  invalid_scan_session: 'analysis_failed',
  accurate_retry_requires_fast_evidence: 'analysis_incomplete',
  // save
  scan_not_ready_for_creation: 'save_not_ready',
  scan_session_expired: 'save_not_ready',
  allergen_confirmation_persistence_failed: 'save_failed',
  scanner_product_quota_preflight_failed: 'save_failed',
  product_ingest_preflight_failed: 'save_failed',
  product_ingest_failed: 'save_failed',
  product_ingest_result_invalid: 'save_failed',
  scanner_overlay_finalize_failed: 'save_failed',
  invalid_finalize_request: 'save_failed',
  invalid_json: 'save_failed',
};

/** The safe copy a stage falls back to when nothing more specific is known. */
export const DEFAULT_SCANNER_ERROR_BY_STAGE: Record<ScannerStage, ScannerErrorCode> = {
  analysis: 'analysis_failed',
  save: 'save_failed',
};

/** Analysis data survives everything except a failed analysis. */
const retainsAnalysis = (code: ScannerErrorCode): boolean => code !== 'analysis_failed';

export interface ClassifyScannerErrorInput {
  stage: ScannerStage;
  /** The `error` field of the function's JSON body, when it returned one. */
  serverCode?: string | null;
  /** The transport/SDK message. Diagnostics only. */
  rawMessage?: string | null;
  /** Set when the failure is a fetch/network error rather than an HTTP response. */
  networkFailure?: boolean;
}

export function classifyScannerError(input: ClassifyScannerErrorInput): ScannerError {
  const serverCode = input.serverCode?.trim() || null;
  const raw = input.rawMessage?.trim() || null;
  const diagnostic = [
    `stage=${input.stage}`,
    serverCode ? `code=${serverCode}` : null,
    raw ? `raw=${raw}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const code: ScannerErrorCode = input.networkFailure
    ? 'connection'
    : serverCode && SERVER_CODES[serverCode] !== undefined
      ? SERVER_CODES[serverCode]!
      : DEFAULT_SCANNER_ERROR_BY_STAGE[input.stage];

  return { code, messagePl: COPY[code], analysisRetained: retainsAnalysis(code), diagnostic };
}

/** Every user-facing string this model can produce (the render gate's allow-list). */
export const SCANNER_ERROR_COPY: Readonly<Record<ScannerErrorCode, string>> = COPY;
