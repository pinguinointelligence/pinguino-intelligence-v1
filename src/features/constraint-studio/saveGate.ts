/**
 * Honest availability gate for the pro-core save→version control — PURE.
 * Signed-out, plan-blocked and unconfigured-backend states each resolve to a
 * plain Polish note instead of a dead button; the DEV in-memory repository is
 * visibly marked non-durable.
 */
import { constraintStudioCopy as copy } from './constraintStudioCopy';

export type SaveGateView =
  | { kind: 'signed_out'; messagePl: string }
  | { kind: 'plan_blocked'; messagePl: string }
  | { kind: 'unavailable'; messagePl: string }
  | { kind: 'ready'; localDevNotePl: string | null };

export function resolveSaveGateView(args: {
  authed: boolean;
  canSaveRecipe: boolean;
  repositoryAvailable: boolean;
  isLocalDev: boolean;
}): SaveGateView {
  if (!args.repositoryAvailable) return { kind: 'unavailable', messagePl: copy.save.unavailable };
  if (!args.authed && !args.isLocalDev) return { kind: 'signed_out', messagePl: copy.save.signedOut };
  if (!args.canSaveRecipe) return { kind: 'plan_blocked', messagePl: copy.save.planBlocked };
  return { kind: 'ready', localDevNotePl: args.isLocalDev ? copy.save.localDev : null };
}
