/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const seed = readFileSync(resolve(ROOT, 'scripts/seed-staging-admin.mjs'), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('fixed owner QA accounts on staging', () => {
  it('pins all three owner-requested identities and the intentionally fixed password', () => {
    expect(seed).toContain("const FIXED_PASSWORD = '123456'");
    for (const email of ['home@home.com', 'pro@pro.com', 'admin@admin.com']) {
      expect(seed).toContain(`email: '${email}'`);
    }
    expect(seed).not.toContain('STAGING_ADMIN_PASSWORD');
    expect(seed).not.toMatch(/Math\.random|randomBytes|randomUUID|generate.*password/i);
  });

  it('keeps the real staging guard and maps Home, Pro and Admin through server authority rows', () => {
    expect(seed).toContain("const STAGING_REF = 'tunabqqrwabacxjcxxkz'");
    expect(seed).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(seed).toContain("accountType: 'home'");
    expect(seed).toContain("scope: 'home'");
    expect(seed).toContain("accountType: 'pro'");
    expect(seed).toContain("scope: 'pro'");
    expect(seed).toContain("accountType: 'internal'");
    expect(seed).toContain("adminRole: 'super_admin'");
    expect(seed).toContain("client.from('account_profiles').upsert");
    expect(seed).toContain("client.from('entitlements')");
    expect(seed).toContain("client.from('admin_users')");
    expect(seed).toContain('Refusing to rewrite Billing-owned access');
  });

  it('makes the legacy Admin seed command an alias of the stable three-account seed', () => {
    expect(pkg.scripts['staging:seed-qa-accounts']).toContain('seed-staging-admin.mjs');
    expect(pkg.scripts['staging:seed-admin']).toBe('npm run staging:seed-qa-accounts');
  });
});
