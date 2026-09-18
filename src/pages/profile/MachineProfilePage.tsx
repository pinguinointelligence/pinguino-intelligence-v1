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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { color, type } from '@/features/customer-shell/ui/tokens';
import { cn } from '@/lib/cn';
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
import { ProductionAreaSurface } from '@/features/production-area/ProductionAreaSurface';
import { requestLeave } from '@/features/production-area/unsavedGuard';
import { useRegisterUnsaved } from '@/features/production-area/useRegisterUnsaved';
import { productionAreaCopy } from '@/copy/productionArea';

const areaCopy = productionAreaCopy();

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
    setChoiceSaveFailed(false);
    setDefaultChangedName(appCopy.proMachine.professionalLabel);
    setMode('view');
  };
  const [mode, setMode] = useState<PageMode>('view');
  // „Domyślna maszyna została zmieniona na …” after a profile default change.
  const [defaultChangedName, setDefaultChangedName] = useState<string | null>(null);
  /* Produkcja v3 §3: a failed save of the machine CHOICE used to be silent — the page
     simply went back to the old machine. It now says so with the existing message. */
  const [choiceSaveFailed, setChoiceSaveFailed] = useState(false);

  const settingsView = useMemo(
    () => (preference.record !== null ? buildMachineSettingsView(preference.record) : null),
    [preference.record],
  );

  const editableCustomProfile = useMemo(() => {
    if (preference.record === null || preference.record.selection.kind !== 'custom') return null;
    return resolvePreferenceProfile(preference.record);
  }, [preference.record]);

  /* The save of the machine choice in flight — awaited by the unsaved-changes question's
     „Zapisz i przejdź”, which may leave only after this save reports success. */
  const choiceSaveInFlight = useRef<Promise<boolean> | null>(null);
  const handleComplete = (completion: MachineOnboardingCompletion): Promise<boolean> => {
    const run = (async () => {
      writeProfessionalChoice(authUserId, false);
      setProfessionalChosen(false);
      const hadDefault = preference.record !== null;
      const ok = await preference.save(completion.record);
      // §7: „Zmień domyślną maszynę” explicitly changes the PROFILE default — an
      // unambiguous confirmation, but only when it was a CHANGE (not first setup).
      if (ok && hadDefault) {
        setDefaultChangedName(buildMachineContextView(completion.record)?.name ?? null);
      }
      setChoiceSaveFailed(!ok);
      setMode('view');
      return ok;
    })();
    choiceSaveInFlight.current = run;
    return run;
  };

  /* Produkcja v3 §1.5 — „wybór maszyny przed „Zapisz””: a machine picked on „Dopasuj
     ilość” but not yet saved is an unsaved area form. „Zapisz i przejdź” runs the step's
     OWN submit (its amount validation and message) and leaves only after the choice is
     saved; „Odrzuć zmiany” closes the choice without saving anything. */
  const [pendingChoiceSubmit, setPendingChoiceSubmit] = useState<(() => boolean) | null>(null);
  const registerPendingChoice = useCallback(
    (submit: (() => boolean) | null) => setPendingChoiceSubmit(() => submit),
    [],
  );
  useRegisterUnsaved({
    id: 'machine-choice',
    label: areaCopy.sections.machine,
    enabled: mode !== 'view',
    dirty: pendingChoiceSubmit !== null,
    save: async () => {
      choiceSaveInFlight.current = null;
      if (!pendingChoiceSubmit?.()) return { ok: false };
      const ok = (await choiceSaveInFlight.current) ?? false;
      return ok ? { ok: true } : { ok: false };
    },
    discard: () => {
      setPendingChoiceSubmit(null);
      setMode('view');
    },
  });

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
  const [saveMachineSettings, setSaveMachineSettings] = useState<(() => Promise<boolean>) | null>(
    null,
  );
  const registerSave = useCallback(
    (submit: (() => Promise<boolean>) | null) => setSaveMachineSettings(() => submit),
    [],
  );

  const shell = (children: ReactNode, headingAction?: ReactNode) => (
    <ProductionAreaSurface
      section="machine"
      title={areaCopy.machine.heading}
      blurb={areaCopy.machine.blurb}
      actions={headingAction}
    >
      {/* The area frame already owns the gutters and the rhythm: the page keeps the customer
          type scale without CustomerSurface's second gutter and top padding. */}
      <div className={cn('max-w-4xl pb-8', type.body, color.textPrimary)}>{children}</div>
    </ProductionAreaSurface>
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
            /* Produkcja v3 §3: the choice SAVES and stays here — it never went to a recipe,
               so it no longer says „Zapisz i przejdź do receptury”. */
            submitLabel={areaCopy.machine.choiceSubmit}
            onPendingSaveChange={registerPendingChoice}
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
        {choiceSaveFailed ? (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-status-error/35 bg-status-error/[0.06] px-4 py-3 text-[13px] text-status-error"
            data-testid="machine-choice-save-failed"
          >
            {machineOnboardingCopy.settings.saveFailed}
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
          unsavedGuard={{ id: 'machine-settings', label: areaCopy.sections.machine }}
          onSetUp={() => setMode('onboarding')}
          onChange={() => {
            setDefaultChangedName(null);
            setChoiceSaveFailed(false);
            setMode('onboarding');
          }}
          onSave={handleSave}
          onGoToRecipe={() =>
            requestLeave(() => void navigate(persona === 'pro' ? '/pro/recipe' : '/home'))
          }
          {...(editableCustomProfile !== null
            ? { onEditCustom: () => setMode('edit_custom') }
            : {})}
        />
        )}
        {/* Produkcja v3 §3 — Maszyna is the ONE place of the default machine and batch. The
            card states what a save here changes (GEL-P0-022 precedence, unchanged), and the
            row leads to the rest of the new-recipe settings, which stay in the account. */}
        <section
          className="mt-5 rounded-2xl border border-ink/12 bg-white p-4 sm:p-5"
          aria-labelledby="machine-default-scope"
          data-testid="machine-default-scope"
        >
          <h2 id="machine-default-scope" className="text-[15px] font-semibold text-ink">
            {areaCopy.machine.defaultsCard.title}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-stone-600">
            {areaCopy.machine.defaultsCard.lead}
          </p>
          <dl className="mt-3">
            {areaCopy.machine.defaultsCard.rows.map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 border-t border-ink/10 py-2 first:border-t-0"
              >
                <dt className="text-[12.5px] text-stone-600">{label}</dt>
                <dd className="text-right text-[12.5px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <Link
          to="/account?section=recipe"
          onClick={(event) => {
            event.preventDefault();
            requestLeave(() => void navigate('/account?section=recipe'));
          }}
          className="pro-focus-ring mt-5 flex min-h-12 items-center justify-between gap-4 border-y border-ink/10 text-[14px] text-ink"
          data-testid="machine-recipe-defaults-link"
        >
          <span>{areaCopy.machine.recipeDefaultsLink}</span>
          <span className="text-stone-500">
            {areaCopy.machine.recipeDefaultsLinkHint} <span aria-hidden>›</span>
          </span>
        </Link>
        <p className="mt-2 text-[12px] leading-relaxed text-stone-600">
          {areaCopy.machine.recipeDefaultsNote}
        </p>
      </div>
    </>,
    saveMachineSettings ? (
      <button
        type="button"
        // The heading action ignores the result: the card shows its own status line.
        onClick={() => void saveMachineSettings()}
        className={buttonClasses('primary', 'sm')}
        data-testid="machine-settings-save"
      >
        {machineOnboardingCopy.settings.save}
      </button>
    ) : undefined,
  );
}
