/**
 * Two machine levels — PROFILE default vs RECIPE-only override (owner
 * correction 2026-07-17: „DOMYŚLNA MASZYNA W PROFILU VS MASZYNA BIEŻĄCEJ
 * RECEPTURY”).
 *
 * Covers the owner §8 test list at the level the node/static-markup harness can
 * prove (component render + exact copy + the persistence contract). The full
 * state-machine transitions (a recipe override never writing the profile, a new
 * recipe restarting from the default, promote/revert) are exercised end-to-end
 * in the browser A–G checklist — here we pin the pieces they are built from.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MACHINE_CATALOG_VERSION,
  KITCHENAID_5KSMICM,
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_SCOOP_SWIRL_NC7,
} from '@/features/machine-catalog';
import { createCustomerFlow, resolveBatch } from '@/features/customer-flow';
import { applyMachineRecordToFlow } from '@/features/customer-shell/machineFlowBridge';
import { machineOnboardingCopy as copy } from './machineOnboardingCopy';
import { buildMachineContextView } from './machineViews';
import { buildMachineSettingsView } from './machineSettingsView';
import {
  buildMachinePreferenceRecord,
  effectiveDefaultBatchGrams,
  withUserDefaultBatch,
  type MachinePreferenceRecord,
} from './preferenceContracts';
import { MachineContextBar } from './ui/MachineContextBar';
import { MachineProfileSection } from './ui/MachineProfileSection';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => undefined;
const okSave = async () => true;

const recordFor = (profile: typeof KITCHENAID_5KSMICM): MachinePreferenceRecord => {
  const record = buildMachinePreferenceRecord({
    profile,
    isCustom: false,
    setAt: '2026-07-17T12:00:00.000Z',
    catalogVersion: MACHINE_CATALOG_VERSION,
  });
  if (record === null) throw new Error(`expected a record for ${profile.id}`);
  return record;
};

/* ------------------------------------------------------------------ */
/* Owner tests 12–13 — the exact, unambiguous action names             */
/* ------------------------------------------------------------------ */

describe('owner tests 12–13 — the change actions are named by scope', () => {
  it('the recipe context bar says „Zmień dla tej receptury” (never a bare „Zmień”)', () => {
    expect(copy.contextBar.changeForRecipe).toBe('Zmień dla tej receptury');
  });

  it('the profile says „Zmień maszynę” (owner UX correction 2026-07-17)', () => {
    expect(copy.profile.change).toBe('Zmień maszynę');
  });

  it('the conscious promotion is „Ustaw … jako domyślną”', () => {
    expect(copy.contextBar.setAsDefault('Ninja CREAMi')).toBe('Ustaw Ninja CREAMi jako domyślną');
    expect(copy.recipeMachine.alsoSetAsDefault).toBe('Ustaw również jako moją domyślną maszynę');
  });
});

/* ------------------------------------------------------------------ */
/* §3 context bar — default vs override display                        */
/* ------------------------------------------------------------------ */

describe('§3 recipe context bar — default vs temporary override', () => {
  it('DEFAULT: „Twoja maszyna: X” + „Zmień dla tej receptury”, no default line', () => {
    const view = buildMachineContextView(recordFor(KITCHENAID_5KSMICM));
    if (view === null) throw new Error('expected view');
    const html = render(<MachineContextBar view={view} onChange={noop} />);
    expect(html).toContain(copy.contextBar.prefix); // „Twoja maszyna:”
    expect(html).toContain('KitchenAid Ice Cream Maker');
    expect(html).toContain(copy.contextBar.changeForRecipe);
    expect(html).not.toContain(copy.contextBar.overridePrefix);
    expect(html).not.toContain(copy.contextBar.defaultPrefix);
  });

  it('OVERRIDE: „Maszyna dla tej receptury: Y” + „Domyślna maszyna: X” + revert/promote', () => {
    const overrideView = buildMachineContextView(recordFor(NINJA_CREAMI_SCOOP_SWIRL_NC7));
    if (overrideView === null) throw new Error('expected view');
    const html = render(
      <MachineContextBar
        view={overrideView}
        onChange={noop}
        override={{
          defaultName: 'KitchenAid Ice Cream Maker',
          onRevert: noop,
          onSetAsDefault: noop,
        }}
      />,
    );
    // The recipe uses the override machine…
    expect(html).toContain(copy.contextBar.overridePrefix); // „Maszyna dla tej receptury:”
    expect(html).toContain('Ninja CREAMi Scoop &amp; Swirl');
    // …while the (unchanged) profile default is shown small, with both actions.
    expect(html).toContain(copy.contextBar.defaultPrefix); // „Domyślna maszyna:”
    expect(html).toContain('KitchenAid Ice Cream Maker');
    expect(html).toContain(copy.contextBar.revertToDefault); // „Wróć do domyślnej”
    // „&” renders HTML-escaped in static markup.
    expect(html).toContain('Ustaw Ninja CREAMi Scoop &amp; Swirl jako domyślną');
    expect(html).toContain(copy.contextBar.changeForRecipe);
  });
});

