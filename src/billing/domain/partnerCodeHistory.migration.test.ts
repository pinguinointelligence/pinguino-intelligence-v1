/// <reference types="node" />
/**
 * D-CODE-06 — archiving (or changing) a code never rewrites history.
 *
 * Attribution, commission, payouts and campaign links all key on the immutable
 * partner id, not on the code. So retiring a code must change the code row's
 * status and nothing else — and no migration anywhere may move a historical
 * row to a different partner.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const files = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const read = (file: string) => readFileSync(new URL(file, MIGRATIONS), 'utf8');

const MANAGE = (() => {
  const opener = 'create or replace function public.gellatti_partner_manage_code_v1(';
  let found: string | undefined;
  for (const file of files) {
    const sql = read(file);
    const start = sql.lastIndexOf(opener);
    if (start < 0) continue;
    const tag = /as (\$[a-z]*\$)/.exec(sql.slice(start))?.[1];
    if (!tag) continue;
    const open = sql.indexOf(tag, start) + tag.length;
    found = sql.slice(start, sql.indexOf(tag, open) + tag.length);
  }
  if (!found) throw new Error('no migration defines the manage-code RPC');
  return found;
})();

const ARCHIVE = (() => {
  const start = MANAGE.indexOf("elsif p_action='ARCHIVE' then");
  const end = MANAGE.indexOf('\n  else', start);
  return start < 0 || end < 0 ? '' : MANAGE.slice(start, end);
})();

/** Every table whose rows are history the partner earned or created. */
const HISTORY = [
  'referral_clicks',
  'referral_attributions',
  'commission_entries',
  'commission_adjustments',
  'partner_payouts',
  'payout_items',
  'partner_content_links',
];

describe('D-CODE-06 — a code change never rewrites history', () => {
  it('archiving retires the code row and writes an audit entry — nothing else', () => {
    expect(ARCHIVE).not.toBe('');
    expect(ARCHIVE).toContain("update public.partner_codes set status='retired'");
    expect(ARCHIVE.match(/\bupdate\b/gi)).toHaveLength(1);
    expect(ARCHIVE).not.toMatch(/\bdelete\b|\binsert into\b/i);
    expect(ARCHIVE).toContain("'partner_code.archive'");
  });

  it('only the partner who owns an active code can archive it', () => {
    expect(ARCHIVE).toContain("where id=p_code_id and partner_id=v_partner and status='active'");
  });

  it('no migration ever moves a historical row to another partner', () => {
    for (const file of files) {
      const sql = read(file).replace(/--[^\n]*/g, '');
      for (const table of HISTORY) {
        const rewrite = new RegExp(
          `update\\s+public\\.${table}\\s+set[^;]*\\bpartner_id\\s*=`,
          'i',
        );
        expect(sql, `${file} rewrites ${table}.partner_id`).not.toMatch(rewrite);
      }
    }
  });
});
