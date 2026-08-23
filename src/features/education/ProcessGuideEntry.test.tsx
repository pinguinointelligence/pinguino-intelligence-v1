import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import {
  OWNER_MAPPER_INGREDIENTS,
  ownerSameInputRecipe,
} from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type {
  HeatProcessClassification,
  ProcessEvidenceDecision,
  RecipeProcessEvidence,
} from './processClassification';
import { classifyHeatProcess, processIdentityForItem } from './processClassification';
import { ContextualEducationView } from './ContextualEducationView';
import { ProcessGuideEntry } from './ProcessGuideEntry';

const source = readFileSync(resolve(import.meta.dirname, 'ProcessGuideEntry.tsx'), 'utf8');

function evidence(
  decision: ProcessEvidenceDecision,
  ingredientId: string,
  reasonType: RecipeProcessEvidence['reasonType'] = 'process_requirement',
  explanation = `Verified ${decision}`,
): RecipeProcessEvidence {
  return {
    decision,
    reasonType,
    affectedIngredientIds: [ingredientId],
    explanation,
    source: {
      id: `${decision}:${ingredientId}`,
      label: 'Owner Process Metadata',
      reference: 'owner-workbook:07_Process_Metadata_2026-08-08',
      verificationStatus: 'verified',
    },
  };
}

function singleIngredientInput(id: string, name = id): RecipeInput {
  const base = starterMilkBase();
  return {
    ...base,
    items: [
      {
        ...base.items[0]!,
        id: `line:${id}`,
        ingredient: {
          ...base.items[0]!.ingredient,
          id,
          canonical_ingredient_id: id,
          name,
        },
      },
    ],
  };
}

function renderEntry(input: RecipeInput, processEvidence: readonly RecipeProcessEvidence[]) {
  const classification: HeatProcessClassification = classifyHeatProcess({
    ingredientIds: input.items.map(processIdentityForItem),
    evidence: processEvidence,
  });
  return renderToStaticMarkup(
    <ProcessGuideEntry classification={classification} loading={false} onOpen={() => undefined} />,
  );
}

describe('normal Pro Process Guide entry', () => {
  it.each([
    ['cold_process_ok', [evidence('cold_process_approved', 'cold')], 'Można przygotować na zimno'],
    [
      'heat_required_for_function',
      [evidence('heat_required_for_function', 'function')],
      'Podgrzanie wymagane technologicznie',
    ],
    [
      'heat_required_for_safety',
      [evidence('heat_required_for_safety', 'safety')],
      'Podgrzanie wymagane dla bezpieczeństwa',
    ],
  ] as const)('renders %s as a normal-user status summary', (status, rows, title) => {
    const id = status === 'cold_process_ok' ? 'cold' : status.endsWith('function') ? 'function' : 'safety';
    const html = renderEntry(singleIngredientInput(id), rows);
    expect(html).toContain('data-testid="monitor-process-guide-entry"');
    expect(html).toContain(`data-process-status="${status}"`);
    expect(html).toContain('Jak je przygotować?');
    expect(html).toContain(title);
    expect(html).toContain('Zobacz sposób przygotowania');
  });

  it('renders HEAT_REQUIRED_FOR_BOTH when verified function and safety evidence coexist', () => {
    const input = singleIngredientInput('both');
    const html = renderEntry(input, [
      evidence('heat_required_for_function', 'both'),
      evidence('heat_required_for_safety', 'both'),
    ]);
    expect(html).toContain('data-process-status="heat_required_for_both"');
    expect(html).toContain('Podgrzanie wymagane technologicznie i dla bezpieczeństwa');
  });

  it('states UNKNOWN as missing information, never as a warning or a readiness gate', () => {
    const html = renderEntry(singleIngredientInput('unknown'), []);
    expect(html).toContain('data-process-status="unknown"');
    expect(html).toContain('Brak informacji o obróbce');
    expect(html).toContain('BRAK INFORMACJI');
    // No invented cold approval, and no warning styling or readiness marker.
    expect(html).not.toContain('Można przygotować na zimno');
    expect(html).not.toContain('nonprod');
    expect(html).not.toContain('data-readiness');
  });

  it('opens the existing Process Guide directly for the exact Tara Owner fixture', () => {
    const taraId = OWNER_MAPPER_INGREDIENTS.tara_gum.id;
    const taraEvidence = evidence(
      'heat_required_for_function',
      taraId,
      'hydration',
      'Tara jest częściowo rozpuszczalna na zimno; pełna hydratacja wymaga ciepła. To wymaganie funkcjonalne, nie automatyczny kill-step bezpieczeństwa.',
    );
    const html = renderToStaticMarkup(
      <ContextualEducationView
        input={ownerSameInputRecipe()}
        audience="pro"
        initialLesson="process"
        processEvidence={[taraEvidence]}
        onBack={() => undefined}
      />,
    );
    expect(html).toContain('data-process-status="heat_required_for_function"');
    expect(html).toContain('Podgrzanie wymagane technologicznie');
    expect(html).toContain('TARA GUM');
    expect(html).toContain('pełna hydratacja wymaga ciepła');
    expect(html).toContain('Przygotuj składniki');
    expect(html).toContain('Podgrzej zgodnie z procesem receptury');
    expect(html).toContain('Schłodź');
    expect(html).toContain('Przejdź do mrożenia');
    expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/\b\d+\s*(min|minut)\b/i);
  });

  it('is independent from Owner Review and remains a full-width mobile tap target', () => {
    const html = renderEntry(singleIngredientInput('unknown'), []);
    expect(html).not.toContain('Diagnostyka właściciela');
    expect(html).not.toContain('ADVANCED');
    expect(html).not.toContain('data-review-badge');
    expect(source).not.toContain('ReviewMarkedModule');
    expect(source).not.toContain('useReviewMode');
    expect(source).toContain('min-h-11');
    expect(source).toContain('w-full');
  });
});
