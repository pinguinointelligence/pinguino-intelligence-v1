/**
 * DESIGN V3.0 §3 — WHEN the new-recipe setup is on screen. Pure: the gate reads
 * published facts only and decides no setting.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { proSetupFlowStep, useProSetupFlowStore, type ProSetupGateFacts } from './proSetupFlowGate';

const UNSAVED = JSON.stringify(['unsaved-draft', 'a']);
const SAVED = JSON.stringify(['saved-recipe', 'r1', 'v1']);

const facts = (patch: Partial<ProSetupGateFacts> = {}): ProSetupGateFacts => ({
  phone: true,
  available: true,
  activeTab: 'profile',
  draftIdentity: UNSAVED,
  settingsConfirmed: false,
  untouchedStarter: true,
  session: null,
  settled: {},
  ...patch,
});

describe('proSetupFlowStep', () => {
  it('asks Step 1 of a new unsaved recipe on the phone composition', () => {
    expect(proSetupFlowStep(facts())).toBe(1);
  });

  it('asks Step 1 of an untouched starter even when saved defaults confirmed it', () => {
    expect(proSetupFlowStep(facts({ settingsConfirmed: true }))).toBe(1);
  });

  it('asks an unconfirmed unsaved draft that is not a starter (the former B3 case)', () => {
    expect(proSetupFlowStep(facts({ untouchedStarter: false }))).toBe(1);
  });

  it('leaves a confirmed, edited draft alone', () => {
    expect(
      proSetupFlowStep(facts({ settingsConfirmed: true, untouchedStarter: false })),
    ).toBeNull();
  });

  it('never opens on the desktop, outside Receptura, on the locked preview or for a saved recipe', () => {
    expect(proSetupFlowStep(facts({ phone: false }))).toBeNull();
    expect(proSetupFlowStep(facts({ activeTab: 'monitor' }))).toBeNull();
    expect(proSetupFlowStep(facts({ available: false }))).toBeNull();
    expect(proSetupFlowStep(facts({ draftIdentity: SAVED }))).toBeNull();
    expect(proSetupFlowStep(facts({ draftIdentity: null }))).toBeNull();
  });

  it('asks once per draft in a session, and a setup in progress keeps its step', () => {
    expect(proSetupFlowStep(facts({ settled: { [UNSAVED]: 'setup' } }))).toBeNull();
    expect(proSetupFlowStep(facts({ settled: { [UNSAVED]: 'defaults' } }))).toBeNull();
    expect(
      proSetupFlowStep(
        facts({
          settingsConfirmed: true,
          untouchedStarter: false,
          session: { draftIdentity: UNSAVED, step: 3 },
        }),
      ),
    ).toBe(3);
    // A session of another draft is not this draft's setup.
    expect(
      proSetupFlowStep(
        facts({
          settingsConfirmed: true,
          untouchedStarter: false,
          session: { draftIdentity: JSON.stringify(['unsaved-draft', 'b']), step: 2 },
        }),
      ),
    ).toBeNull();
  });
});

describe('useProSetupFlowStore', () => {
  beforeEach(() => useProSetupFlowStore.getState().resetForTests());

  it('finishes a setup, and „Zmień" reopens it at Step 2', () => {
    const store = useProSetupFlowStore.getState();
    store.goTo(UNSAVED, 2);
    expect(useProSetupFlowStore.getState().session).toEqual({ draftIdentity: UNSAVED, step: 2 });
    store.finish(UNSAVED, 'defaults');
    expect(useProSetupFlowStore.getState().session).toBeNull();
    expect(useProSetupFlowStore.getState().settled[UNSAVED]).toBe('defaults');
    store.reopen(UNSAVED);
    expect(useProSetupFlowStore.getState().session).toEqual({ draftIdentity: UNSAVED, step: 2 });
    expect(useProSetupFlowStore.getState().settled[UNSAVED]).toBeUndefined();
  });
});
