/**
 * SaveCorrectionControl (Spine Slice 24) — the FIRST write control: persist an
 * accepted optimizer correction as one immutable audit record the user owns.
 *
 * Gating (locked owner decisions A–I):
 *  - unsigned sessions (incl. demo) see only "Sign in to save corrections" —
 *    never a button;
 *  - signed-in Free renders NOTHING (no dead control, no upsell — saving
 *    embodies exact grams, a Pro capability);
 *  - signed-in Pro (exact grams + save capability) gets the real control.
 *
 * Honesty rules: only a rerun-verified solve is saveable — the pure Slice-16
 *  draft builder decides, and its rejection is shown as-is when nothing is
 *  saveable. Saving is an EXPLICIT click (never automatic), writes exactly one
 *  record via the accepted-corrections service, reports the real stored record
 *  id on success and the real error message on failure. The recipe itself is
 *  NEVER changed, and a completed save disables the button until the preview
 *  or solve selection changes (write-once; a revision is a new preview).
 */
import { useRef, useState } from 'react';
import type { RecipeInput } from '@/engine';
import { useAccess } from '@/access/useAccess';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { createAcceptedCorrection } from '@/services/acceptedCorrections';
import {
  buildAcceptedCorrectionDraft,
  type AcceptedCorrectionRejection,
} from './acceptedCorrectionDraft';
import type { OptimizationPreviewView } from './optimizationPreviewRunner';
import type { SolverTargetMode } from './solverTargetInjection';
import { customerErrorMessage } from '@/copy/customerError';

const REJECTION_TEXT: Record<AcceptedCorrectionRejection, string> = {
  missing_owner: 'Zaloguj się, aby zapisać korektę.',
  requires_pro: 'Zapisywanie korekt wymaga Gellatti Pro.',
  requires_signed_in_save: 'W tej sesji nie można zapisać korekty.',
  solve_blocked: 'To przeliczenie jest zablokowane — nie ma potwierdzonej korekty do zapisania.',
  decision_not_saveable: 'W tym podglądzie nie ma potwierdzonej korekty do zapisania.',
  rerun_not_verified: 'Korekta nie została ponownie sprawdzona i nie może być zapisana.',
  no_correction_actions: 'Podgląd nie proponuje zmian w gramach.',
  missing_original_snapshot: 'Brakuje pierwotnej receptury potrzebnej do zapisu.',
  missing_corrected_snapshot: 'Brakuje skorygowanej receptury potrzebnej do zapisu.',
  missing_after_metrics: 'Brakuje wyników po korekcie potrzebnych do zapisu.',
};

type SaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; id: string }
  | { state: 'error'; message: string };

const modeLabel: Record<SolverTargetMode, string> = {
  engine_seeded: 'Główne przeliczenie',
  regulator_shadow: 'Dodatkowe porównanie',
};

