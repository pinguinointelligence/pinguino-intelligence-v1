/**
 * The LAST gate between a failure and the Product Scanner screen (owner defect v1.4).
 *
 * Lives in the services layer on purpose: naming vendor/transport vocabulary is exactly what this
 * module does, and the studio boundary guard keeps those names out of `src/features/**`. The typed
 * error model itself is pure and stays in `features/product-scanner/scannerErrors.ts`.
 *
 * The owner saw „Edge Function returned a non-2xx status code" rendered under a correct scan
 * result. `productScanner.ts` now classifies every failure before it is thrown, so this guard
 * should never have work to do — it exists so that a future code path which forgets to classify
 * still cannot put transport vocabulary on a user's screen.
 */
import {
  DEFAULT_SCANNER_ERROR_BY_STAGE,
  SCANNER_ERROR_COPY,
  type ScannerStage,
} from '@/features/product-scanner/scannerErrors';

/**
 * Phrasings that are transport/database vocabulary rather than product language. Every entry is a
 * message shape actually observed from this stack; the first is the owner's exact leak.
 */
const RAW_INFRASTRUCTURE_PATTERNS: readonly RegExp[] = [
  /non-2xx status code/i,
  /edge function/i,
  /functions?httperror|functionsrelayerror|functionsfetcherror/i,
  /\bPGRST\d+/,
  /\bSQLSTATE\b|\berrcode\b/i,
  /^\s*(ERROR|FATAL|PANIC|WARNING|HINT|DETAIL|CONTEXT)\s*:/i,
  /\b(P0\d{3}|2[23][0-9A-Z]{3}|42[0-9A-Z]{3})\b:/,
  /classification entity not found|raise exception/i,
  /violates? (row-level security|foreign key|check constraint|unique constraint)/i,
  /duplicate key value/i,
  /relation "[^"]+" does not exist|column "[^"]+"/i,
  /permission denied for (table|function|schema)/i,
  /public\.[a-z_]+_v\d|\bpg_[a-z_]+\b/i,
  /^\s*(TypeError|ReferenceError|SyntaxError|Error):/,
  /\bat [A-Za-z0-9_.$]+ \(.*:\d+:\d+\)/,
  /supabase|postgrest|postgres|deno\b/i,
  /\bHTTP\s?\d{3}\b|status(?: code)?[:= ]\s?\d{3}/i,
];

export function isRawInfrastructureMessage(message: string): boolean {
  return RAW_INFRASTRUCTURE_PATTERNS.some((pattern) => pattern.test(message));
}

/** A bare machine identifier such as `product_ingest_failed` — a code, not a sentence. */
const looksLikeServerCode = (value: string): boolean => /^[a-z][a-z0-9_]{3,63}$/.test(value);

/**
 * Returns the message only if it is safe to show. Anything that is one of our own copy strings
 * passes; an unrecognized server code or any infrastructure phrasing becomes the stage's safe copy.
 */
export function assertUserSafeScannerMessage(message: string, stage: ScannerStage): string {
  if (Object.values(SCANNER_ERROR_COPY).includes(message)) return message;
  if (isRawInfrastructureMessage(message) || looksLikeServerCode(message)) {
    return SCANNER_ERROR_COPY[DEFAULT_SCANNER_ERROR_BY_STAGE[stage]];
  }
  return message;
}

/** Convert an arbitrary caught value before it enters React state. Raw transport details never
 * become component state, which makes the render boundary safe by construction. */
export function scannerMessageFromUnknown(cause: unknown, stage: ScannerStage): string {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  return assertUserSafeScannerMessage(message, stage);
}
