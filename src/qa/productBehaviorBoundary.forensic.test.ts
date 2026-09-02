/**
 * HOME-FUNC-RECALCULATE / ProductBehavior — BOUNDARY FORENSIC (owner-requested).
 *
 * Records only. Changes no logic, weakens no guard. It walks the boundaries the owner
 * listed and reports, for every starter line, where ProductBehavior authority exists.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';

const rows = (label: string) => {
  const s = useRecipeStore.getState();
  const snaps = s.productBehaviorSnapshots ?? {};
  return s.items.map((item) => ({
    boundary: label,
    lineId: item.id,
    productId: item.ingredient.id,
    name: item.ingredient.name,
    grams: item.planned_grams,
    hasSnapshot: Object.prototype.hasOwnProperty.call(snaps, item.id),
    canonicalId: (item.ingredient as { canonical_ingredient_id?: string }).canonical_ingredient_id ?? null,
    provenance: (item.ingredient as { identity_provenance?: string }).identity_provenance ?? null,
    verified: (item.ingredient as { is_verified?: boolean }).is_verified ?? null,
  }));
};

describe('BOUNDARY TRACE — where does ProductBehavior authority first go missing?', () => {
  it('reports authority at each boundary of a fresh canonical starter', () => {
    useRecipeStore.getState().rebuildNewRecipeStarter({
      visibleProductType: 'gelato',
      servingModeId: 'temp_minus_13',
      formulationStrategy: 'optimal',
      targetBatchGrams: 1000,
    });
    const afterStarter = rows('1. starter creation');

    useRecipeStore.getState().setBatchGrams(670, undefined, 'USER_OVERRIDE');
    const afterResize = rows('2. machine/batch resize');

    writeFileSync(
      '/tmp/pb-trace.txt',
      '\n=== ProductBehavior boundary trace ===\n' +
        [...afterStarter, ...afterResize]
          .map(
            (r) =>
              `${r.boundary.padEnd(22)} id=${String(r.productId).padEnd(12)} ` +
              `canonical=${String(r.canonicalId).padEnd(15)} prov=${String(r.provenance).padEnd(8)} ` +
              `snapshot=${r.hasSnapshot ? 'YES' : 'NO '}  ${r.name}`,
          )
          .join('\n') +
        `\n\nstarter lines: ${afterStarter.length}` +
        `, with snapshot: ${afterStarter.filter((r) => r.hasSnapshot).length}` +
        `\nsnapshot map keys: ${Object.keys(useRecipeStore.getState().productBehaviorSnapshots ?? {}).length}\n`,
    );

    expect(afterStarter.length).toBeGreaterThan(0);
  });
});
