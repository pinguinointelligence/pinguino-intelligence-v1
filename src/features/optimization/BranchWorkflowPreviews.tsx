/**
 * BranchWorkflowPreviews (Spine Slice 21) — the production Studio section for
 * the IF9 (Actual Batch Rescue) and IF10 (Stock Shortage) branch PREVIEWS.
 *
 * Paid-gated: Demo/Free see that the workflows exist plus the upgrade
 * affordance — the preview buttons render only for paid capability (mirroring
 * the spine contract `canUseActualBatchRescue` / `canUseStockShortageWorkflow`:
 * demo false, paid true). Explicit click only — nothing runs automatically.
 *
 * Context inputs are MINIMAL, LOCAL AND NON-PERSISTED (component state only):
 * the operator types what they measured; nothing is invented — an empty batch
 * size or stock quantity flows into the routers' honest `blocked_missing_data`
 * states. The recipe context (product profile, intended temperature, line
 * grams) comes from the LIVE Studio recipe, which is never mutated. No
 * substitute can be declared here at all, so no unsafe substitute can appear.
 *
 * NOTHING is applied, saved or written: no Apply/Save/Update-inventory control
 * exists; the only buttons COMPUTE a preview.
 */
import { useState } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import type { RecipeInput } from '@/engine';
import type { BatchRescueProblem } from '@/spine';
import {
  previewBatchRescueRecalculation,
  previewStockShortageRecalculation,
  type BranchRecalculationPreview,
} from './branchRecalculationPreview';
import { BranchWorkflowPreviewPanel } from './BranchWorkflowPreviewPanel';
import {
  branchWorkflowDisplayPolicy,
  type BranchWorkflowCapabilities,
} from './branchWorkflowPolicy';
import { studioIntentFromRecipe } from './optimizationPreviewRunner';

const RESCUE_PROBLEMS: readonly { value: BatchRescueProblem; label: string }[] = [
  { value: 'too_hard', label: 'Too hard' },
  { value: 'too_soft', label: 'Too soft' },
  { value: 'icy', label: 'Icy' },
  { value: 'sandy', label: 'Sandy' },
  { value: 'too_sweet', label: 'Too sweet' },
  { value: 'too_fatty', label: 'Too fatty' },
  { value: 'serving_temperature_mismatch', label: 'Serving temperature mismatch' },
];

/** '' → null (missing, routers block honestly); otherwise the parsed number. */
const parseMeasured = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));

const inputCls =
  'w-full rounded border border-ivory/20 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-ivory placeholder:text-ivory/60';
