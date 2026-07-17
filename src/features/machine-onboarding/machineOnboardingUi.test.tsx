/**
 * Machine onboarding UI — static-markup honesty checks (node environment,
 * renderToStaticMarkup — the same pattern as the destination-page tests).
 *
 * Pins: the §8.1 first screen, tile honesty (disabled families keep the
 * honest note), the §8.3 plain-language answers, the §8.4 form fields, the
 * §8.5 lines, the §7.3 context bar hard rules (no engine name / technology
 * code / temperature) and the „Zalecany wsad PINGÜINO” framing.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  MACHINE_CATALOG_VERSION,
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_SCOOP_SWIRL_NC7,
  deriveMachineSetup,
} from '@/features/machine-catalog';
import { machineOnboardingCopy as copy } from './machineOnboardingCopy';
import { autoConfigLines, buildMachineContextView } from './machineViews';
import { buildMachineSettingsView } from './machineSettingsView';
import { buildMachinePreferenceRecord } from './preferenceContracts';
import { MachineOnboarding } from './ui/MachineOnboarding';
import { MachineBehaviorQuestion } from './ui/MachineBehaviorQuestion';
import { CustomMachineForm } from './ui/CustomMachineForm';
import { AutoConfigTransition } from './ui/AutoConfigTransition';
import { MachineContextBar } from './ui/MachineContextBar';
import { MachineProfileSection } from './ui/MachineProfileSection';

const render = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => undefined;

function recordFor(profileId: 'nc7' | 'deluxe') {
  const profile = profileId === 'nc7' ? NINJA_CREAMI_SCOOP_SWIRL_NC7 : NINJA_CREAMI_DELUXE_NC502EU;
  const record = buildMachinePreferenceRecord({
    profile,
    isCustom: false,
    setAt: '2026-07-17T12:00:00.000Z',
    catalogVersion: MACHINE_CATALOG_VERSION,
  });
  if (record === null) throw new Error('expected record');
  return record;
}

describe('§8.1/§8.2 first screen', () => {
  const html = render(<MachineOnboarding onComplete={noop} />);

  it('asks the spec question with the spec lead and a search field', () => {
    expect(html).toContain('Jakiej maszyny używasz?');
    expect(html).toContain(copy.intro.lead);
    expect(html).toContain(copy.intro.searchLabel);
  });

  it('renders every §8.2 family tile plus the escape tile', () => {
    for (const label of [
      'Ninja CREAMi',
      'Ninja CREAMi Deluxe',
      'Moulinex Freezi',
      'Sage / Breville Smart Scoop',
      'Magimix Gelato Expert',
      'Cuisinart ICE-100',
      'KitchenAid Ice Cream Maker',
      'Cuisinart z misą chłodzoną',
      'Nie widzę mojej maszyny',
    ]) {
      expect(html).toContain(label.replace('&', '&amp;'));
    }
  });

  it('disabled families carry the honest note and a real disabled control', () => {
    expect(html).toContain(copy.tiles.unavailableNote);
    expect(html).toContain('disabled=""'); // an actual disabled attribute, not just styling
  });
});

describe('§8.3 behavior question', () => {
  const html = render(<MachineBehaviorQuestion onPick={noop} onBack={noop} />);

  it('shows the four plain-language answers with helpers', () => {
    expect(html).toContain('Najpierw zamrażam całą mieszankę');
    expect(html).toContain('Maszyna sama chłodzi mieszankę');
    expect(html).toContain('Najpierw zamrażam tylko misę');
    expect(html).toContain('Maszyna wydaje miękkie lody z dozownika');
    expect(html).toContain('Zamrożona misa chłodzi mieszankę podczas mieszania.');
  });

  it('never shows technology jargon to the user', () => {
    expect(/re-?spin|kompresor|compressor|frozen\s*bowl/i.test(html)).toBe(false);
  });
});

describe('§8.4 custom form', () => {
  it('renders the spec fields; the vessel-only note appears only when relevant', () => {
    const html = render(
      <CustomMachineForm vesselOnlyNote={copy.custom.vesselOnlyBowlNote} onSubmit={noop} onBack={noop} />,
    );
    expect(html).toContain(copy.custom.brandLabel);
    expect(html).toContain(copy.custom.modelLabel);
    expect(html).toContain(copy.custom.vesselLabel);
    expect(html).toContain(copy.custom.maxFillLabel);
    expect(html).toContain(copy.custom.maxMixLabel);
    expect(html).not.toContain(copy.custom.vesselOnlyBowlNote); // nothing entered yet
  });

  it('prefilled vessel-only values show the honest device-type note (editable state)', () => {
    const html = render(
      <CustomMachineForm
        vesselOnlyNote={copy.custom.vesselOnlyBowlNote}
        initialValues={{
          brand: null,
          model: null,
          vesselCapacity: { value: 2, unit: 'l' },
          hasMaxFillLine: null,
          manufacturerMaxMix: null,
        }}
        onSubmit={noop}
        onBack={noop}
      />,
    );
    expect(html).toContain(copy.custom.vesselOnlyBowlNote);
  });
});

describe('§8.5 auto-config transition', () => {
  it('renders the four checkmark lines in an aria-live region with the honest amount detail', () => {
    const derivation = deriveMachineSetup(NINJA_CREAMI_SCOOP_SWIRL_NC7);
    const html = render(
      <AutoConfigTransition
        lines={autoConfigLines(derivation)}
        amountDetail={`${copy.batch.recommendedLabel}: 460 g`}
        onDone={noop}
      />,
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Rozpoznano urządzenie');
    expect(html).toContain('Ustawiono właściwą ilość');
    expect(html).toContain('Dopasowano sposób przygotowania');
    expect(html).toContain('Przygotowano Studio');
    expect(html).toContain('Zalecany wsad PINGÜINO: 460 g');
  });
});

describe('§7.3 context bar — hard rules', () => {
  const view = buildMachineContextView(recordFor('deluxe'));
  if (view === null) throw new Error('expected view');
  const html = render(<MachineContextBar view={view} onChange={noop} />);

  it('shows exactly name + vessel + Zmień', () => {
    expect(html).toContain('Twoja maszyna:');
    expect(html).toContain('Ninja CREAMi Deluxe');
    expect(html).toContain('pojemnik 706 ml');
    expect(html).toContain('>Zmień<');
    expect(html).toContain('aria-label="Zmień maszynę"');
  });

  it('NEVER shows an engine name, technology code, temperature or grams', () => {
    expect(html).not.toMatch(/engine/i);
    expect(html).not.toMatch(/respin|ninja_gelato|ninja_swirl|compressor|frozen_bowl/);
    expect(html).not.toMatch(/−?\s?1[123]\s?°C|°C/);
    expect(html).not.toMatch(/\d+\s?g\b/); // grams live on batch surfaces, not the bar
  });

  it('a machine without a vessel figure renders the name only', () => {
    const nameOnly = render(
      <MachineContextBar view={{ name: 'Twoja maszyna', vesselMl: null, recommendedBatchGrams: null }} onChange={noop} />,
    );
    expect(nameOnly).not.toContain('pojemnik');
  });
});

describe('§8.6 profile section (settings card — owner hotfix)', () => {
  const asyncNoop = async () => true;

  it('separates the manufacturer figure from the user-editable default + saves + next step', () => {
    const view = buildMachineSettingsView(recordFor('nc7'));
    if (view === null) throw new Error('expected view');
    const html = render(
      <MachineProfileSection
        view={view}
        onSetUp={noop}
        onChange={noop}
        onSave={asyncNoop}
        onGoToRecipe={noop}
      />,
    );
    expect(html).toContain(copy.profile.title);
    expect(html).toContain('Ninja CREAMi Scoop &amp; Swirl');
    // Manufacturer data — labelled as the model's, read-only.
    expect(html).toContain(copy.settings.manufacturerCapacityLabel);
    expect(html).toContain('480 ml');
    // PINGÜINO's proposal — never framed as the manufacturer's gram figure.
    expect(html).toContain('Zalecany wsad PINGÜINO');
    expect(html).toContain('460 g');
    // The user's own editable default, the actions and the next step.
    expect(html).toContain(copy.settings.userDefaultLabel);
    expect(html).toContain(copy.settings.save);
    expect(html).toContain(copy.settings.restoreRecommended);
    expect(html).toContain(copy.profile.change);
    expect(html).toContain(copy.settings.goToRecipe);
    expect(html).toContain(copy.settings.useCustomContainer);
  });

  it('without a saved machine it offers the set-up entry', () => {
    const html = render(
      <MachineProfileSection
        view={null}
        onSetUp={noop}
        onChange={noop}
        onSave={asyncNoop}
        onGoToRecipe={noop}
      />,
    );
    expect(html).toContain(copy.profile.noMachine);
    expect(html).toContain(copy.profile.setUp);
  });
});
