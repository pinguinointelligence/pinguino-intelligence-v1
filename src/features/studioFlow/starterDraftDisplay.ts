/**
 * Starter draft → tier-safe DISPLAY object (User-Flow layer).
 *
 * `redactStarterDraftForDisplay` is the ONLY path from an `IntentRecipeDraft`
 * to the starter preview UI. The returned object is what the preview component
 * receives, so redaction is physical, not cosmetic:
 *
 *  - without `canViewExactGrams` (Demo + signed-in Free) the display variant is
 *    `redacted`: name-only lines, NO numeric values anywhere in the object, no
 *    engine numbers, and NEVER an apply payload;
 *  - `applyPayload` (the exact `RecipeInput` for the local Studio apply) exists
 *    ONLY when the draft is `ready` AND the viewer has `canApplyStarterToStudio`
 *    AND grams are viewable — the paid tier (Home i Pro). Any non-`ready`
 *    status (`not_supported` / `blocked` / `needs_more_information`) has no
 *    payload for ANY tier, so applying an unsupported draft is impossible.
 *
 * Pure and deterministic: no IO, no state, no persistence; inputs never mutated.
 */
import type { Capabilities } from '@/access/plans';
import type { RecipeInput } from '@/engine';
import type {
  IntentRecipeDraft,
  IntentRecipeDraftStatus,
  IntentRecipeDraftWarning,
} from './intentRecipeDraft';

export type StarterDisplayCapabilities = Pick<
  Capabilities,
  'canViewExactGrams' | 'canApplyStarterToStudio'
>;

export interface StarterExactLine {
  id: string;
  name: string;
  grams: number;
}

/** Name-only line — deliberately has NO gram field at all. */
export interface StarterRedactedLine {
  id: string;
  name: string;
}

export interface StarterEnginePreviewDisplay {
  configVersion: string;
  npacPoints: number | null;
  podPoints: number | null;
  iceFractionPercent: number | null;
}

interface StarterDisplayShared {
  templateId: string | null;
  /** Qualitative direction — safe in every tier. */
  inBand: boolean;
  warningCodes: IntentRecipeDraftWarning['code'][];
}

export type StarterDraftDisplay =
  | ({
      variant: 'exact';
      status: 'ready';
      lines: StarterExactLine[];
      enginePreview: StarterEnginePreviewDisplay | null;
      /** The exact engine input for the local apply — null when not allowed. */
      applyPayload: RecipeInput | null;
    } & StarterDisplayShared)
  | ({
      variant: 'redacted';
      status: 'ready';
      lines: StarterRedactedLine[];
      applyPayload: null;
    } & StarterDisplayShared)
  | {
      variant: 'unavailable';
      status: Exclude<IntentRecipeDraftStatus, 'ready'>;
      templateId: string | null;
      applyPayload: null;
    };

/**
 * Build the tier-safe display object for a starter draft (pure).
 * Redaction dominates: without `canViewExactGrams` the result carries no
 * numeric values and no apply payload, regardless of any other flag.
 */
export function redactStarterDraftForDisplay(
  draft: IntentRecipeDraft,
  capabilities: StarterDisplayCapabilities,
): StarterDraftDisplay {
  if (draft.status !== 'ready') {
    return {
      variant: 'unavailable',
      status: draft.status,
      templateId: draft.templateId,
      applyPayload: null,
    };
  }

  const shared: StarterDisplayShared = {
    templateId: draft.templateId,
    inBand: draft.enginePreview?.inBand === true,
    warningCodes: draft.warnings.map((w) => w.code),
  };

  if (!capabilities.canViewExactGrams) {
    return {
      variant: 'redacted',
      status: 'ready',
      lines: draft.ingredients.map((line) => ({ id: line.id, name: line.name })),
      applyPayload: null,
      ...shared,
    };
  }

  return {
    variant: 'exact',
    status: 'ready',
    lines: draft.ingredients.map((line) => ({ ...line })),
    enginePreview: draft.enginePreview
      ? {
          configVersion: draft.enginePreview.configVersion,
          npacPoints: draft.enginePreview.npacPoints,
          podPoints: draft.enginePreview.podPoints,
          iceFractionPercent: draft.enginePreview.iceFractionPercent,
        }
      : null,
    applyPayload: capabilities.canApplyStarterToStudio ? draft.recipeInput : null,
    ...shared,
  };
}
