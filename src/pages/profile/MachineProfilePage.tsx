/**
 * Profile → „Moja maszyna” (§8.6) — NOT ROUTED yet.
 *
 * The orchestrator adds the `/profile/machine` route (see
 * `src/features/machine-onboarding/INTEGRATION.md`); this page stays inert
 * until then. Light-native, self-contained.
 *
 * Store wiring (launch gate, mirroring pro-core): ONLY the device-local
 * adapter is wired here. The account-scoped backend adapter (services/
 * machinePreference) joins the selector AFTER the owner applies migration
 * 0030 — wiring it earlier would target a table that does not exist.
 */
import { useMemo, useState } from 'react';
import { CustomerSurface } from '@/features/customer-shell/ui/CustomerSurface';
import {
  MachineOnboarding,
  MachineProfileSection,
  buildMachineProfileSectionView,
  localStorageMachinePreferenceStore,
  resolvePreferenceProfile,
  useMachinePreference,
  type MachineOnboardingCompletion,
} from '@/features/machine-onboarding';
import { selectMachinePreferenceStore } from '@/services/machinePreference/machinePreferenceSelector';

type PageMode = 'view' | 'onboarding' | 'edit_custom';

export function MachineProfilePage() {
  const store = useMemo(
    () => selectMachinePreferenceStore({ localDevice: () => localStorageMachinePreferenceStore() }).store,
    [],
  );
  const preference = useMachinePreference(store);
  const [mode, setMode] = useState<PageMode>('view');

  const sectionView = useMemo(
    () => (preference.record !== null ? buildMachineProfileSectionView(preference.record) : null),
    [preference.record],
  );

  const editableCustomProfile = useMemo(() => {
    if (preference.record === null || preference.record.selection.kind !== 'custom') return null;
    return resolvePreferenceProfile(preference.record);
  }, [preference.record]);

  const handleComplete = async (completion: MachineOnboardingCompletion) => {
    await preference.save(completion.record);
    setMode('view');
  };

  if (preference.status === 'loading') {
    return <CustomerSurface>{null}</CustomerSurface>;
  }

  if (mode === 'onboarding' || mode === 'edit_custom') {
    return (
      <CustomerSurface>
        <div className="py-8">
          <MachineOnboarding
            onComplete={(completion) => void handleComplete(completion)}
            {...(mode === 'edit_custom' && editableCustomProfile !== null
              ? { editCustomProfile: editableCustomProfile }
              : {})}
          />
        </div>
      </CustomerSurface>
    );
  }

  return (
    <CustomerSurface>
      <div className="py-8">
        <MachineProfileSection
          view={sectionView}
          onSetUp={() => setMode('onboarding')}
          onChange={() => setMode('onboarding')}
          {...(editableCustomProfile !== null ? { onEditCustom: () => setMode('edit_custom') } : {})}
        />
      </div>
    </CustomerSurface>
  );
}
