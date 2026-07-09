/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import {
  previewBatchRescueRecalculation,
  previewStockShortageRecalculation,
  type BranchRecalculationPreview,
} from './branchRecalculationPreview';
import {
  BRANCH_RECALCULATION_SCENARIOS,
  type BatchRescueScenario,
  type StockShortageScenario,
} from './branchRecalculationFixtures';
import { BranchWorkflowPreviewPanel } from './BranchWorkflowPreviewPanel';
import { BranchWorkflowPreviews } from './BranchWorkflowPreviews';
import { branchStatusLabel, branchWorkflowDisplayPolicy } from './branchWorkflowPolicy';

const HERE = import.meta.dirname;

const scenario = <T extends { id: string }>(id: string): T =>
  BRANCH_RECALCULATION_SCENARIOS.find((s) => s.id === id)! as unknown as T;

// REAL computed previews (engine + regulator verified) — no handcrafted fiction.
const rescuePartial = (): BranchRecalculationPreview => {
  const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
  return previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe });
};
const shortageCalculated = (): BranchRecalculationPreview => {
  const s = scenario<StockShortageScenario>('shortage-scale-down');
  return previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: s.plannedRecipe });
};
const rescueBlocked = (): BranchRecalculationPreview => {
  const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
  return previewBatchRescueRecalculation({
    rescueIntent: { ...s.rescueIntent, batchSizeG: null },
    actualRecipe: s.actualRecipe,
  });
};

const demo = branchWorkflowDisplayPolicy({ exactCorrectionGrams: false, technicalView: false });
const pro = branchWorkflowDisplayPolicy({ exactCorrectionGrams: true, technicalView: true });
const devDemo = branchWorkflowDisplayPolicy({ exactCorrectionGrams: false, technicalView: false }, { dev: true });

const renderPanel = (preview: BranchRecalculationPreview, policy = pro) =>
  renderToStaticMarkup(
    <SurfaceToneContext.Provider value="shell">
      <BranchWorkflowPreviewPanel preview={preview} policy={policy} />
    </SurfaceToneContext.Provider>,
  );
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('BranchWorkflowPreviewPanel — redaction (Demo/Free vs Pro vs DEV)', () => {
  it('Demo/Free never see the verified IF9 grams; the upgrade affordance shows instead', () => {
    const html = renderPanel(rescuePartial(), demo);
    expect(html).not.toContain('74.4');
    expect(/sucrose/i.test(html)).toBe(false);
    expect(visibleText(html)).toMatch(/available on Pro/);
  });

  it('Demo/Free never see the exact IF10 scale factor', () => {
    const html = renderPanel(shortageCalculated(), demo);
    expect(html).not.toContain('0.720');
    expect(visibleText(html)).toMatch(/available on Pro/);
  });

  it('Pro sees the VERIFIED IF9 add-only grams', () => {
    const t = visibleText(renderPanel(rescuePartial(), pro));
    expect(t).toMatch(/verified add-only/);
    expect(t).toMatch(/add Sucrose 74\.4g/);
    expect(t).not.toMatch(/available on Pro/);
  });

  it('Pro sees the VERIFIED IF10 scale-down ratio', () => {
    const t = visibleText(renderPanel(shortageCalculated(), pro));
    expect(t).toMatch(/verified scale-down: ×0\.720/);
    expect(t).toMatch(/composition percentages preserved/);
  });

  it('DEV shows the debug trace but STILL respects demo redaction', () => {
    const html = renderPanel(rescuePartial(), devDemo);
    expect(html).toContain('DEV trace');
    expect(html).toContain('single-shot');
    expect(html).toContain('multi-step');
    expect(html).not.toContain('74.4'); // additive trace, no redaction upgrade
    expect(/sucrose/i.test(html)).toBe(false);
  });
});

describe('BranchWorkflowPreviewPanel — honest labels and hard display rules', () => {
  it('partial_improvement is labelled partial — never "verified", never a rescued claim', () => {
    const preview = rescuePartial();
    expect(preview.exactStatus).toBe('partial_improvement'); // the real Slice 20 outcome
    const t = visibleText(renderPanel(preview, pro));
    expect(t).toMatch(/partial improvement — not fully rescued/);
    expect(branchStatusLabel('partial_improvement')).not.toBe('verified');
    // every "rescued" occurrence is inside an explicit "not fully rescued" phrase
    expect(t.replace(/not fully rescued/g, '')).not.toMatch(/rescued/);
  });

  it('calculated is labelled verified (IF10 scale-down)', () => {
    const preview = shortageCalculated();
    expect(preview.exactStatus).toBe('calculated');
    expect(visibleText(renderPanel(preview, pro))).toMatch(/Stock Shortage/);
    expect(visibleText(renderPanel(preview, pro))).toMatch(/verified/);
  });

  it('blocked/missing-data renders honestly with the measurement requirement', () => {
    const preview = rescueBlocked();
    expect(preview.exactStatus).toBe('blocked_missing_data');
    const t = visibleText(renderPanel(preview, pro));
    expect(t).toMatch(/blocked — data missing/);
    expect(t).toMatch(/weigh actual batch g/);
  });

  it('the locked user-decision menu renders for feasible decisions (both branches)', () => {
    const rescueText = visibleText(renderPanel(rescuePartial(), demo));
    expect(rescueText).toMatch(/rescue same target batch/);
    expect(rescueText).toMatch(/stop batch/);
    const shortageText = visibleText(renderPanel(shortageCalculated(), demo));
    expect(shortageText).toMatch(/reduce batch to available stock/);
    expect(shortageText).toMatch(/stop and buy missing product/);
  });

  it('always shows the preview-only / no-inventory / no-save disclaimers', () => {
    for (const policy of [demo, pro, devDemo]) {
      const t = visibleText(renderPanel(rescuePartial(), policy));
      expect(t).toMatch(/Preview only — nothing is applied/);
      expect(t).toMatch(/No inventory is changed/);
      expect(t).toMatch(/No recipe is saved/);
    }
  });

  it('the panel carries NO buttons at all — no Apply, no Save, no inventory update', () => {
    for (const preview of [rescuePartial(), shortageCalculated(), rescueBlocked()]) {
      const html = renderPanel(preview, pro);
      expect(html.includes('<button')).toBe(false);
      expect(/apply|update inventory/i.test(visibleText(html))).toBe(false);
    }
  });
});

