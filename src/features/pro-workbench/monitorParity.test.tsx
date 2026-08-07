/**
 * MONITOR PI — the owner's B1 PARITY INVENTORY as an executable test (Agent M).
 *
 * The pre-redesign pinned right panel (tree before cdb7902: OverallScoreCard +
 * UserMonitorPro + NutritionCostScorePanel + CorrectionPanel + advanced tools +
 * owner diagnostics) must be FULLY present in the one `MonitorPanelContent` that
 * serves BOTH the desktop LIVE right panel and the mobile bottom sheet. Owner list
 * items proven here:
 *
 *  1. parity inventory (every element rendered on a REAL engine result)
 *  2. the technical /10 renders
 *  3. provisional + insufficient truthful states (B5)
 *  4. every detailed module mounted (B3 — collapse allowed, disappearance never)
 *  5. content not clipped (B6 — no overflow-hidden/max-h/nested scroll inside)
 *  6. advanced red-marked (B4), core summary NEVER review-marked
 *  7. nothing removed (the drawer renders the SAME complete content)
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateRecipe,
  proposeCorrections,
  type ProductCategory,
  type RecipeInput,
} from '@/engine';
import { copy } from '@/copy/en';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import {
  starterMilkBase,
  starterLine,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';

// Full Pro capabilities so the REAL exact panels mount (the owner's staging view).
vi.mock('@/access/useAccess', () => ({
  useAccess: () => ({
    plan: 'pro',
    tier: 'pro',
    isSignedIn: true,
    isPro: true,
    exactCorrectionGrams: true,
    fullFormula: true,
    technicalView: true,
    canViewExactGrams: true,
    canApplyStarterToStudio: true,
    saveRecipes: true,
    myRecipes: true,
    productionMode: false,
    rescueMode: false,
  }),
}));

const { MonitorPanelContent } = await import('./MonitorPanelContent');

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

function renderPanel(input: RecipeInput) {
  const result = calculateRecipe(input);
  const corrections = proposeCorrections({ input, context: recipeContext(input), redact: false });
  return renderToStaticMarkup(
    <MonitorPanelContent
      result={result}
      servingTemperatureC={input.target_temperature_c}
      corrections={corrections}
      input={input}
    />,
  );
}

/* ─────────────── 1+2+4. The B1 inventory on a REAL engine result ─────────────── */