const labelCls = 'font-mono text-[10px] uppercase tracking-wide text-ivory/60';
const buttonCls =
  'inline-flex w-full items-center justify-center rounded-md border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40';

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 font-mono text-[11px] text-ivory/60">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function BranchWorkflowPreviews({
  recipe,
  capabilities,
}: {
  recipe: RecipeInput;
  capabilities: BranchWorkflowCapabilities;
}) {
  const policy = branchWorkflowDisplayPolicy(capabilities, { dev: import.meta.env.DEV });

  // IF9 — local, non-persisted measurement inputs.
  const [problem, setProblem] = useState<BatchRescueProblem>('too_hard');
  const [measuredBatchG, setMeasuredBatchG] = useState('');
  const [observedTempC, setObservedTempC] = useState('');
  const [frozen, setFrozen] = useState(false);
  const [canReprocess, setCanReprocess] = useState(true);
  const [liquidOk, setLiquidOk] = useState(true);
  const [dryOk, setDryOk] = useState(true);
  const [foodSafety, setFoodSafety] = useState(false);

  // IF10 — local, non-persisted stock inputs.
  const [shortLineId, setShortLineId] = useState(recipe.items[0]?.id ?? '');
  const [availableG, setAvailableG] = useState('');
  const [canScaleDown, setCanScaleDown] = useState(true);
  const [canReformulate, setCanReformulate] = useState(false);
  const [purchasePossible, setPurchasePossible] = useState(true);

  const [preview, setPreview] = useState<BranchRecalculationPreview | null>(null);

  const runRescuePreview = () => {
    const intent = studioIntentFromRecipe(recipe);
    setPreview(
      previewBatchRescueRecalculation({
        rescueIntent: {
          productProfile: intent.productProfile,
          intendedServingTemperatureC: recipe.target_temperature_c,
          batchSizeG: parseMeasured(measuredBatchG),
          observation: {
            problem,
            observedServingTemperatureC: parseMeasured(observedTempC),
            foodSafetyConcern: foodSafety,
          },
          constraints: {
            canReprocess,
            liquidAdditionPossible: liquidOk,
            dryAdditionPossible: dryOk,
            batchAlreadyFrozen: frozen,
          },
        },
        actualRecipe: recipe,
      }),
    );
  };

  const runShortagePreview = () => {
    const intent = studioIntentFromRecipe(recipe);
    const line = recipe.items.find((i) => i.id === shortLineId) ?? recipe.items[0];
    const shortageIntent = {
      productProfile: intent.productProfile,
      batchSizeG: recipe.target_batch_grams,
      observation: {
        shortages: line
          ? [
              {
                lineId: line.id,
                ingredientName: line.ingredient.name,
                requiredG: line.planned_grams,
                availableG: parseMeasured(availableG),
              },
            ]
          : [],
      },
      constraints: {
        canScaleBatchDown: canScaleDown,
        canReformulate,
        purchaseOrWaitPossible: purchasePossible,
      },
    };
    // Studio offers NO substitute input in ANY build — verified composition can
    // never be typed in by hand. The verified-substitute exact preview
    // (previewVerifiedSubstituteRecalculation) is proven on the DEV fixtures
    // page until the reference substitute catalog exists.
    setPreview(previewStockShortageRecalculation({ shortageIntent, plannedRecipe: recipe }));
  };

  return (
    <div className="space-y-3 border-t border-ivory/10 pt-6">
      <div className="flex flex-col gap-1">
        <SectionLabel>Batch rescue &amp; stock shortage</SectionLabel>
        <p className="text-xs leading-relaxed text-ivory/60">
          Preview only — nothing is applied. No inventory is changed. No recipe is saved. Decisions and any
          verified numbers come from the real engine with regulator verification; missing measurements block
          honestly instead of being guessed.
        </p>
      </div>

      {!policy.canRunWorkflows ? (
        <p className="text-[11px] leading-relaxed text-ivory/60">
          Batch rescue and stock shortage previews are available on Pro.
        </p>
      ) : (
        <>
          {/* IF9 — Actual Batch Rescue (measured inputs, local state only) */}
          <div className="space-y-2 rounded-lg border border-ivory/10 bg-black/20 p-3">
            <p className={labelCls}>Actual batch rescue — what did you observe?</p>
            <select className={inputCls} value={problem} onChange={(e) => setProblem(e.target.value as BatchRescueProblem)}>
              {RESCUE_PROBLEMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={labelCls}>measured batch (g)</p>
                <input className={inputCls} inputMode="decimal" placeholder="weigh it" value={measuredBatchG} onChange={(e) => setMeasuredBatchG(e.target.value)} />
              </div>
              <div>
                <p className={labelCls}>observed serving °C</p>
                <input className={inputCls} inputMode="decimal" placeholder="optional" value={observedTempC} onChange={(e) => setObservedTempC(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Check label="already frozen" checked={frozen} onChange={setFrozen} />
              <Check label="can reprocess" checked={canReprocess} onChange={setCanReprocess} />
              <Check label="liquid addition ok" checked={liquidOk} onChange={setLiquidOk} />
              <Check label="dry addition ok" checked={dryOk} onChange={setDryOk} />
            </div>
            <Check label="food-safety concern (contamination)" checked={foodSafety} onChange={setFoodSafety} />
            <button type="button" onClick={runRescuePreview} className={buttonCls}>
              Preview actual batch rescue
            </button>
          </div>

          {/* IF10 — Stock Shortage (stock inputs, local state only; no substitutes declarable) */}
          <div className="space-y-2 rounded-lg border border-ivory/10 bg-black/20 p-3">
            <p className={labelCls}>Stock shortage — which line is short?</p>
            <select className={inputCls} value={shortLineId} onChange={(e) => setShortLineId(e.target.value)}>
              {recipe.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ingredient.name} · needs {i.planned_grams.toFixed(0)} g
                </option>
              ))}
            </select>
            <div>
              <p className={labelCls}>available in stock (g)</p>
              <input className={inputCls} inputMode="decimal" placeholder="count it" value={availableG} onChange={(e) => setAvailableG(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Check label="may scale batch down" checked={canScaleDown} onChange={setCanScaleDown} />
              <Check label="may reformulate" checked={canReformulate} onChange={setCanReformulate} />
              <Check label="can buy / wait" checked={purchasePossible} onChange={setPurchasePossible} />
            </div>
            <p className="text-[10px] leading-relaxed text-ivory/60">
              Verified substitute preview requires a calibrated substitute from the reference catalog —
              substitutes can never be typed in by hand.
            </p>
            <button type="button" onClick={runShortagePreview} className={buttonCls}>
              Preview stock shortage
            </button>
          </div>

          {preview ? <BranchWorkflowPreviewPanel preview={preview} policy={policy} /> : null}
        </>
      )}
    </div>
  );
}
