import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findVerifiedProteinFormulationCandidate } from '@/data/ingredients/verifiedProteinToolbox';
import { WorkbenchScoreDisplay } from '@/features/pro-workbench/WorkbenchScoreDisplay';
import { ProteinContentReadout } from './ProteinContentReadout';
import { assessProteinFormulation } from './proteinAuthority';
import {
  assessProteinQualification,
  requiredProteinPercentFor,
} from './proteinQualification';
import { overrunProxyAtProteinPercent } from './proteinStructureQuality';
import { proteinContentLabelPl, formatProteinPercentPl } from './proteinReadout';
import { PROTEIN_CONCENTRATION_EVIDENCE, PROTEIN_QUALIFICATION } from './proteinScienceAuthority';

/**
 * PROTEIN ENGINE v2 — the owner's binding invariants, pinned.
 *
 * These are the rules the whole change exists to enforce (§40):
 * protein % is an OUTPUT, the Score is quality, and more protein never buys a
 * better Score.
 */

const draft = (extra: RecipeInput['items'] = []): RecipeInput => ({
  items: [
    {
      id: 'main-raspberry',
      ingredient: findDemoIngredient('raspberry')!,
      planned_grams: 100,
      actual_grams: null,
      lock_type: 'main',
    },
    ...extra,
  ],
  mode: 'signature',
  category: 'protein_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
});

describe('§40.1–2 — no user-selectable protein target anywhere', () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

  it('exposes no protein target setter on the recipe store', () => {
    const store = read('src/stores/recipeStore.ts');
    expect(store).not.toContain('setTargetProteinPercent');
    expect(store).not.toContain('target_protein_percent');
  });

  it('never feeds a protein target into the Engine input', () => {
    const builder = read('src/features/studio/buildRecipeInput.ts');
    expect(builder).not.toContain('target_protein_percent');
  });

  it('ships no protein target control component', () => {
    expect(() => read('src/features/protein-gelato/ProteinTargetControl.tsx')).toThrow();
  });

  it('renders the protein read-out with no input, slider or button', () => {
    const input = draft();
    const html = renderToStaticMarkup(
      <ProteinContentReadout assessment={assessProteinFormulation(input)} />,
    );
    expect(html).toContain('data-testid="protein-content-readout"');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('type="range"');
    expect(html).not.toContain('Cel białka');
  });
});

describe('§40.16 — Score and protein % are two different things, side by side', () => {
  it('shows the protein content beside the ring without a visual /10', () => {
    const html = renderToStaticMarkup(
      <WorkbenchScoreDisplay
        score={10}
        label="Wyjątkowo dobrze dopasowana"
        preview={false}
        proteinPercent={8.42}
        proteinEnergySharePercent={20.6}
      />,
    );
    expect(html).toContain('data-testid="workbench-score-ring"');
    expect(html).toContain('data-testid="workbench-score-protein"');
    // The current architecture draws the ring as a partial SVG arc — the
    // Protein read-out must sit BESIDE it, never inside it.
    expect(html).toContain('data-testid="workbench-score-ring-arc"');
    expect(html).toContain('8,4% białka');
    expect(html).toContain('21% energii');
    expect(html).toContain('Wynik aktualny');
    expect(html).toContain('Wyjątkowo dobrze dopasowana');
    // The ring never renders a visible "/10" (owner-approved Score ring
    // contract). The current ScoreRing draws an SVG arc and then the bare
    // numeral, so assert on the numeral's own text node. The page CSS uses
    // Tailwind's `/10` opacity suffix, which is not a visible "out of ten".
    const numeral = html.match(
      /data-testid="workbench-score-ring"[\s\S]*?<\/svg><span[^>]*>([^<]*)</,
    );
    expect(numeral?.[1]).toBe('10');
    expect(html.indexOf('data-testid="workbench-score-protein"')).toBeLessThan(
      html.indexOf('data-testid="workbench-score-ring"'),
    );
  });

  it('omits the protein read-out entirely outside Protein mode', () => {
    const html = renderToStaticMarkup(
      <WorkbenchScoreDisplay score={8} label="Dobrze dopasowana" preview={false} />,
    );
    expect(html).not.toContain('data-testid="workbench-score-protein"');
    expect(html).not.toContain('Białko');
  });

  it('formats protein with a Polish decimal comma, deterministically', () => {
    expect(formatProteinPercentPl(8.42)).toBe('8,4%');
    expect(formatProteinPercentPl(10.05)).toBe('10,1%');
    expect(formatProteinPercentPl(12)).toBe('12,0%');
    expect(proteinContentLabelPl(8.42)).toBe('Białko 8,4%');
  });

  it('renders a LOWER score next to a HIGHER protein number without contradiction', () => {
    // The owner's illustration: 10 → 8,4 % · 9 → 10,1 % · 8 → 12,0 %.
    const rows = [
      { score: 10 as const, protein: 8.4 },
      { score: 9 as const, protein: 10.1 },
      { score: 8 as const, protein: 12.0 },
    ];
    for (const row of rows) {
      const html = renderToStaticMarkup(
        <WorkbenchScoreDisplay
          score={row.score}
          label="—"
          preview={false}
          proteinPercent={row.protein}
          proteinEnergySharePercent={20}
        />,
      );
      expect(html).toContain(`data-score="${row.score}"`);
      expect(html).toContain(`${formatProteinPercentPl(row.protein)} białka`);
    }
  });
});

