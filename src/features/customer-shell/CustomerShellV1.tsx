/**
 * PINGÜINO Customer Shell — CustomerShellV1 (`/customer-v1`).
 *
 * A mobile-first, white/light premium, single-column customer surface. It drives
 * the pure conversational core (Agent B, `@/features/customer-flow`) and renders
 * it with the scoped design system (Agent C, `@/features/customer-shell/ui`).
 *
 * Honesty guarantees carried straight through from the core:
 *  - the customer never picks "Chocolate" — chocolate is routed internally and
 *    only surfaced inside the collapsed technical details;
 *  - protein is an honest, blocked gap — never a fabricated recipe, never a
 *    silent gelato fallback;
 *  - a nominal ml capacity is never turned into grams behind the scenes;
 *  - exact grams are governed ONLY by the persona-derived gram-visibility
 *    capability fed into `buildCustomerRecipeView` — Demo lines carry no grams at
 *    all in the payload, so the locked stand-in renders with no leaked number.
 *
 * Presentation only: no engine math, no IO beyond the browser's own optional
 * speech-recognition, no persistence.
 */
import { useRef, useState, type ReactNode } from 'react';
import {
  createCustomerFlow,
  setProductType,
  removeFlavorChip,
  addFlavorChip,
  selectDevicePreset,
  confirmDeviceCapacity,
  setBatchGrams,
  chooseRecipePath,
  activeFlavorChips,
  resolveProductType,
  resolveBatch,
  nextQuestion,
  flowStatus,
  productTypeQuestion,
  matchReadyRecipes,
  selectReadyRecipe,
  buildCustomerRecipeView,
  buildCustomerRecipeStructure,
  buildRecipeStructure,
  gramVisibilityForPersona,
  type CustomerFlowState,
  type CustomerPersona,
  type CustomerProductType,
  type CustomerRecipeInput,
  type CustomerRecipeStructure,
  type CustomerRecipeStructureLine,
  type CatalogueRecipeCard,
  type ReadyRecipeMatch,
  type ReadyRecipeQuery,
  type ReadyRecipeWorkingDraft,
  type DevicePreset,
} from '@/features/customer-flow';
import { DEVICE_FIXTURES } from '@/features/customer-flow/__fixtures__/deviceFixtures';
import { CATALOGUE_FIXTURES } from '@/features/customer-flow/__fixtures__/catalogueFixtures';
import {
  CustomerSurface,
  CustomerSection,
  TouchButton,
  TextField,
  MicrophoneButton,
  SelectableCard,
  FlavorChip,
  DeviceCard,
  BatchSelector,
  ReadyRecipeCard,
  IngredientRow,
  TechnicalDetails,
  StickyCta,
  EmptyStateView,
  type MicState,
} from '@/features/customer-shell/ui';
import { customerShellCopy as copy } from './customerShellCopy';

/* ------------------------------------------------------------------ *
 * Browser speech recognition (optional, never an external service)   *
 * ------------------------------------------------------------------ */

type SpeechResultLike = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
interface MinimalRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => MinimalRecognition;

/** The browser's own recognizer, or null when the API is absent (e.g. SSR/tests). */
function getSpeechCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ------------------------------------------------------------------ *
 * Presentation helpers (pure)                                        *
 * ------------------------------------------------------------------ */

const SERVING_OPTIONS = [
  { id: 'soft11', servingProfile: 'display-minus-11' },
  { id: 'scoop12', servingProfile: 'display-minus-12' },
  { id: 'firm13', servingProfile: 'display-minus-13' },
  { id: 'deep18', servingProfile: 'freezer-minus-18' },
  { id: 'displayFresh', servingProfile: 'display-fresh' },
  { id: 'custom', servingProfile: null },
] as const;

type ServingId = (typeof SERVING_OPTIONS)[number]['id'];

const servingProfileFor = (id: ServingId | null): string | null =>
  SERVING_OPTIONS.find((o) => o.id === id)?.servingProfile ?? null;

const servingCopyFor = (id: ServingId) =>
  copy.serving.options[id as keyof typeof copy.serving.options];

function flavorLabel(tag: string): string {
  return copy.flavors[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1);
}

