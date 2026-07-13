import { describe, expect, it } from 'vitest';
import { resolveBatchSectionView } from './batchPresentation';
import type { BatchResolution } from '@/features/customer-flow';

type BatchSlice = Pick<BatchResolution, 'source' | 'satisfied' | 'needsConfirmation'>;

const batch = (over: Partial<BatchSlice>): BatchSlice => ({
  source: 'none',
  satisfied: false,
  needsConfirmation: false,
  ...over,
});

describe('resolveBatchSectionView — a verified Ninja shows no manual mass input by default', () => {
  const verified = batch({ source: 'device_verified', satisfied: true });

  it('shows the auto-selected mass ("Wybrana ilość") with the manual field HIDDEN by default', () => {
    const v = resolveBatchSectionView({ batch: verified, deviceKind: 'appliance', overrideOpen: false });
    expect(v.mode).toBe('resolved');
    expect(v.labelKind).toBe('selected'); // "Wybrana ilość"
    expect(v.showChangeAction).toBe(true); // the secondary "Zmień ilość" is offered
    expect(v.editorOpen).toBe(false); // ...but no manual gram field is shown yet
    expect(v.editor).toBe('custom_mass'); // a single grams field, not the kg selector
  });

  it('reveals the custom mass field ONLY after the customer opens the override', () => {
    const v = resolveBatchSectionView({ batch: verified, deviceKind: 'appliance', overrideOpen: true });
    expect(v.mode).toBe('resolved');
    expect(v.editorOpen).toBe(true);
    expect(v.editor).toBe('custom_mass');
  });
});

describe('resolveBatchSectionView — professional & unresolved paths keep the selector', () => {
  it('a professional machine with no batch shows the batch selector (choose mode)', () => {
    const v = resolveBatchSectionView({
      batch: batch({ source: 'none' }),
      deviceKind: 'professional',
      overrideOpen: false,
    });
    expect(v.mode).toBe('choose');
    expect(v.showChangeAction).toBe(false);
  });

  it('a customer-set professional batch overrides via the kg selector, not a single field', () => {
    const v = resolveBatchSectionView({
      batch: batch({ source: 'user', satisfied: true }),
      deviceKind: 'professional',
      overrideOpen: true,
    });
    expect(v.mode).toBe('resolved');
    expect(v.labelKind).toBe('resolved'); // "Ustalona ilość", not "Wybrana ilość"
    expect(v.showChangeAction).toBe(true);
    expect(v.editor).toBe('batch_selector');
    expect(v.editorOpen).toBe(true);
  });

  it('an unverified-volume device awaiting confirmation is the confirm mode', () => {
    const v = resolveBatchSectionView({
      batch: batch({ source: 'device_unverified', needsConfirmation: true }),
      deviceKind: 'appliance',
      overrideOpen: false,
    });
    expect(v.mode).toBe('confirm_capacity');
    expect(v.showChangeAction).toBe(false);
    expect(v.editorOpen).toBe(false);
  });

  it('a text-recognized batch is resolved but not overridable via this action', () => {
    const v = resolveBatchSectionView({
      batch: batch({ source: 'text', satisfied: true }),
      deviceKind: null,
      overrideOpen: false,
    });
    expect(v.mode).toBe('resolved');
    expect(v.labelKind).toBe('resolved');
    expect(v.showChangeAction).toBe(false);
  });
});
