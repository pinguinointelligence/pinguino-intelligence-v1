/// <reference types="node" />
/**
 * Shared app-origin map (supabase/functions/_shared/appOrigins.ts) — which app a
 * request came from, decided on the server. Staging and production share one
 * Supabase project, so this is the only per-request environment signal, and a
 * substring rule on a client-sent value was already shown to label a lookalike
 * host as production (Growth QA, 2026-09-17).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_ORIGINS, resolveAppOrigin } from '../../supabase/functions/_shared/appOrigins.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('resolveAppOrigin — exact match against the closed map', () => {
  it('maps each known origin to its environment and canonical base', () => {
    expect(resolveAppOrigin('https://www.gellatti.com')).toEqual({
      environment: 'production',
      base: 'https://www.gellatti.com',
      matched: true,
    });
    expect(resolveAppOrigin('https://gellatti.com')).toEqual({
      environment: 'production',
      base: 'https://www.gellatti.com',
      matched: true,
    });
    expect(resolveAppOrigin('https://staging.pinguinoai.com')).toEqual({
      environment: 'staging',
      base: 'https://staging.pinguinoai.com',
      matched: true,
    });
  });

  it('tolerates only case and a trailing slash', () => {
    expect(resolveAppOrigin('HTTPS://WWW.GELLATTI.COM/').matched).toBe(true);
    expect(resolveAppOrigin('  https://www.gellatti.com  ').environment).toBe('production');
  });

  it('never calls a lookalike, another scheme, a port or a path production', () => {
    for (const origin of [
      'https://gellatti.com.attacker.example',
      'https://www.gellatti.com.attacker.example',
      'https://evil-gellatti.com',
      'https://attacker.example/?gellatti.com',
      'http://www.gellatti.com',
      'https://www.gellatti.com:8443',
      'https://www.gellatti.com/partner',
      'null',
      '',
      '__proto__',
      'constructor',
    ]) {
      expect(resolveAppOrigin(origin), origin).toEqual({
        environment: 'staging',
        base: 'https://staging.pinguinoai.com',
        matched: false,
      });
    }
    expect(resolveAppOrigin(null).matched).toBe(false);
    expect(resolveAppOrigin(undefined).environment).toBe('staging');
  });
});

describe('one closed map everywhere', () => {
  const rows = (entries: Iterable<RegExpMatchArray>) =>
    [...entries]
      .map((m) => ({ origin: m[1], environment: m[2], base: m[3] }))
      .sort((a, b) => (a.origin ?? '').localeCompare(b.origin ?? ''));
  const shared = Object.entries(APP_ORIGINS)
    .map(([origin, v]) => ({ origin, environment: v.environment, base: v.base }))
    .sort((a, b) => a.origin.localeCompare(b.origin));

  it('equals APP_ORIGINS in shop-digital-document', () => {
    const shopMap =
      read('supabase/functions/shop-digital-document/index.ts').match(
        /const APP_ORIGINS[\s\S]*?= \{([\s\S]*?)\n\};/,
      )?.[1] ?? '';
    expect(
      rows(
        shopMap.matchAll(
          /'(https:\/\/[a-z0-9.-]+)': \{\s*environment: '(production|staging)',\s*base: '(https:\/\/[a-z0-9.-]+)',?\s*\}/g,
        ),
      ),
    ).toEqual(shared);
  });

  it('equals public.app_origins as the mail foundation migration seeds it', () => {
    const sql = read('supabase/migrations/20260910175900_mail_origin_and_escaping.sql');
    expect(
      rows(sql.matchAll(/\('(https:\/\/[a-z0-9.-]+)', '(production|staging)', '(https:\/\/[a-z0-9.-]+)'\)/g)),
    ).toEqual(shared);
  });
});

describe('admin-control decides the app per request, and asks no Partner to set up payouts', () => {
  const source = read('supabase/functions/admin-control/index.ts');
  const executable = source.replace(/\/\/[^\n]*/g, '');

  it('resolves the app from the request Origin header through the shared map', () => {
    expect(source).toContain("import { resolveAppOrigin } from '../_shared/appOrigins.ts';");
    expect(source).toContain("const app = resolveAppOrigin(req.headers.get('origin'));");
  });

  it('invitation redirects come from the map, not from one environment variable', () => {
    expect(executable).not.toContain('PUBLIC_APP_URL');
    expect([...executable.matchAll(/redirectTo: `\$\{app\.base\}\/login`/g)]).toHaveLength(2);
  });

  it('no environment label is hard-coded', () => {
    expect(executable).not.toMatch(/environment:\s*'(staging|production)'/);
  });

  it('provisioning Connect no longer tells the Partner to finish a payout setup', () => {
    expect(executable).not.toContain('Dokończ konfigurację wypłat');
    expect(executable).not.toContain('PARTNER_CONNECT_ACTION_REQUIRED');
  });
});
