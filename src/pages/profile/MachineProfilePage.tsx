import type { ReactNode } from 'react';
/**
 * Profile → „Moja maszyna” (`/profile/machine`, §8.6).
 *
 * Owner hotfix (2026-07-17): a real SETTINGS page — the user's own default
 * batch is editable and explicitly saved, the save is confirmed, and the next
 * action („Przejdź do receptury”) is always offered. Manufacturer data stays
 * read-only unless the user declares their own container.
 *
 * Store wiring (launch gate, mirroring pro-core): ONLY the device-local
 * adapter is wired. The account-scoped backend adapter (services/
 * machinePreference) joins the selector once the owner applies migrations
 * 0030 + 0031 to the environment the bundle talks to.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CustomerSurface } from '@/features/customer-shell/ui/CustomerSurface';
import { TouchButton } from '@/features/customer-shell/ui/TouchButton';
import {
  MachineOnboarding,
  MachineProfileSection,
  buildMachineContextView,
  buildMachineSettingsView,
  localStorageMachinePreferenceStore,
  machineOnboardingCopy,
  userScopedMachineKey,
  resolvePreferenceProfile,
  useMachinePreference,
  withCustomContainer,
  withUserDefaultBatch,
  type MachineOnboardingCompletion,
  type MachineSettingsSubmit,
} from '@/features/machine-onboarding';
import { selectMachinePreferenceStore } from '@/services/machinePreference/machinePreferenceSelector';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { machineAccountDefaultSnapshot } from '@/features/pro-workbench/machineAccountDefault';
import { professionalAccountDefaultSnapshot } from '@/features/pro-workbench/professionalAccountAuthority';
import {
  readProfessionalChoice,
  writeProfessionalChoice,
} from '@/features/machine-onboarding/professionalMachineChoice';
import { copy as appCopy } from '@/copy/en';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { DestinationSurface } from '@/components/shared/DestinationSurface';

type PageMode = 'view' | 'onboarding' | 'edit_custom';

export function MachineProfilePage() {
  const navigate = useNavigate();
  const persona = useProCorePersona();
  /* The device-local key must be SCOPED to the signed-in account (owner P0,
     2026-07-18): the Home shell already does this, and this page did not, so
     the same customer's machine landed under two different keys and, on a
     shared browser, one account's machine carried into the next account's
     session. Same store, same launch gate — only the key is corrected. */
  const authUserId = useAuthStore((state) => state.user?.id ?? null);
  const store = useMemo(
    () =>
      selectMachinePreferenceStore({
        localDevice: () =>
          localStorageMachinePreferenceStore(undefined, userScopedMachineKey(authUserId)),
      }).store,
    [authUserId],
  );
  const preference = useMachinePreference(store);
  /* Saving a machine here is what makes it the default for the NEXT new recipe.
     The sign-in bridge in `providers` covers a reload; this keeps the same
     session honest, so „+ Nowa receptura" right after saving already opens on
     the machine that was just saved. */
  const machineRecord = preference.record;
  const [professionalChosen, setProfessionalChosen] = useState(() =>
    readProfessionalChoice(authUserId),
  );
  /* Re-read on an account switch during render rather than in an effect: the
     read is synchronous, and an effect here would render the previous account's
     choice for one frame before correcting itself. */
  const [choiceOwner, setChoiceOwner] = useState(authUserId);
  if (choiceOwner !== authUserId) {
    setChoiceOwner(authUserId);
    setProfessionalChosen(readProfessionalChoice(authUserId));
  }
  useEffect(() => {
    useRecipeProfileStore
      .getState()
      .setMachineAccountDefault(
        authUserId,
        professionalChosen
          ? professionalAccountDefaultSnapshot
          : machineRecord === null
            ? null
            : (visibleProductType) =>
                machineAccountDefaultSnapshot(machineRecord, visibleProductType),
      );
  }, [authUserId, machineRecord, professionalChosen]);

  /* Professional and a Home machine are ONE choice, so picking either clears
     the other. Professional keeps no record of its own — there is no container
     and no derived batch to record — only the fact that it was chosen. */
  const chooseProfessional = async () => {
    writeProfessionalChoice(authUserId, true);
    setProfessionalChosen(true);
    await preference.clear();
    setDefaultChangedName(appCopy.proMachine.professionalLabel);
    setMode('view');
  };
  const [mode, setMode] = useState<PageMode>('view');
  // „Domyślna maszyna została zmieniona na …” after a profile default change.
  const [defaultChangedName, setDefaultChangedName] = useState<string | null>(null);

  const settingsView = useMemo(
    () => (preference.record !== null ? buildMachineSettingsView(preference.record) : null),
    [preference.record],
  );

  const editableCustomProfile = useMemo(() => {
    if (preference.record === null || preference.record.selection.kind !== 'custom') return null;
    return resolvePreferenceProfile(preference.record);
  }, [preference.record]);

  const handleComplete = async (completion: MachineOnboardingCompletion) => {
    writeProfessionalChoice(authUserId, false);
    setProfessionalChosen(false);
    const hadDefault = preference.record !== null;
    const ok = await preference.save(completion.record);
    // §7: „Zmień domyślną maszynę” explicitly changes the PROFILE default — an
    // unambiguous confirmation, but only when it was a CHANGE (not first setup).
    if (ok && hadDefault) {
      setDefaultChangedName(buildMachineContextView(completion.record)?.name ?? null);
    }
    setMode('view');
  };

  /** Persist the settings; report an honest false on a store failure. */
  const handleSave = async (submit: MachineSettingsSubmit): Promise<boolean> => {
    const current = preference.record;
    if (current === null) return false;
    const now = new Date().toISOString();
    const withContainer = withCustomContainer(current, submit.customContainer, now);
    if (withContainer === null) return false;
    const next = withUserDefaultBatch(withContainer, submit.userDefaultGrams, now);
    if (next === null) return false;
    return preference.save(next);
  };

  // Maszyna is an authenticated destination reached from the one drawer, so it
  // wears the approved global DestinationSurface while retaining the exact
  // onboarding, persistence and save callbacks below.
  /* V2.1 §5 (owner-approved wiring): the approved design puts „Zapisz
     ustawienia" in the page heading. The draft, its validation and its payload
     stay inside `MachineProfileSection`; the section registers its EXISTING
     submit here, so this button and the section's own are one save authority —
     never two. When no section is mounted (loading, onboarding) there is no
     registered submit and the action is simply absent. */
  const [saveMachineSettings, setSaveMachineSettings] = useState<
    (() => Promise<void>) | null
  >(null);
  const registerSave = useCallback(
    (submit: (() => Promise<void>) | null) => setSaveMachineSettings(() => submit),
    [],
  );

  const shell = (children: ReactNode, headingAction?: ReactNode) => (
    <DestinationSurface
      eyebrow="Konto"
      title="Ustawienia maszyny"
      blurb="Domyślna maszyna i partia są punktem startu dla nowych receptur i nowych Produkcji."
      contextLabel="Ustawienia maszyny"
      actions={headingAction}
    >
      <CustomerSurface measure="workspace">
        <div className="max-w-4xl">{children}</div>
      </CustomerSurface>
    </DestinationSurface>
  );

  if (preference.status === 'loading') {
    return shell(<ApplicationState kind="loading" title="Wczytuję ustawienia maszyny…" />);
  }

  if (mode === 'onboarding' || mode === 'edit_custom') {
    return shell(
      <>
        <div>
          <MachineOnboarding
            onComplete={(completion) => void handleComplete(completion)}
            submitLabel={machineOnboardingCopy.settings.saveAndGoToRecipe}
            onSelectProfessional={() => void chooseProfessional()}
            {...(mode === 'edit_custom' && editableCustomProfile !== null
              ? { editCustomProfile: editableCustomProfile }
              : {})}
          />
          <div className="mt-6">
            <TouchButton variant="quiet" onClick={() => setMode('view')}>
              {machineOnboardingCopy.tiles.disambiguation.back}
            </TouchButton>
          </div>
        </div>
      </>,
    );
  }

  return shell(
    <>
      <div>
        {defaultChangedName !== null ? (
          <p
            role="status"
            className="mb-4 rounded-xl border border-status-ideal/40 bg-status-ideal/10 px-4 py-3 text-[13px] text-stone-700"
          >
            ✓ {machineOnboardingCopy.recipeMachine.defaultChanged(defaultChangedName)}
          </p>
        ) : null}
        {professionalChosen ? (
          /* Professional has no container and no derived batch to show, so the
             panel states exactly what was chosen and what it means, and offers
             the same „Zmień maszynę" door as a saved Home machine. */
          <section
            className="rounded-2xl border border-ink/12 bg-white p-5"
            data-testid="machine-professional-summary"
          >
            <p className="text-[11px] font-semibold tracking-[0.08em] text-stone-500 uppercase">
              {machineOnboardingCopy.profile.defaultLabel}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              {appCopy.proMachine.professionalLabel}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
              {machineOnboardingCopy.tiles.professionalNote}
            </p>
            <div className="mt-5">
              <TouchButton variant="quiet" onClick={() => setMode('onboarding')}>
                {machineOnboardingCopy.profile.change}
              </TouchButton>
            </div>
          </section>
        ) : (
        <MachineProfileSection
          view={settingsView}
          onRegisterSave={registerSave}
          onSetUp={() => setMode('onboarding')}
          onChange={() => {
            setDefaultChangedName(null);
            setMode('onboarding');
          }}
          onSave={handleSave}
          onGoToRecipe={() => void navigate(persona === 'pro' ? '/pro/recipe' : '/home')}
          {...(editableCustomProfile !== null
            ? { onEditCustom: () => setMode('edit_custom') }
            : {})}
        />
        )}
      </div>
    </>,
    saveMachineSettings ? (
      <button
        type="button"
        onClick={() => void saveMachineSettings()}
        className={buttonClasses('primary', 'sm')}
        data-testid="machine-settings-save"
      >
        {machineOnboardingCopy.settings.save}
      </button>
    ) : undefined,
  );
}
