/**
 * HOME-M1 — „Zmień" must actually reveal the machine chooser.
 *
 * Served signed-in on staging: pressing „Zmień" left the summary on screen and no
 * machine choice ever appeared. `onChangeMachine` set `forceMachineStage`, which
 * re-opened the machine STAGE through the flow, but `HomeMachineSection` decides
 * between summary and choices from `view.needsMachineChoice` — and that was still
 * computed from the recipe's already-set `machineLabel`. The customer's request never
 * reached the view.
 *
 * The fix propagates the state that already existed. There is no second machine
 * authority and no duplicated machine state: `setMachineSelection` remains the only
 * writer, and this view remains a description that cannot mutate anything.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHomeMachineView } from './homeMachinePresentation';

const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');

const withSavedMachine = (changeRequested?: boolean) =>
  buildHomeMachineView({
    machineKind: 'home',
    machineLabel: 'Ninja CREAMi Deluxe',
    targetBatchGrams: 670,
    recommendedBatchGrams: 670,
    containers: 1,
    ...(changeRequested === undefined ? {} : { changeRequested }),
  });

describe('A · a saved machine shows the summary', () => {
  it('does not ask again on its own (§42)', () => {
    expect(withSavedMachine().needsMachineChoice).toBe(false);
    expect(withSavedMachine(false).needsMachineChoice).toBe(false);
    expect(withSavedMachine().label).toBe('Ninja CREAMi Deluxe');
  });
});

describe('B · „Zmień" reveals the choices', () => {
  it('offers the chooser once the customer asks', () => {
    expect(withSavedMachine(true).needsMachineChoice).toBe(true);
  });

  it('is wired: the page passes its change request into the view', () => {
    expect(page).toContain('changeRequested: forceMachineStage');
    expect(page).toContain('onChangeMachine={() => {');
    expect(page).toContain('setForceMachineStage(true)');
  });
});

describe('C · the current machine stays selected while choosing', () => {
  it('keeps the label and the amount presentation intact', () => {
    const open = withSavedMachine(true);
    expect(open.label).toBe('Ninja CREAMi Deluxe');
    expect(open.amount).toEqual({ kind: 'containers', containers: 1, totalGrams: 670 });
    expect(open.isProfessional).toBe(false);
    expect(open.warning).toBeNull();
  });
});

describe('D · choosing uses the existing canonical setter', () => {
  it('writes through setMachineSelection and closes the request', () => {
    const from = page.indexOf('onSelectMachine={');
    const handler = page.slice(from, page.indexOf('onOtherMachine=', from));
    expect(from).toBeGreaterThan(-1);
    expect(handler).toContain('setMachineSelection({');
    expect(handler).toContain('setForceMachineStage(false)');
    // HOME derives nothing of its own — the shared derivation answers.
    expect(handler).toContain('deriveMachineSetup(');
  });
});

describe('E · leaving the chooser without choosing (HOME-M2)', () => {
  const section = readFileSync('src/features/home-creator/ui/HomeMachineSection.tsx', 'utf8');

  it('ends an open change request even when nothing was picked', () => {
    // `onBack={` also appears for earlier sections, so bound the slice AFTER onDone.
    const start = page.indexOf('onDone={() => {');
    const done = page.slice(start, page.indexOf('onBack={', start));
    expect(start).toBeGreaterThan(-1);
    expect(done).toContain('setForceMachineStage(false)');
  });

  it('offers a cancel INSIDE the chooser — served, there was no way out', () => {
    // „Gotowe" lives in the summary branch, so while choosing it does not exist and the
    // only exit was to pick a machine.
    const chooser = section.slice(
      section.indexOf('{view.needsMachineChoice ? ('),
      section.indexOf(') : ('),
    );
    expect(chooser).toContain('data-testid="home-machine-cancel-change"');
    expect(chooser).toContain('onClick={onCancelChange}');
  });

  it('only offers it when there is a machine to return to', () => {
    expect(section).toContain('onCancelChange && view.label !== null');
  });

  it('cancelling changes nothing — it just closes the request', () => {
    expect(page).toContain('onCancelChange={() => setForceMachineStage(false)}');
    // Nothing is written on the way out.
    const cancel = page.slice(
      page.indexOf('onCancelChange={'),
      page.indexOf('onCancelChange={') + 90,
    );
    for (const write of ['setMachineSelection', 'setBatchGrams', 'setPlannedGrams']) {
      expect(cancel, write).not.toContain(write);
    }
  });

  it('keeps the previous machine while choosing, so cancel restores it exactly', () => {
    // `setMachine(null)` here used to drop the container presentation on cancel.
    const change = page.slice(page.indexOf('onChangeMachine={'), page.indexOf('onCancelChange={'));
    expect(change).not.toContain('setMachine(null)');
    expect(change).toContain('setForceMachineStage(true)');
  });

  it('reuses existing copy rather than inventing a new string', () => {
    expect(section).toContain('homeCreatorCopy.draft.cancel');
  });
});

describe('F · no duplicate machine state was introduced', () => {
  it('adds no new machine store, selection state or setter', () => {
    for (const forbidden of [
      'useMachineStore',
      'homeMachineStore',
      'setHomeMachine',
      'useState<HomeMachineProfile[]>',
    ]) {
      expect(page, forbidden).not.toContain(forbidden);
    }
    // The single pre-existing recipe-scoped selection is still the only one.
    expect(page.match(/useState<HomeMachineProfile \| null>/g) ?? []).toHaveLength(1);
  });

  it('keeps the view a description, never a mutation', () => {
    const src = readFileSync('src/features/home-creator/homeMachinePresentation.ts', 'utf8');
    for (const forbidden of ['useRecipeStore', 'setMachineSelection', 'setBatchGrams']) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });
});

describe('§16 · a Professional recipe still cannot be changed from HOME', () => {
  it('ignores a change request outright — the guarantee stays structural', () => {
    const professional = buildHomeMachineView({
      machineKind: 'professional',
      machineLabel: 'Twoja maszyna',
      targetBatchGrams: 4000,
      recommendedBatchGrams: null,
      containers: 1,
      changeRequested: true,
    });
    expect(professional.needsMachineChoice).toBe(false);
    expect(professional.isProfessional).toBe(true);
    expect(professional.warning).toBeNull();
  });
});

describe('a recipe with no machine still asks, unchanged', () => {
  it('offers the chooser without any request', () => {
    expect(
      buildHomeMachineView({
        machineKind: 'home',
        machineLabel: null,
        targetBatchGrams: 1000,
        recommendedBatchGrams: null,
        containers: 1,
      }).needsMachineChoice,
    ).toBe(true);
  });
});
