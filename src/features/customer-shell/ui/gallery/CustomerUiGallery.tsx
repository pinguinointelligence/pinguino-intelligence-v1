/**
 * DEV GALLERY — customer-shell UI showcase (presentational, static/mock props only).
 *
 * Renders every component and every visual state of the mobile-first customer
 * design system. NOT wired into the router by this feature — the orchestrator
 * mounts it at a dev route (e.g. /dev/customer-ui) during integration. No live
 * data, no business logic: all state below is local UI demo state.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import {
  BatchSelector,
  BottomSheet,
  CustomerSection,
  CustomerSurface,
  DeviceCard,
  EmptyStateView,
  ErrorStateView,
  FlavorChip,
  IngredientListSkeleton,
  IngredientRow,
  LoadingStateView,
  LockedGram,
  MicrophoneButton,
  ReadyRecipeCard,
  ReadyRecipeCardSkeleton,
  RecipeImage,
  SelectableCard,
  Skeleton,
  StickyCta,
  SubstituteAction,
  SubstitutionSheet,
  TechnicalDetails,
  TextField,
  Toast,
  TouchButton,
  color,
  type,
  type BatchOption,
  type MicState,
  type SubstitutionOption,
  type ToastTone,
} from '../index';

/* ------------------------------- helpers -------------------------------- */

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-ink/10 bg-stone-50 p-4', className)}>{children}</div>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className={cn('mb-2', type.label, color.textMuted)}>{children}</p>;
}

/* --------------------------------- data --------------------------------- */

const BATCHES: BatchOption[] = [
  { id: 's', label: '0.5 kg', meta: '≈ 6 scoops' },
  { id: 'm', label: '1 kg', meta: '≈ 12 scoops' },
  { id: 'l', label: '2 kg', meta: '≈ 24 scoops' },
  { id: 'xl', label: '5 kg', meta: 'catering', disabled: true },
];

const SUBSTITUTES: SubstitutionOption[] = [
  { id: 'dex', name: 'Dextrose', note: 'Lowers freezing point; slightly less sweet.', tag: 'In stock' },
  { id: 'inv', name: 'Invert sugar', note: 'Softer scoop, higher anti-freezing power.' },
  { id: 'hon', name: 'Honey', note: 'Distinct aroma — changes the flavour profile.' },
  { id: 'trh', name: 'Trehalose', note: 'Currently unavailable from your supplier.', disabled: true },
];

const MIC_STATES: { state: MicState; label: string }[] = [
  { state: 'idle', label: 'Idle' },
  { state: 'listening', label: 'Listening' },
  { state: 'unavailable', label: 'Unavailable' },
  { state: 'permission-denied', label: 'Permission denied' },
];

/* -------------------------------- gallery ------------------------------- */