describe('BranchWorkflowPreviews — Studio section (paid gate + explicit click)', () => {
  const recipe = scenario<BatchRescueScenario>('rescue-too-hard-12').actualRecipe;
  const renderSection = (caps: { exactCorrectionGrams: boolean; technicalView: boolean }) =>
    renderToStaticMarkup(
      <SurfaceToneContext.Provider value="shell">
        <BranchWorkflowPreviews recipe={recipe} capabilities={caps} />
      </SurfaceToneContext.Provider>,
    );

  it('Demo/Free see the section + upgrade affordance, but NO runnable workflow buttons', () => {
    const html = renderSection({ exactCorrectionGrams: false, technicalView: false });
    const t = visibleText(html);
    expect(t).toMatch(/Batch rescue/);
    expect(t).toMatch(/available on Pro/);
    expect(html.includes('<button')).toBe(false);
  });

  it('Pro sees the two explicit preview buttons and the local measurement inputs', () => {
    const html = renderSection({ exactCorrectionGrams: true, technicalView: true });
    const t = visibleText(html);
    expect(t).toMatch(/Preview actual batch rescue/);
    expect(t).toMatch(/Preview stock shortage/);
    expect(t).toMatch(/measured batch \(g\)/);
    expect(t).toMatch(/available in stock \(g\)/);
    // explicit-click only: no panel output on initial render
    expect(t).not.toMatch(/your decision/);
    expect(t).not.toMatch(/· preview/);
  });

  it('the ONLY buttons are the two preview triggers — nothing apply/save-shaped', () => {
    const html = renderSection({ exactCorrectionGrams: true, technicalView: true });
    const buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(/Preview/.test(b)).toBe(true);
      expect(/apply|save|update/i.test(b)).toBe(false);
    }
  });

  it('measurement inputs default EMPTY — missing data is never invented', () => {
    const html = renderSection({ exactCorrectionGrams: true, technicalView: true });
    // no value attribute is pre-filled on the measured inputs
    expect(/placeholder="weigh it"[^>]*value="[^"]+"/.test(html)).toBe(false);
    expect(/placeholder="count it"[^>]*value="[^"]+"/.test(html)).toBe(false);
  });

  it('rendering the section never mutates the recipe', () => {
    const snapshot = JSON.stringify(recipe);
    renderSection({ exactCorrectionGrams: true, technicalView: true });
    expect(JSON.stringify(recipe)).toBe(snapshot);
  });
});

describe('BranchWorkflow UI — boundary + Studio wiring', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const panelSrc = strip(readFileSync(join(HERE, 'BranchWorkflowPreviewPanel.tsx'), 'utf8'));
  const policySrc = strip(readFileSync(join(HERE, 'branchWorkflowPolicy.ts'), 'utf8'));
  const sectionSrc = strip(readFileSync(join(HERE, 'BranchWorkflowPreviews.tsx'), 'utf8'));
  const studioSrc = strip(readFileSync(resolve(HERE, '..', '..', 'pages', 'studio', 'StudioPage.tsx'), 'utf8'));

  it('panel + policy are pure display: no engine import, no handlers, no writes', () => {
    for (const src of [panelSrc, policySrc]) {
      expect(/from\s+['"]@\/engine/.test(src)).toBe(false);
      expect(/onClick|onChange|onSubmit/.test(src)).toBe(false);
      expect(/@\/services\/|@\/lib\/|@\/data\/products|mapper_basement|service_role/i.test(src)).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
      expect(/saveRecipe|persistRecipe|applyAutoFix|writeInventory|updateStock/i.test(src)).toBe(false);
    }
  });

  it('the section computes ONLY through the preview modules — never the engine/solver directly', () => {
    expect(/previewBatchRescueRecalculation|previewStockShortageRecalculation/.test(sectionSrc)).toBe(true);
    expect(/calculateRecipe\s*\(|proposeAutoFix|applyAutoFix|solveBatchRescueSteps/.test(sectionSrc)).toBe(false);
    expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(sectionSrc)).toBe(false); // type-only barrel import allowed
    expect(/@\/services\/|@\/lib\/|mapper_basement|service_role/i.test(sectionSrc)).toBe(false);
    expect(/saveRecipe|persistRecipe|writeInventory|updateStock|localStorage|sessionStorage/i.test(sectionSrc)).toBe(false);
    for (const verb of ['.insert(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
      expect(sectionSrc.includes(verb), verb).toBe(false);
    }
  });

  it('production Studio mounts the branch previews with capability props (no DEV gate around it)', () => {
    expect(studioSrc.includes('BranchWorkflowPreviews')).toBe(true);
    // no conditional DEV gate directly wrapping the mount (the section itself is production)
    expect(/import\.meta\.env\.DEV\s*(\?|&&)\s*\(?\s*<BranchWorkflowPreviews/.test(studioSrc)).toBe(false);
    expect(/capabilities=\{\{\s*exactCorrectionGrams,\s*technicalView\s*\}\}/.test(studioSrc)).toBe(true);
  });
});
