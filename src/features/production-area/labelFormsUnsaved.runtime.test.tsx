// @vitest-environment jsdom
/**
 * Production v3 §5 — both label forms of Produkcja → Etykiety join the ONE unsaved-changes
 * register: the default profile editor („Zapisz profil”) and a run's label settings
 * („Zastosuj ustawienia”). „Zapisz i przejdź” is the form's own save and leaves only when it
 * succeeded; a failed save keeps the reader, the draft and the form's own message.
 * „Zapisz jako moje ustawienie domyślne” starts unticked, so applying a run's settings does not
 * rewrite the account default.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { createCompleteLabel } from '@/features/master-label/masterLabelTestFixture';
import {
  defaultAccountLabelProfile,
  type AccountLabelProfile,
  type LabelRepository,
  type RunLabelSnapshot,
} from '@/services/labels/labelRepository';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import { useAuthStore } from '@/stores/authStore';
import { clearProductionAreaMemory } from './productionAreaMemory';
import { resetUnsavedGuardForTests } from './unsavedGuard';

const OWNER = 'owner-label-forms';
const mocks = vi.hoisted(() => ({ repository: null as unknown as LabelRepository }));
vi.mock('@/services/labels/labelRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/labels/labelRepository')>()),
  resolveLabelRepository: () => mocks.repository,
}));

const { LabelsHubPage } = await import('@/pages/destinations/GlobalDestinationPages');

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="probe" data-path={`${location.pathname}${location.search}`} />;
}

const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

function repository() {
  const profile: { current: AccountLabelProfile } = {
    current: { ...defaultAccountLabelProfile(OWNER), businessName: 'Profil konta' },
  };
  const saved: RunLabelSnapshot = {
    snapshotId: 'snap-1',
    version: 1,
    contentHash: 'hash-1',
    runId: 'run-1',
    ownerUserId: OWNER,
    label: createCompleteLabel('EU', {
      sourceCompletionSessionId: 'run-1',
      businessName: 'Etykieta wersja 1',
    }),
    accountProfileSnapshot: {},
    logoPath: null,
    createdAt: '2026-09-16T12:00:00.000Z',
  };
  const completed = {
    sessionId: 'run-1',
    ownerUserId: OWNER,
    productionCompletedAt: '2026-09-16T11:00:00.000Z',
    lotCode: 'LOT-RUN-1',
    source: {
      recipeId: 'recipe-1',
      recipeVersionId: 'version-1',
      recipeVersionNumber: 1,
      recipeName: 'Truskawkowe gelato',
    },
  } as unknown as ProductionCompletionSnapshot;
  return {
    profile,
    getAccountProfile: vi.fn(async () => structuredClone(profile.current)),
    saveAccountProfile: vi.fn(async (next: AccountLabelProfile) => {
      profile.current = structuredClone(next);
      return structuredClone(next);
    }),
    getCompletedSnapshot: vi.fn(async (runId: string) => (runId === 'run-1' ? completed : null)),
    freezeCompletedSnapshot: vi.fn(async () => undefined),
    getRunLabelSnapshot: vi.fn(async () => structuredClone(saved)),
    getRunLabelSnapshotById: vi.fn(async (id: string) =>
      id === saved.snapshotId ? structuredClone(saved) : null,
    ),
    listRunLabelSnapshots: vi.fn(async () => [structuredClone(saved)]),
    saveRunLabelSnapshot: vi.fn(async (label: RunLabelSnapshot['label']) => ({
      ...structuredClone(saved),
      snapshotId: 'snap-2',
      version: 2,
      label: structuredClone(label),
    })),
    uploadLogo: vi.fn(async () => `${OWNER}/logo.png`),
    createLogoSignedUrl: vi.fn(async (path: string) => path),
  };
}

describe('Produkcja → Etykiety forms and the unsaved-changes question', () => {
  let host: HTMLDivElement;
  let root: Root;
  let repo: ReturnType<typeof repository>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: null, displayName: null },
      available: true,
    });
    useProCoreAccessStore.setState({ devPersona: 'pro' });
    clearProductionAreaMemory();
    resetUnsavedGuardForTests();
    repo = repository();
    mocks.repository = repo as unknown as LabelRepository;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useProCoreAccessStore.setState({ devPersona: null });
    resetUnsavedGuardForTests();
  });

  const render = async (entry: string) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/labels" element={<LabelsHubPage />} />
            <Route path="/production" element={<p>Partie</p>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>,
      );
    });
  };
  const path = () => host.querySelector('[data-testid="probe"]')?.getAttribute('data-path');
  const button = (scope: ParentNode, label: string) =>
    [...scope.querySelectorAll<HTMLElement>('button, a')].find(
      (element) => element.textContent?.trim() === label,
    );
  const sectionLink = (label: string) =>
    [...host.querySelectorAll<HTMLAnchorElement>('nav a')].find((link) =>
      link.textContent?.trim().startsWith(label),
    )!;
  const dialog = () => document.querySelector('[data-testid="unsaved-changes-dialog"]');
  const businessInput = () =>
    [...document.querySelectorAll<HTMLLabelElement>('[data-testid="label-profile-editor"] label')]
      .find((label) => label.textContent?.startsWith('Marka / nazwa firmy'))!
      .querySelector('input')!;

  const openProfileEditor = async () => {
    await render('/labels');
    await vi.waitFor(() => expect(button(host, 'Edytuj')).toBeDefined());
    await act(async () => button(host, 'Edytuj')!.click());
    await act(async () => setValue(businessInput(), 'Nowa firma'));
  };

  it('asks before leaving an edited default profile; „Zostań” keeps the draft', async () => {
    await openProfileEditor();
    await act(async () => sectionLink('Partie').click());
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('Etykiety · profil domyślny');
    expect(path()).toBe('/labels');
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-testid="unsaved-changes-stay"]')!.click(),
    );
    expect(dialog()).toBeNull();
    expect(businessInput().value).toBe('Nowa firma');
    expect(repo.saveAccountProfile).not.toHaveBeenCalled();
  });

  it('„Zapisz i przejdź” saves the profile through „Zapisz profil” and then leaves', async () => {
    await openProfileEditor();
    await act(async () => sectionLink('Partie').click());
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-testid="unsaved-changes-save"]')!.click(),
    );
    await vi.waitFor(() => expect(path()).toBe('/production'));
    expect(repo.saveAccountProfile).toHaveBeenCalledTimes(1);
    expect(repo.profile.current.businessName).toBe('Nowa firma');
  });

  it('a failed save keeps the reader, the draft and the form’s own message', async () => {
    repo.saveAccountProfile.mockRejectedValueOnce(new Error('network down'));
    await openProfileEditor();
    await act(async () => sectionLink('Partie').click());
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-testid="unsaved-changes-save"]')!.click(),
    );
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(path()).toBe('/labels');
    expect(businessInput().value).toBe('Nowa firma');
    expect(host.querySelector('.text-status-error')?.textContent).toBeTruthy();
  });

  it('„Odrzuć zmiany” drops only the profile draft and leaves', async () => {
    await openProfileEditor();
    await act(async () => sectionLink('Partie').click());
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-testid="unsaved-changes-discard"]')!.click(),
    );
    expect(path()).toBe('/production');
    expect(repo.saveAccountProfile).not.toHaveBeenCalled();
  });

  it('a run’s label settings ask too, and „Zastosuj” does not rewrite the default profile', async () => {
    await render('/labels?run=run-1&snapshot=snap-1&labelView=settings');
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="label-settings-view"]')).not.toBeNull(),
    );
    const asDefault = [...host.querySelectorAll<HTMLLabelElement>('label')]
      .find((label) => label.textContent?.includes('Zapisz jako moje ustawienie domyślne'))!
      .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(asDefault.checked).toBe(false);

    const market = host.querySelector<HTMLSelectElement>('[data-testid="label-market-select"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
        market,
        'WORLD',
      );
      market.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => sectionLink('Partie').click());
    expect(dialog()?.textContent).toContain('Etykiety · ustawienia etykiety partii');
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-testid="unsaved-changes-save"]')!.click(),
    );
    await vi.waitFor(() => expect(path()).toBe('/production'));
    expect(repo.saveRunLabelSnapshot).toHaveBeenCalledTimes(1);
    expect(repo.saveAccountProfile).not.toHaveBeenCalled();
  });
});
