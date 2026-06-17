import { useNavigate } from 'react-router';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { copy } from '@/copy/en';
import { findPreset } from '@/data/demoPresets';
import { PRODUCT_PROFILE_ORDER, type ProductProfileId } from '@/data/productProfiles';
import {
  findServingProfile,
  isServingProfileConnected,
  SERVING_PROFILE_ORDER,
  type ServingProfileId,
} from '@/data/servingProfiles';
import { useIntakeStore } from '@/stores/intakeStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ChatPrompt } from './ChatPrompt';
import { ChoiceChips, type ChipOption } from './ChoiceChips';
import { DemoSummary } from './DemoSummary';
import { buildDemoHints } from './demoHints';
import { demoSummaryView, type IntakeState } from './conversation';
import { intakeToRecipe } from './intakeToRecipe';

const c = copy.chat;

const productChips: ChipOption[] = PRODUCT_PROFILE_ORDER.map((id) => ({
  id,
  label: copy.productTypes[id].label,
  desc: copy.productTypes[id].tagline,
}));

const servingChips: ChipOption[] = SERVING_PROFILE_ORDER.map((id) => ({
  id,
  label: copy.servingProfiles[id].label,
  desc: isServingProfileConnected(findServingProfile(id)) ? undefined : 'Preview',
}));

const batchChips: ChipOption[] = [
  { id: '1000', label: `1000 ${c.batchUnit}` },
  { id: '2000', label: `2000 ${c.batchUnit}` },
  { id: '5000', label: `5000 ${c.batchUnit}` },
];

function Question({ children }: { children: string }) {
  return <h2 className="text-center text-xl font-light tracking-tight text-ivory">{children}</h2>;
}

/** Guided intake orchestrator — renders the current conversation step and runs
 * the PI Pro handoff into Advanced Studio (Step 6A.1). */
export function PIChat() {
  const navigate = useNavigate();

  const step = useIntakeStore((s) => s.step);
  const flavorIdea = useIntakeStore((s) => s.flavorIdea);
  const productProfileId = useIntakeStore((s) => s.productProfileId);
  const servingProfileId = useIntakeStore((s) => s.servingProfileId);
  const batchGrams = useIntakeStore((s) => s.batchGrams);
  const dispatch = useIntakeStore((s) => s.dispatch);

  const loadPreset = useRecipeStore((s) => s.loadPreset);
  const removeItem = useRecipeStore((s) => s.removeItem);
  const setCategory = useRecipeStore((s) => s.setCategory);
  const setMode = useRecipeStore((s) => s.setMode);
  const setBatchGrams = useRecipeStore((s) => s.setBatchGrams);
  const setTargetTemperature = useRecipeStore((s) => s.setTargetTemperature);
  const setPlan = useSessionStore((s) => s.setPlan);

  const intake: IntakeState = { step, flavorIdea, productProfileId, servingProfileId, batchGrams };

  const handleUnlock = () => {
    const seed = intakeToRecipe(intake);
    if (seed) {
      const preset = findPreset(seed.presetId);
      if (preset) {
        loadPreset(preset);
        seed.removeLineIds.forEach((id) => removeItem(id));
        setCategory(seed.category);
        setMode(seed.mode);
        setBatchGrams(seed.batchGrams);
        setTargetTemperature(seed.temperatureC);
      }
    }
    dispatch({ type: 'unlockPro' });
    setPlan('pro'); // internal test/preview level (DEV) — not a subscription
    navigate('/studio');
  };

  if (step === 'product_type') {
    return (
      <div className="w-full max-w-xl space-y-6">
        <Question>{c.productQuestion}</Question>
        <ChoiceChips
          options={productChips}
          selectedId={productProfileId}
          onChoose={(id) => dispatch({ type: 'chooseProductType', id: id as ProductProfileId })}
        />
      </div>
    );
  }

  if (step === 'serving_profile') {
    return (
      <div className="w-full max-w-xl space-y-6">
        <Question>{c.servingQuestion}</Question>
        <ChoiceChips
          options={servingChips}
          selectedId={servingProfileId}
          onChoose={(id) => dispatch({ type: 'chooseServingProfile', id: id as ServingProfileId })}
        />
      </div>
    );
  }

  if (step === 'batch') {
    return (
      <div className="w-full max-w-xl space-y-6">
        <Question>{c.batchQuestion}</Question>
        <ChoiceChips
          options={batchChips}
          onChoose={(id) => dispatch({ type: 'setBatch', keep: id === '1000', grams: Number(id) })}
        />
      </div>
    );
  }

  if (step === 'demo_summary') {
    return (
      <DemoSummary view={demoSummaryView(intake)} hints={buildDemoHints(intake)} onUnlock={handleUnlock} />
    );
  }

  // 'flavor' (and any terminal/stale step) — the opening prompt.
  return (
    <div className="w-full max-w-xl space-y-4">
      <SectionLabel tone="ivory" className="text-center">
        {copy.home.eyebrow}
      </SectionLabel>
      <ChatPrompt onSubmit={(text) => dispatch({ type: 'submitFlavor', text })} />
    </div>
  );
}
