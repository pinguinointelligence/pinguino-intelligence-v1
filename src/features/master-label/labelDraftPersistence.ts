import type { RecipeInput } from '@/engine';
import { productionLotCodeForRun } from '@/features/production-workspace/productionSession';
import type { MasterLabelData } from './masterLabel';

export const RECIPE_LABEL_DRAFT_KEY = 'pinguino_label_draft_v1' as const;

export interface RecipeLabelDraft {
  readonly schemaVersion: 1;
  readonly draftId: string;
  readonly lotCode: string;
  readonly productionDate: string;
  readonly timeZone: string;
  readonly confirmedFields: readonly string[];
  readonly label: MasterLabelData | null;
}

/** Unique draft identity. Production remains the sole authority for LOT formatting. */
export function newRecipeLabelDraftId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  // The random portion comes first because Production uses the leading
  // alphanumeric identity characters in its canonical LOT suffix.
  return `${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

type RecipeInputWithLabelDraft = RecipeInput & {
  [RECIPE_LABEL_DRAFT_KEY]?: unknown;
};

const dateParts = (now: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

/** Calendar day used by Production on this account/device, never a UTC slice. */
export function productionDateForTimeZone(
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  try {
    return dateParts(now, timeZone);
  } catch {
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return dateParts(now, localTimeZone);
  }
}

/**
 * Initializes one recipe-label draft. LOT delegates to the exact generator used
 * by Production; persistence, not rerender timing, owns its stable draft id.
 */
export function createRecipeLabelDraft({
  draftId,
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: {
  draftId: string;
  now?: Date;
  timeZone?: string;
}): RecipeLabelDraft {
  const productionDate = productionDateForTimeZone(now, timeZone);
  return {
    schemaVersion: 1,
    draftId,
    lotCode: productionLotCodeForRun(draftId, productionDate),
    productionDate,
    timeZone,
    confirmedFields: [],
    label: null,
  };
}

export function attachRecipeLabelDraft(
  input: RecipeInput,
  draft: RecipeLabelDraft | null,
): RecipeInput {
  if (draft === null) return input;
  return {
    ...input,
    [RECIPE_LABEL_DRAFT_KEY]: structuredClone(draft),
  } as RecipeInputWithLabelDraft;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Tolerant Save/Reopen seam. Invalid legacy values fail closed to a new draft. */
export function readRecipeLabelDraft(input: RecipeInput): RecipeLabelDraft | null {
  const value = record((input as RecipeInputWithLabelDraft)[RECIPE_LABEL_DRAFT_KEY]);
  if (
    !value ||
    value.schemaVersion !== 1 ||
    typeof value.draftId !== 'string' ||
    value.draftId.trim() === '' ||
    typeof value.lotCode !== 'string' ||
    value.lotCode.trim() === '' ||
    typeof value.productionDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.productionDate) ||
    typeof value.timeZone !== 'string' ||
    !Array.isArray(value.confirmedFields) ||
    !value.confirmedFields.every((field) => typeof field === 'string')
  ) {
    return null;
  }
  const rawLabel = record(value.label);
  const label =
    rawLabel?.schemaVersion === 1 &&
    record(rawLabel.productName) !== null &&
    typeof rawLabel.lotCode === 'string' &&
    typeof rawLabel.productionDate === 'string'
      ? (structuredClone(rawLabel) as unknown as MasterLabelData)
      : null;
  return {
    schemaVersion: 1,
    draftId: value.draftId,
    lotCode: value.lotCode,
    productionDate: value.productionDate,
    timeZone: value.timeZone,
    confirmedFields: [...value.confirmedFields] as string[],
    label,
  };
}
