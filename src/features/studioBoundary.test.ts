/// <reference types="node" />
/**
 * Studio boundary guard (pinguino-studio-design skill, hard rules).
 *
 * Scans the UI source (non-test) and fails if it:
 *  (a) references OpenAI / Stripe ANYWHERE, or references Supabase outside the
 *      sanctioned client layer (`src/lib/supabase/**`; `src/services/**` is not
 *      scanned). Stores/UI reach Supabase only through `@/services/**`,
 *  (b) reaches into engine internals via a deep `@/engine/<module>` import
 *      (the public `@/engine` barrel is the only allowed entry),
 *  (c) calls engine stage functions / coefficient tables directly — i.e.
 *      duplicates recipe math instead of going through calculateRecipe /
 *      proposeCorrections.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..');
const SCAN_DIRS = ['features', 'pages/studio', 'pages/home', 'stores', 'access', 'data', 'lib'];

function scanFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const base = join(SRC, dir);
    let entries: string[];
    try {
      entries = readdirSync(base, { recursive: true }) as string[];
    } catch {
      continue;
    }
    for (const rel of entries) {
      const full = join(base, String(rel));
      if (!/\.(ts|tsx)$/.test(full)) continue;
      if (/\.test\.(ts|tsx)$/.test(full)) continue;
      if (full.includes('__snapshots__')) continue;
      files.push(full);
    }
  }
  return files;
}

const FILES = scanFiles();

/** Engine internals the UI must NOT call directly (only the public entry points
 * calculateRecipe + proposeCorrections + plain config data are allowed). */
const FORBIDDEN_ENGINE_IDENTIFIERS = [
  'computeComposition',
  'computeComponentTotals',
  'computePercentages',
  'computeSugarBreakdown',
  'computeTotalBatchGrams',
  'computeRecipePod',
  'computeRecipePac',
  'computeRecipeNpac',
  'ingredientPodContribution',
  'ingredientPacContribution',
  'ingredientNpacContribution',
  'estimateIceFraction',
  'classifyRecipeIndicators',
  'computeScores',
  'computeTechnicalScore',
  'computeNutritionPer100g',
  'computeRecipeCosts',
  'POD_COEFFICIENTS',
  'PAC_COEFFICIENTS',
  'NPAC_COEFFICIENTS',
];

describe('studio boundary guard', () => {
  it('scans a non-empty set of UI source files', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it('contains no OpenAI / Stripe anywhere, and no Supabase outside the client layer', () => {
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      // OpenAI / Stripe are forbidden everywhere (incl. the supabase client layer).
      expect(/\b(openai|stripe)\b/i.test(text), `openai/stripe in ${file}`).toBe(false);
      // Supabase is allowed ONLY under src/lib/supabase/** (services/** is not scanned).
      const supabaseAllowedHere = /[\\/]lib[\\/]supabase[\\/]/.test(file);
      if (!supabaseAllowedHere) {
        expect(/\bsupabase\b/i.test(text), `supabase outside lib/supabase in ${file}`).toBe(false);
      }
    }
  });

  it('never uses the banned term "Mini Engine" (UI source + copy)', () => {
    const copyFile = join(SRC, 'copy', 'en.ts');
    for (const file of [...FILES, copyFile]) {
      const text = readFileSync(file, 'utf8');
      expect(/mini\s*engine/i.test(text), file).toBe(false);
    }
  });

  it('imports the engine only through the public @/engine barrel', () => {
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(text), `deep engine import in ${file}`).toBe(
        false,
      );
    }
  });

  it('never duplicates engine math (no direct stage-function / coefficient use)', () => {
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      for (const identifier of FORBIDDEN_ENGINE_IDENTIFIERS) {
        expect(text.includes(identifier), `${identifier} used in ${file}`).toBe(false);
      }
    }
  });
});