/* ------------------------------------------------------------------ */
/* Owner tests 1–2 — the profile shows + can change the default        */
/* ------------------------------------------------------------------ */

describe('owner tests 1–2 — the profile page shows the default machine and can change it', () => {
  const html = render(
    <MachineProfileSection
      view={buildMachineSettingsView(recordFor(KITCHENAID_5KSMICM))!}
      onSetUp={noop}
      onChange={noop}
      onSave={okSave}
      onGoToRecipe={noop}
    />,
  );

  it('labels the machine as the DEFAULT and names it', () => {
    expect(html).toContain(copy.profile.defaultLabel); // „Domyślna maszyna”
    expect(html).toContain('KitchenAid Ice Cream Maker');
  });

  it('always offers „Zmień maszynę” and „Przejdź do receptury”', () => {
    expect(html).toContain(copy.profile.change);
    expect(html).toContain('Zmień maszynę');
    expect(html).toContain(copy.settings.goToRecipe);
  });
});

/* ------------------------------------------------------------------ */
/* §4 recipe machine change notice                                     */
/* ------------------------------------------------------------------ */

describe('§4 recipe machine change notice copy', () => {
  it('explains the scope and keeps the default unchanged, with three actions', () => {
    expect(copy.recipeMachine.onlyThisRecipe('Ninja CREAMi', 'KitchenAid Ice Cream Maker')).toBe(
      'Ninja CREAMi została wybrana tylko dla tej receptury. Twoja domyślna maszyna nadal to KitchenAid Ice Cream Maker.',
    );
    expect(copy.recipeMachine.continueForRecipe).toBe('Kontynuuj tylko dla tej receptury');
    expect(copy.recipeMachine.backToDefault).toBe('Wróć do domyślnej maszyny');
    expect(copy.recipeMachine.defaultChanged('Ninja CREAMi Swirl')).toBe(
      'Domyślna maszyna została zmieniona na Ninja CREAMi Swirl.',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Owner test 11 — profile vs recipe grams are separate                */
/* ------------------------------------------------------------------ */

describe('owner test 11 — userDefaultBatchGrams (profile) vs recipe grams are separate', () => {
  it('applying an override drives the recipe from the override’s effective default, not the profile’s', () => {
    // Profile default: KitchenAid, own default 1200 g.
    const profile = withUserDefaultBatch(recordFor(KITCHENAID_5KSMICM), 1200, '2026-07-17T13:00:00.000Z')!;
    expect(effectiveDefaultBatchGrams(profile)).toBe(1200);

    // A recipe override to Deluxe (recommendation 670, no own default) drives
    // THIS recipe from 670 — the profile's 1200 is untouched.
    const override = recordFor(NINJA_CREAMI_DELUXE_NC502EU);
    const flow = applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), override);
    expect(resolveBatch(flow).batchGrams).toBe(670);
    // The profile record object is a separate value — the override never mutated it.
    expect(effectiveDefaultBatchGrams(profile)).toBe(1200);
    expect(profile.selection).not.toEqual(override.selection);
  });
});