export function SaveCorrectionControl({
  view,
  recipe,
}: {
  view: OptimizationPreviewView;
  recipe: RecipeInput;
}) {
  const { exactCorrectionGrams, saveRecipes } = useAccess();
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);

  // Default engine_seeded (decision H); regulator_shadow selectable only when
  // that solve is itself verified & saveable.
  const [mode, setMode] = useState<SolverTargetMode>('engine_seeded');
  // Save status is keyed to the exact (view, mode) it belongs to — a new
  // preview or a different solve selection derives back to idle, so a stale
  // result can never claim a save it did not perform.
  const [saveResult, setSaveResult] = useState<{
    view: OptimizationPreviewView;
    mode: SolverTargetMode;
    status: SaveStatus;
  } | null>(null);
  const status: SaveStatus =
    saveResult && saveResult.view === view && saveResult.mode === mode
      ? saveResult.status
      : { state: 'idle' };
  const inFlight = useRef(false);

  // Unsigned (incl. demo sessions): a plain sign-in note, never a button.
  if (authStatus !== 'authed' || !user) {
    return (
      <p className="text-[11px] leading-relaxed text-ivory/60">Zaloguj się, aby zapisać korektę.</p>
    );
  }
  // Signed-in Free: no control at all (no dead button, no upsell here).
  if (!exactCorrectionGrams || !saveRecipes) return null;

  const capabilities = { exactCorrectionGrams, saveRecipes };
  const buildFor = (acceptedSolve: SolverTargetMode) =>
    buildAcceptedCorrectionDraft({
      view,
      acceptedSolve,
      originalRecipe: recipe,
      savedRecipeId,
      user,
      capabilities,
    });

  const builds: Record<SolverTargetMode, ReturnType<typeof buildFor>> = {
    engine_seeded: buildFor('engine_seeded'),
    regulator_shadow: buildFor('regulator_shadow'),
  };
  const selected = builds[mode];

  // Nothing saveable in either solve → one honest line, no controls.
  if (!builds.engine_seeded.ok && !builds.regulator_shadow.ok) {
    const reason = builds.engine_seeded.ok ? null : builds.engine_seeded.reason;
    return (
      <p className="text-[11px] leading-relaxed text-ivory/60">
        {reason ? REJECTION_TEXT[reason] : 'W tym podglądzie nie ma korekty do zapisania.'}
      </p>
    );
  }

  const onSave = async () => {
    // Ref guard: a rapid double-click can fire before the disabled re-render —
    // never send the same accepted correction twice.
    if (inFlight.current) return;
    // Key every transition to the (view, mode) being saved: if the preview
    // changes mid-flight, the late result stays attached to the OLD key and
    // the visible status derives back to idle.
    const key = { view, mode };
    const build = buildFor(mode);
    if (!build.ok) {
      setSaveResult({ ...key, status: { state: 'error', message: REJECTION_TEXT[build.reason] } });
      return;
    }
    inFlight.current = true;
    setSaveResult({ ...key, status: { state: 'saving' } });
    try {
      const record = await createAcceptedCorrection(build.draft);
      setSaveResult({ ...key, status: { state: 'saved', id: record.id } });
    } catch (error) {
      setSaveResult({
        ...key,
        status: {
          state: 'error',
          message: customerErrorMessage(error, 'recipes', 'RECIPE_SAVE_FAILED'),
        },
      });
    } finally {
      inFlight.current = false;
    }
  };

  const busy = status.state === 'saving';
  const done = status.state === 'saved';

  return (
    <div className="space-y-2 rounded-lg border border-ivory/10 bg-black/20 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-ivory/60">
        Zapisz zaakceptowaną korektę
      </p>
      <p className="text-[11px] leading-relaxed text-ivory/60">
        Zapisz pierwotną i skorygowaną recepturę jako jeden wpis należący do Ciebie. Bieżąca
        receptura nie zostanie zmieniona.
      </p>
      <div className="flex flex-col gap-1.5">
        {(['engine_seeded', 'regulator_shadow'] as const).map((m) => (
          <label
            key={m}
            className={`flex items-center gap-2 font-mono text-[11px] ${
              builds[m].ok ? 'text-ivory/60' : 'text-ivory/60'
            }`}
          >
            <input
              type="radio"
              name="accepted-solve"
              checked={mode === m}
              disabled={!builds[m].ok || busy}
              onChange={() => setMode(m)}
            />
            {modeLabel[m]}
            {!builds[m].ok ? ' — niedostępne' : ''}
          </label>
        ))}
      </div>
      {!selected.ok ? (
        <p className="text-[11px] leading-relaxed text-ivory/60">
          {REJECTION_TEXT[selected.reason]}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onSave}
        disabled={!selected.ok || busy || done}
        className="inline-flex w-full items-center justify-center rounded-md border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Zapisywanie…' : done ? 'Zapisano' : 'Zapisz korektę'}
      </button>
      {status.state === 'saved' ? (
        <p className="font-mono text-[11px] leading-relaxed text-emerald-300/80">
          Korekta zapisana · {status.id}
        </p>
      ) : null}
      {status.state === 'error' ? (
        <p className="font-mono text-[11px] leading-relaxed text-red-300/90">{status.message}</p>
      ) : null}
    </div>
  );
}
