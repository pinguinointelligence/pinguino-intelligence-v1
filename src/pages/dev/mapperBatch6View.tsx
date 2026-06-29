/**
 * Presentational view for the DEV-only six-product Mapper batch page. Pure +
 * side-effect-free: it takes the result rows + an onRun callback and renders them. No
 * service, no store, no DB, no orchestrator import — unit-testable via static markup, and
 * the boundary scan never sees a write path here.
 */
import { Button } from '@/components/ui/Button';

export interface BatchRow {
  code: string;
  ok: boolean;
  mapper_status: string | null;
  match_method: string | null;
  match_confidence: string | null;
  matched_basement_id: string | null;
  candidate_count: number | null;
  error: string | null;
}

export interface MapperBatch6ViewProps {
  rows: BatchRow[];
  running: boolean;
  count: number;
  onRun: () => void;
}

export function MapperBatch6View({ rows, running, count, onRun }: MapperBatch6ViewProps) {
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Six-product Mapper batch</h1>

      <div className="mt-6 rounded-md border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <strong>Warning.</strong> Clicking the button runs the Mapper on{' '}
        <strong>exactly {count} hardcoded products</strong> (the single-candidate set). It writes{' '}
        <strong>only the 11 Mapper result columns</strong> on those rows — it does not write the locked
        reference ingredient base, does not change product identity (source / EAN / product code), runs no
        engine or recipe calculation, and is not a full-catalog batch. You must be signed in as the product owner.
      </div>

      <div className="mt-6">
        <Button variant="primary" onClick={onRun} disabled={running}>
          {running ? 'Running…' : `Run ${count}-product Mapper batch`}
        </Button>
      </div>

      {rows.length > 0 ? (
        <pre className="mt-6 overflow-auto rounded-md border border-stone-200 bg-stone-50 p-4 font-mono text-xs leading-relaxed text-ink">
          {JSON.stringify(rows, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
