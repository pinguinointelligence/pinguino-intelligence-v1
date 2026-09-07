import type { ProductCategory, RecipeInput, RecipeItem } from '@/engine';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import {
  GELATO_STABILIZER_SYSTEM_POLICY,
  assessGelatoStabilizerSystem,
  clampGelatoStabilizerComponentGrams,
  gelatoStabilizerSystemApplies,
  gelatoStabilizerWholeGramBand,
  type ClampGelatoStabilizerComponentResult,
  type GelatoStabilizerSystemAssessment,
} from './gelatoStabilizerSystemAuthority';
import {
  SORBET_STABILIZER_SYSTEM_POLICY,
  assessSorbetStabilizerSystem,
  clampSorbetStabilizerComponentGrams,
  sorbetStabilizerSystemApplies,
  sorbetStabilizerWholeGramBand,
  type SorbetStabilizerSystemAssessment,
} from './sorbetStabilizerSystemAuthority';

export type StabilizerEngineRole = 'gelato' | 'sorbet' | 'vegan' | 'protein';

export interface OwnerStabilizerWholeGramBand {
  minGrams: number;
  preferredGrams: number;
  maxGrams: number;
}

export interface PresenceOnlyStabilizerSystemAssessment {
  applicable: true;
  present: boolean;
  totalGrams: number;
  lineIds: string[];
  band: null;
  issues: PresenceOnlyStabilizerSystemIssue[];
}

export interface PresenceOnlyStabilizerSystemIssue {
  code: 'component_not_whole_grams';
  lineIds: string[];
  messagePl: string;
  totalGrams: number;
  minGrams: null;
  maxGrams: null;
}

export type OwnerStabilizerSystemAssessment =
  | GelatoStabilizerSystemAssessment
  | SorbetStabilizerSystemAssessment
  | PresenceOnlyStabilizerSystemAssessment;

export interface StabilizerSystemAuthorityContract {
  role: StabilizerEngineRole;
  policyId: string;
  provenance: string;
  gramSemantics: 'whole_grams';
  aggregateRule: 'percentage_band' | 'presence_only';
  /** Null means this profile owns presence only and publishes no dose band. */
  wholeGramBand: ((baseGrams: number) => OwnerStabilizerWholeGramBand) | null;
  assess: (
    input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
  ) => OwnerStabilizerSystemAssessment;
  clampComponentGrams: (
    input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
    lineId: string,
    requestedGrams: number,
  ) => ClampGelatoStabilizerComponentResult;
}

const noClamp = (requestedGrams: number): ClampGelatoStabilizerComponentResult => ({
  grams: requestedGrams,
  clamped: false,
  messagePl: null,
  reason: null,
  limitGrams: 0,
});

const presenceOnlyAssessment = (
  input: Pick<RecipeInput, 'items'>,
  roleLabel: 'Vegan' | 'Protein',
): PresenceOnlyStabilizerSystemAssessment => {
  const positive = ownerStabilizerSystemItems(input.items).filter((item) => item.planned_grams > 0);
  const totalGrams = positive.reduce((sum, item) => sum + item.planned_grams, 0);
  const fractional = positive.filter((item) => !Number.isInteger(item.planned_grams));
  return {
    applicable: true,
    present: positive.length > 0,
    totalGrams,
    lineIds: positive.map((item) => item.id),
    band: null,
    issues:
      fractional.length === 0
        ? []
        : [
            {
              code: 'component_not_whole_grams',
              lineIds: fractional.map((item) => item.id),
              messagePl: `Składniki systemu stabilizującego ${roleLabel} muszą mieć pełne gramy.`,
              totalGrams,
              minGrams: null,
              maxGrams: null,
            },
          ],
  };
};

const clampPresenceOnlyComponentGrams = (
  input: Pick<RecipeInput, 'items'>,
  lineId: string,
  requestedGrams: number,
): ClampGelatoStabilizerComponentResult => {
  const line = input.items.find((item) => item.id === lineId);
  if (!line || resolveFunctionalRole(line.ingredient) !== 'stabilizer') {
    return noClamp(requestedGrams);
  }
  const grams = Math.max(0, Math.round(requestedGrams));
  const clamped = !Object.is(grams, requestedGrams);
  return {
    grams,
    clamped,
    messagePl: clamped ? 'Składniki systemu stabilizującego muszą mieć pełne gramy.' : null,
    reason: clamped ? 'whole_gram' : null,
    limitGrams: 0,
  };
};

