/**
 * §16, §42, §43 — how HOME presents the machine of the CURRENT recipe. PURE.
 *
 * The rule that makes this file necessary is §16: HOME's machine CHOOSER never offers
 * Professional, but a recipe that is ALREADY configured for Professional must survive
 * being looked at in HOME — same machine, same temperature, same mode, same batch, no
 * warning, and no forced Home machine.
 *
 * Those are two different questions, and conflating them is exactly how a view switch
 * would silently rewrite a Pro user's recipe:
 *
 *   whatToOFFER  — Home machines + Other machine. Never Professional. (§43)
 *   whatToSHOW   — whatever the recipe actually has, including Professional. (§16)
 */
import type { HomeMachineProfile } from '@/features/machine-catalog';
import { listActiveHomeMachines } from '@/features/machine-catalog';

export type RecipeMachineKind = 'professional' | 'home' | null;

/**
 * §43: the machines HOME may offer. Professional is not in the catalogue at all
 * (it is not a machine record), so the offer is simply the active Home list —
 * asserted here rather than assumed, so a future catalogue change cannot leak one in.
 */
export function homeSelectableMachines(
  catalog: readonly HomeMachineProfile[],
): readonly HomeMachineProfile[] {
  return listActiveHomeMachines(catalog);
}

/** How the amount line reads for the current recipe. */
export type AmountPresentation =
  /** §45: `− 1 container +`, because the machine has a per-container authority. */
  | { readonly kind: 'containers'; readonly containers: number; readonly totalGrams: number }
  /** §16: a Professional recipe shows `Amount / 1000 g / Change` — no container wording. */
  | { readonly kind: 'plain_amount'; readonly totalGrams: number };

export interface HomeMachineView {
  /** The machine label to show, or `null` when none is configured yet. */
  readonly label: string | null;
  /** True when this recipe is on Professional — HOME shows it, never changes it. */
  readonly isProfessional: boolean;
  /** §16: a Professional recipe must produce NO warning in HOME. */
  readonly warning: null;
  readonly amount: AmountPresentation;
  /** Whether the machine stage should be offered at all (§42: never ask twice). */
  readonly needsMachineChoice: boolean;
}

/**
 * Build the HOME machine view for the current recipe.
 *
 * Note what this function CANNOT do: it returns a description, never a mutation. There
 * is no code path from "viewing a Professional recipe in HOME" to "changing the
 * machine", which is the §16 guarantee expressed structurally rather than by comment.
 */
export function buildHomeMachineView(input: {
  readonly machineKind: RecipeMachineKind;
  readonly machineLabel: string | null;
  readonly targetBatchGrams: number;
  readonly recommendedBatchGrams: number | null;
  readonly containers: number;
  /**
   * The customer pressed „Zmień". §42 says a saved machine is never ASKED about again;
   * it does not say the customer may not ask. Without this the flow re-opened the
   * machine stage while this view still reported `needsMachineChoice: false` from the
   * still-set label, so the section kept rendering the summary and the chooser was
   * unreachable.
   *
   * It deliberately does NOT reach the Professional branch: §16's guarantee that HOME
   * cannot change a Professional recipe's machine is structural, and stays structural.
   */
  readonly changeRequested?: boolean;
}): HomeMachineView {
  if (input.machineKind === 'professional') {
    return {
      label: input.machineLabel,
      isProfessional: true,
      warning: null,
      // §16: plain amount, no container wording, no forced Home machine.
      amount: { kind: 'plain_amount', totalGrams: input.targetBatchGrams },
      needsMachineChoice: false,
    };
  }

  const hasHomeMachine = input.machineKind === 'home' && input.machineLabel !== null;
  return {
    label: input.machineLabel,
    isProfessional: false,
    warning: null,
    amount:
      input.recommendedBatchGrams !== null
        ? {
            kind: 'containers',
            containers: input.containers,
            totalGrams: input.targetBatchGrams,
          }
        : { kind: 'plain_amount', totalGrams: input.targetBatchGrams },
    // §42: a saved machine is used automatically and never asked about again — unless
    // the customer asks.
    needsMachineChoice: !hasHomeMachine || input.changeRequested === true,
  };
}
