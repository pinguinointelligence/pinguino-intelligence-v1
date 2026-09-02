/**
 * Agent 4 fixture sweep — the pink markers are ON every runtime-reachable
 * non-production surface, and ABSENT from surfaces serving genuine production
 * data. Rendered proofs where the surface is light enough for a static render;
 * source-text proofs (repo convention, cf. canonicalWorkbench.test.tsx) for the
 * heavy store-wired shells.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { RecipesHubPage } from '@/pages/destinations/RecipesHubPage';
import { LandingPage } from '@/pages/landing/LandingPage';
import { ConstraintPreviewCard } from '@/features/constraint-studio/ui/ConstraintPreviewCard';
import { constraintStudioCopy } from '@/features/constraint-studio/constraintStudioCopy';
import type { ConstraintPreview } from '@/features/constraint-studio/applyPipeline';
import type { TemplateStatus } from '@/features/formulation/templateRegistry';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { NON_PRODUCTION_BADGE_LABEL } from './NonProductionMarker';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const source = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);

/* ------------------------------------------------------------------ *
 * Rendered proofs — markers present                                   *
 * ------------------------------------------------------------------ */

describe('pink markers render on marked surfaces', () => {
  it('/recipes — normal customer mode does not expose owner-review state', () => {
    const html = render(<RecipesHubPage />);
    expect(html).not.toContain('data-testid="nonprod-marked-recipes-hub-tiles"');
    expect(html).not.toContain('TRYB PRZEGLĄDU WŁAŚCICIELA');
    // The real saved-recipe content remains inside the canonical internal MOJE tab.
    expect(html).toContain('data-testid="recipes-tab-mine"');
    expect(html).not.toContain('href="/my-recipes"');
  });

  it('/ — the landing Monitor example carries the compact badge next to the honest tag', () => {
    const html = render(<LandingPage />);
    expect(html).toContain('data-testid="nonprod-badge-landing-monitor-example"');
    expect(html).toContain(NON_PRODUCTION_BADGE_LABEL);
  });
});

/* ------------------------------------------------------------------ *
 * ConstraintPreviewCard — reference_derived marked, approved NOT      *
 * ------------------------------------------------------------------ */

const previewWithTemplate = (templateStatus: TemplateStatus): ConstraintPreview => ({
  kind: 'optimize',
  titlePl: constraintStudioCopy.preview.kindLabels.optimize,
  // Owner addendum item 4: hand-forged fixtures declare the outcome
  // classification explicitly (the real builders compute it).
  outcomeClassification: {
    outcome: 'no_verified_change',
    batchReconciled: false,
    compositionUnchanged: false,
    engineImproved: false,
    beforeGrams: 1000,
    afterGrams: 1000,
    targetBatchGrams: 1000,
    violationsBefore: 0,
    violationsAfter: 0,
  },
  baseFingerprint: 'fp',
  proposedInput: starterMilkBase(),
  nextConstraints: { byLineId: {} },
  formulation: {
    mode: 'full_formulation',
    templateId: templateStatus === 'reference_derived' ? 'fruit_gelato_ref_v1' : 'milk_base_v1',
    templateStatus,
    added: [],
    missingRoles: [],
    recommendations: [],
    keptFixed: [],
    roleTrace: [],
  },
  lines: [
    {
      lineId: 'l-milk',
      name: 'Mleko 3,5%',
      beforeGrams: 600,
      afterGrams: 600,
      kind: 'unchanged',
      locked: false,
    },
  ],
  violationsBefore: 1,
  violationsAfter: 0,
  explanation: [],
  engineVersion: 'e',
  configVersion: 'c',
  createdAt: '2026-07-24T12:00:00.000Z',
});

