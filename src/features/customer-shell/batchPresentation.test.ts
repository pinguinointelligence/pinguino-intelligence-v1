import { describe, expect, it } from 'vitest';
import { resolveBatchSectionView } from './batchPresentation';
import type { BatchResolution } from '@/features/customer-flow';

type BatchSlice = Pick<BatchResolution, 'source' | 'satisfied'>;

const batch = (over: Partial<BatchSlice>): BatchSlice => ({
  source: 'none',
  satisfied: false,
  ...over,
});

describe('resolveBatchSectionView — a Ninja preset shows no manual mass input by default', () => {
  const ninja = batch({ source: 'mode_ninja', satisfied: true });

  it('shows the auto-selected mass ("Wybrana ilość") with the manual field HIDDEN by default', () => {
    const v = resolveBatchSectionView({ batch: ninja, isNinja: true, overrideOpen: false });
    expect(v.mode).toBe('resolved');
    expect(v.labelKind).toBe('selected'); // "Wybrana ilość"
    expect(v.showChangeAction).toBe(true); // the secondary "Zmień ilość" is offered
    expect(v.editorOpen).toBe(false); // ...but no manual gram field is shown yet
    expect(v.editor).toBe('custom_mass'); // a single grams field, not the kg selector
  });

  it('reveals the custom mass field ONLY after the customer opens the override', () => {
    const v = resolveBatchSectionView({ batch: ninja, isNinja: true, overrideOpen: true });
    expect(v.mode).toBe('resolved');
    expect(v.editorOpen).toBe(true);
    expect(v.editor).toBe('custom_mass');
  });
});

describe('resolveBatchSectionView — direct / fresh paths keep the kg selector', () => {
  it('a direct/fresh mode with no batch shows the batch selector (choose mode)', () => {
    const v = resolveBatchSectionView({
      batch: batch({ source: 'none' }),
      isNinja: false,
      overrideOpen: false,
    });
    expect(v.mode).toBe('choose');
    expect(v.showChangeAction).toBe(false);
  });

  it('a customer-set direct batch overrides via the kg selector, not a single field', () => {
    const v = resolveBatchSectionView({
      batch: batch({ source: 'user', satisfied: true }),
      isNinja: false,
      overrideOpen: true,
    });
    expect(v.mode).toBe('resolved');
    expect(v.labelKind).toBe('resolved'); // "Ustalona ilość", not "Wybrana ilość"
    expect(v.showChangeAction).toBe(true);
    expect(v.editor).toBe('batch_selector');
    expect(v.editorOpen).toBe(true);
  });

  it('a text-recognized batch is resolved but not overridable via this action', () => {
    const v = resolveBatchSectionView({
      batch: batch({ source: 'text', satisfied: true }),
      isNinja: false,
      overrideOpen: false,
    });
    expect(v.mode).toBe('resolved');
    expect(v.labelKind).toBe('resolved');
    expect(v.showChangeAction).toBe(false);
  });
});
