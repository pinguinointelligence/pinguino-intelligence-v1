/**
 * DEV-ONLY browser proof of the Studio "My Products" picker (route: /dev/studio-picker-proof).
 *
 * Renders the REAL `IngredientPicker` with a deterministic fixture library (see
 * studioPickerProofFixture) so the My Products group + provenance can be seen in a browser
 * WITHOUT a signed-in Pro session (which a local preview can't provide). It writes nothing and
 * reads no DB; production Studio keeps using `useIngredientLibrary` (real RLS data). The page is
 * clearly labelled as fixture data.
 *
 * Boundaries (StudioPickerProofPage.security.test.ts): DEV-only; no supabase / service / write.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { IngredientPicker } from '@/features/ingredient-builder/IngredientPicker';
import type { EngineIngredient } from '@/engine';
import { STUDIO_PICKER_PROOF_NOTE, buildStudioPickerProofLibrary } from './studioPickerProofFixture';

export function StudioPickerProofPage() {
  const [added, setAdded] = useState<EngineIngredient[]>([]);

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const library = buildStudioPickerProofLibrary();

  return (
    <div className="min-h-screen bg-[#1a1a1a] px-6 py-12 text-ivory">
      <div className="mx-auto max-w-md">
        <p className="font-mono text-xs uppercase tracking-wide text-ivory/40">DEV · internal</p>
        <h1 className="mt-3 text-2xl font-light tracking-tight">Studio picker — My Products proof</h1>
        <p className="mt-2 text-xs leading-relaxed text-ivory/50">{STUDIO_PICKER_PROOF_NOTE}</p>

        <div className="mt-6">
          <IngredientPicker library={library} onAdd={(i) => setAdded((prev) => [...prev, i])} />
        </div>

        <div className="mt-6 border-t border-ivory/10 pt-4">
          <p className="font-mono text-xs uppercase tracking-wide text-ivory/40">Added to recipe ({added.length})</p>
          {added.length === 0 ? (
            <p className="mt-1 text-xs text-ivory/40">Pick an ingredient or a My Product and add it.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {added.map((i, idx) => (
                <li key={`${i.id}-${idx}`} className="font-mono text-xs text-ivory/70">
                  {i.id} · {i.name} · pac {i.pac_value ?? '—'} / pod {i.pod_value ?? '—'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
