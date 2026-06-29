/**
 * DEV-ONLY six-product Mapper batch page (route: /dev/mapper-batch-6).
 *
 * Runs the EXISTING explicit orchestrator matchAndSaveProduct() against EXACTLY the six
 * hardcoded single-candidate products surfaced by the post-fix read-only audit, then shows
 * each returned mapper-result row. This is the deliberate, smallest real run of the matcher
 * after the numeric-coercion fix — NOT the full 69, NOT the ambiguous set.
 *
 * Boundaries (same as the one-product smoke page):
 *   - Gated by import.meta.env.DEV: the route is registered only in DEV (app/router.tsx),
 *     and this component renders NotFound when not DEV — it cannot ship in a production
 *     build (the import is dead-code-eliminated there).
 *   - Targets a FIXED list of six hardcoded ids. No arbitrary input, no list/import, no
 *     full-catalog matching, no runMatch flag.
 *   - The ONLY action is matchAndSaveProduct(id) per product — the boundary-tested
 *     orchestrator that writes ONLY the 11 mapper-result columns on that one row via the
 *     RLS-scoped products service. It never writes the locked reference base, never runs the
 *     engine, never changes identity / source / code, and uses no privileged key.
 *   - Nothing runs on mount; the batch runs only on an explicit button click. Sign-in is
 *     enforced by row-level security inside the orchestrator (no extra auth gating).
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { matchAndSaveProduct } from '@/services/productMapper';
import { MapperBatch6View, type BatchRow } from './mapperBatch6View';

/** The exact six single-candidate products (verified read-only before wiring). */
const BATCH: ReadonlyArray<{ code: string; id: string }> = [
  { code: 'PR-ING-000010', id: '0acf8585-0967-4d8f-ad4e-597d2dd26f6a' },
  { code: 'PR-ING-000011', id: '50bee8c3-60b4-447a-84c6-ce8474e2ff59' },
  { code: 'PR-ING-000012', id: 'a8cecf22-d2ef-4426-af9a-8133a1516782' },
  { code: 'PR-ING-000020', id: 'f5c2d6a7-87f1-42d4-a2e2-de82b3af844e' },
  { code: 'PR-ING-000031', id: '69fb82a0-62a8-4eb2-94ed-4e1fbe648691' },
  { code: 'PR-ING-000054', id: '31a9a7df-ccb3-4c61-a1ea-dd5d86c2a079' },
];

export function MapperBatch6Page() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<BatchRow[]>([]);

  // Defence in depth: never render the dev tool outside a dev build.
  if (!import.meta.env.DEV) return <NotFoundPage />;

  const runBatch = async () => {
    setRunning(true);
    setRows([]);
    const out: BatchRow[] = [];
    for (const item of BATCH) {
      try {
        const result = await matchAndSaveProduct(item.id);
        const u = result.updatedProduct;
        out.push({
          code: item.code,
          ok: true,
          mapper_status: u.mapper_status,
          match_method: u.match_method,
          match_confidence: u.match_confidence,
          matched_basement_id: u.matched_basement_id,
          candidate_count: u.candidate_count,
          error: null,
        });
      } catch (error) {
        out.push({
          code: item.code,
          ok: false,
          mapper_status: null,
          match_method: null,
          match_confidence: null,
          matched_basement_id: null,
          candidate_count: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      setRows([...out]);
    }
    setRunning(false);
  };

  return (
    <MapperBatch6View rows={rows} running={running} count={BATCH.length} onRun={() => void runBatch()} />
  );
}