describe('B1 parity inventory — every pre-redesign element, data-connected', () => {
  const html = renderPanel(starterMilkBase());
  const text = visibleText(html);

  it('renders the technical score as N/10 with the §15.1 label (owner item 2)', () => {
    expect(text).toMatch(/\d{1,2}\/10/);
    expect(html).toContain('data-testid="monitor-summary-score"');
    expect(text).toContain('Dopasowanie receptury');
  });

  it('renders the §14.1 status badge, coverage and truthful assessment state', () => {
    expect(html).toContain('data-testid="monitor-summary-badge"');
    expect(text).toMatch(/Gotowa|Wymaga korekty|Test rekomendowany/);
    expect(html).toContain('data-testid="monitor-assessment"');
    expect(html).toMatch(/data-state="(native|provisional)"/);
  });

  it('renders the six quality axes with TEXT readings', () => {
    for (const axis of ['Struktura', 'Miękkość', 'Słodycz', 'Kremowość', 'Pełnia', 'Stabilność']) {
      expect(text, axis).toContain(axis);
    }
    for (const id of ['struktura', 'miekkosc', 'slodycz', 'kremowosc', 'pelnia', 'stabilnosc']) {
      expect(html).toContain(`data-testid="monitor-axis-${id}"`);
    }
  });

  it('renders readiness, data confidence and the serving temperature', () => {
    expect(text).toContain('Gotowość produkcyjna');
    expect(text).toContain('Pewność danych');
    expect(html).toContain('data-testid="monitor-summary-readiness"');
    expect(text).toContain('Temperatura serwowania');
  });

  it('renders ONE primary warning/success line', () => {
    expect(html).toContain('data-testid="monitor-primary-signal"');
  });

  it('mounts EVERY historical §14.2 module — including the layout-disabled Expert module (forceAllModules)', () => {
    for (const module of [
      'Zachowanie w temperaturze',
      'Cukry i słodycz',
      'Woda i faza mrożona',
      'Tłuszcze i kremowość',
      'Białka i struktura',
      'Ciała stałe i pełnia',
      'Stabilizacja',
      'Składniki specjalne', // carries the Alkohol row
      'Tryb Expert', // advanced Engine metrics (POD/PAC/NPAC/ice)
    ]) {
      expect(text, module).toContain(module);
    }
    for (const id of [
      'temperatura',
      'cukry',
      'woda',
      'tluszcze',
      'bialka',
      'ciala_stale',
      'stabilizacja',
      'specjalne',
      'expert',
    ]) {
      expect(html).toContain(`data-testid="user-monitor-module-${id}"`);
    }
    // Advanced Engine metrics rows are REAL (POD/PAC/NPAC vocabulary present).
    expect(text).toContain('POD');
    expect(text).toContain('NPAC');
  });

  it('renders the Stabilizacja provenance sentence (B1 „+provenance")', () => {
    expect(html).toContain('data-testid="stabilization-provenance"');
  });

  it('renders nutrition + koszt/kg + KOSZT PARTII + portions + the missing-price state', () => {
    expect(html).toContain('data-testid="monitor-detail-nutrition"');
    expect(text).toContain('Per 100 g');
    const costs = calculateRecipe(starterMilkBase()).costs;
    if (costs === null) {
      expect(text).toContain(copy.studio.metrics.costEmpty);
    } else {
      expect(text).toContain(copy.studio.metrics.costPerKg);
      expect(text).toContain(copy.studio.metrics.costBatch); // Koszt partii — restored field
      expect(text).toContain(copy.studio.metrics.serving60);
    }
  });

  it('renders Korekty PI (recommendations) and the full score card', () => {
    expect(html).toContain('data-testid="monitor-detail-corrections"');
    expect(html).toContain('data-testid="monitor-detail-score"');
  });

  it('renders the owner diagnostics inside the Monitor (iteration/stop/trajectory home)', () => {
    expect(html).toContain('data-testid="review-marked-monitor-owner-diagnostic"');
    expect(html).toContain('data-testid="owner-diagnostic"');
    expect(text).toContain(copy.studio.secondary.reviewMarked.ownerDiagnostic);
    expect(html).toContain('data-testid="owner-identity-diagnostics"');
    expect(text).toContain(copy.studio.diagnostic.identityCanonical);
    expect(text).toContain(copy.studio.diagnostic.identityEffective);
    expect(text).toContain(copy.studio.diagnostic.identityEngine);
    expect(text).toContain(copy.studio.diagnostic.monitorRevision);
    expect(text).toContain(copy.studio.diagnostic.formulationRevision);
  });
});

/* ───────────────────────── 3. B5 truthful states ───────────────────────── */

