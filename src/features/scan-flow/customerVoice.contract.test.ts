/**
 * SOL-043 — A CUSTOMER NEVER READS AN ENGINE OR PRODUCTBEHAVIOR ENUM.
 *
 * Owner test on an iPhone, 2026-09-06, canonical staging: after photographing a Cola Zero label the
 * screen said, verbatim,
 *
 *   `not ready: INGREDIENTS_EVIDENCE_REQUIRED, roleReadiness:REVIEW, recognition:NORMAL_INGREDIENT/BASE_ONLY`
 *
 * The served client rendered the pipeline's diagnostic `note` directly (`{phase.note}`). These
 * contracts keep that shape from coming back on any customer surface: the sentences are filtered by
 * the one shared customer-voice filter, and no customer file may contain such a token as copy.
 * PRO's professional dashboard is deliberately out of scope — it is where the diagnosis belongs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exposesInternals, homeCustomerNotice } from '@/features/home-creator/homeCustomerNotice';
import { customerSentence, missingDataSentence } from './scanFlowLogic';

/** exactly what the owner's screen showed */
const OWNER_SENTENCE =
  'not ready: INGREDIENTS_EVIDENCE_REQUIRED, roleReadiness:REVIEW, recognition:NORMAL_INGREDIENT/BASE_ONLY';

const CUSTOMER_SURFACES = ['src/features/scan-flow', 'src/features/home-creator', 'src/pages/home'];

function customerFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(full) || /\.test\.(ts|tsx)$/.test(full)) continue;
      out.push(full);
    }
  };
  for (const dir of CUSTOMER_SURFACES) walk(dir);
  return out;
}

describe('SOL-043 — raw internal statuses never reach a customer surface', () => {
  it('the exact sentence the owner saw is refused by the shared filter', () => {
    expect(exposesInternals(OWNER_SENTENCE)).toBe(true);
    expect(homeCustomerNotice(OWNER_SENTENCE)).not.toContain('INGREDIENTS_EVIDENCE_REQUIRED');
    expect(customerSentence(OWNER_SENTENCE)).not.toContain('roleReadiness');
    expect(customerSentence(OWNER_SENTENCE)).not.toContain('NORMAL_INGREDIENT');
  });

  it.each([
    'INGREDIENTS_EVIDENCE_REQUIRED',
    'roleReadiness:REVIEW',
    'recognition:NORMAL_INGREDIENT/BASE_ONLY',
    'BASE_ONLY',
    'TOPPING_ONLY',
    'engineUsable: false',
    'compositionReadiness ESTIMATED_READY',
    'PROFILE_CONFIDENCE_BELOW_ENGINE_READY_FLOOR',
    '{"missingCritical":["ingredients"]}',
  ])('a customer never reads %s', (token) => {
    expect(exposesInternals(token)).toBe(true);
  });

  it('ordinary customer wording still passes through untouched', () => {
    for (const sentence of [
      'Produkt jest zapisany u Ciebie. Uzupełnij skład i wartości odżywcze, aby użyć go w recepturze.',
      'Nie ma czego poprawiać — receptura jest już dobrze ustawiona.',
      'Crunchy Sante Naturalne: dodano jako dodatek (topping).',
      'Na koniec dodaj topping.',
    ]) {
      expect(customerSentence(sentence)).toBe(sentence);
    }
  });

  it('the missing-data sentence names label fields, never codes', () => {
    const sentence = missingDataSentence([
      'ingredients',
      'allergen_confirmation',
      'nutrition.fat',
      'INGREDIENTS_EVIDENCE_REQUIRED',
    ]);
    expect(exposesInternals(sentence)).toBe(false);
    expect(sentence).toContain('Uzupełnij');
    // an unknown code contributes nothing rather than leaking itself
    expect(sentence).not.toContain('INGREDIENTS_EVIDENCE');
    // and a list of codes the mapping knows nothing about still yields a usable sentence
    expect(exposesInternals(missingDataSentence(['SOMETHING_INTERNAL_V2']))).toBe(false);
  });

  it('no customer-surface file carries such a token as copy', () => {
    const offenders: string[] = [];
    for (const file of customerFiles()) {
      const text = readFileSync(file, 'utf8');
      // string literals only — a TypeScript comparison against an enum is legitimate code
      for (const [, literal] of text.matchAll(/'([^'\n]{8,200})'|"([^"\n]{8,200})"/g)) {
        const value = literal ?? '';
        if (!/[ąćęłńóśźżA-Za-z]{4,}\s+[ąćęłńóśźżA-Za-z]{3,}/.test(value)) continue; // prose only
        if (exposesInternals(value)) offenders.push(`${file}: ${value.slice(0, 90)}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the scan flow renders no diagnostic note', () => {
    const flow = readFileSync('src/features/scan-flow/ScanFlow.tsx', 'utf8');
    expect(flow).not.toMatch(/\{phase\.note\}/);
    expect(flow).not.toMatch(/note:\s*noteText/);
    // and every notice it does render is filtered
    expect(flow).not.toMatch(/\{phase\.notice\}/);
    expect(flow).toMatch(/customerSentence\(phase\.notice\)/);
  });

  it('no customer surface promises a message that no process sends (owner rule)', () => {
    // "Damy znać, gdy produkt będzie gotowy" was shown to the owner on 2026-09-06; nothing in the
    // system sends such a notification, so the sentence may not exist on a customer screen at all
    for (const file of customerFiles()) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/Damy znać|Powiadomimy|Poinformujemy/i);
    }
  });
});
