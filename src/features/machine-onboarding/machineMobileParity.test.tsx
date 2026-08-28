import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MACHINE_CATALOG_VERSION, SAGE_SMART_SCOOP_BCI600 } from '@/features/machine-catalog';
import {
  buildMachineContextView,
  buildMachinePreferenceRecord,
  buildMachineSettingsView,
} from '@/features/machine-onboarding';
import { MachineContextBar } from './ui/MachineContextBar';
import { MachineOnboarding } from './ui/MachineOnboarding';
import { MachineProfileSection } from './ui/MachineProfileSection';

const noop = () => undefined;
const save = async () => true;

describe('mobile machine parity — shared responsive surfaces', () => {
  it('uses the same active Sage profile without horizontal scrollers', () => {
    const record = buildMachinePreferenceRecord({
      profile: SAGE_SMART_SCOOP_BCI600,
      isCustom: false,
      setAt: '2026-08-28T12:00:00.000Z',
      catalogVersion: MACHINE_CATALOG_VERSION,
    });
    if (!record) throw new Error('expected Sage record');
    const settings = buildMachineSettingsView(record);
    const context = buildMachineContextView(record);
    if (!settings || !context) throw new Error('expected Sage views');

    const markup = [
      renderToStaticMarkup(<MachineOnboarding onComplete={noop} />),
      renderToStaticMarkup(
        <MachineProfileSection
          view={settings}
          onSetUp={noop}
          onChange={noop}
          onSave={save}
          onGoToRecipe={noop}
        />,
      ),
      renderToStaticMarkup(<MachineContextBar view={context} onChange={noop} />),
    ].join('\n');

    expect(markup.match(/Sage Smart Scoop/g)?.length).toBeGreaterThanOrEqual(3);
    expect(markup).toContain('1,0 L');
    expect(markup).toContain('950 g');
    expect(markup).not.toContain('overflow-x-auto');
    expect(markup).not.toMatch(/min-w-\[[1-9]\d{2,}px\]/);
  });
});
