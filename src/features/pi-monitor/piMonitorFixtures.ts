/**
 * PINGÜINO PI Recipe Monitor — DEV-only fixtures.
 *
 * Reuses the optimization feature's deterministic sample recipes (literature-value
 * compositions, NO product DB / Mapper / external backend) so the DEV page can
 * exercise the four axes + the persona gate + the resolution gate through the REAL
 * pipeline. Used ONLY by the DEV preview page.
 */
import type { RecipeInput } from '@/engine';
import type { NormalizedRecipeIntent } from '@/spine';
import { OPTIMIZATION_PREVIEW_FIXTURES } from '@/features/optimization/optimizationPreviewFixtures';
import {
  NEUTRAL_AXIS_INTENTS,
  type IngredientResolutionSummary,
  type PiAxisIntents,
  type PiMonitorPersona,
} from './piMonitorContracts';

const byId = (id: string): { recipe: RecipeInput; intent: NormalizedRecipeIntent } => {
  const f = OPTIMIZATION_PREVIEW_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`missing optimization fixture: ${id}`);
  return { recipe: f.recipe, intent: f.intent };
};

const RESOLVED: IngredientResolutionSummary = { allResolved: true, unresolvedCount: 0, unresolvedNames: [] };

export interface PiMonitorFixture {
  id: string;
  label: string;
  recipe: RecipeInput;
  baseIntent: NormalizedRecipeIntent;
  axisIntents: PiAxisIntents;
  resolution: IngredientResolutionSummary;
  persona: PiMonitorPersona;
}

const gelato = byId('gelato-tradeoff');
const sorbet = byId('sorbet-ready');

export const PI_MONITOR_FIXTURES: readonly PiMonitorFixture[] = [
  {
    id: 'home-sweeter',
    label: 'Home · gelato · życzenie: słodsze + twardsze',
    recipe: gelato.recipe,
    baseIntent: gelato.intent,
    axisIntents: { ...NEUTRAL_AXIS_INTENTS, slodycz: 'increase', miekkosc_twardosc: 'increase' },
    resolution: RESOLVED,
    persona: 'home',
  },
  {
    id: 'demo-qualitative',
    label: 'Demo · gelato · życzenie: słodsze (jakościowo, bez gramów)',
    recipe: gelato.recipe,
    baseIntent: gelato.intent,
    axisIntents: { ...NEUTRAL_AXIS_INTENTS, slodycz: 'increase' },
    resolution: RESOLVED,
    persona: 'demo',
  },
  {
    id: 'pro-in-range',
    label: 'Pro · sorbet · czysta referencja (już w zakresie)',
    recipe: sorbet.recipe,
    baseIntent: sorbet.intent,
    axisIntents: NEUTRAL_AXIS_INTENTS,
    resolution: RESOLVED,
    persona: 'pro',
  },
  {
    id: 'home-blocked-resolution',
    label: 'Home · gelato · 2 składniki nierozwiązane (recalc zablokowany)',
    recipe: gelato.recipe,
    baseIntent: gelato.intent,
    axisIntents: { ...NEUTRAL_AXIS_INTENTS, kremowosc_tluszcz: 'increase' },
    resolution: { allResolved: false, unresolvedCount: 2, unresolvedNames: ['baza mleczna', 'stabilizator'] },
    persona: 'home',
  },
];