describe('formulation provenance — presentation-layer marking only', () => {
  it('a reference_derived template preview shows the pink badge on the provenance line', () => {
    const html = renderToStaticMarkup(
      <ConstraintPreviewCard
        preview={previewWithTemplate('reference_derived')}
        onApply={() => {}}
        onCancel={() => {}}
        showTechnicalDetails
      />,
    );
    expect(html).toContain('data-testid="nonprod-badge-preview-reference-template"');
    expect(html).toContain(NON_PRODUCTION_BADGE_LABEL);
    expect(html).toContain('fruit_gelato_ref_v1'); // the honest provenance stays
  });

  it('an APPROVED template preview shows NO pink badge (genuine production path unmarked)', () => {
    const html = renderToStaticMarkup(
      <ConstraintPreviewCard
        preview={previewWithTemplate('approved')}
        onApply={() => {}}
        onCancel={() => {}}
        showTechnicalDetails
      />,
    );
    expect(html).not.toContain('nonprod-badge');
    expect(html).not.toContain(NON_PRODUCTION_BADGE_LABEL);
  });
});

/* ------------------------------------------------------------------ *
 * Source-text proofs — heavy store-wired shells                       *
 * ------------------------------------------------------------------ */

describe('markers are wired into the heavy shells (source-level proof)', () => {
  it('/start — CustomerShellV1 marks the fixture ready-recipe list AND the fixture draft result', () => {
    const src = source('src/features/customer-shell/CustomerShellV1.tsx');
    expect(src).toContain('nonprod-marked-start-ready-catalogue');
    expect(src).toContain('nonprod-marked-start-ready-draft');
    expect(src).toContain(`itemId="start-ready-catalogue"`);
    expect(src).toContain(`itemId="start-ready-draft"`);
  });

  it('/pro/recipe — locks retain readiness markers while approved axes use the light control system', () => {
    const row = source('src/features/ingredient-builder/IngredientRow.tsx');
    const profile = source('src/features/pro-workbench/RecipeProfilePanel.tsx');
    const direction = source('src/features/pro-workbench/ProfileDirectionAxes.tsx');
    expect(row).toContain('row-lock-percent-');
    expect(row).toContain('border-nonprod/30');
    expect(profile).toContain('ProfileDirectionAxes');
    expect(direction).not.toContain('border-nonprod/28');
    expect(direction).toContain("data-regulator-state={disabled ? 'unavailable'");
    expect(direction).toContain('aria-disabled={disabled || undefined}');
    // The approved accent, carried by the frozen track's thumb rather than by
    // a bordered detent. What this line guards is that the axes stay on the
    // LIGHT control system — the plain accent, never a nonprod marker — which
    // the assertions above and below still pin.
    expect(direction).toContain('bg-[#f58a07]');
    expect(direction).not.toContain('nonprod');
  });
});

/* ------------------------------------------------------------------ *
 * Negative proofs — genuine production surfaces stay UNMARKED         *
 * ------------------------------------------------------------------ */

describe('markers absent where the data is genuinely production', () => {
  const UNMARKED_SURFACES = [
    // Saved recipes — the user's own Supabase rows.
    'src/pages/recipes/MyRecipesPage.tsx',
    // Machine profile — honest Annex-A provisional catalog (spec-sourced, null when unknown).
    'src/pages/profile/MachineProfilePage.tsx',
    // Plans page — real locked offer catalogue (migration 0014 mirror), no invented prices.
    'src/pages/destinations/SubscriptionPage.tsx',
    // CSV import — real parser + real owner-scoped write path.
    'src/pages/destinations/ProductImportPage.tsx',
    // Live Mapper search picker — the real 2,088-row read model, honest unavailable states.
    'src/features/customer-shell/ResolutionSheet.tsx',
  ];

  for (const rel of UNMARKED_SURFACES) {
    it(`${rel} carries NO non-production marker`, () => {
      const src = source(rel);
      expect(src).not.toContain('NonProductionMarker');
      expect(src).not.toContain('NonProductionBadge');
      expect(src).not.toContain('nonprod-');
    });
  }

  it('the marker itself is never imported by engine or formulation logic (presentation only)', () => {
    for (const rel of [
      'src/features/formulation/templateRegistry.ts',
      'src/features/formulation/formulate.ts',
      'src/features/constraint-studio/applyPipeline.ts',
    ]) {
      const src = source(rel);
      expect(src).not.toContain('NonProductionMarker');
      expect(src).not.toContain('nonProductionRegistry');
    }
  });
});
