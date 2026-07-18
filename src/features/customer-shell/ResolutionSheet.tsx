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
import {
  compactIngredientRow,
  compactProductRow,
  PICKER_SOURCE_ORDER,
  type PickerSourceId,
  type ProductPickResult,
  type SafeIngredientHit,
} from '@/features/product-picker';
import { BottomSheet, TouchButton, TextField, SelectableCard, notice } from './ui';
import { customerShellCopy as copy } from './customerShellCopy';
import type { IngredientResolutionController } from './useIngredientResolution';

const R = copy.resolution;

/**
 * Readiness badge — desaturated status tokens on the light surface (audit #26:
 * no raw Tailwind emeralds/ambers). The label text carries the state; the hue
 * only supports it, and the text tier stays readable on white.
 */
function ReadinessBadge({ tone, label }: { tone: 'ready' | 'needs_data'; label: string }) {
  return (
    <span
      className={
        `inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${notice.text} ` +
        (tone === 'ready' ? notice.ideal : notice.risky)
      }
    >
      {label}
    </span>
  );
}

/**
 * ONE dense, ≥44px-tall selectable row for both sources (owner spec: compact
 * rows, no metadata walls). Title, one small meta line, compact id, readiness.
 */
function CompactPickRow({
  title,
  subtitle,
  metaLine,
  idLabel,
  statusLabel,
  readinessTone,
  readinessLabel,
  onPick,
}: {
  title: string;
  subtitle: string | null;
  metaLine: string | null;
  idLabel: string | null;
  statusLabel: string | null;
  readinessTone: 'ready' | 'needs_data';
  readinessLabel: string;
  onPick: () => void;
}) {
  const meta = [subtitle, metaLine, statusLabel].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-ink/10 bg-ink/[0.02] px-3 py-2 text-left transition hover:border-ink/40 active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-tight text-ink">{title}</span>
        {meta ? <span className="block truncate text-[11px] leading-tight text-stone-500">{meta}</span> : null}
        {idLabel ? (
          <span className="block truncate font-mono text-[10px] leading-tight text-stone-400">{idLabel}</span>
        ) : null}
      </span>
      <ReadinessBadge tone={readinessTone} label={readinessLabel} />
    </button>
  );
}

function CandidateRow({ result, onPick }: { result: ProductPickResult; onPick: () => void }) {
  const vm = compactProductRow(result, R.eanPrefix);
  return (
    <CompactPickRow
      title={vm.title}
      subtitle={vm.subtitle}
      metaLine={null}
      idLabel={vm.idLabel}
      statusLabel={vm.statusLabel}
      readinessTone={vm.readinessTone}
      readinessLabel={vm.readinessLabel}
      onPick={onPick}
    />
  );
}

function IngredientHitRow({ hit, onPick }: { hit: SafeIngredientHit; onPick: () => void }) {
  const vm = compactIngredientRow(hit, {
    engineApproved: R.ingredientEngineApproved,
    needsVerification: R.ingredientNeedsVerification,
  });
  return (
    <CompactPickRow
      title={vm.title}
      subtitle={vm.subtitle}
      metaLine={vm.metaLine}
      idLabel={vm.idLabel}
      statusLabel={null}
      readinessTone={vm.readinessTone}
      readinessLabel={vm.readinessLabel}
      onPick={onPick}
    />
  );
}

/** The two-source switch — compact segmented tabs, ≥44px touch targets. */
function SourceTabs({ active, onSelect }: { active: PickerSourceId; onSelect: (t: PickerSourceId) => void }) {
  return (
    <div role="tablist" aria-label={R.searchLabel} className="mb-3 flex gap-1 rounded-xl border border-ink/10 bg-ink/[0.03] p-1">
      {PICKER_SOURCE_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onSelect(id)}
          className={
            'min-h-[44px] flex-1 rounded-lg px-3 text-[13px] font-medium transition ' +
            (active === id ? 'bg-paper text-ink shadow-sm' : 'text-stone-500 hover:text-ink')
          }
        >
          {R.sources[id]}
        </button>
      ))}
    </div>
  );
}

