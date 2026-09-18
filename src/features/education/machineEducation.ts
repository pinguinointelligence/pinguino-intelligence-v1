import { educationCopy } from '@/copy/education.pl';
import {
  machineStepIllustrationFor,
  type PreparationIllustration,
} from './preparationIllustrations';
import {
  MACHINE_CATALOG,
  type HomeMachineProfile,
  type MachineTechnology,
} from '@/features/machine-catalog';

export type MachineEducationCategory =
  | 'frozen_container'
  | 'frozen_bowl'
  | 'compressor'
  | 'fresh_gelato';

export interface MachineEducationGuide {
  category: MachineEducationCategory;
  title: string;
  /** Machine preparation that must happen before the mix is prepared (e.g. freezing an empty bowl). */
  beforeStartSteps: readonly string[];
  /** Machine steps after the mix is ready. */
  steps: readonly string[];
  timing:
    | { status: 'verified'; text: string; hours: number; source: string }
    | { status: 'missing'; text: string; source: null };
  sourceMachineId: string | null;
  /** Owner illustration of this exact machine's step; null for generic or custom machines. */
  illustration: PreparationIllustration | null;
}

const categoryForTechnology: Readonly<
  Partial<Record<MachineTechnology, Exclude<MachineEducationCategory, 'fresh_gelato'>>>
> = {
  respin: 'frozen_container',
  respin_soft: 'frozen_container',
  frozen_bowl: 'frozen_bowl',
  compressor: 'compressor',
};

export function machineEducationCategory(
  technology: MachineTechnology,
): Exclude<MachineEducationCategory, 'fresh_gelato'> | null {
  return categoryForTechnology[technology] ?? null;
}

export function machineEducationForProfile(
  profile: HomeMachineProfile | null,
): MachineEducationGuide | null {
  if (profile === null) return null;
  const category = machineEducationCategory(profile.technology);
  if (category === null) return null;
  const verifiedHours =
    profile.specificationStatus === 'verified' &&
    profile.specificationVerifiedAt !== undefined &&
    profile.preFreezeMinimumHours != null
      ? profile.preFreezeMinimumHours
      : null;
  const operating = profile.operatingFeatures;
  return {
    category,
    title: operating?.instructionTitle ?? educationCopy.machine.categories[category].title,
    // Model-specific instructions own the whole sequence; the generic split applies only to copy.
    beforeStartSteps: operating?.operationalInstructions
      ? []
      : educationCopy.machine.categories[category].beforeStartSteps,
    steps: operating?.operationalInstructions ?? educationCopy.machine.categories[category].steps,
    timing:
      verifiedHours === null
        ? { status: 'missing', text: educationCopy.machine.timingMissing, source: null }
        : {
            status: 'verified',
            // A frozen container's source states a duration; a bowl's states a minimum.
            text:
              category === 'frozen_container'
                ? educationCopy.machine.timingMixtureVerified(verifiedHours)
                : educationCopy.machine.timingVerified(verifiedHours),
            hours: verifiedHours,
            source: profile.specificationSourceUrl ?? profile.id,
          },
    sourceMachineId: profile.id,
    illustration: machineStepIllustrationFor(profile.id),
  };
}

export function machineEducationById(machineId: string | null): MachineEducationGuide | null {
  const profile =
    machineId === null ? null : (MACHINE_CATALOG.find((entry) => entry.id === machineId) ?? null);
  return machineEducationForProfile(profile);
}

/** Canonical catalog guide, with a technology-based fallback only for a saved custom machine. */
export function machineEducationForSelection(
  machineId: string | null,
  customTechnology: MachineTechnology | null,
): MachineEducationGuide | null {
  const canonical = machineEducationById(machineId);
  if (canonical !== null) return canonical;
  if (customTechnology === null) return null;
  const category = machineEducationCategory(customTechnology);
  return category === null ? null : genericMachineEducation(category);
}

/**
 * The ONE machine hand-off a batch is run with — for HOME and for PRO alike.
 *
 * Production reads the plan from `preparationPlanForSession`, and the plan's machine
 * steps come from this guide, so the same recipe must answer the same guide whichever
 * side started the batch. The rule itself is not new: only a HOME machine carries a
 * home guide, and a Professional recipe runs with no machine hand-off (§16) — it used
 * to be written out twice (`useProductionWorkspace` and `HomePreparation`), which is
 * exactly the shape of duplicated authority that lets the two sides drift apart on a
 * recipe whose kind and machine disagree. One function, one answer.
 */
export function productionMachineGuide(recipe: {
  machineKind: 'professional' | 'home' | null;
  machineId: string | null;
  machineTechnology: MachineTechnology | null;
}): MachineEducationGuide | null {
  return recipe.machineKind === 'home'
    ? machineEducationForSelection(recipe.machineId, recipe.machineTechnology)
    : null;
}

export function genericMachineEducation(category: MachineEducationCategory): MachineEducationGuide {
  if (category === 'fresh_gelato') return FRESH_GELATO_EDUCATION;
  return {
    category,
    title: educationCopy.machine.categories[category].title,
    beforeStartSteps: educationCopy.machine.categories[category].beforeStartSteps,
    steps: educationCopy.machine.categories[category].steps,
    timing: { status: 'missing', text: educationCopy.machine.timingMissing, source: null },
    sourceMachineId: null,
    illustration: null,
  };
}

export const FRESH_GELATO_EDUCATION: MachineEducationGuide = {
  category: 'fresh_gelato',
  title: educationCopy.machine.categories.fresh_gelato.title,
  beforeStartSteps: educationCopy.machine.categories.fresh_gelato.beforeStartSteps,
  steps: educationCopy.machine.categories.fresh_gelato.steps,
  timing: { status: 'missing', text: educationCopy.machine.timingMissing, source: null },
  sourceMachineId: null,
  illustration: null,
};

export function availableMachineEducationCategories(): readonly MachineEducationCategory[] {
  const canonical = new Set<MachineEducationCategory>();
  for (const profile of MACHINE_CATALOG) {
    const category = machineEducationCategory(profile.technology);
    if (category !== null) canonical.add(category);
  }
  return [...canonical, 'fresh_gelato'];
}
