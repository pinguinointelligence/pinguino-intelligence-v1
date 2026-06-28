/**
 * Presentational view for the DEV-only one-product Mapper smoke page. Pure +
 * side-effect-free: it takes data + an onRun callback and renders them. No service,
 * no store, no DB, no orchestrator import — so it is unit-testable via static markup,
 * and the boundary scan never sees a write path here.
 */
import { Button } from '@/components/ui/Button';

export interface MapperSmokeViewProps {
  /** Human product code shown in the warning (display only). */
  productCode: string;
  /** The single product id the smoke targets (display only). */
  productId: string;
  /** True while the one match is in flight — disables the button. */
  running: boolean;
  /** Pretty-printed result JSON once the match returns, else null. */
  resultJson: string | null;
  /** A calm error message if the match threw, else null. */
  errorMessage: string | null;
  /** Explicit, user-initiated run (never called on mount). */
  onRun: () => void;
}

export function MapperSmokeView({
  productCode,
  productId,
  running,
  resultJson,
  errorMessage,
  onRun,
}: MapperSmokeViewProps) {
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">One-product Mapper smoke</h1>

      <div className="mt-6 rounded-md border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <strong>Warning.</strong> Clicking the button writes <strong>only the 11 Mapper result columns</strong> on
        exactly one product — <span className="font-mono">{productCode}</span>{' '}
        (<span className="font-mono">{productId}</span>). It does not write the locked reference ingredient base,
        does not change product identity (source / EAN / product code), runs no engine or recipe calculation, and is
        not a batch. You must be signed in as the product owner.
      </div>

      <div className="mt-6">
        <Button variant="primary" onClick={onRun} disabled={running}>
          {running ? 'Running…' : 'Run one-product Mapper smoke'}
        </Button>
      </div>

      {resultJson !== null ? (
        <pre className="mt-6 overflow-auto rounded-md border border-stone-200 bg-stone-50 p-4 font-mono text-xs leading-relaxed text-ink">
          {resultJson}
        </pre>
      ) : null}

      {errorMessage !== null ? (
        <p className="mt-6 text-sm text-status-risky">Error: {errorMessage}</p>
      ) : null}
    </div>
  );
}
