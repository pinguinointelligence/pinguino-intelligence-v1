/**
 * −11°C Engine Contract + AI/API guardrails — documentation string-scan guards
 * (Slice 1A.5). Reads the two new docs by EXPLICIT path (never a recursive docs/
 * walk, so docs/ingredient-database/ and the masterplan are untouched) and pins
 * the required phrases + forbidden terms. vitest runs in the node environment.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8');

const CONTRACT_RAW = read('docs/engine/MINUS_11_ENGINE_CONTRACT.md');
const GUARDRAILS_RAW = read('docs/ai/PINGUINO_AI_ENGINE_GUARDRAILS.md');
const CONTRACT = CONTRACT_RAW.toLowerCase();
const GUARDRAILS = GUARDRAILS_RAW.toLowerCase();

// Special characters built from codepoints so the test enforces the exact glyphs.
const MINUS = '−'; // U+2212 MINUS SIGN (NOT the ASCII hyphen '-')
const DEG = '°'; // U+00B0 DEGREE SIGN
const LABEL = `${MINUS}11${DEG}C Engine`; // −11°C Engine
const TEMP_11 = `${MINUS}11${DEG}C`;

const FORBIDDEN_TERMS = ['mini engine', 'smartgelato', 'mygelato', 'openai', 'stripe', 'supabase', 'demo'];

describe('−11°C Engine Contract doc — required content', () => {
  it('uses the exact active engine label "−11°C Engine" (U+2212 minus)', () => {
    expect(CONTRACT_RAW).toContain(LABEL);
  });

  it('states the scope is −11°C only', () => {
    expect(CONTRACT_RAW).toContain(`${TEMP_11} only`);
  });

  it('explicitly says there are no validated −10 / −12 / −13°C tests yet', () => {
    expect(CONTRACT).toContain('no validated');
    expect(CONTRACT_RAW).toContain(`${MINUS}12${DEG}C`);
    expect(CONTRACT_RAW).toContain(`${MINUS}13${DEG}C`);
  });

  it('does NOT claim a −12°C or −13°C engine exists (no future profile as a working engine)', () => {
    expect(CONTRACT_RAW).not.toContain(`${MINUS}12${DEG}C Engine`);
    expect(CONTRACT_RAW).not.toContain(`${MINUS}13${DEG}C Engine`);
    expect(CONTRACT).toContain('not separate working engines yet');
  });

  it('includes the Auto Fix determinism + idempotence / no-op rule', () => {
    expect(CONTRACT).toContain('deterministic');
    expect(CONTRACT).toContain('idempotent');
    expect(CONTRACT).toContain('already balanced');
    expect(CONTRACT).toContain('no-op');
  });

  it('includes the hero / locked-ingredient protection rule', () => {
    expect(CONTRACT).toContain('never reduce a locked');
    expect(CONTRACT).toContain('premium');
    expect(CONTRACT).toContain('signature');
    expect(CONTRACT).toContain('protected');
  });

  it('includes the impossible-balance (never fake perfection) rule', () => {
    expect(CONTRACT).toContain('tradeoff');
    expect(CONTRACT).toContain('never fakes perfection');
    expect(CONTRACT).toContain('no negative grams');
  });

  it('includes the alcohol / ingredient-influence rule', () => {
    expect(CONTRACT).toContain('do not blindly add dextrose');
  });

  it('includes the API forbidden-behavior list (no inventing exact values)', () => {
    expect(CONTRACT).toContain('invent exact grams');
    expect(CONTRACT).toContain('npac');
  });

  it('contains no banned / off-limits terms', () => {
    for (const term of FORBIDDEN_TERMS) {
      expect(CONTRACT, `contract doc must not contain "${term}"`).not.toContain(term);
    }
  });
});

describe('AI/API guardrails doc — required content', () => {
  it('uses "AI/API" wording', () => {
    expect(GUARDRAILS).toContain('ai/api');
  });

  it('states the division of labor (AI routes; engine calculates; solver fixes; DB provides data)', () => {
    expect(GUARDRAILS).toContain('ai explains and routes');
    expect(GUARDRAILS).toContain('engine calculates');
    expect(GUARDRAILS).toContain('solver fixes');
    expect(GUARDRAILS).toContain('ingredient database provides data');
  });

  it('says the AI must never invent exact values', () => {
    expect(GUARDRAILS).toContain('must never invent exact');
  });

  it('requires missing data to be reported as missing / needs review', () => {
    expect(GUARDRAILS).toContain('missing / needs review');
  });

  it('requires impossible recipes to be explained as constrained / impossible, not faked', () => {
    expect(GUARDRAILS).toContain('constrained / impossible');
    expect(GUARDRAILS).toContain('never fake precision');
  });

  it('references the −11°C temperature scope', () => {
    expect(GUARDRAILS_RAW).toContain(TEMP_11);
  });

  it('contains no banned / off-limits terms', () => {
    for (const term of FORBIDDEN_TERMS) {
      expect(GUARDRAILS, `guardrails doc must not contain "${term}"`).not.toContain(term);
    }
  });
});
