/**
 * DEV-ONLY one-product Mapper smoke page (route: /dev/mapper-smoke).
 *
 * Lets a signed-in developer run the EXISTING explicit orchestrator
 * matchAndSaveProduct() against EXACTLY ONE hardcoded product (PR-ING-000002) from
 * the normal browser UI, then shows the returned mapper-result row as JSON.
 *
 * Boundaries:
 *   - Gated by import.meta.env.DEV: the route is registered only in DEV (app/router.tsx),
 *     and this component itself renders NotFound when not DEV — so it cannot ship in a
 *     production build (and the import is dead-code-eliminated there).
 *   - Targets ONE hardcoded id. No batch, no loop, no list, no import, no full matching.
 *   - The ONLY action is matchAndSaveProduct(id) — the boundary-tested orchestrator that
 *     writes ONLY the 11 mapper-result columns on that one row via the RLS-scoped products
 *     service. It never writes the locked reference base, never runs the engine, never
 *     changes identity / source / code, and uses no privileged key.
 *   - Nothing runs on mount; the match runs only on an explicit button click. Sign-in is
 *     enforced naturally by row-level security inside the orchestrator (no extra auth gating).
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { matchAndSaveProduct } from '@/services/productMapper';
import { MapperSmokeView } from './mapperSmokeView';

/** The single product this smoke targets (verified read-only before wiring). */
const SMOKE_PRODUCT_CODE = 'PR-ING-000002';
const SMOKE_PRODUCT_ID = '18313d47-ddad-4e4e-b1f9-ba39c9ad9434';

export function MapperSmokePage() {
  const [running, setRunning] = useState(false);
  const [resultJson, setResultJson] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Defence in depth: never render the dev tool outside a dev build.
  if (!import.meta.env.DEV) return <NotFoundPage />;

  const runSmoke = async () => {
    setRunning(true);
    setResultJson(null);
    setErrorMessage(null);
    try {
      const result = await matchAndSaveProduct(SMOKE_PRODUCT_ID);
      setResultJson(JSON.stringify(result.updatedProduct, null, 2));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  return (
    <MapperSmokeView
      productCode={SMOKE_PRODUCT_CODE}
      productId={SMOKE_PRODUCT_ID}
      running={running}
      resultJson={resultJson}
      errorMessage={errorMessage}
      onRun={() => void runSmoke()}
    />
  );
}
