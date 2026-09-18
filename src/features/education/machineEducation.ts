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
  | 'fresh_gelato'
  /* H4-6 (Owner 18.09.2026): a Professional recipe is not a home machine, but it is not
     „no machine” either — it is a batch freezer, and its three steps are as real as any
     home card's. It is deliberately NOT part of `categoryForTechnology`, so no home
     technology can ever resolve to it. */
  | 'professional';

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
  /**
   * H4-3 (Owner 18.09.2026) — the machine's OWN program name („GELATO”, „SORBET”…), and
   * only when the machine's data confirms one. `null` with `programStatus: 'data_needed'`
   * means exactly that: we show the technologically correct step WITHOUT a program name
   * rather than inventing one. The capacity keys in the catalog (`ice_cream`,
   * `sorbet_granita`) are capacities, not the label printed on the device, so they are
   * deliberately not used here.
   */
  programName: string | null;
  programStatus: 'confirmed' | 'data_needed';
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
    /* H4-3: no machine in the catalog carries a CONFIRMED program label yet (the
       `program` keys it does carry are capacities per program, not the label printed on
       the device), so every card honestly reports the gap instead of inventing one. */
    ...machineProgram(profile),
  };
}

/**
 * H4-3 — the machine's own program name, from machine data only.
 *
 * It reads one field and nothing else: an owner-confirmed label on the machine record.
 * There is deliberately no fallback to capacity program keys, to the product type, or to
 * anything else that could look like a program name — a wrong name on a machine card is
 * worse than no name, because the operator would press the wrong button.
 */
function machineProgram(
  profile: HomeMachineProfile,
): Pick<MachineEducationGuide, 'programName' | 'programStatus'> {
  const label = profile.operatingFeatures?.programLabel?.trim();
  return label
    ? { programName: label, programStatus: 'confirmed' }
    : { programName: null, programStatus: 'data_needed' };
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
  if (recipe.machineKind === 'home') {
    return machineEducationForSelection(recipe.machineId, recipe.machineTechnology);
  }
  /* H4-6: a Professional recipe runs on a batch freezer, so it gets the professional
     card — never a home machine's, whatever `machineId` happens to carry. A recipe with
     no machine kind at all still gets nothing: that is an unfinished choice, not a
     machine. */
  return recipe.machineKind === 'professional' ? PROFESSIONAL_EDUCATION : null;
}

export function genericMachineEducation(category: MachineEducationCategory): MachineEducationGuide {
  if (category === 'fresh_gelato') return FRESH_GELATO_EDUCATION;
  if (category === 'professional') return PROFESSIONAL_EDUCATION;
  return {
    category,
    title: educationCopy.machine.categories[category].title,
    beforeStartSteps: educationCopy.machine.categories[category].beforeStartSteps,
    steps: educationCopy.machine.categories[category].steps,
    timing: { status: 'missing', text: educationCopy.machine.timingMissing, source: null },
    sourceMachineId: null,
    illustration: null,
    programName: null,
    programStatus: 'data_needed',
  };
}

/**
 * H4-6 (Owner 18.09.2026) — the Professional batch freezer's three steps.
 *
 * A Professional recipe has no home machine, and until now that meant no machine step at
 * all: the batch ended with the base prepared and nothing said about freezing it. These
 * steps are the neutral technological truth for a batch freezer and carry NO program name
 * (H4-3) and no timing claim — the product never states a duration it cannot source.
 */
export const PROFESSIONAL_EDUCATION: MachineEducationGuide = {
  category: 'professional',
  title: educationCopy.machine.categories.professional.title,
  beforeStartSteps: educationCopy.machine.categories.professional.beforeStartSteps,
  steps: educationCopy.machine.categories.professional.steps,
  timing: { status: 'missing', text: educationCopy.machine.timingMissing, source: null },
  sourceMachineId: null,
  illustration: null,
  programName: null,
  programStatus: 'data_needed',
};

export const FRESH_GELATO_EDUCATION: MachineEducationGuide = {
  category: 'fresh_gelato',
  title: educationCopy.machine.categories.fresh_gelato.title,
  beforeStartSteps: educationCopy.machine.categories.fresh_gelato.beforeStartSteps,
  steps: educationCopy.machine.categories.fresh_gelato.steps,
  timing: { status: 'missing', text: educationCopy.machine.timingMissing, source: null },
  sourceMachineId: null,
  illustration: null,
  programName: null,
  programStatus: 'data_needed',
};

export function availableMachineEducationCategories(): readonly MachineEducationCategory[] {
  const canonical = new Set<MachineEducationCategory>();
  for (const profile of MACHINE_CATALOG) {
    const category = machineEducationCategory(profile.technology);
    if (category !== null) canonical.add(category);
  }
  return [...canonical, 'fresh_gelato'];
}
