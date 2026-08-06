/**
 * MONITOR PI — 100 % HISTORICAL PARITY, VERIFIED NOT ASSERTED (owner addendum item 5,
 * Agent D, 2026-07-25). The EXECUTABLE form of
 * `docs/product-completion/MONITOR_PARITY_VERIFIED_LEDGER.md`.
 *
 * WHY THIS FILE EXISTS BESIDE `monitorParity.test.tsx`
 * ---------------------------------------------------
 * The earlier parity suite renders `MonitorPanelContent` DIRECTLY on a hand-built
 * fixture and proves the host wiring by grepping source text for `<MonitorPanelContent`.
 * That proves the component can render; it cannot prove the Monitor the OWNER opens is
 * mounted, is fed the CURRENT draft's engine result, or is reachable. This suite closes
 * that hole: every inventory row is asserted against the markup of the REAL host
 * (`ProWorkspacePage` → `StudioEngineSurface` → the pinned `pro-monitor-panel` aside),
 * and the numbers in it are compared against an INDEPENDENTLY computed
 * `calculateRecipe(buildRecipeInput(<live store state>))`. Neither suite supersedes the
 * other — that one pins the component contract, this one pins the product.
 *
 * HARNESS TRUTH (recorded so no future reader over-claims): the repo test environment is
 * `node` + `renderToStaticMarkup`. React takes the SSR path, so zustand v5 serves
 * `getInitialState()` — mutating the store between renders CANNOT change the markup. So
 * data-connection is proven the only way this harness honestly can: by recomputing the
 * engine result from the SAME store state the host renders from and finding those exact
 * values in the host's Monitor. A hardcoded or stale fixture fails that. The layout
 * proofs (zero body scroll, nothing clipped, desktop/mobile equality) were additionally
 * measured in a real browser and are recorded in the ledger with numbers.
 *
 * THE INVENTORY re-derived from git history (not from the previous agent's ledger):
 * the last pre-redesign Monitor is the tree at `a55f5fc` — the parent of `6d612eb`
 * („ONE-SCREEN workbench"). Its right-hand analysis rail rendered, in order:
 * OverallScoreCard · UserMonitorPro (§14.1 cards + §14.2 modules) · NutritionCostScorePanel ·
 * CorrectionPanel · the red-marked advanced tools · OwnerDiagnosticPanel. Everything that
 * rail rendered must still be present, data-connected and reachable.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeResult } from '@/engine';
import { copy } from '@/copy/en';
import { FRIENDLY_METRIC_PRESENTATION, USER_MONITOR_MODULE_TITLES } from '@/features/user-monitor';
import { SUMMARY_CARD_LABELS, SUMMARY_CARD_ORDER } from '@/features/user-monitor';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

const mockPersona: ProCorePersona = 'pro';
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mockPersona,
}));

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

const { ProWorkspacePage } = await import('@/pages/pro/ProWorkspacePage');

/* ─────────────────────────── harness ─────────────────────────── */

/** The REAL product route — the Monitor the owner actually opens. */
function renderWorkbench(path = '/pro/monitor'): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pro/:section" element={<ProWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The pinned desktop Monitor subtree, sliced out of the real page markup. The bottom
 * action bar closes the split, so it bounds the Monitor; the red review zone (a later
 * sibling region) is the fallback bound. Neither belongs to the Monitor. */
function monitorPanelOf(pageHtml: string): string {
  const start = pageHtml.indexOf('data-testid="pro-monitor-panel"');
  expect(
    start,
    'the LIVE Monitor panel must be mounted by the real /pro workbench',
  ).toBeGreaterThan(-1);
  const bounds = ['data-testid="workbench-action-bar"', 'data-testid="pro-review-zone"']
    .map((marker) => pageHtml.indexOf(marker, start))
    .filter((index) => index > -1);
  return pageHtml.slice(start, bounds.length > 0 ? Math.min(...bounds) : pageHtml.length);
}

/** Markup attribute values arrive HTML-escaped (`&` → `&amp;`); Tailwind arbitrary
 * variants contain `&`, so class assertions must compare unescaped text. */
const unescapeHtml = (html: string) =>
  html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