/** The Składniki PI pane — live Mapper search with honest phases. */
function IngredientsPane({ c }: { c: IngredientResolutionController }) {
  const ls = c.liveSearch;
  return (
    <div>
      <p className="mb-2 text-[12px] leading-snug text-stone-500">
        {R.sampleSourcePrefix}: {R.ingredientsSourceNote}
      </p>
      <TextField
        label={R.ingredientsSearchLabel}
        placeholder={R.ingredientsSearchPlaceholder}
        value={c.query}
        onChange={(e) => c.setQuery(e.target.value)}
      />

      {/* Post-selection engine-values fetch — honest login/unavailable notes. */}
      {c.ingredientPick === 'fetching' ? (
        <p className="mt-3 rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2 text-[13px] text-stone-600">
          {R.pickChecking}
        </p>
      ) : null}
      {c.ingredientPick === 'login_required' ? (
        <p className={`mt-3 rounded-xl px-3 py-2 text-[13px] ${notice.risky} ${notice.text}`}>{R.pickLoginRequired}</p>
      ) : null}
      {c.ingredientPick === 'unavailable' ? (
        <p className={`mt-3 rounded-xl px-3 py-2 text-[13px] ${notice.risky} ${notice.text}`}>{R.pickUnavailable}</p>
      ) : null}
      {c.ingredientPick === 'error' ? (
        <p className={`mt-3 rounded-xl px-3 py-2 text-[13px] ${notice.error} ${notice.text}`}>{R.pickError}</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-1.5">
        {ls.phase === 'unavailable' ? (
          <p className={`rounded-xl px-4 py-5 text-center text-[13px] leading-relaxed ${notice.risky} ${notice.text}`}>
            {R.liveUnavailable}
          </p>
        ) : ls.phase === 'error' ? (
          <div className={`rounded-xl px-4 py-4 text-center ${notice.error}`}>
            <p className={`text-[13px] ${notice.text}`}>{R.liveError}</p>
            <TouchButton variant="secondary" onClick={c.retryLiveSearch} className="mt-2">
              {R.liveRetry}
            </TouchButton>
          </div>
        ) : ls.phase === 'loading' || ls.phase === 'idle' ? (
          <p className="py-5 text-center text-[13px] text-stone-500">{R.liveLoading}</p>
        ) : ls.phase === 'empty' ? (
          <p className="py-5 text-center text-[13px] text-stone-500">
            {R.liveEmptyPrefix} „{ls.query}”.
          </p>
        ) : (
          <>
            {ls.hits.map((hit) => (
              <IngredientHitRow key={hit.ingredientId} hit={hit} onPick={() => c.pickIngredient(hit)} />
            ))}
            {ls.phase === 'loading_more' ? (
              <p className="py-2 text-center text-[12px] text-stone-500">{R.liveLoadingMore}</p>
            ) : ls.hasMore ? (
              <TouchButton block variant="quiet" onClick={c.loadMore}>
                {R.liveLoadMore}
              </TouchButton>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** The Produkty pane — the existing bundled sample (honest stopgap, never „live"). */
function ProductsPane({ c }: { c: IngredientResolutionController }) {
  return !c.catalogueAvailable ? (
    <p className={`rounded-2xl px-4 py-6 text-center text-[13px] leading-relaxed ${notice.risky} ${notice.text}`}>
      {c.source.note}
    </p>
  ) : (
    <div>
      <p className="mb-2 text-[12px] leading-snug text-stone-500">
        {R.sampleSourcePrefix}: {c.source.note}
      </p>
      <TextField
        label={R.searchLabel}
        placeholder={R.searchPlaceholder}
        value={c.query}
        onChange={(e) => c.setQuery(e.target.value)}
      />
      <div className="mt-3 flex flex-col gap-1.5">
        {c.results.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-stone-500">{R.noResults}</p>
        ) : (
          c.results.map((r) => <CandidateRow key={r.entry.productId} result={r} onPick={() => c.pick(r)} />)
        )}
      </div>
    </div>
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
      {/* Outcome banner after a product was picked — status tokens on light (audit #26). */}
      {outcome === 'resolved' ? (
        <div className={`mb-4 rounded-2xl px-4 py-3 text-[13px] ${notice.ideal} ${notice.text}`}>
          {picked ? <span className="font-medium text-ink">{picked}. </span> : null}
          {R.resolvedReady}
        </div>
      ) : null}
      {outcome === 'needs_data' ? (
        <div className={`mb-4 rounded-2xl px-4 py-3 ${notice.risky}`}>
          {picked ? <p className="text-[13px] font-medium text-ink">{picked}</p> : null}
          <p className={`mt-0.5 text-[13px] ${notice.text}`}>{line.message}</p>
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
        /* Two catalogue sources (Track F): live Mapper library (default) + the
           bundled products sample. The recipe stays visible behind the sheet. */
        <div>
          <SourceTabs active={c.sourceTab} onSelect={c.setSourceTab} />
          {c.sourceTab === 'pi_ingredients' ? <IngredientsPane c={c} /> : <ProductsPane c={c} />}
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
          <p className="mt-2 rounded-2xl border border-ink/15 bg-ink/[0.03] px-4 py-3 text-[13px] text-stone-600">
            {R.intakeBackendNote}
          </p>
          {import.meta.env.DEV ? (
            <a
              href="/dev/ocr-intake"
              className="mt-3 inline-block text-[13px] text-stone-600 underline underline-offset-2"
            >
              {R.intakeDevLink}
            </a>
          ) : null}
        </div>
      ) : (
        /* Action menu. */
        <div className="flex flex-col gap-2">
          {line.substitutionIntent && line.state === 'unresolved' ? (
            <p className="rounded-2xl border border-ink/15 bg-ink/[0.03] px-4 py-3 text-[13px] text-stone-600">
              {line.substitutionIntent.reason === 'i_dont_have_this' ? R.dontHaveRecorded : R.substituteRecorded}
            </p>
          ) : null}
          {actionsInOrder.map((a) => (
            <TouchButton key={a.id} block variant="secondary" size="lg" onClick={() => c.runAction(a.id)}>
              {R.actions[a.id] ?? a.label}
            </TouchButton>
          ))}
          {c.whyOpen ? (
            <p className="rounded-2xl border border-ink/15 bg-ink/[0.03] px-4 py-3 text-[13px] text-stone-600">
              {R.whyBody}
            </p>
          ) : null}
        </div>
      )}
    </BottomSheet>
  );
}
