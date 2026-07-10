/// <reference types="node" />
/**
 * Studio Flow (PL-first User-Flow layer) — locked copy + pure mapper + panel.
 *
 * Pins the HONESTY rules: nothing claims saved/applied, partial improvement
 * is never a rescue, Demo/Free wording stays redaction-safe, stock guidance
 * never implies an inventory write, save-vs-apply stays explicit, and the
 * whole layer is pure (no DB / Mapper / persistence path).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  access: { exactCorrectionGrams: true, saveRecipes: true },
  auth: { status: 'authed' as 'authed' | 'anon' | 'loading' },
}));

vi.mock('@/access/useAccess', () => ({ useAccess: () => h.access }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof h.auth) => unknown) => sel(h.auth),
}));

import {
  STUDIO_FLOW_COPY,
  STUDIO_FLOW_SITUATIONS,
} from './studioFlowCopy';
import { productionFlowGuidance, studioFlowGuidance } from './studioFlowGuidance';
import { StudioFlowGuidePanel } from './StudioFlowGuidePanel';
import { findOptimizationPreviewFixture } from '@/features/optimization/optimizationPreviewFixtures';
import { runOptimizationPreview } from '@/features/optimization/optimizationPreviewRunner';

const PL = STUDIO_FLOW_COPY.pl;

/** Every string the registry ships, flattened for honesty scans. */
const allCopyStrings = (): string[] => [
  ...Object.values(PL.situations).flatMap((s) => [s.title, s.body, s.nextAction]),
  PL.tier.demoLockedGrams,
  PL.tier.proExactGrams,
  PL.save.signInToSave,
  PL.save.saveAvailable,
  PL.save.saveVsApply,
  PL.disclaimers.previewOnly,
  PL.disclaimers.noInventoryWrite,
  PL.disclaimers.noRecipeMutation,
];

const tradeoffView = runOptimizationPreview(findOptimizationPreviewFixture('gelato-tradeoff')!);
const inRangeView = runOptimizationPreview(findOptimizationPreviewFixture('sorbet-ready')!);
const blockedView = runOptimizationPreview(findOptimizationPreviewFixture('granita-blocked')!);

const proState = (optimization: Parameters<typeof studioFlowGuidance>[0]['optimization']) =>
  studioFlowGuidance({
    authStatus: 'authed',
    exactCorrectionGrams: true,
    saveRecipes: true,
    optimization,
  });

beforeEach(() => {
  h.access = { exactCorrectionGrams: true, saveRecipes: true };
  h.auth = { status: 'authed' };
});

