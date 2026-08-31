/**
 * The server search must stem the way the client does, or a Polish query never
 * reaches an English catalogue row: the baker types „inulina", the Mapper says
 * INULIN, and substring matching alone answers nothing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stem } from './ingredientSearch';

const MIGRATION = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260824110000_search_relevance_stem_and_rank.sql',
  ),
  'utf8',
);

describe('search relevance contract', () => {
  it('stems an inflected Polish query down to the catalogue stem', () => {
    expect(stem('inulina')).toBe('inulin');
    expect(stem('truskawkowy')).toBe('truskawk');
  });

  it('never over-stems a short word', () => {
    expect(stem('soja')).toBe('soja');
    expect(stem('skyr')).toBe('skyr');
  });

  it('ships the same suffix ladder to the database', () => {
    // Drift here is silent: the client would find a row the server cannot.
    for (const suffix of ['owych', 'owym', 'owej', 'owe', 'owy', 'owa', 'ami', 'ach']) {
      expect(MIGRATION).toContain(`'${suffix}'`);
    }
    expect(MIGRATION).toContain('length(t.tok) - length(suf) >= 4');
  });

  it('expands the query to its root server-side', () => {
    expect(MIGRATION).toContain('select public.gellatti_search_root(i.q)');
  });

  it('does not let whole-document fuzzy matching admit unrelated rows', () => {
    expect(MIGRATION).toContain('extensions.similarity(c.search_text,e.q)>=0.55');
    expect(MIGRATION).not.toContain('extensions.similarity(c.search_text,e.q)>=0.28');
  });

  it('puts matching favourites first, then relevance', () => {
    expect(MIGRATION).toContain('order by c.favorite desc,c.relevance desc');
  });
});
