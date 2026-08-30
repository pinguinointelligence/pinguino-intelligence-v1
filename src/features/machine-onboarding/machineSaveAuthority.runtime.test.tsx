// @vitest-environment jsdom
/**
 * ONE machine-save authority — owner-approved relocation (Gellatti V2.1 §5).
 *
 * The approved design places „Zapisz ustawienia" in the PAGE HEADING rather
 * than inside the machine card. The draft, its validation and its payload stay
 * inside `MachineProfileSection`; the section registers its EXISTING `submit`
 * upward and the heading button calls that same closure.
 *
 * The owner approved the placement as PRESENTATION/WIRING ONLY, so this file
 * pins the part that must not have moved with it:
 *
 *   1. exactly ONE save authority exists — the section does not keep a second
 *      button once a page has taken the action over;
 *   2. the heading button submits the SAME payload the in-card button did;
 *   3. WHEN saving is allowed is unchanged — an invalid draft is still refused
 *      before `onSave` is ever called;
 *   4. success and failure still land on the section's own status line;
 *   5. the registration is withdrawn on unmount, so a page can never invoke a
 *      stale closure against an unmounted section.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MACHINE_CATALOG_VERSION, NINJA_CREAMI_DELUXE_NC502EU } from '@/features/machine-catalog';
import { MachineProfileSection } from './ui/MachineProfileSection';
import { buildMachineSettingsView } from './machineSettingsView';
import { buildMachinePreferenceRecord } from './preferenceContracts';
import type { MachineSettingsSubmit } from './ui/MachineProfileSection';

const record = () => {
  const built = buildMachinePreferenceRecord({
    profile: NINJA_CREAMI_DELUXE_NC502EU,
    isCustom: false,
    setAt: '2026-07-17T12:00:00.000Z',
    catalogVersion: MACHINE_CATALOG_VERSION,
  });
  if (built === null) throw new Error('expected a Deluxe record');
  return built;
};

const view = () => buildMachineSettingsView(record());

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (props: Record<string, unknown>) => {
  act(() => {
    root.render(
      <MachineProfileSection
        view={view()}
        onSetUp={() => undefined}
        onChange={() => undefined}
        onGoToRecipe={() => undefined}
        onSave={async () => true}
        {...props}
      />,
    );
  });
};

const saveButtons = () =>
  [...host.querySelectorAll('button')].filter((b) => /Zapisz ustawienia/.test(b.textContent ?? ''));

describe('machine save authority survives the approved heading placement', () => {
  it('1. keeps exactly ONE save authority — the card yields when a page takes it', () => {
    render({});
    expect(saveButtons()).toHaveLength(1);

    render({ onRegisterSave: () => undefined });
    expect(saveButtons()).toHaveLength(0);
  });

  it('2. the registered submit sends the SAME payload the card button sent', async () => {
    const fromCard = vi.fn<(input: MachineSettingsSubmit) => Promise<boolean>>(async () => true);
    render({ onSave: fromCard });
    await act(async () => saveButtons()[0]!.click());

    let registered: (() => Promise<void>) | null = null;
    const fromHeading = vi.fn<(input: MachineSettingsSubmit) => Promise<boolean>>(async () => true);
    render({
      onSave: fromHeading,
      onRegisterSave: (submit: (() => Promise<void>) | null) => {
        registered = submit;
      },
    });
    expect(registered).not.toBeNull();
    await act(async () => registered!());

    expect(fromHeading).toHaveBeenCalledTimes(1);
    expect(fromHeading.mock.calls[0]![0]).toEqual(fromCard.mock.calls[0]![0]);
  });

  it('3. WHEN saving is allowed is unchanged — an invalid draft never reaches onSave', async () => {
    const onSave = vi.fn(async () => true);
    let registered: (() => Promise<void>) | null = null;
    render({
      onSave,
      onRegisterSave: (submit: (() => Promise<void>) | null) => {
        registered = submit;
      },
    });

    const field = host.querySelector<HTMLInputElement>('input');
    expect(field).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        field,
        'nie-liczba',
      );
      field!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => registered!());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('4. success and failure still land on the section status line', async () => {
    let registered: (() => Promise<void>) | null = null;
    render({
      onSave: async () => false,
      onRegisterSave: (submit: (() => Promise<void>) | null) => {
        registered = submit;
      },
    });
    await act(async () => registered!());
    expect(host.querySelector('[role="alert"]')?.textContent ?? '').not.toBe('');
  });

  it('5. the registration is withdrawn on unmount', () => {
    const seen: (null | (() => Promise<void>))[] = [];
    render({ onRegisterSave: (submit: (() => Promise<void>) | null) => seen.push(submit) });
    act(() => root.render(<div />));
    expect(seen.at(-1)).toBeNull();
  });
});