describe('locked PL copy — coverage and honesty rules', () => {
  it('every core situation has non-empty Polish copy (title, body, next action)', () => {
    expect(STUDIO_FLOW_SITUATIONS).toHaveLength(10);
    for (const situation of STUDIO_FLOW_SITUATIONS) {
      const c = PL.situations[situation];
      expect(c.title.length, situation).toBeGreaterThan(3);
      expect(c.body.length, situation).toBeGreaterThan(10);
      expect(c.nextAction.length, situation).toBeGreaterThan(10);
    }
    // it is really Polish (diacritics present across the registry)
    expect(allCopyStrings().join(' ')).toMatch(/[ąćęłńóśźż]/);
  });

  it('nothing ever claims "zapisano" / "zastosowano" / "nałożono" (nothing saves or applies here)', () => {
    for (const text of allCopyStrings()) {
      expect(/zapisano|zastosowano|nałożono/i.test(text), text).toBe(false);
    }
  });

  it('a partial improvement is NEVER called rescued without the "nie w pełni" qualifier', () => {
    for (const text of allCopyStrings()) {
      if (/uratowan/i.test(text)) {
        expect(/nie w pełni/i.test(text), text).toBe(true);
      }
    }
    // the tradeoff copy calls it a compromise, not a rescue
    expect(PL.situations.recipe_tradeoff.body).toMatch(/kompromis/i);
    expect(/uratowan/i.test(PL.situations.recipe_tradeoff.body)).toBe(false);
  });

  it('Demo/Free wording is upgrade-safe and never promises visible exact grams', () => {
    expect(PL.tier.demoLockedGrams).toMatch(/dostępne w Pro/);
    expect(/widzisz dokładne/i.test(PL.tier.demoLockedGrams)).toBe(false);
  });

  it('Pro wording names the exact-gram value honestly', () => {
    expect(PL.tier.proExactGrams).toMatch(/dokładne gramatury/i);
  });

  it('save-vs-apply is explicit: an audit record, the recipe stays untouched', () => {
    expect(PL.save.saveVsApply).toMatch(/NIE zmiana receptury/);
    expect(PL.save.saveVsApply).toMatch(/nietknięta/);
    expect(PL.disclaimers.noRecipeMutation).toMatch(/nie jest modyfikowana/);
  });

  it('missing-data copy asks for a measurement instead of guessing', () => {
    expect(PL.situations.missing_data.body).toMatch(/pomiar/);
    expect(PL.situations.missing_data.body).toMatch(/zgadywać/);
    expect(PL.situations.batch_rescue_guidance.nextAction).toMatch(/nie zgaduje/);
  });

  it('stock-shortage copy states inventory is neither read nor written', () => {
    expect(PL.situations.stock_shortage_guidance.body).toMatch(/ani odczytywane, ani nigdzie zapisywane/);
    expect(PL.disclaimers.noInventoryWrite).toMatch(/nie są ani odczytywane, ani zapisywane/);
  });

  it('substitute copy forbids hand-typed compositions', () => {
    expect(PL.situations.verified_substitute_guidance.body).toMatch(/nie można wpisać ręcznie/);
  });
});

describe('studioFlowGuidance — pure state → copy mapping', () => {
  it('no optimization yet → new-recipe guidance without context line', () => {
    const g = proState(null);
    expect(g.situation).toBe('new_recipe');
    expect(g.contextLine).toBeNull();
    expect(g.saveNote).toBeNull();
  });

  it('maps every optimization decision to its situation (real runner views)', () => {
    const of = (view: typeof tradeoffView) => ({
      finalDecision: view.finalDecision,
      saveableSolve: false,
      productProfile: view.productProfile,
      servingTemperatureC: view.servingTemperatureC,
    });
    expect(proState(of(tradeoffView)).situation).toBe('recipe_tradeoff');
    expect(proState(of(inRangeView)).situation).toBe('recipe_in_range');
    expect(proState(of(blockedView)).situation).toBe('recipe_blocked');
    expect(proState(of(tradeoffView)).contextLine).toBe('standard_gelato · -11°C');
  });

  it('the save note appears ONLY for a genuinely saveable solve — and per tier', () => {
    const saveable = {
      finalDecision: 'tradeoff' as const,
      saveableSolve: true,
      productProfile: 'standard_gelato',
      servingTemperatureC: -11,
    };
    // Pro signed-in → save available + the save-vs-apply distinction
    const pro = proState(saveable);
    expect(pro.saveNote).toBe(PL.save.saveAvailable);
    expect(pro.saveVsApplyNote).toBe(PL.save.saveVsApply);
    // unsigned → sign-in note, no distinction text
    const anon = studioFlowGuidance({
      authStatus: 'anon',
      exactCorrectionGrams: false,
      saveRecipes: false,
      optimization: saveable,
    });
    expect(anon.saveNote).toBe(PL.save.signInToSave);
    expect(anon.saveVsApplyNote).toBeNull();
    // signed-in Free → no save note at all (no dead promise)
    const free = studioFlowGuidance({
      authStatus: 'authed',
      exactCorrectionGrams: false,
      saveRecipes: true,
      optimization: saveable,
    });
    expect(free.saveNote).toBeNull();
    // an unverified solve never earns a save note, even for Pro
    expect(proState({ ...saveable, saveableSolve: false }).saveNote).toBeNull();
    // a non-saveable decision never earns one either
    expect(proState({ ...saveable, finalDecision: 'impossible' }).saveNote).toBeNull();
  });

  it('always carries the preview-only + no-recipe-mutation disclaimers', () => {
    const g = proState(null);
    expect(g.disclaimers).toContain(PL.disclaimers.previewOnly);
    expect(g.disclaimers).toContain(PL.disclaimers.noRecipeMutation);
  });

  it('production-flow guidance exposes the IF9 / IF10 / substitute trio', () => {
    const trio = productionFlowGuidance();
    expect(trio.map((t) => t.title)).toEqual([
      PL.situations.batch_rescue_guidance.title,
      PL.situations.stock_shortage_guidance.title,
      PL.situations.verified_substitute_guidance.title,
    ]);
  });

  it('is deterministic', () => {
    const run = () =>
      JSON.stringify(
        studioFlowGuidance({
          authStatus: 'authed',
          exactCorrectionGrams: true,
          saveRecipes: true,
          optimization: {
            finalDecision: 'tradeoff',
            saveableSolve: true,
            productProfile: 'standard_gelato',
            servingTemperatureC: -12,
          },
        }),
      );
    expect(run()).toBe(run());
  });
});

