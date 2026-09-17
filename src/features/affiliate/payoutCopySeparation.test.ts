/**
 * The Partner does not configure payouts.
 *
 * Gellatti decides the rates, the hold, the monthly batch, the threshold and the
 * settlement. The only thing the Partner can do — and must do — is confirm
 * identity and payout data with the payment operator, on Stripe's own hosted
 * pages. The old copy ("Dokończ konfigurację (wypłat)", "Onboarding wymaga
 * ukończenia") promised a setup screen that does not exist and hid who decides
 * what, so these assertions keep the two apart.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8');

const PARTNER_PAGE = read('src', 'pages', 'community', 'PartnerPage.tsx');
const FIRST_STEPS = read('src', 'features', 'affiliate', 'firstStepsModel.ts');
const STEP_LABELS = read('src', 'features', 'affiliate', 'PartnerFirstSteps.tsx');
const COMMISSION = read('src', 'features', 'affiliate', 'commissionDisplay.ts');

const PARTNER_FACING = [PARTNER_PAGE, FIRST_STEPS, STEP_LABELS, COMMISSION];

describe('what the Partner is asked to do', () => {
  it('never asks the Partner to configure a payout', () => {
    for (const source of PARTNER_FACING) {
      expect(source).not.toMatch(/Dokończ konfigurację/);
      expect(source).not.toMatch(/konfigurac\w* wypłat/i);
      expect(source).not.toMatch(/Dokończ onboarding/);
    }
  });

  it('says who decides the rates and the terms', () => {
    expect(PARTNER_PAGE).toContain('Stawki, terminy i rozliczenia ustala Gellatti.');
    expect(FIRST_STEPS).toContain('Stawki i terminy ustala Gellatti.');
  });

  it('names the one real step, and where it happens', () => {
    expect(PARTNER_PAGE).toContain('Potwierdź tożsamość i dane do wypłat w Stripe.');
    expect(PARTNER_PAGE).toContain('Potwierdź dane w Stripe');
    expect(STEP_LABELS).toContain("payouts: 'Potwierdź dane w Stripe'");
  });

  it('distinguishes "not started" from "sent, Stripe is checking"', () => {
    /* `onboardingComplete` was already returned by the workspace RPC and never
       rendered, so a Partner who had finished the hosted flow saw the same
       sentence as one who had not started it. */
    expect(PARTNER_PAGE).toContain('data.partner?.onboardingComplete');
    expect(PARTNER_PAGE).toContain(
      'Twoje dane są u Stripe. Czekamy na potwierdzenie — nic więcej nie musisz robić.',
    );
  });

  it('keeps the waiting states honest: no promise that verification is done', () => {
    expect(PARTNER_PAGE).toContain('Gellatti przygotowuje Twoje konto wypłat. Damy znać, kiedy będzie gotowe.');
    expect(COMMISSION).toContain('Twoje dane do wypłat nie są jeszcze potwierdzone. Kwota czeka.');
  });
});