const visibleText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const testIdsOf = (html: string): string[] =>
  [...html.matchAll(/data-testid="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((id): id is string => id !== undefined)
    .sort();

/** The engine result the host MUST be showing: recomputed from the same store state
 * React's SSR path renders from (zustand v5 serves `getInitialState` under SSR). */
function liveResult(): RecipeResult {
  const s = useRecipeStore.getInitialState();
  return calculateRecipe(
    buildRecipeInput({
      mode: s.mode,
      category: s.category,
      target_temperature_c: s.target_temperature_c,
      target_batch_grams: s.target_batch_grams,
      machine_capacity_grams: s.machine_capacity_grams,
      flavor_intensity: s.flavor_intensity,
      cost_priority: s.cost_priority,
      items: s.items,
    }),
  );
}

/** UserMonitorPro's display rounding — duplicated deliberately so the assertion is an
 * INDEPENDENT recomputation rather than a call into the code under test. */
const proNumber = (v: number): string =>
  (Math.round(v * 10) / 10).toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

const PAGE = renderWorkbench();
const PANEL = monitorPanelOf(PAGE);
const PANEL_TEXT = visibleText(PANEL);
const RESULT = liveResult();

const d = copy.studio.diagnostic;
const m = copy.studio.metrics;

/* ══════════════════════════════════════════════════════════════════════════ *
 * 1. THE INVENTORY — every element the pre-redesign Monitor rendered,        *
 *    asserted against the REAL host's Monitor markup (owner items 1 + 3).    *
 * ══════════════════════════════════════════════════════════════════════════ */

interface InventoryRow {
  /** Ledger row id (matches MONITOR_PARITY_VERIFIED_LEDGER.md). */
  id: string;
  /** What the owner asked for, in the owner's words. */
  element: string;
  /** Where it lived in the last pre-redesign tree (a55f5fc). */
  before: string;
  /** DOM anchors that must be present in the mounted Monitor. */
  testIds?: readonly string[];
  /** Visible text that must be present (proves the module rendered, not just its shell). */
  text?: readonly string[];
}

/** Re-derived from `git show a55f5fc:src/features/studio/StudioEngineSurface.tsx`
 * plus the components that rail mounted. ORDER = the owner's enumeration. */
const MONITOR_PARITY_INVENTORY: readonly InventoryRow[] = [
  {
    id: 'P01',
    element: 'Complete technical /10 score with its §15.1 label',
    before: 'OverallScoreCard (rail head)',
    testIds: ['monitor-summary-score', 'monitor-detail-score'],
  },
  {
    id: 'P02',
    element: 'Truthful native / provisional / partial assessment state',
    before: 'OverallScoreCard partial-assessment note',
    testIds: ['monitor-assessment'],
  },
  {
    id: 'P03',
    element: 'Assessed coverage („Oceniono N z M obszarów")',
    before: 'OverallScoreCard `score-coverage`',
    text: [
      copy.studio.overall.coverage(
        RESULT.indicators.filter((i) => i.band != null).length,
        RESULT.indicators.length,
      ),
    ],
  },
  {
    id: 'P04',
    element: '§14.1 status badge (gotowa / wymaga korekty / test rekomendowany)',
    before: 'UserMonitorPro status line',
    testIds: ['monitor-summary-badge'],
  },
  {
    id: 'P05',
    element: 'The six quality axes with TEXT readings',
    before: 'UserMonitorPro §14.1 summary cards',
    testIds: ['monitor-summary-axes', ...SUMMARY_CARD_ORDER.map((id) => `monitor-axis-${id}`)],
    text: SUMMARY_CARD_ORDER.map((id) => SUMMARY_CARD_LABELS[id]),
  },
  {
    id: 'P06',
    element: 'Production readiness (§20.5)',
    before: 'UserMonitorPro readiness line',
    testIds: ['monitor-summary-readiness'],
  },
  {
    id: 'P07',
    element: 'Data confidence (§20.5)',
    before: 'UserMonitorPro confidence line',
    testIds: ['monitor-summary-confidence'],
  },
  {
    id: 'P08',
    element: 'Serving-temperature behaviour',
    before: 'UserMonitorPro serving temperature + „Zachowanie w temperaturze" module',
    text: [copy.monitorPi.summary.servingLabel, USER_MONITOR_MODULE_TITLES.temperatura],
    testIds: ['user-monitor-module-temperatura'],
  },
  {
    id: 'P09',
    element: 'Sugars and sweetness',
    before: '§14.2 module „Cukry i słodycz"',
    testIds: ['user-monitor-module-cukry'],
    text: [USER_MONITOR_MODULE_TITLES.cukry, 'Sacharoza', 'Dekstroza', 'Laktoza'],
  },
  {
    id: 'P10',
    element: 'Water and frozen phase',
    before: '§14.2 module „Woda i faza mrożona"',
    testIds: ['user-monitor-module-woda'],
    text: [USER_MONITOR_MODULE_TITLES.woda],
  },
  {
    id: 'P11',
    element: 'Fats and creaminess',
    before: '§14.2 module „Tłuszcze i kremowość"',
    testIds: ['user-monitor-module-tluszcze'],
    text: [USER_MONITOR_MODULE_TITLES.tluszcze],
  },
  {
    id: 'P12',
    element: 'Proteins and structure',
    before: '§14.2 module „Białka i struktura"',
    testIds: ['user-monitor-module-bialka'],
    text: [USER_MONITOR_MODULE_TITLES.bialka],
  },
  {
    id: 'P13',
    element: 'Total solids and body',
    before: '§14.2 module „Ciała stałe i pełnia"',
    testIds: ['user-monitor-module-ciala_stale'],
    text: [USER_MONITOR_MODULE_TITLES.ciala_stale],
  },
  {
    id: 'P14',
    element: 'Stabilisation WITH its provenance sentence',
    before: '§14.2 module „Stabilizacja" (provenance sentence added by the redesign)',
    testIds: ['user-monitor-module-stabilizacja', 'stabilization-provenance'],
    text: [USER_MONITOR_MODULE_TITLES.stabilizacja],
  },
  {
    id: 'P15',
    element: 'Alcohol',
    before: '§14.2 module „Składniki specjalne" (Alkohol row)',
    testIds: ['user-monitor-module-specjalne'],
    text: [USER_MONITOR_MODULE_TITLES.specjalne, FRIENDLY_METRIC_PRESENTATION.alcohol.label],
  },
  {
    id: 'P16',
    element: 'Advanced engine metrics (POD / PAC / NPAC / ice fraction)',
    before: '§14.2 module „Tryb Expert"',
    testIds: ['user-monitor-module-expert'],
    text: [USER_MONITOR_MODULE_TITLES.expert, 'POD', 'PAC', 'NPAC'],
  },
  {
    id: 'P17',
    element: 'Engine + config version provenance',
    before: 'Tryb Expert footer',
    text: [RESULT.engine_version, RESULT.config_version],
  },
  {
    id: 'P18',
    element: '§14.3 „Dostosuj widok" — module toggles, pinning, reset',
    before: 'UserMonitorPro customize layer',
    text: ['Dostosuj widok', 'Przywróć domyślny układ'],
  },
  {
    id: 'P19',
    element: 'Nutrition per 100 g',
    before: 'NutritionCostScorePanel',
    testIds: ['monitor-detail-nutrition'],
    text: [m.nutritionTitle, m.kcal, m.fat, m.carbs, m.protein, m.salt, m.fiber],
  },
  {
    id: 'P20',
    element: 'Costs — per kg, BATCH, per portion (60/70/80 g)',
    before: 'NutritionCostScorePanel cost block',
    text:
      RESULT.costs === null
        ? [m.costEmpty]
        : [m.costTitle, m.costPerKg, m.costBatch, m.serving60, m.serving70, m.serving80],
  },
  {
    id: 'P21',
    element: 'PI corrections / recommendations',
    before: 'CorrectionPanel',
    testIds: ['monitor-detail-corrections'],
    text: [copy.monitorPi.sections.corrections],
  },
  {
    id: 'P22',
    element: 'Engine warnings (all of them) + the ONE primary signal line',
    before: 'UserMonitorPro warning list',
    testIds: ['monitor-primary-signal'],
  },
  {
    id: 'P23',
    element: 'Owner diagnostics — the real resolved Engine input',
    before: 'OwnerDiagnosticPanel (red-marked ADVANCED)',
    testIds: ['review-marked-monitor-owner-diagnostic', 'owner-diagnostic'],
    text: [d.title, d.bandCell, d.engineVersion, d.activeLocks, d.excluded],
  },
  {
    id: 'P24',
    element: 'Solver ITERATION COUNT and STOP REASON (+ trajectory)',
    before: 'OwnerDiagnosticPanel iteration rows',
    text: [d.iterationCount, d.iterationStop, d.iterationTrajectory],
  },
  {
    id: 'P25',
    element: 'Band provenance + stabilizer dosage provenance',
    before: 'OwnerDiagnosticPanel A9/Phase-9 rows',
    text: [
      d.bandSource,
      d.hardViolations,
      d.softViolations,
      d.stabilizerDosage,
      d.stabilizerDosageProvenance,
    ],
  },
];

describe('MONITOR PARITY — the re-derived inventory, executable against the REAL host', () => {
  it.each(MONITOR_PARITY_INVENTORY.map((row) => [row.id, row.element, row] as const))(
    '%s — %s',
    (_id, _element, row) => {
      for (const testId of row.testIds ?? []) {
        expect(
          PANEL,
          `${row.id}: missing DOM anchor data-testid="${testId}" (was: ${row.before})`,
        ).toContain(`data-testid="${testId}"`);
      }
      for (const text of row.text ?? []) {
        expect(
          PANEL_TEXT,
          `${row.id}: missing visible text "${text}" (was: ${row.before})`,
        ).toContain(text);
      }
    },
  );

  it('the inventory is complete — every owner-enumerated element has a row', () => {
    expect(MONITOR_PARITY_INVENTORY).toHaveLength(25);
    const ids = MONITOR_PARITY_INVENTORY.map((r) => r.id);
    expect(new Set(ids).size, 'inventory ids must be unique').toBe(ids.length);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ *
 * 2. DATA-CONNECTED, NOT JUST MOUNTED (owner item 2)                         *
 * ══════════════════════════════════════════════════════════════════════════ */

describe('the mounted Monitor receives the CURRENT draft engine result', () => {
  it('EVERY indicator the engine computed is present with its friendly §14.4 name', () => {
    // Derived from the engine result itself — if the engine gains an indicator, this
    // test demands the Monitor show it. Supersedes the hand-written module list, and
    // re-pins the guarantee the retired flat `PIPanel` used to carry (all 11 metrics).
    expect(RESULT.indicators.length).toBeGreaterThanOrEqual(11);
    for (const indicator of RESULT.indicators) {
      const presentation =
        FRIENDLY_METRIC_PRESENTATION[indicator.key as keyof typeof FRIENDLY_METRIC_PRESENTATION];
      expect(
        presentation,
        `engine indicator "${indicator.key}" has no Monitor presentation`,
      ).toBeDefined();
      expect(
        PANEL_TEXT,
        `engine indicator "${indicator.key}" is not rendered in the Monitor`,
      ).toContain(presentation.label);
    }
  });

  it('the rendered numbers ARE the current engine result (not a fixture)', () => {
    // Independently recomputed values must appear verbatim in the host's Monitor.
    const expectations: Array<[string, string]> = [
      ['ice_fraction_percent', proNumber(RESULT.ice_fraction_percent ?? NaN)],
      ['pod_points', proNumber(RESULT.pod_points ?? NaN)],
      ['pac_points', proNumber(RESULT.pac_points ?? NaN)],
      ['npac_points', proNumber(RESULT.npac_points ?? NaN)],
      ['totals.fat_g', proNumber(RESULT.totals.fat_g)],
      ['totals.protein_g', proNumber(RESULT.totals.protein_g)],
      ['sugar.sucrose_g', proNumber(RESULT.sugar.sucrose_g)],
      ['sugar.lactose_g', proNumber(RESULT.sugar.lactose_g)],
    ];
    for (const [field, formatted] of expectations) {
      expect(
        PANEL_TEXT,
        `${field} = ${formatted} is not rendered by the mounted Monitor`,
      ).toContain(formatted);
    }
  });

  it('nutrition and cost read the SAME result object (independent formatter)', () => {
    const nutrition = RESULT.nutrition_per_100g;
    expect(nutrition, 'the acceptance draft must produce nutrition').not.toBeNull();
    if (nutrition !== null) {
      expect(PANEL_TEXT).toContain(nutrition.kcal.toFixed(0));
      expect(PANEL_TEXT).toContain(nutrition.fat_g.toFixed(1));
      expect(PANEL_TEXT).toContain(nutrition.protein_g.toFixed(1));
    }
    // Costs are nullable end-to-end (no ingredient prices → the honest empty state,
    // pinned by P20); when they exist they must be the ENGINE's own numbers.
    const costs = RESULT.costs;
    if (costs !== null) {
      if (costs.cost_per_kg !== null) {
        expect(PANEL_TEXT, 'koszt/kg must be the engine cost').toContain(
          costs.cost_per_kg.toFixed(2),
        );
      }
      if (costs.total_cost !== null) {
        expect(PANEL_TEXT, 'KOSZT PARTII must be the engine total_cost').toContain(
          costs.total_cost.toFixed(2),
        );
      }
    }
  });

  it('the owner diagnostics report the SAME draft (batch, ingredient count, versions)', () => {
    const s = useRecipeStore.getInitialState();
    expect(PANEL_TEXT).toContain(`${Math.round(s.target_batch_grams)} g`);
    expect(PANEL_TEXT).toContain(RESULT.engine_version);
    expect(PANEL_TEXT).toContain(RESULT.config_version);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ *
 * 3. NOTHING LOST TO LAYOUT (owner item 4)                                   *
 * ══════════════════════════════════════════════════════════════════════════ */

describe('no content is lost to layout', () => {
  it('the Monitor introduces no height caps, hidden overflow or nested scroll', () => {
    expect(PANEL).not.toMatch(/\boverflow-hidden\b/);
    expect(PANEL).not.toMatch(/\bmax-h-/);
    expect(PANEL).not.toMatch(/\bline-clamp-/);
    expect(PANEL).not.toMatch(/\bh-0\b/);
    // The ONE internal scroll surface is the aside itself — no nested scroller inside.
    const inner = PANEL.slice(PANEL.indexOf('data-testid="monitor-panel-content"'));
    expect(inner).not.toMatch(/\boverflow-y-auto\b/);
  });

  it('nothing is removed with display:none and all core modules remain present', () => {
    expect(PANEL).not.toContain('display:none');
    expect(PANEL).not.toContain('display: none');
    for (const id of ['monitor-live-summary', 'monitor-detail-monitor', 'monitor-detail-nutrition', 'monitor-detail-corrections', 'monitor-detail-score']) {
      expect(PANEL).toContain(`data-testid="${id}"`);
    }
  });

  it('single-line truncation never survives inside the narrow Monitor column', () => {
    /* OWNER ADDENDUM (Agent D, 2026-07-25) — the gap this suite was written to catch.
     * `OwnerDiagnosticPanel` renders `<dd class="… truncate …">`, authored for the
     * pre-redesign full-width column. Measured in Chrome at 1366×768 inside the 38 %
     * Monitor column, „Dawka stabilizatora" laid out 540 px of sentence into a 224 px
     * box — 316 px (~58 %) replaced by an ellipsis, including the approved dosage
     * window and the in-window verdict; still 105 px lost at 1920×1080. Fixed in
     * `MonitorPanelContent` by an un-truncating wrapper. This pins the guarantee:
     * every `truncate` inside the Monitor must sit under that wrapper. */
    const wrapper = PANEL.indexOf('data-testid="monitor-advanced-unclipped"');
    expect(wrapper, 'the un-truncating wrapper must be mounted').toBeGreaterThan(-1);
    for (const match of PANEL.matchAll(/\btruncate\b/g)) {
      expect(
        match.index,
        'a truncating element escaped the un-truncating wrapper — content would be clipped',
      ).toBeGreaterThan(wrapper);
    }
    // …and the wrapper really reverses all three parts of Tailwind's `truncate`
    // (`overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap`).
    const wrapperClass = unescapeHtml(PANEL.slice(PANEL.lastIndexOf('class="', wrapper), wrapper));
    expect(wrapperClass).toContain('[&_dd]:whitespace-normal');
    expect(wrapperClass).toContain('[&_dd]:overflow-visible');
    expect(wrapperClass).toContain('[&_dd]:text-clip');
  });

  it('the mobile cockpit sheet carries the SAME Monitor content as the desktop panel', () => {
    const mobileStart = PAGE.indexOf('data-testid="mobile-cockpit-sheet"');
    expect(mobileStart).toBeGreaterThan(-1);
    const drawer = PAGE.slice(mobileStart);
    const drawerIds = new Set(testIdsOf(drawer));
    const routeContainerIds = new Set([
      'pro-monitor-panel',
      'pro-profile-panel',
      'pro-context-tabs',
      'pro-context-monitor',
      'pro-workbar',
      'pro-workbar-context',
      'pro-workbar-name',
      'pro-workbar-save',
      'pro-workbar-status',
    ]);
    const missing = testIdsOf(PANEL).filter(
      (id) => !routeContainerIds.has(id) && !drawerIds.has(id),
    );
    expect(missing, 'the bottom sheet must not be a reduced Monitor').toEqual([]);
    // …and the sheet owns exactly ONE scroll surface.
    expect(drawer).toContain('max-h-[82dvh] overflow-y-auto');
    expect((drawer.match(/overflow-y-auto/g) ?? []).length).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ *
 * 4. THE REVIEW-MARKING CONTRACT (owner item 5)                              *
 * ══════════════════════════════════════════════════════════════════════════ */

describe('review marking — advanced marked, core never optional', () => {
  it('the CORE summary and CORE detail modules carry NO review mark', () => {
    const summary = PANEL.indexOf('data-testid="monitor-live-summary"');
    const firstDetail = PANEL.indexOf('data-testid="monitor-detail-monitor"');
    const advanced = PANEL.indexOf('data-testid="review-marked-monitor-owner-diagnostic"');
    expect(summary).toBeGreaterThan(-1);
    expect(firstDetail).toBeGreaterThan(summary);
    // No review mark anywhere before the advanced section: the summary AND all four
    // core detail modules (Monitor / nutrition / corrections / score) stay unmarked.
    expect(PANEL.slice(0, advanced)).not.toContain('review-marked');
    for (const core of ['monitor', 'nutrition', 'corrections', 'score']) {
      expect(PANEL.indexOf(`data-testid="monitor-detail-${core}"`)).toBeLessThan(advanced);
    }
  });

  it('the core ENGINE metrics module is never marked optional', () => {
    // „Tryb Expert" (POD/PAC/NPAC/ice) lives INSIDE the unmarked core Monitor module.
    const expert = PANEL.indexOf('data-testid="user-monitor-module-expert"');
    const advanced = PANEL.indexOf('data-testid="review-marked-monitor-owner-diagnostic"');
    expect(expert).toBeGreaterThan(-1);
    expect(expert, 'advanced engine metrics must stay in the CORE Monitor').toBeLessThan(advanced);
  });

  it('owner diagnostics stay MOUNTED, functional and red-marked ADVANCED', () => {
    const advanced = PANEL.indexOf('data-testid="review-marked-monitor-owner-diagnostic"');
    expect(advanced).toBeGreaterThan(-1);
    expect(PANEL.slice(advanced, advanced + 400)).toContain('ADVANCED');
    expect(PANEL.slice(advanced, advanced + 400)).toContain('border-l-review');
    // marked, but NOT emptied — the real diagnostic rows are inside.
    expect(PANEL.slice(advanced)).toContain('data-testid="owner-diagnostic"');
  });

  it('the questionable modules remain reachable on the dedicated review-tools route', () => {
    const tools = renderWorkbench('/pro/tools');
    const zone = tools.indexOf('data-testid="pro-review-zone"');
    expect(zone, 'the red review zone must be mounted on /pro/tools').toBeGreaterThan(-1);
    for (const id of ['assistant', 'flow-guide', 'optimization', 'branch-previews']) {
      expect(tools, `review-zone module "${id}" was removed`).toContain(
        `data-testid="review-marked-${id}"`,
      );
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ *
 * 5. ONE-SCREEN WORKBENCH still holds WITH the Monitor complete (item 6)     *
 * ══════════════════════════════════════════════════════════════════════════ */

describe('the one-screen workbench survives the complete Monitor', () => {
  it('ingredients and the Monitor are siblings inside the viewport-locked region', () => {
    const region = PAGE.indexOf('data-testid="pro-viewport-region"');
    const editor = PAGE.indexOf('data-testid="workbench-editor-pane"');
    const monitor = PAGE.indexOf('data-testid="pro-monitor-panel"');
    const actionBar = PAGE.indexOf('data-testid="workbench-action-bar"');
    expect(region).toBeGreaterThan(-1);
    expect(editor).toBeGreaterThan(region);
    expect(monitor).toBeGreaterThan(editor);
    // Primary actions sit inside the viewport region after the split, in the fixed recipe bar.
    expect(actionBar).toBeGreaterThan(editor);
    expect(actionBar).toBeGreaterThan(monitor);
    expect(actionBar).toBeLessThan(PAGE.indexOf('</main>'));
  });

  it('the Monitor keeps its own scroll surface so its growth never scrolls the page', () => {
    const asideTag = PAGE.slice(
      PAGE.lastIndexOf('<aside', PAGE.indexOf('data-testid="pro-monitor-panel"')),
    );
    const openTag = asideTag.slice(0, asideTag.indexOf('>'));
    expect(openTag, 'the Monitor column owns its scroll').toContain('lg:overflow-y-auto');
    expect(openTag, 'a flex child must be allowed to shrink or it pushes the page').toContain(
      'min-h-0',
    );
  });
});