/**
 * Neutral, honest customer-facing device name mapped by fixture preset id.
 * Never surfaces the engineering fixture label carried on the preset object.
 */
function deviceLabel(preset: DevicePreset): string {
  return copy.deviceLabels[preset.id] ?? copy.device.label;
}

/**
 * Neutral, honest customer-facing catalogue title mapped by fixture card id.
 * Never surfaces the engineering fixture title carried on the card object.
 */
function catalogueTitle(id: string, fallback: string): string {
  return copy.catalogueTitles[id] ?? fallback;
}

function deviceMeta(preset: DevicePreset): string {
  if (
    preset.targetRecipeMassStatus === 'verified' &&
    typeof preset.targetRecipeMassG === 'number' &&
    preset.targetRecipeMassG > 0
  ) {
    return `${copy.device.massVerified}: ${preset.targetRecipeMassG} ${copy.device.unitGrams}`;
  }
  if (typeof preset.containerCapacityMl === 'number' && preset.containerCapacityMl > 0) {
    // Official volume only — shown honestly, never converted to grams.
    return `${copy.device.capacityNominal}: ${preset.containerCapacityMl} ${copy.device.unitMl} · ${copy.device.volumeNotMass}`;
  }
  return copy.device.capacityUserDefined;
}

function formatBatch(grams: number | null): string {
  if (grams === null) return '—';
  if (grams % 1000 === 0) return `${grams / 1000} kg`;
  return `${grams} ${copy.device.unitGrams}`;
}

/** Base-line id → the Polish ingredient-name copy key. */
const BASE_INGREDIENT_COPY_KEY: Record<string, keyof typeof copy.ingredients> = {
  milk: 'milk',
  cream: 'cream',
  'plant-milk': 'plantMilk',
  'coconut-oil': 'coconutOil',
  water: 'water',
  sugar: 'sugar',
  dextrose: 'dextrose',
  stabilizer: 'stabilizer',
};

/** Human name for a structure line: flavor chips keep their own flavor label. */
function structureLineName(line: CustomerRecipeStructureLine): string {
  if (line.role === 'flavor' && line.flavorTag !== undefined) {
    return `${flavorLabel(line.flavorTag)} ${copy.ingredients.flavorSuffix}`;
  }
  const key = BASE_INGREDIENT_COPY_KEY[line.id];
  return key !== undefined ? copy.ingredients[key] : line.id;
}

/** Map the pure recipe STRUCTURE onto the view input (names from copy). */
function structureToRecipeInput(
  recipeId: string,
  title: string,
  structure: CustomerRecipeStructure,
): CustomerRecipeInput {
  return {
    recipeId,
    title,
    productType: structure.productType,
    lines: structure.lines.map((l) => ({
      ingredientId: l.id,
      ingredientName: structureLineName(l),
      grams: l.grams,
      resolution: l.resolution,
    })),
  };
}

/** Polish plural of "składnik" (1 / 2–4 / 5+). */
function pluralSkladnik(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (abs === 1) return copy.result.needsRefinementNoun.one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return copy.result.needsRefinementNoun.few;
  return copy.result.needsRefinementNoun.many;
}

/** Honest "recipe needs refinement (N ingredients)" line — never a fake total. */
function needsRefinementText(n: number): string {
  return `${copy.result.needsRefinementPrefix} (${n} ${pluralSkladnik(n)})`;
}

const noteText = (code: string): string => copy.tech.notes[code] ?? code;

/* ------------------------------------------------------------------ *
 * Small local presentational atoms                                   *
 * ------------------------------------------------------------------ */

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[13px] uppercase tracking-[0.12em] text-stone-500">{label}</span>
      <span className="min-w-0 text-right text-[15px] text-ink">{value}</span>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-ink/10 bg-stone-50 px-4 py-3 text-[13px] leading-relaxed text-stone-600">
      {children}
    </p>
  );
}

