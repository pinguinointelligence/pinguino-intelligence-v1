/// <reference types="node" />
/**
 * create-connect-onboarding-link — pure logic tests + Deno source scans
 * (approved+active partners only, allowlisted return/refresh URLs).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideOnboardingEligibility } from '../../supabase/functions/create-connect-onboarding-link/logic.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const fnDir = join(ROOT, 'supabase', 'functions', 'create-connect-onboarding-link');
const indexSource = readFileSync(join(fnDir, 'index.ts'), 'utf8');
const logicSource = readFileSync(join(fnDir, 'logic.ts'), 'utf8');

describe('onboarding eligibility — approved AND active partners only', () => {
  it('approved + active → ok', () => {
    expect(decideOnboardingEligibility({ status: 'approved', active: true })).toEqual({ ok: true });
  });

  it('missing partner → no_partner', () => {
    expect(decideOnboardingEligibility(null)).toEqual({ ok: false, reason: 'no_partner' });
    expect(decideOnboardingEligibility(undefined)).toEqual({ ok: false, reason: 'no_partner' });
  });

  it('every non-approved status refuses (pending, rejected, suspended, garbage)', () => {
    for (const status of ['pending', 'rejected', 'suspended', 'APPROVED', '', 'nonsense']) {
      expect(decideOnboardingEligibility({ status, active: true }), status).toEqual({
        ok: false,
        reason: 'partner_not_approved',
      });
    }
  });

  it('approved but inactive → partner_inactive (kill-switch wins)', () => {
    expect(decideOnboardingEligibility({ status: 'approved', active: false })).toEqual({
      ok: false,
      reason: 'partner_inactive',
    });
  });
});

describe('Deno entrypoint — source pins', () => {
  it('is labelled NOT DEPLOYED, JWT-authenticated, partner looked up server-side', () => {
    expect(/NOT DEPLOYED/.test(indexSource)).toBe(true);
    expect(/auth\.getUser\(\)/.test(indexSource)).toBe(true);
    expect(/\.from\('partners'\)/.test(indexSource)).toBe(true);
    expect(/body\.account|body\.partner/i.test(indexSource)).toBe(false);
  });

  it('validates BOTH return and refresh URLs against the env allowlist', () => {
    expect(/BILLING_REDIRECT_URL_ALLOWLIST/.test(indexSource)).toBe(true);
    expect(/isAllowedRedirectUrl\(body\.returnUrl/.test(indexSource)).toBe(true);
    expect(/isAllowedRedirectUrl\(body\.refreshUrl/.test(indexSource)).toBe(true);
  });

  it('mints an account_onboarding link and never writes any table', () => {
    expect(/type: 'account_onboarding'/.test(indexSource)).toBe(true);
    expect(indexSource.includes('.upsert(')).toBe(false);
    expect(indexSource.includes('.insert(')).toBe(false);
    expect(indexSource.includes('.update(')).toBe(false);
    expect(indexSource.includes('.delete(')).toBe(false);
  });

  it('contains no secrets or real-looking account ids', () => {
    expect(/sk_(live|test)_[A-Za-z0-9]/.test(indexSource)).toBe(false);
    expect(/acct_(?!fake)[A-Za-z0-9]{8,}/.test(indexSource)).toBe(false);
  });

  it('the logic module stays pure (no imports, no Deno, no IO)', () => {
    expect(/^\s*import\s/m.test(logicSource)).toBe(false);
    expect(logicSource.includes('Deno.')).toBe(false);
  });
});
