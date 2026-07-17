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
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CustomerSurface } from '@/features/customer-shell/ui/CustomerSurface';
import { CustomerMenu } from '@/features/customer-shell/ui/CustomerMenu';
import { TouchButton } from '@/features/customer-shell/ui/TouchButton';
import {
  MachineOnboarding,
  MachineProfileSection,
  buildMachineContextView,
  buildMachineSettingsView,
  localStorageMachinePreferenceStore,
  machineOnboardingCopy,
  resolvePreferenceProfile,
  useMachinePreference,
  withCustomContainer,
  withUserDefaultBatch,
  type MachineOnboardingCompletion,
  type MachineSettingsSubmit,
} from '@/features/machine-onboarding';
import { selectMachinePreferenceStore } from '@/services/machinePreference/machinePreferenceSelector';

type PageMode = 'view' | 'onboarding' | 'edit_custom';

export function MachineProfilePage() {
  const navigate = useNavigate();
  const store = useMemo(
    () => selectMachinePreferenceStore({ localDevice: () => localStorageMachinePreferenceStore() }).store,
    [],
  );
  const preference = useMachinePreference(store);
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

  if (preference.status === 'loading') {
    return (
      <CustomerSurface>
        <CustomerMenu />
      </CustomerSurface>
    );
  }

  if (mode === 'onboarding' || mode === 'edit_custom') {
    return (
      <CustomerSurface>
        {/* Owner hotfix §2: the global menu belongs on EVERY customer route —
            this page used to be a lone white sheet with no way back. */}
        <CustomerMenu />
        <div className="py-8">
          <MachineOnboarding
            onComplete={(completion) => void handleComplete(completion)}
            submitLabel={machineOnboardingCopy.settings.saveAndGoToRecipe}
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
      </CustomerSurface>
    );
  }

  return (
    <CustomerSurface>
      <CustomerMenu />
      <div className="py-8">
        {defaultChangedName !== null ? (
          <p role="status" className="mb-4 rounded-xl border border-status-ideal/40 bg-status-ideal/10 px-4 py-3 text-[13px] text-stone-700">
            ✓ {machineOnboardingCopy.recipeMachine.defaultChanged(defaultChangedName)}
          </p>
        ) : null}
        <MachineProfileSection
          view={settingsView}
          onSetUp={() => setMode('onboarding')}
          onChange={() => {
            setDefaultChangedName(null);
            setMode('onboarding');
          }}
          onSave={handleSave}
          onGoToRecipe={() => void navigate('/start')}
          {...(editableCustomProfile !== null ? { onEditCustom: () => setMode('edit_custom') } : {})}
        />
      </div>
    </CustomerSurface>
  );
}
