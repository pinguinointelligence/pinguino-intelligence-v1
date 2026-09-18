/**
 * PREPARATION ILLUSTRATIONS — the one registry HOME and PRO read (owner addendum
 * 2026-09-17). An illustration is attached to a step only through an exact
 * canonical machine id; there is no family, technology or name fallback and no
 * guessed URL for any machine without a shipped file.
 *
 * Files: owner PNGs from "OBRAZKI I RECEPTURY I PRZYGOTOWANIE" (1254×1254),
 * encoded whole — no crop, no retouch — with cwebp 1.6.0 `-q 80 -m 6 -metadata
 * none -resize <w> 0`, the settings of the official recipe photos. Field names
 * follow the owner instruction-image manifest (imageCode, fileStem, smallPath,
 * largePath, width, height, sha256, alt, version).
 */
import { educationCopy } from '@/copy/education.pl';

export interface PreparationIllustration {
  imageCode: string;
  fileStem: string;
  smallPath: string;
  largePath: string;
  width: number;
  height: number;
  alt: string;
  version: 1;
  source: { sha256: string; width: number; height: number };
  outputs: readonly { width: number; path: string; sha256: string; bytes: number }[];
}

const DIRECTORY = '/recipes/instructions/v2';

function illustration(
  imageCode: string,
  sourceSha256: string,
  small: { sha256: string; bytes: number },
  large: { sha256: string; bytes: number },
  alt: string,
): PreparationIllustration {
  const smallPath = `${DIRECTORY}/${imageCode}-256.webp`;
  const largePath = `${DIRECTORY}/${imageCode}-512.webp`;
  return {
    imageCode,
    fileStem: imageCode,
    smallPath,
    largePath,
    width: 512,
    height: 512,
    alt,
    version: 1,
    source: { sha256: sourceSha256, width: 1254, height: 1254 },
    outputs: [
      { width: 256, path: smallPath, ...small },
      { width: 512, path: largePath, ...large },
    ],
  };
}

const freezeAlt = educationCopy.preparation.illustrations.freezeMixtureContainer;

export const PREPARATION_ILLUSTRATIONS = {
  'IMG-FREEZE-NINJA-NC3': illustration(
    'IMG-FREEZE-NINJA-NC3',
    'a78f1e85790483536aa180147e23d678693ada64934ce88f8faf1aa2c5dccc1e',
    { sha256: '04fe6c08fca4700ae58dec376508a0b9ed8980c13b226871d7ae5deb58d635e7', bytes: 4300 },
    { sha256: 'e4d066d9dc952717895173087d4813a0948154d0afc400bb9c07ad3a1d7313ea', bytes: 10296 },
    freezeAlt,
  ),
  'IMG-FREEZE-NINJA-NC5': illustration(
    'IMG-FREEZE-NINJA-NC5',
    'cd60f2130ad8d130db37f25728fdcfe17f52dac08548e5306806674a9b671956',
    { sha256: '856f202310fbf78e4e5f3a5bc8dfda5bec2a0eae30c0de54556ff94901c6c722', bytes: 4700 },
    { sha256: '93e462446c5c1e81a54d254939c54b29d96002c38e998c5d5bd9974daf4193e5', bytes: 11330 },
    freezeAlt,
  ),
  'IMG-FREEZE-NINJA-NC7': illustration(
    'IMG-FREEZE-NINJA-NC7',
    'ac6aac683baf44b6b92d2ae6b30e0b02be775d05377f6d72ae92d5b4acbb07cf',
    { sha256: 'e478b61a94eb784119fe34f0977049350ca2ecf643bc4851b11697d915506f08', bytes: 4572 },
    { sha256: '0f65fc44fceae78037b7ebf73612dcc7c0d47f16f82ac45634ecc43ecffefee8', bytes: 10634 },
    freezeAlt,
  ),
} as const satisfies Record<string, PreparationIllustration>;

export type PreparationIllustrationCode = keyof typeof PREPARATION_ILLUSTRATIONS;

/** The mixture-freezing step of each canonical machine that has an owner image. */
export const MACHINE_STEP_ILLUSTRATION_BY_MACHINE_ID: Readonly<
  Record<string, PreparationIllustrationCode>
> = {
  'ninja-creami-nc302eu-eu-es': 'IMG-FREEZE-NINJA-NC3',
  'ninja-creami-deluxe-nc502eu-eu-es': 'IMG-FREEZE-NINJA-NC5',
  'ninja-creami-scoop-swirl-nc7-eu-es': 'IMG-FREEZE-NINJA-NC7',
};

export function machineStepIllustrationFor(
  machineId: string | null,
): PreparationIllustration | null {
  const code = machineId === null ? undefined : MACHINE_STEP_ILLUSTRATION_BY_MACHINE_ID[machineId];
  return code ? PREPARATION_ILLUSTRATIONS[code] : null;
}

/**
 * H4-4 (Owner 18.09.2026) — the steps of the preparation plan that may carry an owner
 * illustration of their own, beside the machine's.
 *
 * `cool` is not a step of its own: the plan states cooling inside the heat step (H4-5 —
 * „Schłódź bazę” exists only after real heating), so its image belongs to that step too.
 */
export type PreparationStepIllustrationKind = 'weigh' | 'heat' | 'cool' | 'addon';

/**
 * Owner-approved images per step kind.
 *
 * DELIBERATELY EMPTY: every image in this registry today is the mixture-freezing step of
 * one Ninja machine, and no weighing / heating / cooling / topping image has been
 * approved. An unapproved image is worse than none — it would teach a process nobody
 * verified — so the plan reports the gap (`asset_needed`) and carries on without one.
 * The day an image is approved, it enters `PREPARATION_ILLUSTRATIONS` and is named here;
 * no other code changes.
 */
export const STEP_ILLUSTRATION_BY_KIND: Readonly<
  Partial<Record<PreparationStepIllustrationKind, PreparationIllustrationCode>>
> = {};

/** The status a plan step reports for its own illustration. */
export type PreparationIllustrationStatus = 'registered' | 'asset_needed';

export function stepIllustrationFor(kind: PreparationStepIllustrationKind): {
  illustration: PreparationIllustration | null;
  illustrationStatus: PreparationIllustrationStatus;
} {
  const code = STEP_ILLUSTRATION_BY_KIND[kind];
  return code
    ? { illustration: PREPARATION_ILLUSTRATIONS[code], illustrationStatus: 'registered' }
    : { illustration: null, illustrationStatus: 'asset_needed' };
}

/** Every step kind still waiting for an approved image — the ASSET NEEDED list. */
export function preparationIllustrationGaps(): readonly PreparationStepIllustrationKind[] {
  return (['weigh', 'heat', 'cool', 'addon'] as const).filter(
    (kind) => STEP_ILLUSTRATION_BY_KIND[kind] === undefined,
  );
}
