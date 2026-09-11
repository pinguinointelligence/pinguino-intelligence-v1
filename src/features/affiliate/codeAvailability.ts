import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PARTNER_CODE_MAX_LENGTH, PARTNER_CODE_MIN_LENGTH } from '@/billing/domain/partnerCodes';
import type { CodeClaimRefusalReason } from '@/billing/domain/partnerCodeSlots';
import { checkPartnerCodeAvailability } from '@/services/partner';

/**
 * D-CODE-03 — "is this code free?", answered while the partner types.
 *
 * The database already had the answer: gellatti_partner_code_claim_refusal_v1
 * returns exactly the refusal the create guard would raise, or null when the
 * code can be claimed. The Codes form never asked it, so a partner found out a
 * code was taken only by submitting. This module asks, and turns the answer
 * into one sentence — never the raw reason.
 */

/** Everything the server can answer. Pinned to its `return '…'` vocabulary by test. */
export type ServerCodeRefusal = Exclude<CodeClaimRefusalReason, 'empty'>;

export const CODE_REFUSAL_COPY: Readonly<Record<ServerCodeRefusal, string>> = Object.freeze({
  too_short: `Kod musi mieć co najmniej ${PARTNER_CODE_MIN_LENGTH} znaków.`,
  too_long: `Kod może mieć najwyżej ${PARTNER_CODE_MAX_LENGTH} znaków.`,
  // The server drops spaces itself, so only letters and digits are worth naming.
  invalid_characters: 'Tylko litery A–Z i cyfry — bez polskich znaków i symboli.',
  banned_word: 'Kod zawiera zastrzeżone słowo. Wybierz inny.',
  blocked_code: 'Ten kod jest zablokowany. Wybierz inny.',
  held_by_another_partner: 'Ten kod jest już zajęty. Wybierz inny.',
  already_current: 'To już jest jeden z Twoich aktywnych kodów.',
  partner_active_code_limit_reached:
    'Masz już 3 aktywne kody. Zarchiwizuj jeden, aby dodać kolejny.',
});

const GENERIC_REFUSAL = 'Tego kodu nie można użyć. Wybierz inny.';
const HINT = `Od ${PARTNER_CODE_MIN_LENGTH} do ${PARTNER_CODE_MAX_LENGTH} znaków: litery i cyfry.`;
const CHECKING = 'Sprawdzam dostępność…';
const AVAILABLE = 'Kod jest dostępny.';

export interface AvailabilityLine {
  readonly tone: 'neutral' | 'ok' | 'error';
  readonly text: string;
}

export type ServerAnswer =
  | { readonly state: 'waiting' }
  | { readonly state: 'failed' }
  | { readonly state: 'answered'; readonly refusal: string | null };

/**
 * The server's own normalisation — `upper(regexp_replace(code, '\s', '', 'g'))`
 * — so the form asks about exactly the string the create would claim.
 */
export const serverCodeForm = (typed: string): string => typed.replace(/\s/g, '').toUpperCase();

/** Below the minimum there is nothing worth asking the server yet. */
export const worthAsking = (typed: string): boolean =>
  serverCodeForm(typed).length >= PARTNER_CODE_MIN_LENGTH;

const refusalCopy = (reason: string): string =>
  Object.prototype.hasOwnProperty.call(CODE_REFUSAL_COPY, reason)
    ? CODE_REFUSAL_COPY[reason as ServerCodeRefusal]
    : GENERIC_REFUSAL;

/** The one line under the code field, or nothing. */
export function codeAvailabilityLine(typed: string, server: ServerAnswer): AvailabilityLine | null {
  if (serverCodeForm(typed).length === 0) return null;
  if (!worthAsking(typed)) return { tone: 'neutral', text: HINT };
  if (server.state === 'waiting') return { tone: 'neutral', text: CHECKING };
  // A failed check proves nothing either way: say nothing, the create guard still decides.
  if (server.state === 'failed') return null;
  return server.refusal === null
    ? { tone: 'ok', text: AVAILABLE }
    : { tone: 'error', text: refusalCopy(server.refusal) };
}

const DEBOUNCE_MS = 350;

/** Asks the server about the code being typed, once typing pauses. */
export function useCodeAvailability(
  partnerId: string | undefined,
  typed: string,
): AvailabilityLine | null {
  const form = serverCodeForm(typed);
  const [settled, setSettled] = useState(form);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(form), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [form]);

  const ask = Boolean(partnerId) && settled === form && worthAsking(form);
  const query = useQuery({
    queryKey: ['partner-code-availability', partnerId, settled],
    queryFn: () => checkPartnerCodeAvailability(partnerId ?? '', settled),
    enabled: ask,
    staleTime: 15_000,
    retry: false,
  });

  const server: ServerAnswer = !partnerId
    ? { state: 'failed' }
    : !ask || query.isPending
      ? { state: 'waiting' }
      : query.isError
        ? { state: 'failed' }
        : { state: 'answered', refusal: query.data ?? null };
  return codeAvailabilityLine(typed, server);
}