describe('§40.3 — the Score never rewards protein', () => {
  const wpc = (grams: number) =>
    draft([
      {
        id: 'user-milk',
        ingredient: findDemoIngredient('milk_3_5')!,
        planned_grams: 750 - grams,
        actual_grams: null,
        lock_type: 'unlocked',
      },
      {
        id: 'user-wpc',
        ingredient: findVerifiedProteinFormulationCandidate('PI-ING-000264')!,
        planned_grams: grams,
        actual_grams: null,
        lock_type: 'unlocked',
      },
      {
        id: 'user-sucrose',
        ingredient: findDemoIngredient('sucrose')!,
        planned_grams: 150,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ]);

  it('is monotonically NON-INCREASING in protein once the claim is earned', () => {
    const ladder = [60, 90, 120, 160, 200, 240, 280].map((grams) =>
      assessProteinFormulation(wpc(grams)),
    );
    const qualified = ladder.filter((entry) => entry.qualification.qualified);
    expect(qualified.length).toBeGreaterThan(2);
    for (let index = 1; index < qualified.length; index += 1) {
      expect(qualified[index]!.actualPercent!).toBeGreaterThan(
        qualified[index - 1]!.actualPercent!,
      );
      expect(qualified[index]!.structure.score!).toBeLessThanOrEqual(
        qualified[index - 1]!.structure.score!,
      );
    }
  });
});

describe('§40.4–5 — protein % is derived, and source changes the verdict', () => {
  it('derives protein % from the recipe itself, not from any stored value', () => {
    const input = wpcDraft(150);
    const result = calculateRecipe(input);
    const assessment = assessProteinFormulation(input, result);
    expect(assessment.actualPercent).toBe(result.percentages.protein_percent);
    expect(assessment.actualPercent).toBeCloseTo(
      (result.totals.protein_g / result.total_batch_g) * 100,
      9,
    );
  });

  function wpcDraft(grams: number): RecipeInput {
    return draft([
      {
        id: 'user-milk',
        ingredient: findDemoIngredient('milk_3_5')!,
        planned_grams: 750 - grams,
        actual_grams: null,
        lock_type: 'unlocked',
      },
      {
        id: 'user-wpc',
        ingredient: findVerifiedProteinFormulationCandidate('PI-ING-000264')!,
        planned_grams: grams,
        actual_grams: null,
        lock_type: 'unlocked',
      },
      {
        id: 'user-sucrose',
        ingredient: findDemoIngredient('sucrose')!,
        planned_grams: 150,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ]);
  }

  it('assesses two sources at comparable protein differently through their lactose load', () => {
    const withSource = (id: string, grams: number) =>
      draft([
        {
          id: 'user-milk',
          ingredient: findDemoIngredient('milk_3_5')!,
          planned_grams: 600 - grams,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'user-source',
          ingredient: findVerifiedProteinFormulationCandidate(id)!,
          planned_grams: grams,
          actual_grams: null,
          lock_type: 'unlocked',
        },
        {
          id: 'user-sucrose',
          ingredient: findDemoIngredient('sucrose')!,
          planned_grams: 300,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ]);
    // WPC 60 carries 28 % lactose; WPC 80 carries 15 %. Same class, same
    // whey dominance, very different serum chemistry per gram of protein.
    const wpc60 = calculateRecipe(withSource('PI-ING-000294', 250));
    const wpc80 = calculateRecipe(withSource('PI-ING-000295', 250));
    expect(wpc60.percentages.lactose_percent).toBeGreaterThan(
      wpc80.percentages.lactose_percent + 2,
    );
    // Protein contributes no colligative depression, but the lactose it drags
    // in does — so the two mixes freeze differently at equal protein source mass.
    expect(wpc60.npac_points).not.toBeCloseTo(wpc80.npac_points!, 2);
  });
});

describe('§40.6 — UNKNOWN metadata never costs a recipe anything', () => {
  it('scores an unclassified protein source purely on its composition', () => {
    const pistachio = draft([
      {
        id: 'user-pistachio',
        ingredient: findDemoIngredient('pistachio_paste')!,
        planned_grams: 120,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ]);
    const assessment = assessProteinFormulation(pistachio);
    const unknownWarnings = assessment.structure.warnings.filter(
      (warning) => warning.code === 'protein_source_class_unknown',
    );
    // The warning may fire, but it can never be a scored penalty.
    for (const warning of unknownWarnings) expect(warning.scored).toBe(false);
    expect(assessment.structure.penalties.proteinExcess).toBeGreaterThanOrEqual(0);
  });
});

describe('qualification arithmetic is the EU rule, exactly', () => {
  it('solves the HIGH PROTEIN threshold from the non-protein energy', () => {
    // 4P / (4P + nonProteinKcal) = 0.20  ⇒  P = nonProteinKcal / 16
    expect(requiredProteinPercentFor(160)).toBeCloseTo(10, 9);
    expect(requiredProteinPercentFor(0)).toBeCloseTo(0, 9);
    expect(PROTEIN_QUALIFICATION.highProteinEnergySharePercent).toBe(20);
    expect(PROTEIN_QUALIFICATION.sourceOfProteinEnergySharePercent).toBe(12);
  });

  it('agrees with the energy share it computes from a real recipe', () => {
    const input = draft([
      {
        id: 'user-milk',
        ingredient: findDemoIngredient('milk_3_5')!,
        planned_grams: 600,
        actual_grams: null,
        lock_type: 'unlocked',
      },
      {
        id: 'user-wpc',
        ingredient: findVerifiedProteinFormulationCandidate('PI-ING-000264')!,
        planned_grams: 150,
        actual_grams: null,
        lock_type: 'unlocked',
      },
      {
        id: 'user-sucrose',
        ingredient: findDemoIngredient('sucrose')!,
        planned_grams: 150,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ]);
    const result = calculateRecipe(input);
    const qualification = assessProteinQualification(input, result);
    const nutrition = result.nutrition_per_100g!;
    expect(qualification.energySharePercent).toBeCloseTo(
      ((nutrition.protein_g * 4) / nutrition.kcal) * 100,
      9,
    );
    // At exactly the requirement, the energy share is exactly the threshold.
    const atThreshold =
      (qualification.requiredPercent! * 4) /
      (qualification.requiredPercent! * 4 + (nutrition.kcal - nutrition.protein_g * 4));
    expect(atThreshold * 100).toBeCloseTo(20, 6);
  });

  it('never applies outside the Protein profile', () => {
    const gelato: RecipeInput = { ...draft(), category: 'milk_gelato' };
    expect(assessProteinQualification(gelato).applicable).toBe(false);
    expect(assessProteinFormulation(gelato).score).toBeNull();
  });
});

describe('the overrun proxy reproduces the measured AFR 2022 series', () => {
  it.each(PROTEIN_CONCENTRATION_EVIDENCE.series.map((point) => [point.proteinPercent, point.overrunPercent]))(
    'returns the measured overrun %s%% → %s%%',
    (proteinPercent, overrunPercent) => {
      expect(overrunProxyAtProteinPercent(proteinPercent)).toBeCloseTo(overrunPercent, 9);
    },
  );

  it('is monotonically decreasing across the measured range', () => {
    let previous = Infinity;
    for (let percent = 4; percent <= 10; percent += 0.25) {
      const overrun = overrunProxyAtProteinPercent(percent);
      expect(overrun).toBeLessThanOrEqual(previous + 1e-9);
      previous = overrun;
    }
  });

  it('holds the end values instead of extrapolating unmeasured numbers', () => {
    expect(overrunProxyAtProteinPercent(2)).toBe(94.9);
    expect(overrunProxyAtProteinPercent(25)).toBe(33.9);
  });
});

describe('§40.14 — the Mapper base is untouched', () => {
  it('still holds exactly 2088 rows at the recorded hash', () => {
    const raw = readFileSync(
      resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
    );
    const rows = raw.toString('utf8').trim().split('\n').length - 1;
    expect(rows).toBe(2088);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(
      'b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38',
    );
  });
});
