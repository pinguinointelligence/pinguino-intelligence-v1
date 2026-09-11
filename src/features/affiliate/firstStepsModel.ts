/**
 * G-WEL — a new partner's first steps, derived from the workspace itself.
 *
 * Approval used to drop a new partner straight into the accounting dashboard.
 * The welcome the checklist asks for is five steps: codes, a first campaign
 * link, the commission table, Stripe Connect, then the dashboard. All but the
 * commission table can be read from data the workspace RPC already returns, so
 * the guide needs no new state and no database change: a step is done when the
 * partner has actually done it, and the guide disappears when nothing is left.
 *
 * The commission-table step (G-WEL-04) is deliberately absent: it has to show
 * the partner's RESOLVED rate profile (Standard / Gold / Elite-custom), which
 * the workspace does not return — that needs a DB change.
 */
import type { PartnerWorkspace } from '@/services/partner';

export type FirstStepId = 'code' | 'link' | 'payouts';
export type FirstStepSection = 'codes' | 'generator' | 'payouts';

export interface FirstStep {
  readonly id: FirstStepId;
  readonly done: boolean;
  readonly title: string;
  readonly detail: string;
  /** Where the partner acts. Absent when the next move is Gellatti's. */
  readonly section?: FirstStepSection;
}

export function partnerFirstSteps(data: PartnerWorkspace): readonly FirstStep[] {
  const activeCode = (data.codes ?? []).find((code) => code.status === 'active');
  const hasLink = (data.links ?? []).some((link) => link.status === 'ACTIVE');
  const payoutsOn = data.partner?.payoutsEnabled === true;
  const connectExists = data.partner?.connectAccountPresent === true;

  const code: FirstStep = activeCode
    ? { id: 'code', done: true, title: 'Twój kod', detail: `Kod ${activeCode.code} jest aktywny.` }
    : {
        id: 'code',
        done: false,
        title: 'Twój kod',
        detail: 'Utwórz kod — możesz mieć do 3 aktywnych.',
        section: 'codes',
      };

  const link: FirstStep = hasLink
    ? {
        id: 'link',
        done: true,
        title: 'Pierwszy link',
        detail: 'Masz link gotowy do udostępnienia.',
      }
    : {
        id: 'link',
        done: false,
        title: 'Pierwszy link',
        detail: 'Utwórz link do przepisu, profilu lub cennika — z Twoim kodem w środku.',
        section: 'generator',
      };

  // G-WEL-07: an unfinished payout setup never blocks the rest of Partner mode.
  const payouts: FirstStep = payoutsOn
    ? { id: 'payouts', done: true, title: 'Wypłaty', detail: 'Wypłaty są włączone.' }
    : connectExists
      ? {
          id: 'payouts',
          done: false,
          title: 'Wypłaty',
          detail: 'Dokończ konfigurację konta Connect, aby otrzymywać wypłaty.',
          section: 'payouts',
        }
      : {
          id: 'payouts',
          done: false,
          title: 'Wypłaty',
          detail:
            'Gellatti przygotowuje Twoje konto wypłat — nic nie musisz robić. Kody i linki działają już teraz.',
        };

  return [code, link, payouts];
}

export const firstStepsComplete = (steps: readonly FirstStep[]): boolean =>
  steps.every((step) => step.done);
