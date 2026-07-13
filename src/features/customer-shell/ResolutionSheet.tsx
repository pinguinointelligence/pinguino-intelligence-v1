/**
 * Customer-shell — Ingredient Resolution bottom sheet (presentational).
 *
 * Renders the multi-step resolution flow for one tapped requirement line, driven by
 * the `useIngredientResolution` controller: fresh/culinary FORM step → action menu
 * (the 7 actions) → product picker (search + honest candidate list + readiness
 * verdict) → substitute / intake handoff. No grams are shown here for any persona;
 * no product is saved; nothing is persisted. Honest Polish copy throughout.
 */
import { RESOLUTION_ACTIONS, type IngredientForm } from '@/features/ingredient-resolution';
import type { ProductPickResult } from '@/features/product-picker';
import { BottomSheet, TouchButton, TextField, SelectableCard } from './ui';
import { customerShellCopy as copy } from './customerShellCopy';
import type { IngredientResolutionController } from './useIngredientResolution';

const R = copy.resolution;

function ReadinessBadge({ ready }: { ready: boolean }) {
  return (
    <span
      className={
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
        (ready
          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
          : 'border-amber-400/40 bg-amber-400/10 text-amber-300')
      }
    >
      {ready ? R.badgeReady : R.badgeNeedsData}
    </span>
  );
}

function CandidateRow({ result, onPick }: { result: ProductPickResult; onPick: () => void }) {
  const e = result.entry;
  const meta = [e.brand, e.packageSize ? `${R.packagePrefix}: ${e.packageSize}` : null, e.ean ? `${R.eanPrefix}: ${e.ean}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-start gap-3 rounded-2xl border border-ink/15 bg-ink/[0.03] px-4 py-3 text-left transition hover:border-ink/40 active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{e.displayName}</span>
        {meta ? <span className="mt-0.5 block truncate text-[12px] text-stone-500">{meta}</span> : null}
        {result.statusLabel ? <span className="mt-0.5 block text-[11px] text-stone-500">{result.statusLabel}</span> : null}
      </span>
      <ReadinessBadge ready={result.readiness.exactReady} />
    </button>
  );
}

export function ResolutionSheet({ controller }: { controller: IngredientResolutionController }) {
  const c = controller;
  if (c.activeLineId === null || c.activeLine === null) return null;
  const line = c.activeLine;
  const name = line.line.ingredientName;
  const isForm = line.state === 'choosing_form';
  const outcome = line.state === 'resolved' ? 'resolved' : line.state === 'needs_data' ? 'needs_data' : null;
  const picked = c.pickedName(c.activeLineId);

  const actionsInOrder = RESOLUTION_ACTIONS.filter((a) => c.actions.includes(a.id));

  return (
    <BottomSheet
      open
      onClose={c.close}
      title={`${R.sheetTitlePrefix}: ${name}`}
      footer={
        <TouchButton block variant="secondary" onClick={c.close}>
          {R.close}
        </TouchButton>
      }
    >
      {/* Honest catalogue source note. */}
      <p className="mb-3 text-[12px] leading-snug text-stone-500">
        {R.sampleSourcePrefix}: {c.source.note}
      </p>

      {/* Outcome banner after a product was picked. */}
      {outcome === 'resolved' ? (
        <div className="mb-4 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-200">
          {picked ? <span className="font-medium">{picked}. </span> : null}
          {R.resolvedReady}
        </div>
      ) : null}
      {outcome === 'needs_data' ? (
        <div className="mb-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3">
          {picked ? <p className="text-[13px] font-medium text-amber-100">{picked}</p> : null}
          <p className="mt-0.5 text-[13px] text-amber-200/90">{line.message}</p>
          <div className="mt-3 flex flex-col gap-2">
            <TouchButton block variant="secondary" onClick={() => c.runAction('scan_label')}>
              {R.needsDataScan}
            </TouchButton>
            <TouchButton block variant="secondary" onClick={() => c.runAction('add_manually')}>
              {R.needsDataManual}
            </TouchButton>
            <TouchButton block variant="quiet" onClick={() => c.runAction('search_catalogue')}>
              {R.needsDataOther}
            </TouchButton>
          </div>
        </div>
      ) : null}

      {/* Body by step. */}
      {isForm ? (
        <div>
          <p className="text-[15px] font-medium text-ink">{R.formTitle}</p>
          <p className="mt-1 text-[13px] text-stone-500">{R.formLead}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {c.forms.map((f) => (
              <SelectableCard key={f.id} title={f.label} onSelect={() => c.chooseForm(f.id as IngredientForm)} />
            ))}
          </div>
        </div>
      ) : c.view === 'picker' ? (
        <div>
          <TextField
            label={R.searchLabel}
            placeholder={R.searchPlaceholder}
            value={c.query}
            onChange={(e) => c.setQuery(e.target.value)}
          />
          <div className="mt-3 flex flex-col gap-2">
            {c.results.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-stone-500">{R.noResults}</p>
            ) : (
              c.results.map((r) => <CandidateRow key={r.entry.productId} result={r} onPick={() => c.pick(r)} />)
            )}
          </div>
        </div>
      ) : c.view === 'substitute' ? (
        <div>
          <p className="text-[15px] font-medium text-ink">{R.substituteTitle}</p>
          <div className="mt-3 flex items-end gap-2">
            <TextField
              className="flex-1"
              label={R.substituteLabel}
              placeholder={R.substitutePlaceholder}
              value={c.substituteName}
              onChange={(e) => c.setSubstituteName(e.target.value)}
            />
            <TouchButton disabled={c.substituteName.trim() === ''} onClick={c.confirmSubstitute}>
              {R.substituteConfirm}
            </TouchButton>
          </div>
        </div>
      ) : c.view === 'intake' ? (
        <div>
          <p className="text-[15px] font-medium text-ink">
            {line.intakeHandoff?.mode === 'scan' ? R.intakeScanTitle : R.intakeManualTitle}
          </p>
          <p className="mt-2 rounded-2xl border border-ink/15 bg-ink/[0.03] px-4 py-3 text-[13px] text-stone-400">
            {R.intakeBackendNote}
          </p>
          {import.meta.env.DEV ? (
            <a
              href="/dev/ocr-intake"
              className="mt-3 inline-block text-[13px] text-stone-400 underline underline-offset-2"
            >
              {R.intakeDevLink}
            </a>
          ) : null}
        </div>
      ) : (
        /* Action menu. */
        <div className="flex flex-col gap-2">
          {line.substitutionIntent && line.state === 'unresolved' ? (
            <p className="rounded-2xl border border-ink/15 bg-ink/[0.03] px-4 py-3 text-[13px] text-stone-400">
              {line.substitutionIntent.reason === 'i_dont_have_this' ? R.dontHaveRecorded : R.substituteRecorded}
            </p>
          ) : null}
          {actionsInOrder.map((a) => (
            <TouchButton key={a.id} block variant="secondary" size="lg" onClick={() => c.runAction(a.id)}>
              {R.actions[a.id] ?? a.label}
            </TouchButton>
          ))}
          {c.whyOpen ? (
            <p className="rounded-2xl border border-ink/15 bg-ink/[0.03] px-4 py-3 text-[13px] text-stone-400">
              {R.whyBody}
            </p>
          ) : null}
        </div>
      )}
    </BottomSheet>
  );
}