describe('B5 truthful states — never a blank Monitor', () => {
  it('insufficient input renders the EXACT sentence „Brak wystarczających danych do oceny."', () => {
    const html = renderPanel({ ...starterMilkBase(), items: [] });
    expect(html).toContain('data-testid="monitor-insufficient"');
    expect(visibleText(html)).toContain('Brak wystarczających danych do oceny.');
    // The detailed layer STAYS mounted with its own honest empty states — never blank.
    expect(html).toContain('data-testid="monitor-detail-nutrition"');
    expect(html).toContain('data-testid="monitor-detail-corrections"');
  });

  it('provisional profile renders „Ocena częściowa / prowizoryczna" + source + coverage', () => {
    const html = renderPanel({ ...starterMilkBase(), category: 'nut_gelato' as ProductCategory });
    const text = visibleText(html);
    expect(html).toContain('data-state="provisional"');
    expect(text).toContain('Ocena częściowa / prowizoryczna');
    expect(text).toContain(copy.monitorPi.summary.provisionalSource.category);
    expect(html).toContain('data-testid="monitor-summary-coverage"');
  });

  it('native violations show the current value and direction without exposing exact bands', () => {
    const html = renderPanel(withGrams(starterMilkBase(), starterLine('sucrose'), 10));
    expect(html).toContain('data-testid="monitor-violated-bands"');
    const text = visibleText(html);
    expect(text).toMatch(/\d+([.,]\d+)?(%|°C| g\/l)?\s+\((poniżej|powyżej) złotego środka\)/);
    expect(text).not.toMatch(/\(zakres \d+([.,]\d+)?–\d+([.,]\d+)?/);
  });
});

/* ─────────────────────────── 5. B6 — no clipping ─────────────────────────── */

describe('B6 — one predictable scroll surface, nothing clipped', () => {
  it('the panel content itself introduces NO height caps, hidden overflow or nested scroll', () => {
    const html = renderPanel(starterMilkBase());
    expect(html).not.toContain('overflow-hidden');
    expect(html).not.toContain('overflow-y-auto');
    expect(html).not.toMatch(/max-h-/);
    expect(html).not.toMatch(/\bh-0\b/);
  });

  it('the hosts own the ONE scroll surface: desktop aside + mobile sheet are overflow-y-auto', () => {
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    expect(surface).toContain('data-testid="pro-monitor-panel"');
    expect(surface).toContain('lg:overflow-y-auto');
    const drawer = read('features', 'pro-core', 'MonitorDrawer.tsx');
    expect(drawer).toContain('overflow-y-auto');
    expect(drawer).toContain('MonitorPanelContent');
  });
});

/* ────────────── 6. advanced red-marked; core summary never marked ────────────── */

describe('B4 — advanced marked, summary sacrosanct', () => {
  it('owner diagnostics is red-marked ADVANCED; the summary layer carries NO review mark', () => {
    const html = renderPanel(starterMilkBase());
    const summaryStart = html.indexOf('data-testid="monitor-live-summary"');
    const detailsStart = html.indexOf('data-testid="monitor-detail-monitor"');
    expect(summaryStart).toBeGreaterThan(-1);
    // No review-marked module before the detailed layer (the summary is never marked).
    expect(html.slice(0, detailsStart)).not.toContain('review-marked');
    const advanced = html.indexOf('data-testid="review-marked-monitor-owner-diagnostic"');
    expect(advanced).toBeGreaterThan(detailsStart);
    expect(html.slice(advanced, advanced + 500)).toContain('ADVANCED');
  });
});

/* ──────────────── 7. nothing removed — drawer renders the SAME content ──────────────── */

describe('nothing removed — one content component everywhere', () => {
  it('MonitorDrawer and the desktop panel both mount MonitorPanelContent (single source)', () => {
    const drawer = read('features', 'pro-core', 'MonitorDrawer.tsx');
    const profile = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    expect(drawer).toContain('<MonitorPanelContent');
    expect(profile).toContain('<MonitorPanelContent');
    // The panel content mounts every historical module component.
    const content = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    for (const module of [
      '<UserMonitorPro',
      '<NutritionCostScorePanel',
      '<CorrectionPanel',
      '<OverallScoreCard',
      '<OwnerDiagnosticPanel',
      '<MonitorLiveSummary',
    ]) {
      expect(content, module).toContain(module);
    }
    expect(content.includes('display: none')).toBe(false);
    expect(/className="[^"]*\bhidden\b/.test(content)).toBe(false);
  });

  it('the score seam is ONE function (split-adapter integration point)', () => {
    const view = read('features', 'pro-workbench', 'monitorSummaryView.ts');
    expect(view).toContain('export function monitorScoreView');
    // The summary layer reads the score ONLY through the seam.
    const summary = read('features', 'pro-workbench', 'MonitorLiveSummary.tsx');
    expect(summary).toContain('monitorScoreView');
    expect(summary.includes('recipeMatchScore(')).toBe(false);
  });
});
