import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { SAGE_SMART_SCOOP_BCI600 } from '@/features/machine-catalog';
import { machineEducationById } from '@/features/education';
import { ProductionCockpit } from './ProductionCockpit';
import type { ProductionWorkspaceView } from './useProductionWorkspace';

describe('Production — Sage canonical machine instructions', () => {
  it('renders the same Sage id and operational flow before starting the batch', () => {
    const production = {
      session: null,
      progress: null,
      source: {
        recipeId: 'recipe-sage',
        recipeVersionId: 'version-sage',
        recipeVersionNumber: 1,
        recipeName: 'Sage gelato',
      },
      plannedInput: { ...DEFAULT_PRESET, target_batch_grams: 950 },
      machineGuide: machineEducationById(SAGE_SMART_SCOOP_BCI600.id),
      prerequisite: null,
      practicalReady: true,
      sessionStarting: false,
      sessionStartError: null,
      persistenceBusy: false,
      persistenceError: null,
      heatInformation: [],
      heatInformationAcknowledged: true,
      startNewSession: vi.fn(),
    } as unknown as ProductionWorkspaceView;

    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={production}
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(html).toContain('data-testid="production-machine-instructions"');
    expect(html).toContain(`data-machine-id="${SAGE_SMART_SCOOP_BCI600.id}"`);
    expect(html).toContain('SAGE SMART SCOOP');
    expect(html).toContain('PRE-COOL');
    expect(html).toContain('KEEP COOL');
    expect(html).toContain('3 godzin');
    expect(html.toLowerCase()).not.toMatch(/zamroź|zamraż.*mis/);
  });
});
