// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · A4 — the mobile Etykieta crash.
 *
 * Below 960 px the PRO workbench mounts the Etykieta tab TWICE: the desktop
 * column stays mounted (only CSS hides it) and the mobile cockpit sheet mounts
 * a second copy. Served staging (d9507eed) showed the app-wide error screen
 * („Nie udało się wyświetlić tej części aplikacji…") with React error #185
 * „Maximum update depth exceeded", thrown from `setLabelDraft`.
 *
 * The mechanism these tests pin: every copy used to load the account label
 * profile on its own, and every copy writes its derived label into the ONE
 * shared `recipeStore.labelDraft`. `mergeRecipeDraftLabel` keeps most fields
 * from the stored label but FORCES ingredients, allergens and the nutrition
 * declaration from the copy's own profile-derived system label — and those
 * follow the profile's market and languages. While one copy held a saved
 * non-default market and the other the default, each wrote a different label
 * and undid the other's write, synchronously, until React stopped the loop.
 *
 * Production builds a NEW Supabase repository object on every
 * `resolveLabelRepository()` call, so two copies never share a repository
 * instance. The fake below does the same.
 */
import { act, Component, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  defaultAccountLabelProfile,
  type AccountLabelProfile,
  type LabelRepository,
} from '@/services/labels/labelRepository';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { DraftLabelPanel } from './DraftLabelPanel';

const profileRequests = vi.hoisted(() => ({
  pending: [] as Array<(profile: AccountLabelProfile | null) => void>,
}));

vi.mock('@/services/labels/labelRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/labels/labelRepository')>();
  const unused = async (): Promise<never> => {
    throw new Error('not used by the draft label panel');
  };
  return {
    ...actual,
    resolveLabelRepository: (): LabelRepository => ({
      getAccountProfile: () =>
        new Promise<AccountLabelProfile | null>((resolve) => {
          profileRequests.pending.push(resolve);
        }),
      createLogoSignedUrl: async (path: string) => path,
      saveAccountProfile: unused,
      getCompletedSnapshot: async () => null,
      freezeCompletedSnapshot: unused,
      getRunLabelSnapshot: async () => null,
      getRunLabelSnapshotById: async () => null,
      listRunLabelSnapshots: async () => [],
      saveRunLabelSnapshot: unused,
      uploadLogo: unused,
    }),
  };
});

const OWNER = 'label-twin-owner';

/** A saved profile that differs from the default where the merge listens: market + languages. */
function savedUsProfile(): AccountLabelProfile {
  return { ...defaultAccountLabelProfile(OWNER), market: 'US', labelLanguages: ['en'] };
}

class CaptureBoundary extends Component<
  { onError: (error: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? <p data-testid="twin-boundary">failed</p> : this.props.children;
  }
}

describe('A4 — two mounted Etykieta copies share one account label profile', () => {
  let host: HTMLDivElement;
  let root: Root;
  let errors: unknown[];
  let recipeInput: RecipeInput;

  const render = (copies: { desktop: boolean; sheet: boolean }) =>
    act(async () => {
      root.render(
        <MemoryRouter>
          <CaptureBoundary onError={(error) => errors.push(error)}>
            {copies.desktop ? (
              <section data-testid="desktop-column-copy">
                <DraftLabelPanel recipeInput={recipeInput} fallback={<p>fallback</p>} />
              </section>
            ) : null}
            {copies.sheet ? (
              <section data-testid="mobile-sheet-copy">
                <DraftLabelPanel recipeInput={recipeInput} fallback={<p>fallback</p>} />
              </section>
            ) : null}
          </CaptureBoundary>
        </MemoryRouter>,
      );
    });

  const answerAll = (profile: AccountLabelProfile | null) =>
    act(async () => {
      for (const resolve of profileRequests.pending.splice(0)) resolve(profile);
    });

  const storedLabelJson = () => JSON.stringify(useRecipeStore.getState().labelDraft?.label ?? null);

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    profileRequests.pending.length = 0;
    errors = [];
    useRecipeStore.getState().resetToDemo();
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: null, displayName: null },
      available: true,
    });
    recipeInput = buildRecipeInput(useRecipeStore.getState());
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    profileRequests.pending.length = 0;
  });

  it('does not loop when the saved profile reaches one copy before the other (served #185)', async () => {
    await render({ desktop: true, sheet: true });
    const defaultDerivedLabel = storedLabelJson();

    // Answer only the FIRST outstanding profile request: exactly the moment on
    // a phone when one copy holds the saved profile and the other the default.
    await act(async () => {
      profileRequests.pending.shift()?.(savedUsProfile());
    });
    await act(async () => {});

    expect(errors).toEqual([]);
    expect(host.querySelector('[data-testid="twin-boundary"]')).toBeNull();
    // One account, one profile, one request — shared by every mounted copy.
    expect(profileRequests.pending).toHaveLength(0);
    // The saved profile really reached the label (the US market changes the
    // forced system fields), so the test cannot pass by never deriving at all.
    expect(storedLabelJson()).not.toBe(defaultDerivedLabel);
  });

  it('lets a copy that mounts after the profile settled read it at once, without a second request', async () => {
    await render({ desktop: true, sheet: false });
    await answerAll(savedUsProfile());
    const settledLabel = storedLabelJson();

    // The mobile sheet opens later, while the desktop column copy stays mounted.
    await render({ desktop: true, sheet: true });
    await act(async () => {});

    expect(errors).toEqual([]);
    expect(host.querySelector('[data-testid="twin-boundary"]')).toBeNull();
    expect(profileRequests.pending).toHaveLength(0);
    // The joining copy derives the SAME label, so it writes nothing new.
    expect(storedLabelJson()).toBe(settledLabel);
    const lot = useRecipeStore.getState().labelDraft?.lotCode;
    expect(lot).toBeTruthy();
    expect(host.querySelector('[data-testid="desktop-column-copy"]')?.textContent).toContain(lot);
    expect(host.querySelector('[data-testid="mobile-sheet-copy"]')?.textContent).toContain(lot);
  });

  it('still loads the profile afresh once every copy has unmounted (settings edits stay visible)', async () => {
    await render({ desktop: true, sheet: false });
    expect(profileRequests.pending).toHaveLength(1);
    await answerAll(null);
    const defaultDerivedLabel = storedLabelJson();

    await render({ desktop: false, sheet: false });
    await render({ desktop: true, sheet: false });

    expect(profileRequests.pending).toHaveLength(1);
    await answerAll(savedUsProfile());
    expect(errors).toEqual([]);
    expect(storedLabelJson()).not.toBe(defaultDerivedLabel);
  });
});