describe('StudioFlowGuidePanel — render states (read-only, PL)', () => {
  const render = (view: typeof tradeoffView | null) =>
    renderToStaticMarkup(<StudioFlowGuidePanel view={view} />);
  const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ');

  it('pre-run: new-recipe guidance renders with the disclaimers, no buttons at all', () => {
    const html = render(null);
    const text = visibleText(html);
    expect(text).toContain(PL.situations.new_recipe.title);
    expect(text).toContain('Podgląd — nic nie zapisuje się');
    expect(html).not.toContain('<button');
  });

  it('Pro + real tradeoff view: tradeoff guidance + save availability + save-vs-apply', () => {
    const text = visibleText(render(tradeoffView));
    expect(text).toContain(PL.situations.recipe_tradeoff.title);
    expect(text).toContain('standard_gelato · -11°C');
    expect(text).toContain(PL.tier.proExactGrams);
    expect(text).toContain(PL.save.saveAvailable);
    expect(text).toContain('NIE zmiana receptury');
  });

  it('Demo (anon): redaction-safe tier note + sign-in save note, no exact-gram promise', () => {
    h.access = { exactCorrectionGrams: false, saveRecipes: false };
    h.auth = { status: 'anon' };
    const text = visibleText(render(tradeoffView));
    expect(text).toContain('dostępne w Pro');
    expect(text).toContain(PL.save.signInToSave);
    expect(text).not.toContain('widzisz dokładne gramatury');
  });

  it('renders the production-flow trio inside a disclosure (no auto-actions)', () => {
    const html = render(null);
    expect(html).toContain('<details');
    const text = visibleText(html);
    expect(text).toContain('Ratowanie realnej partii (IF9)');
    expect(text).toContain('Brak surowca (IF10)');
    expect(text).toContain('Zweryfikowany zamiennik');
  });
});

describe('boundary — pure layer, no DB / Mapper / persistence path', () => {
  const HERE = import.meta.dirname;
  const sources = ['studioFlowCopy.ts', 'studioFlowGuidance.ts', 'StudioFlowGuidePanel.tsx'].map(
    (file) =>
      readFileSync(join(HERE, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, ''),
  );

  it('never imports services / DB / Mapper / product data and never writes', () => {
    for (const src of sources) {
      expect(/@\/services\/|@\/lib\/|@\/data\/products|mapper_basement|service_role/i.test(src)).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', 'fetch(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
      expect(/saveRecipe\(|persistRecipe|localStorage|sessionStorage/.test(src)).toBe(false);
      expect(/pi_calculated|pac_value|pod_value/.test(src)).toBe(false);
    }
  });
});