export function CustomerUiGallery() {
  const [selectedCard, setSelectedCard] = useState('gelato');
  const [multi, setMulti] = useState<Record<string, boolean>>({ nuts: true });
  const [chips, setChips] = useState(['Pistachio', 'Vanilla', 'Dark chocolate', 'Hazelnut']);
  const [device, setDevice] = useState('batch-1');
  const [batch, setBatch] = useState('m');
  const [subOpen, setSubOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [substitute, setSubstitute] = useState<string | undefined>('dex');
  const [toastTone, setToastTone] = useState<ToastTone>('success');
  const [showStickyPreview, setShowStickyPreview] = useState(false);

  return (
    <CustomerSurface>
      {/* Header */}
      <div className="pt-2">
        <p className={cn(type.label, color.textMuted)}>DEV · CUSTOMER SHELL</p>
        <h1 className={cn('mt-2', type.display, color.textPrimary)}>Mobile design system</h1>
        <p className={cn('mt-3 max-w-prose', type.body, color.textSecondary)}>
          Presentational component library for the customer experience. White premium surface, large
          type, 52–56px controls, visible focus, safe-area insets. All examples use mock props.
        </p>
      </div>

      {/* Typography */}
      <CustomerSection label="Foundations" title="Typography scale">
        <Frame className="bg-paper">
          <div className="space-y-3">
            <p className={cn(type.display, color.textPrimary)}>Display — recipe ready</p>
            <p className={cn(type.title, color.textPrimary)}>Title — Pistachio gelato</p>
            <p className={cn(type.heading, color.textPrimary)}>Heading — ingredients</p>
            <p className={cn(type.body, color.textPrimary)}>Body 17px — comfortable primary reading size on mobile.</p>
            <p className={cn(type.secondary, color.textSecondary)}>Secondary 15px — supporting copy in stone-600.</p>
            <p className={cn(type.caption, color.textMuted)}>Caption 13px — metadata in stone-500.</p>
            <p className={cn(type.numeric, color.textPrimary)}>185 g · -11 °C — tabular numeric</p>
          </div>
        </Frame>
      </CustomerSection>

      {/* Buttons */}
      <CustomerSection label="Controls" title="Buttons & inputs">
        <Frame className="space-y-4 bg-paper">
          <Caption>TouchButton — primary / secondary / quiet</Caption>
          <div className="flex flex-wrap gap-3">
            <TouchButton>Continue</TouchButton>
            <TouchButton variant="secondary">Save draft</TouchButton>
            <TouchButton variant="quiet">Skip</TouchButton>
            <TouchButton disabled>Disabled</TouchButton>
          </div>
          <TouchButton block size="lg">Full-width large CTA (56px)</TouchButton>

          <div className="pt-2">
            <Caption>TextField — default / hint / error / with mic</Caption>
            <div className="space-y-4">
              <TextField label="Recipe name" placeholder="e.g. Sunday pistachio" defaultValue="" />
              <TextField label="Batch weight" hint="Total grams before churning." placeholder="1000" inputMode="numeric" />
              <TextField label="Email" error="Enter a valid email address." defaultValue="not-an-email" />
              <TextField
                label="Describe your flavour"
                placeholder="Say or type…"
                trailing={<MicrophoneButton state="idle" className="h-11 w-11" />}
              />
            </div>
          </div>
        </Frame>
      </CustomerSection>

      {/* Microphone */}
      <CustomerSection label="Controls" title="Microphone button" lead="Visual states only — no capture logic.">
        <Frame className="bg-paper">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {MIC_STATES.map(({ state, label }) => (
              <div key={state} className="flex flex-col items-center gap-2">
                <MicrophoneButton state={state} />
                <span className={cn(type.caption, color.textMuted)}>{label}</span>
              </div>
            ))}
          </div>
        </Frame>
      </CustomerSection>

      {/* Selection */}
      <CustomerSection label="Selection" title="Selectable cards">
        <div className="space-y-3">
          <SelectableCard
            title="Gelato"
            description="Dense, warm-served Italian style."
            selected={selectedCard === 'gelato'}
            onSelect={() => setSelectedCard('gelato')}
          />
          <SelectableCard
            title="Sorbet"
            description="Dairy-free, fruit-forward."
            selected={selectedCard === 'sorbet'}
            onSelect={() => setSelectedCard('sorbet')}
          />
          <SelectableCard title="Soft serve" description="Coming soon." disabled />
          <div className="pt-2">
            <Caption>Multi-select (checkbox semantics)</Caption>
            <SelectableCard
              role="checkbox"
              title="Contains nuts"
              description="Flag allergens for the label."
              selected={Boolean(multi.nuts)}
              onSelect={() => setMulti((m) => ({ ...m, nuts: !m.nuts }))}
            />
          </div>
        </div>
      </CustomerSection>

      {/* Flavor chips */}
      <CustomerSection label="Selection" title="Flavour chips" lead="Removable + selectable; rows wrap, never scroll.">
        <Frame className="bg-paper">
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <FlavorChip key={c} label={c} onRemove={() => setChips((xs) => xs.filter((x) => x !== c))} />
            ))}
            {chips.length === 0 ? (
              <span className={cn(type.secondary, color.textMuted)}>All removed — add some flavours.</span>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <FlavorChip label="Selected" selected />
            <FlavorChip label="Unselected" />
          </div>
        </Frame>
      </CustomerSection>

      {/* Device + batch */}
      <CustomerSection label="Setup" title="Device & batch">
        <div className="space-y-3">
          <DeviceCard
            label="Carpigiani LB 502"
            meta="Batch freezer"
            temperature="-11 °C"
            selected={device === 'batch-1'}
            onSelect={() => setDevice('batch-1')}
          />
          <DeviceCard
            label="Home churn"
            meta="Compressor"
            temperature="-14 °C"
            selected={device === 'home'}
            onSelect={() => setDevice('home')}
          />
        </div>
        <div className="mt-5">
          <Caption>Batch selector</Caption>
          <BatchSelector options={BATCHES} selectedId={batch} onSelect={setBatch} />
        </div>
      </CustomerSection>

      {/* Ready recipe cards + images */}
      <CustomerSection label="Recipes" title="Ready-recipe cards" lead="Aspect-ratio preserved, lazy-loaded, graceful missing-photo fallback.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReadyRecipeCard
            title="Pistachio gelato"
            subtitle="Pistachio · gelato"
            imageSrc="https://images.example/pistachio.jpg"
            imageAlt="Scoops of pistachio gelato in a metal pan"
            meta="1 kg · 8 ingredients"
            onOpen={() => undefined}
          />
          <ReadyRecipeCard
            title="Raspberry sorbet"
            subtitle="Raspberry · sorbet"
            imageSrc={null}
            imageAlt="Raspberry sorbet"
            meta="1 kg · 5 ingredients"
            onOpen={() => undefined}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <Caption>Image — 1:1</Caption>
            <RecipeImage src={null} alt="Placeholder" ratio="1 / 1" />
          </div>
          <div>
            <Caption>Loading skeleton</Caption>
            <ReadyRecipeCardSkeleton />
          </div>
        </div>
      </CustomerSection>

      {/* Ingredient rows + locked + substitution */}
      <CustomerSection label="Recipes" title="Ingredient rows">
        <Frame className="bg-paper">
          <div className="divide-y divide-ink/10">
            <IngredientRow name="Whole milk 3.5%" note="chilled" amount="620 g" />
            <IngredientRow name="Sucrose" amount="150 g" action={<SubstituteAction onClick={() => setSubOpen(true)} />} />
            <IngredientRow name="Skimmed milk powder" amount="45 g" />
            <IngredientRow name="Stabiliser blend" note="proprietary" locked />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className={cn(type.caption, color.textMuted)}>Locked value:</span>
            <LockedGram hint="Exact grams available on a paid plan" />
          </div>
        </Frame>
      </CustomerSection>

      {/* Technical details disclosure */}
      <CustomerSection label="Recipes" title="Technical details">
        <Frame className="bg-paper py-1">
          <TechnicalDetails preview="PAC · POD · composition">
            <div className="space-y-2 pt-1">
              <div className="flex justify-between">
                <span>Total solids</span>
                <span className={cn(type.numeric, color.textPrimary)}>38.2%</span>
              </div>
              <div className="flex justify-between">
                <span>Sugars</span>
                <span className={cn(type.numeric, color.textPrimary)}>18.0%</span>
              </div>
              <div className="flex justify-between">
                <span>Serving temperature</span>
                <span className={cn(type.numeric, color.textPrimary)}>-11 °C</span>
              </div>
            </div>
          </TechnicalDetails>
        </Frame>
      </CustomerSection>

      {/* Overlays */}
      <CustomerSection label="Overlays" title="Bottom sheets">
        <div className="flex flex-wrap gap-3">
          <TouchButton variant="secondary" onClick={() => setSubOpen(true)}>Open substitution sheet</TouchButton>
          <TouchButton variant="secondary" onClick={() => setSheetOpen(true)}>Open generic sheet</TouchButton>
        </div>
      </CustomerSection>

      {/* States */}
      <CustomerSection label="Feedback" title="Empty / loading / error">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <EmptyStateView
            title="No saved recipes"
            body="Your finished recipes will appear here."
            action={<TouchButton size="md">Create a recipe</TouchButton>}
          />
          <LoadingStateView label="Calculating…" />
          <ErrorStateView
            title="Couldn't load"
            body="Check your connection and try again."
            action={<TouchButton variant="secondary">Retry</TouchButton>}
          />
        </div>
        <div className="mt-4">
          <Caption>Skeletons</Caption>
          <Frame className="bg-paper">
            <div className="space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <IngredientListSkeleton rows={3} />
            </div>
          </Frame>
        </div>
      </CustomerSection>

      {/* Toasts */}
      <CustomerSection label="Feedback" title="Toast / confirmation">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['neutral', 'success', 'error'] as ToastTone[]).map((t) => (
              <TouchButton key={t} variant={t === toastTone ? 'primary' : 'secondary'} size="md" onClick={() => setToastTone(t)}>
                {t}
              </TouchButton>
            ))}
          </div>
          <Toast
            tone={toastTone}
            message={
              toastTone === 'success'
                ? 'Recipe saved.'
                : toastTone === 'error'
                  ? 'Could not save recipe.'
                  : 'Draft updated.'
            }
            actionLabel="Undo"
            onAction={() => undefined}
            onDismiss={() => undefined}
          />
        </div>
      </CustomerSection>

      {/* Sticky CTA */}
      <CustomerSection label="Navigation" title="Sticky bottom CTA" lead="Fixed above the safe area; a spacer keeps it off the content.">
        <TouchButton variant="secondary" onClick={() => setShowStickyPreview((v) => !v)}>
          {showStickyPreview ? 'Hide sticky CTA' : 'Preview sticky CTA'}
        </TouchButton>
      </CustomerSection>

      {/* Interactive overlays (mounted at root of the surface) */}
      <SubstitutionSheet
        open={subOpen}
        onClose={() => setSubOpen(false)}
        ingredientName="Sucrose"
        options={SUBSTITUTES}
        selectedId={substitute}
        onSelect={setSubstitute}
        onConfirm={() => setSubOpen(false)}
      />
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="About this recipe"
        footer={<TouchButton block onClick={() => setSheetOpen(false)}>Got it</TouchButton>}
      >
        <p className={cn(type.body, color.textSecondary)}>
          A generic bottom sheet: dimmed backdrop, grabber handle, scrollable body, and a pinned
          footer that clears the home indicator via the safe-area inset.
        </p>
      </BottomSheet>

      {showStickyPreview ? (
        <StickyCta caption="Total 1 kg · 8 ingredients">
          <TouchButton block size="lg" onClick={() => setShowStickyPreview(false)}>
            Start production
          </TouchButton>
        </StickyCta>
      ) : null}

      {/* Bottom breathing room so the preview CTA never hides the last section. */}
      <div aria-hidden className="h-24" />
    </CustomerSurface>
  );
}
