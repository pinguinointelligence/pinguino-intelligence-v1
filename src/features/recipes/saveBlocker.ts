/**
 * ONE blocker → ONE next action.
 *
 * A refused save used to say one thing and point at another: the message asked for a
 * recalculation while the UI opened and highlighted Settings — which were already showing
 * „Zatwierdzone". The customer was left looking for a decision they had already made.
 *
 * The cure is not more copy. It is a blocker that knows WHICH control resolves it, so the
 * sentence and the highlight are two views of one fact and cannot disagree.
 *
 * PURE. No store, no React, no engine — the save gate classifies, this names and routes.
 */

export type SaveBlockerKind =
  /** Settings were changed and not confirmed. Confirming them is upstream of everything. */
  | 'SETTINGS_CONFIRMATION_REQUIRED'
  /** The draft no longer matches its verified audit; it has to be recalculated. */
  | 'RECALCULATION_REQUIRED'
  /** The preview produced real changes that are still waiting to be applied. */
  | 'APPLY_REQUIRED'
  /** Product data is missing. No control on this screen supplies it. */
  | 'PRODUCT_DATA_REQUIRED'
  /** The engine refused outright and said why. Nothing here is a next action. */
  | 'REFUSED';

/** The single control that resolves a blocker. `null` when no control on screen can. */
export type SaveBlockerAction = 'settings' | 'recalculate' | 'apply' | null;

export interface SaveBlocker {
  readonly kind: SaveBlockerKind;
  /** What the customer reads. Short, and about what to do — never about internals. */
  readonly message: string;
  readonly action: SaveBlockerAction;
}

/**
 * The customer-facing sentence for each blocker.
 *
 * Each one names the action and nothing else. „Otwórz podgląd i zastosuj zweryfikowaną
 * recepturę" described our pipeline; „Przelicz recepturę, aby zapisać." describes the
 * button the customer is about to press.
 */
export const SAVE_BLOCKER_MESSAGE_PL = {
  SETTINGS_CONFIRMATION_REQUIRED: 'Potwierdź ustawienia, aby zapisać.',
  RECALCULATION_REQUIRED: 'Przelicz recepturę, aby zapisać.',
  APPLY_REQUIRED: 'Zastosuj zmiany z podglądu, aby zapisać.',
} as const;

const ACTION_FOR: Record<SaveBlockerKind, SaveBlockerAction> = {
  SETTINGS_CONFIRMATION_REQUIRED: 'settings',
  RECALCULATION_REQUIRED: 'recalculate',
  APPLY_REQUIRED: 'apply',
  // Nothing on this screen supplies missing product data, and nothing on it argues with
  // an engine refusal. Pointing at a control here would send the customer to press
  // something that cannot help them.
  PRODUCT_DATA_REQUIRED: null,
  REFUSED: null,
};

/** What the save gate concluded, before the settings question is taken into account. */
export interface PracticalBlock {
  readonly kind: SaveBlockerKind;
  /** The gate's own message, kept verbatim for the kinds that carry a real reason. */
  readonly message: string;
}

/**
 * Resolve the ONE blocker the customer should see.
 *
 * Unconfirmed settings outrank whatever the practical gate found, because settings are
 * upstream: recalculating a draft whose settings are about to change is work the customer
 * would immediately have to redo. So when both are true we ask for the settings — and we
 * only ever ask for one thing.
 */
export function resolveSaveBlocker(input: {
  readonly practical: PracticalBlock | null;
  /** `false` only when Settings are genuinely dirty; `null` when not yet known. */
  readonly settingsConfirmed: boolean | null;
}): SaveBlocker | null {
  if (input.practical === null) return null;
  if (input.settingsConfirmed === false) {
    return {
      kind: 'SETTINGS_CONFIRMATION_REQUIRED',
      message: SAVE_BLOCKER_MESSAGE_PL.SETTINGS_CONFIRMATION_REQUIRED,
      action: 'settings',
    };
  }
  return {
    kind: input.practical.kind,
    message: input.practical.message,
    action: ACTION_FOR[input.practical.kind],
  };
}