/** Small, honest, non-alarming preview framing pinned to the top of the surface. */
function PreviewNote() {
  return (
    <div className="pt-1">
      <span className="inline-flex items-center rounded-full border border-ink/10 bg-stone-50 px-3 py-1 text-[12px] leading-none tracking-wide text-stone-500">
        {copy.preview.note}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page                                                               *
 * ------------------------------------------------------------------ */

export function CustomerShellV1() {
  const [flow, setFlow] = useState<CustomerFlowState | null>(null);
  const [persona, setPersona] = useState<CustomerPersona>('demo');

  // Home-screen draft (before the flow is created).
  const [draftText, setDraftText] = useState('');

  // In-flow local input drafts.
  const [chipDraft, setChipDraft] = useState('');
  const [capacityDraft, setCapacityDraft] = useState('');
  const [customBatchDraft, setCustomBatchDraft] = useState('');
  const [customBatchOpen, setCustomBatchOpen] = useState(false);
  const [forceBatchEdit, setForceBatchEdit] = useState(false);
  const [servingId, setServingId] = useState<ServingId | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<ReadyRecipeWorkingDraft | null>(null);

  // Speech (browser-only, optional).
  const [listening, setListening] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const recognitionRef = useRef<MinimalRecognition | null>(null);
  const speechCtor = getSpeechCtor();
  const micState: MicState = !speechCtor
    ? 'unavailable'
    : micDenied
      ? 'permission-denied'
      : listening
        ? 'listening'
        : 'idle';

  const update = (fn: (s: CustomerFlowState) => CustomerFlowState) =>
    setFlow((prev) => (prev ? fn(prev) : prev));

  const resetAll = () => {
    setFlow(null);
    setDraftText('');
    setChipDraft('');
    setCapacityDraft('');
    setCustomBatchDraft('');
    setCustomBatchOpen(false);
    setForceBatchEdit(false);
    setServingId(null);
    setSelectedDraft(null);
  };

  const handleMic = () => {
    if (!speechCtor) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    try {
      const rec = new speechCtor();
      rec.lang = 'pl-PL';
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript ?? '';
        if (transcript) setDraftText((prev) => (prev ? `${prev} ${transcript}`.trim() : transcript));
      };
      rec.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setMicDenied(true);
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  };

  /* -------------------------------------------------------------- Home -- */
  if (flow === null) {
    return (
      <CustomerSurface>
        <DevPersonaSelect persona={persona} onChange={setPersona} />
        <PreviewNote />
        <header className="pt-2">
          <h1 className="text-[28px] font-light leading-[1.15] tracking-tight text-ink sm:text-[34px]">
            {copy.home.headline}
          </h1>
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-stone-600">
            {copy.home.subhead}
          </p>
        </header>

        <div className="mt-8">
          <TextField
            label={copy.home.inputLabel}
            placeholder={copy.home.placeholder}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            trailing={<MicrophoneButton state={micState} label={copy.mic[micLabelKey(micState)]} onClick={handleMic} />}
          />
          <div className="mt-3">
            <TouchButton variant="quiet" size="md" onClick={() => setDraftText(copy.home.example)}>
              {copy.home.tryExample}
            </TouchButton>
          </div>
          <div className="mt-6">
            <TouchButton
              block
              size="lg"
              disabled={draftText.trim() === ''}
              onClick={() => setFlow(createCustomerFlow({ text: draftText.trim() }))}
            >
              {copy.home.next}
            </TouchButton>
          </div>
        </div>
      </CustomerSurface>
    );
  }

  /* -------------------------------------------------- Derived flow state -- */
  const typeRes = resolveProductType(flow);
  const batchRes = resolveBatch(flow);
  const status = flowStatus(flow);
  const nq = nextQuestion(flow);
  const chips = activeFlavorChips(flow);
  const recipePath = flow.recipePath;

  // A serving/temperature choice only exists on the PROFESSIONAL path. A Ninja is
  // a home appliance — it never carries a display-temperature serving profile.
  const servingIdEff: ServingId | null = flow.device?.kind === 'professional' ? servingId : null;
  const isAppliance = flow.device?.kind === 'appliance';

  const isResultPhase =
    recipePath === 'new_recipe' || (recipePath === 'ready_recipe' && selectedDraft !== null);
  const isReadyListPhase = recipePath === 'ready_recipe' && selectedDraft === null;
  const isConfigurePhase = typeRes.status === 'resolved' && recipePath === null;

  // Result payload (redacted at source for Demo).
  const capability = gramVisibilityForPersona(persona);
  const resultMainFlavor = selectedDraft
    ? (selectedDraft.flavorTags[0] ?? null)
    : (chips[0] ?? null);
  const resultType: CustomerProductType = selectedDraft
    ? selectedDraft.productType
    : (typeRes.userFacingType ?? 'gelato');
  const resultTitle = selectedDraft
    ? catalogueTitle(selectedDraft.sourceRecipeId, selectedDraft.title)
    : resultMainFlavor
      ? `${flavorLabel(resultMainFlavor)} · ${copy.productType.short[resultType]}`
      : `${copy.result.title} · ${copy.productType.short[resultType]}`;
  const resultRecipeId = selectedDraft ? selectedDraft.sourceRecipeId : `preview-${resultType}`;
  // Build the recipe SKELETON from EVERY active flavor (no chip is dropped). A
  // ready-recipe draft uses its own preserved flavor list.
  const structure: CustomerRecipeStructure = selectedDraft
    ? buildRecipeStructure({ productType: selectedDraft.productType, flavorTags: selectedDraft.flavorTags })
    : buildCustomerRecipeStructure(flow);
  const view = buildCustomerRecipeView(
    structureToRecipeInput(resultRecipeId, resultTitle, structure),
    capability,
  );
  const showStickyUpgrade = isResultPhase && !view.gramsVisible;

  /* ----------------------------------------------------- Ready matches -- */
  const readyQuery: ReadyRecipeQuery = {
    ...(chips[0] !== undefined ? { mainFlavorTag: chips[0] } : {}),
    ...(chips[1] !== undefined ? { secondaryFlavorTag: chips[1] } : {}),
    ...(typeRes.userFacingType !== null ? { productType: typeRes.userFacingType } : {}),
    ...(flow.device !== null ? { deviceId: flow.device.id } : {}),
    ...(typeRes.userFacingType === 'vegan' ? { requireVegan: true } : {}),
    ...(servingProfileFor(servingIdEff) !== null ? { servingProfile: servingProfileFor(servingIdEff)! } : {}),
  };
  const matches: ReadyRecipeMatch[] = isReadyListPhase
    ? matchReadyRecipes(readyQuery, CATALOGUE_FIXTURES)
    : [];

  /* ------------------------------------------------------- Batch pieces -- */
  const presetBatchId = ((): string | undefined => {
    if (customBatchOpen) return 'custom';
    if (flow.explicitBatchGrams === 1000) return '1000';
    if (flow.explicitBatchGrams === 5000) return '5000';
    if (flow.explicitBatchGrams === 10000) return '10000';
    if (flow.explicitBatchGrams !== null) return 'custom';
    return undefined;
  })();

  const onBatchSelect = (id: string) => {
    if (id === 'custom') {
      setCustomBatchOpen(true);
      return;
    }
    setCustomBatchOpen(false);
    update((s) => setBatchGrams(s, Number(id)));
  };

  const confirmCustomBatch = () => {
    const g = Number(customBatchDraft.replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0) return;
    update((s) => setBatchGrams(s, g));
  };

  const confirmCapacity = () => {
    const g = Number(capacityDraft.replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0) return;
    update((s) => confirmDeviceCapacity(s, g));
    setCapacityDraft('');
  };

  const renderBatchSelector = () => (
    <div className="space-y-3">
      <BatchSelector
        legend={copy.batch.legend}
        selectedId={presetBatchId}
        onSelect={onBatchSelect}
        options={[
          { id: '1000', label: copy.batch.options.oneKg },
          { id: '5000', label: copy.batch.options.fiveKg },
          { id: '10000', label: copy.batch.options.tenKg },
          { id: 'custom', label: copy.batch.options.custom },
        ]}
      />
      {customBatchOpen ? (
        <div className="flex items-end gap-2">
          <TextField
            className="flex-1"
            label={copy.batch.customLabel}
            inputMode="numeric"
            placeholder={copy.batch.customPlaceholder}
            value={customBatchDraft}
            onChange={(e) => setCustomBatchDraft(e.target.value)}
          />
          <TouchButton onClick={confirmCustomBatch} disabled={customBatchDraft.trim() === ''}>
            {copy.batch.customConfirm}
          </TouchButton>
        </div>
      ) : null}
    </div>
  );

  /* ------------------------------------------------------- Path toggle -- */
  const pathToggle = (
    <div className="mb-2 flex gap-2">
      <TouchButton
        variant={recipePath === 'new_recipe' ? 'primary' : 'secondary'}
        size="md"
        onClick={() => {
          setSelectedDraft(null);
          update((s) => chooseRecipePath(s, 'new_recipe'));
        }}
      >
        {copy.path.newRecipe}
      </TouchButton>
      <TouchButton
        variant={recipePath === 'ready_recipe' ? 'primary' : 'secondary'}
        size="md"
        onClick={() => {
          setSelectedDraft(null);
          update((s) => chooseRecipePath(s, 'ready_recipe'));
        }}
      >
        {copy.path.readyRecipe}
      </TouchButton>
    </div>
  );

  /* -------------------------------------------------- Technical details -- */
  const servingProfileEnum = servingProfileFor(servingIdEff);
  const servingProfileReadable = isAppliance
    ? copy.devicePrep.short
    : servingProfileEnum
      ? (copy.tech.servingProfileLabels[servingProfileEnum] ?? servingProfileEnum)
      : '—';
  const technical = (
    <TechnicalDetails summary={copy.tech.summary}>
      <div className="pt-1">
        {typeRes.userFacingType ? (
          <SummaryRow label={copy.tech.userFacingType} value={copy.productType.short[typeRes.userFacingType]} />
        ) : null}
        {typeRes.internalProfile ? (
          <SummaryRow
            label={copy.tech.internalProfile}
            value={copy.tech.internalProfileLabels[typeRes.internalProfile] ?? typeRes.internalProfile}
          />
        ) : null}
        {typeRes.chocolateRoutedInternally ? (
          <SummaryRow label={copy.tech.previewInternalRouting} value={copy.tech.chocolateRouting} />
        ) : null}
        <SummaryRow label={copy.tech.batchSource} value={copy.batch.source[batchRes.source]} />
        {batchRes.batchGrams !== null ? (
          <SummaryRow label={copy.tech.batchGrams} value={String(batchRes.batchGrams)} />
        ) : null}
        <SummaryRow label={copy.tech.servingProfile} value={servingProfileReadable} />
        {isResultPhase ? (
          <SummaryRow
            label={copy.tech.recipeStatus}
            value={
              view.unresolvedCount > 0
                ? needsRefinementText(view.unresolvedCount)
                : copy.result.fullyResolvedNote
            }
          />
        ) : null}

        {(() => {
          const codes = [
            ...typeRes.notes,
            ...batchRes.notes,
            ...(selectedDraft ? selectedDraft.notes : []),
          ];
          if (codes.length === 0) return null;
          return (
            <div className="mt-3 border-t border-ink/10 pt-3">
              <p className="text-[12px] uppercase tracking-[0.12em] text-stone-500">{copy.tech.notesTitle}</p>
              <ul className="mt-2 space-y-1">
                {codes.map((code, i) => (
                  <li key={`${code}-${i}`} className="text-[13px] leading-relaxed text-stone-600">
                    {noteText(code)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Raw trace strings live ONLY in a dev-gated advanced sub-section. */}
        {import.meta.env.DEV ? (
          <div className="mt-3 border-t border-ink/10 pt-3">
            <p className="text-[12px] uppercase tracking-[0.12em] text-stone-500">{copy.tech.advancedTitle}</p>
            {typeRes.engineCategory ? (
              <SummaryRow label={copy.tech.engineCategory} value={typeRes.engineCategory} />
            ) : null}
            {typeRes.internalProfile ? (
              <SummaryRow label={copy.tech.internalProfile} value={typeRes.internalProfile} />
            ) : null}
            {servingProfileEnum ? (
              <SummaryRow label={copy.tech.servingProfile} value={servingProfileEnum} />
            ) : null}
            {selectedDraft ? (
              <SummaryRow
                label={copy.tech.sourceRecipe}
                value={`${selectedDraft.sourceRecipeId} · ${selectedDraft.sourceVersion}`}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </TechnicalDetails>
  );

  /* ----------------------------------------------------------- Render -- */
  return (
    <>
      <CustomerSurface hasStickyCta={showStickyUpgrade}>
        <DevPersonaSelect persona={persona} onChange={setPersona} />
        <PreviewNote />
        <div className="flex items-center justify-between pt-2">
          <h1 className="text-[22px] font-medium tracking-tight text-ink">{copy.home.headline}</h1>
          <TouchButton variant="quiet" size="md" onClick={resetAll}>
            {copy.home.restart}
          </TouchButton>
        </div>

        {/* Flavor chips — always editable while collecting. */}
        <CustomerSection label={copy.chips.label} title={copy.chips.title} lead={copy.chips.lead}>
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {chips.map((tag) => (
                <FlavorChip key={tag} label={flavorLabel(tag)} onRemove={() => update((s) => removeFlavorChip(s, tag))} />
              ))}
            </div>
          ) : (
            <p className="text-[15px] leading-relaxed text-stone-600">{copy.chips.empty}</p>
          )}
          <div className="mt-4 flex items-end gap-2">
            <TextField
              className="flex-1"
              label={copy.chips.addLabel}
              placeholder={copy.chips.addPlaceholder}
              value={chipDraft}
              onChange={(e) => setChipDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const t = chipDraft.trim();
                  if (t) {
                    update((s) => addFlavorChip(s, t));
                    setChipDraft('');
                  }
                }
              }}
            />
            <TouchButton
              variant="secondary"
              disabled={chipDraft.trim() === ''}
              onClick={() => {
                const t = chipDraft.trim();
                if (!t) return;
                update((s) => addFlavorChip(s, t));
                setChipDraft('');
              }}
            >
              {copy.chips.addButton}
            </TouchButton>
          </div>
        </CustomerSection>

        {/* Protein — honest, blocked gap (recoverable by picking another base). */}
        {typeRes.status === 'unsupported' ? (
          <CustomerSection label={copy.proteinGap.label} title={copy.proteinGap.title}>
            <Notice>{copy.proteinGap.body}</Notice>
          </CustomerSection>
        ) : null}

        {/* Product type — four visible choices, never "Chocolate". */}
        {typeRes.status === 'unknown' || typeRes.status === 'unsupported' ? (
          <CustomerSection label={copy.productType.label} title={copy.productType.title} lead={copy.productType.lead}>
            <div className="grid grid-cols-1 gap-3">
              {productTypeQuestion().choices.map((choice) => {
                const meta = copy.productType.byKey[choice.labelKey];
                return (
                  <SelectableCard
                    key={choice.value}
                    title={meta?.label ?? choice.value}
                    description={meta?.desc}
                    selected={flow.explicitType === choice.value}
                    onSelect={() => update((s) => setProductType(s, choice.value))}
                  />
                );
              })}
            </div>
          </CustomerSection>
        ) : null}

        {/* Configure: device + serving, capacity/batch, recipe-path fork. */}
        {isConfigurePhase ? (
          <>
            <CustomerSection label={copy.device.label} title={copy.device.title} lead={copy.device.lead}>
              <div className="grid grid-cols-1 gap-3">
                {DEVICE_FIXTURES.map((preset) => (
                  <DeviceCard
                    key={preset.id}
                    label={deviceLabel(preset)}
                    meta={deviceMeta(preset)}
                    selected={flow.device?.id === preset.id}
                    onSelect={() => update((s) => selectDevicePreset(s, preset))}
                  />
                ))}
              </div>
            </CustomerSection>

            {/* Temperature / serving is a PROFESSIONAL-only step. A Ninja is a home
                appliance — no display-temperature choice; show an honest prep note. */}
            {flow.device?.kind === 'professional' ? (
              <CustomerSection label={copy.serving.label} title={copy.serving.title} lead={copy.serving.lead}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {SERVING_OPTIONS.map((opt) => {
                    const c = servingCopyFor(opt.id);
                    return (
                      <SelectableCard
                        key={opt.id}
                        title={c.label}
                        description={c.secondary}
                        selected={servingId === opt.id}
                        onSelect={() => setServingId(opt.id)}
                      />
                    );
                  })}
                </div>
              </CustomerSection>
            ) : isAppliance ? (
              <CustomerSection label={copy.devicePrep.label} title={copy.devicePrep.title}>
                <Notice>{copy.devicePrep.ninja}</Notice>
              </CustomerSection>
            ) : null}

            {/* Ask-once device-capacity confirmation (never ml → g silently). */}
            {batchRes.needsConfirmation ? (
              <CustomerSection label={copy.capacity.label} title={copy.capacity.title} lead={copy.capacity.lead}>
                {flow.device?.containerCapacityMl != null ? (
                  <div className="mb-3">
                    <Notice>
                      {copy.capacity.officialCapacityLabel}: {flow.device.containerCapacityMl} {copy.device.unitMl} ·{' '}
                      {copy.device.volumeNotMass}
                    </Notice>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <TextField
                    className="flex-1"
                    label={copy.capacity.inputLabel}
                    hint={copy.capacity.hint}
                    inputMode="numeric"
                    placeholder={copy.capacity.inputPlaceholder}
                    value={capacityDraft}
                    onChange={(e) => setCapacityDraft(e.target.value)}
                  />
                  <TouchButton onClick={confirmCapacity} disabled={capacityDraft.trim() === ''}>
                    {copy.capacity.confirm}
                  </TouchButton>
                </div>
              </CustomerSection>
            ) : (
              <CustomerSection label={copy.batch.label} title={copy.batch.title} lead={copy.batch.lead}>
                {!batchRes.satisfied ? (
                  renderBatchSelector()
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-ink/10 bg-stone-50 px-4 py-3">
                      <SummaryRow
                        label={copy.batch.resolvedLabel}
                        value={`${formatBatch(batchRes.batchGrams)} — ${copy.batch.source[batchRes.source]}`}
                      />
                    </div>
                    {batchRes.source === 'user' ? (
                      <TouchButton variant="quiet" size="md" onClick={() => setForceBatchEdit((v) => !v)}>
                        {copy.batch.change}
                      </TouchButton>
                    ) : null}
                    {forceBatchEdit ? renderBatchSelector() : null}
                  </div>
                )}
              </CustomerSection>
            )}

            {/* Two equal paths — neither is a default. */}
            {nq === 'recipe_path' ? (
              <CustomerSection label={copy.path.label} title={copy.path.title} lead={copy.path.lead}>
                <div className="grid grid-cols-1 gap-3">
                  <TouchButton block variant="secondary" size="lg" onClick={() => update((s) => chooseRecipePath(s, 'new_recipe'))}>
                    {copy.path.newRecipe}
                  </TouchButton>
                  <TouchButton block variant="secondary" size="lg" onClick={() => update((s) => chooseRecipePath(s, 'ready_recipe'))}>
                    {copy.path.readyRecipe}
                  </TouchButton>
                </div>
              </CustomerSection>
            ) : null}
          </>
        ) : null}

        {/* Ready recipes — honest labels, missing-photo fallback is expected. */}
        {isReadyListPhase ? (
          <CustomerSection label={copy.ready.label} title={copy.ready.title} lead={copy.ready.lead}>
            {pathToggle}
            {matches.length === 0 ? (
              <EmptyStateView title={copy.ready.title} body={copy.ready.empty} />
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {matches.map((match) => {
                  const card: CatalogueRecipeCard = match.card;
                  const title = catalogueTitle(card.id, card.title);
                  const select = () => setSelectedDraft(selectReadyRecipe(card));
                  return (
                    <div key={card.id} className="space-y-2">
                      <ReadyRecipeCard
                        title={title}
                        subtitle={`${copy.productType.short[card.productType]} · ${copy.ready.matchLabels[match.label]}`}
                        imageSrc={null}
                        imageAlt={title}
                        meta={copy.ready.cardMeta}
                        onOpen={select}
                      />
                      <div className="flex gap-2">
                        <TouchButton variant="secondary" size="md" onClick={select}>
                          {copy.ready.view}
                        </TouchButton>
                        <TouchButton variant="quiet" size="md" onClick={select}>
                          {copy.ready.useAsStart}
                        </TouchButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CustomerSection>
        ) : null}

        {/* Result — fixture structure, redacted at source for Demo. */}
        {isResultPhase ? (
          <CustomerSection label={copy.result.label} title={resultTitle}>
            {pathToggle}
            <div className="rounded-2xl border border-ink/10 bg-stone-50 px-4 py-3">
              <SummaryRow label={copy.result.typeLabel} value={copy.productType.short[resultType]} />
              <SummaryRow
                label={copy.result.deviceLabel}
                value={flow.device ? deviceLabel(flow.device) : copy.result.deviceNone}
              />
              <SummaryRow
                label={copy.result.servingLabel}
                value={
                  isAppliance
                    ? copy.devicePrep.short
                    : servingIdEff
                      ? servingCopyFor(servingIdEff).label
                      : copy.result.servingNone
                }
              />
              <SummaryRow label={copy.result.batchLabel} value={formatBatch(batchRes.batchGrams)} />
            </div>

            {/* When any flavor line is still an open requirement, say so honestly —
                the preview is NOT a fully calculated recipe. */}
            {view.unresolvedCount > 0 ? (
              <div className="mt-4">
                <Notice>{needsRefinementText(view.unresolvedCount)}</Notice>
              </div>
            ) : null}

            <div className="mt-4">
              <Notice>
                {copy.result.fixtureNotice}
                {selectedDraft ? ` ${copy.result.draftNotice}` : ''}
              </Notice>
            </div>

            <div className="mt-5">
              <p className="text-[12px] uppercase tracking-[0.14em] text-stone-500">{copy.result.ingredientsTitle}</p>
              <div className="mt-1 divide-y divide-ink/10">
                {view.lines.map((line) => {
                  const unresolved = line.resolution !== 'resolved';
                  return (
                    <IngredientRow
                      key={line.ingredientId}
                      name={line.ingredientName}
                      locked={!unresolved && line.grams === undefined}
                      amount={line.grams !== undefined ? `${line.grams} ${copy.device.unitGrams}` : undefined}
                      requirement={unresolved ? copy.result.resolutionLabels[line.resolution] : undefined}
                    />
                  );
                })}
              </div>
            </div>

            <div className="mt-4">{technical}</div>
          </CustomerSection>
        ) : null}

        {/* Technical details are also available during collection. */}
        {status !== 'complete' && !isResultPhase && typeRes.status === 'resolved' ? (
          <div className="mt-2">{technical}</div>
        ) : null}
      </CustomerSurface>

      {showStickyUpgrade ? (
        <StickyCta caption={copy.upgrade.body}>
          <div className="flex gap-2">
            <TouchButton block size="lg" onClick={() => goToSubscription()}>
              {copy.upgrade.chooseHome}
            </TouchButton>
            <TouchButton block size="lg" variant="secondary" onClick={() => goToSubscription()}>
              {copy.upgrade.seePro}
            </TouchButton>
          </div>
        </StickyCta>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Local helpers bound to the component surface                       *
 * ------------------------------------------------------------------ */

function goToSubscription() {
  if (typeof window !== 'undefined') window.location.assign('/subscription');
}

function micLabelKey(state: MicState): 'idle' | 'listening' | 'unavailable' | 'permissionDenied' {
  switch (state) {
    case 'listening':
      return 'listening';
    case 'unavailable':
      return 'unavailable';
    case 'permission-denied':
      return 'permissionDenied';
    default:
      return 'idle';
  }
}

function DevPersonaSelect({
  persona,
  onChange,
}: {
  persona: CustomerPersona;
  onChange: (p: CustomerPersona) => void;
}) {
  if (!import.meta.env.DEV) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <label htmlFor="persona-select" className="text-[12px] uppercase tracking-[0.12em] text-stone-500">
        {copy.persona.label}
      </label>
      <select
        id="persona-select"
        value={persona}
        onChange={(e) => onChange(e.target.value as CustomerPersona)}
        className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-[13px] text-ink"
      >
        <option value="demo">{copy.persona.demo}</option>
        <option value="home">{copy.persona.home}</option>
        <option value="pro">{copy.persona.pro}</option>
      </select>
    </div>
  );
}
