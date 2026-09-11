/// <reference types="node" />
/**
 * C-APP-04 — one account can never hold two open Partner applications.
 *
 * Two layers carry this, and both are pinned here: the partial unique index
 * refuses a second open row outright, and the submit RPC answers a second
 * submission by returning the existing application (or re-opening the same row
 * when more information was requested) instead of trying to insert another.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARTNER_APPLICATION_STATUSES } from './partnerApplicationStatus';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const files = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const read = (file: string) => readFileSync(new URL(file, MIGRATIONS), 'utf8');
const flat = (sql: string) => sql.replace(/\s+/g, ' ');

/** The last definition of the index wins — a later migration drops and recreates it. */
const INDEX = (() => {
  let found: string | undefined;
  for (const file of files) {
    const match = /create unique index if not exists partner_applications_open_uniq[^;]*;/i.exec(
      read(file),
    );
    if (match) found = flat(match[0]);
  }
  if (!found) throw new Error('partner_applications_open_uniq is not defined');
  return found;
})();

const SUBMIT = (() => {
  const opener = 'create or replace function public.gellatti_submit_partner_application_v1(';
  let found: string | undefined;
  for (const file of files) {
    const sql = read(file);
    const start = sql.lastIndexOf(opener);
    if (start < 0) continue;
    const tag = /as (\$[a-z]*\$)/.exec(sql.slice(start))?.[1];
    if (!tag) continue;
    const open = sql.indexOf(tag, start) + tag.length;
    found = flat(sql.slice(start, sql.indexOf(tag, open) + tag.length));
  }
  if (!found) throw new Error('no migration defines the submit RPC');
  return found;
})();

/** Statuses that end an application: every other status is an open one. */
const CLOSED = ['approved', 'rejected', 'suspended', 'terminated'];

describe('C-APP-04 — no duplicate open application for one account', () => {
  it('the index is UNIQUE on the account', () => {
    expect(INDEX).toMatch(
      /^create unique index if not exists partner_applications_open_uniq on public\.partner_applications \(user_id\)/,
    );
  });

  it('it covers exactly the open statuses — no more, no fewer', () => {
    const covered = [
      ...(/where status in \(([^)]*)\)/.exec(INDEX)?.[1] ?? '').matchAll(/'([^']+)'/g),
    ]
      .map((match) => match[1] ?? '')
      .sort();
    const open = PARTNER_APPLICATION_STATUSES.filter((status) => !CLOSED.includes(status)).sort();
    expect(covered).toEqual(open);
  });

  it('a second submit returns the existing application instead of inserting', () => {
    expect(SUBMIT).toContain("if v_status in ('submitted', 'under_review', 'approved') then");
    expect(SUBMIT).toContain(
      "return jsonb_build_object('id', v_id, 'status', v_status, 'duplicate', true);",
    );
  });

  it('answering "more information needed" re-opens the same row', () => {
    expect(SUBMIT).toContain(
      "return jsonb_build_object('id', v_id, 'status', 'submitted', 'resubmitted', true);",
    );
  });
});