const GELATO_AUTHORITY: StabilizerSystemAuthorityContract = Object.freeze({
  role: 'gelato',
  policyId: GELATO_STABILIZER_SYSTEM_POLICY.policyId,
  provenance: GELATO_STABILIZER_SYSTEM_POLICY.provenance,
  gramSemantics: GELATO_STABILIZER_SYSTEM_POLICY.gramSemantics,
  aggregateRule: 'percentage_band',
  wholeGramBand: gelatoStabilizerWholeGramBand,
  assess: assessGelatoStabilizerSystem,
  clampComponentGrams: clampGelatoStabilizerComponentGrams,
});

const SORBET_AUTHORITY: StabilizerSystemAuthorityContract = Object.freeze({
  role: 'sorbet',
  policyId: SORBET_STABILIZER_SYSTEM_POLICY.policyId,
  provenance: SORBET_STABILIZER_SYSTEM_POLICY.provenance,
  gramSemantics: SORBET_STABILIZER_SYSTEM_POLICY.gramSemantics,
  aggregateRule: 'percentage_band',
  wholeGramBand: sorbetStabilizerWholeGramBand,
  assess: assessSorbetStabilizerSystem,
  clampComponentGrams: clampSorbetStabilizerComponentGrams,
});

/** Vegan and Protein deliberately publish separate presence-only authorities.
 * They share PRO's executable whole-gram representation, but neither borrows
 * Gelato's nor Sorbet's aggregate percentage band. */
export const VEGAN_STABILIZER_SYSTEM_AUTHORITY: StabilizerSystemAuthorityContract = Object.freeze({
  role: 'vegan',
  policyId: 'gellatti-vegan-stabilizer-presence',
  provenance: 'GELLATTI Vegan profile: stabilizer presence with template-held dose',
  gramSemantics: 'whole_grams',
  aggregateRule: 'presence_only',
  wholeGramBand: null,
  assess: (input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>) =>
    presenceOnlyAssessment(input, 'Vegan'),
  clampComponentGrams: clampPresenceOnlyComponentGrams,
});

export const PROTEIN_STABILIZER_SYSTEM_AUTHORITY: StabilizerSystemAuthorityContract = Object.freeze(
  {
    role: 'protein',
    policyId: 'gellatti-protein-stabilizer-presence',
    provenance: 'GELLATTI Protein profile: stabilizer presence with template-held dose',
    gramSemantics: 'whole_grams',
    aggregateRule: 'presence_only',
    wholeGramBand: null,
    assess: (input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>) =>
      presenceOnlyAssessment(input, 'Protein'),
    clampComponentGrams: clampPresenceOnlyComponentGrams,
  },
);

export function stabilizerSystemAuthorityFor(
  category: ProductCategory,
): StabilizerSystemAuthorityContract | null {
  if (gelatoStabilizerSystemApplies(category)) return GELATO_AUTHORITY;
  if (sorbetStabilizerSystemApplies(category)) return SORBET_AUTHORITY;
  if (category === 'vegan_gelato') return VEGAN_STABILIZER_SYSTEM_AUTHORITY;
  if (category === 'protein_gelato') return PROTEIN_STABILIZER_SYSTEM_AUTHORITY;
  return null;
}

export const ownerStabilizerSystemApplies = (category: ProductCategory): boolean =>
  stabilizerSystemAuthorityFor(category) !== null;

export const ownerStabilizerSystemItems = (items: readonly RecipeItem[]): RecipeItem[] =>
  items.filter((item) => resolveFunctionalRole(item.ingredient) === 'stabilizer');

export function assessOwnerStabilizerSystem(
  input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
): OwnerStabilizerSystemAssessment {
  const authority = stabilizerSystemAuthorityFor(input.category);
  if (authority) return authority.assess(input);
  return {
    applicable: false,
    present: false,
    totalGrams: 0,
    lineIds: [],
    band: null,
    issues: [],
  };
}

export function clampOwnerStabilizerComponentGrams(
  input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
  lineId: string,
  requestedGrams: number,
): ClampGelatoStabilizerComponentResult {
  const authority = stabilizerSystemAuthorityFor(input.category);
  return authority
    ? authority.clampComponentGrams(input, lineId, requestedGrams)
    : noClamp(requestedGrams);
}
