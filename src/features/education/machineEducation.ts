import { educationCopy } from '@/copy/education.pl';
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
  steps: readonly string[];
  timing:
    | { status: 'verified'; text: string; hours: number; source: string }
    | { status: 'missing'; text: string; source: null };
  sourceMachineId: string | null;
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
    steps: operating?.operationalInstructions ?? educationCopy.machine.categories[category].steps,
    timing:
      verifiedHours === null
        ? { status: 'missing', text: educationCopy.machine.timingMissing, source: null }
        : {
            status: 'verified',
            text: educationCopy.machine.timingVerified(verifiedHours),
            hours: verifiedHours,
            source: profile.specificationSourceUrl ?? profile.id,
          },
    sourceMachineId: profile.id,
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

export function genericMachineEducation(category: MachineEducationCategory): MachineEducationGuide {
  if (category === 'fresh_gelato') return FRESH_GELATO_EDUCATION;
  return {
    category,
    title: educationCopy.machine.categories[category].title,
    steps: educationCopy.machine.categories[category].steps,
    timing: { status: 'missing', text: educationCopy.machine.timingMissing, source: null },
    sourceMachineId: null,
  };
}

export const FRESH_GELATO_EDUCATION: MachineEducationGuide = {
  category: 'fresh_gelato',
  title: educationCopy.machine.categories.fresh_gelato.title,
  steps: educationCopy.machine.categories.fresh_gelato.steps,
  timing: { status: 'missing', text: educationCopy.machine.timingMissing, source: null },
  sourceMachineId: null,
};

export function availableMachineEducationCategories(): readonly MachineEducationCategory[] {
  const canonical = new Set<MachineEducationCategory>();
  for (const profile of MACHINE_CATALOG) {
    const category = machineEducationCategory(profile.technology);
    if (category !== null) canonical.add(category);
  }
  return [...canonical, 'fresh_gelato'];
}
