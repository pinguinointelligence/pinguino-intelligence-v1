import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DialogShell } from '@/components/ui/DialogShell';
import { SectionLabel } from '@/components/shared/SectionLabel';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import {
  buildLabelPreflight,
  buildMasterLabelData,
  normalizeEnabledOptionalFields,
  type MasterLabelData,
} from './masterLabel';
import { printMasterLabel } from './masterLabelPrint';
import {
  MARKET_PROFILES,
  marketProfile,
  type MarketProfileCode,
  type MasterLabelFieldId,
} from './marketProfiles';
import { ConsumerLabelPreview } from './ConsumerLabelPreview';
import { lotCodeForDisplay } from './labelPresentation';
import {
  defaultAccountLabelProfile,
  resolveLabelRepository,
  type AccountLabelProfile,
  type LabelRepository,
  type RunLabelSnapshot,
} from '@/services/labels/labelRepository';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/cn';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';
import {
  PRINTER_PROFILES,
  normalizePrinterSettings,
  type LabelPrinterSettings,
  type PrinterProfileId,
} from './printerProfiles';
import { assessCanadaFop } from './regulatoryNutrition';

const MARKET_CODES: readonly MarketProfileCode[] = ['EU', 'US', 'CA', 'UK', 'AU_NZ', 'CUSTOM'];
export type LabelWorkspaceView = 'label' | 'settings';

const primaryText = (value: Record<string, string>, languages: readonly string[]): string =>
  languages.map((language) => value[language]).find((text) => text?.trim()) ?? '';

function profileFromLabel(
  profile: AccountLabelProfile,
  label: MasterLabelData,
): AccountLabelProfile {
  return {
    ...profile,
    market: label.market,
    uiLanguage: label.uiLanguage,
    labelLanguages: label.labelLanguages,
    businessName: label.businessName,
    logoPath: label.logoPath,
    enabledOptionalFields: label.enabledOptionalFields,
    facilityDefaults: label.operator,
    presentation: {
      format: label.format,
      widthMm: label.size.widthMm,
      heightMm: label.size.heightMm,
      copies: label.copies,
      printer: label.printer,
    },
  };
}

function labelFromProfile(
  snapshot: ProductionCompletionSnapshot,
  profile: AccountLabelProfile,
): MasterLabelData {
  return buildMasterLabelData({
    masterLabelId: `master-label:${snapshot.sessionId}`,
    snapshot,
    market: profile.market,
    uiLanguage: profile.uiLanguage,
    labelLanguages: profile.labelLanguages,
    facilityDefaults: profile.facilityDefaults,
    businessName: profile.businessName,
    logoPath: profile.logoPath,
    enabledOptionalFields: profile.enabledOptionalFields,
    presentation: {
      format: profile.presentation.format,
      size: {
        widthMm: profile.presentation.widthMm,
        heightMm: profile.presentation.heightMm,
      },
      copies: profile.presentation.copies,
    },
    printer: profile.presentation.printer,
  });
}

export function LabelWorkspace({
  snapshot: suppliedSnapshot = null,
  runId = null,
  profileOnly = false,
  repository: suppliedRepository,
  onSaved,
  initialView = 'label',
}: {
  snapshot?: ProductionCompletionSnapshot | null;
  runId?: string | null;
  profileOnly?: boolean;
  repository?: LabelRepository;
  onSaved?: (snapshot: RunLabelSnapshot) => void;
  initialView?: LabelWorkspaceView;
}) {
  const repository = useMemo(
    () => suppliedRepository ?? resolveLabelRepository(),
    [suppliedRepository],
  );
  const authOwnerId = useAuthStore((state) => state.user?.id ?? null);
  const [profile, setProfile] = useState<AccountLabelProfile | null>(null);
  const [profileWasPersisted, setProfileWasPersisted] = useState(false);
  const [snapshot, setSnapshot] = useState<ProductionCompletionSnapshot | null>(suppliedSnapshot);
  const [saved, setSaved] = useState<RunLabelSnapshot | null>(null);
  const [label, setLabel] = useState<MasterLabelData | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [activeView, setActiveView] = useState<LabelWorkspaceView>(initialView);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'back'>(
    initialView === 'settings' ? 'forward' : 'back',
  );
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedLogo, setResolvedLogo] = useState<{
    path: string;
    url: string | null;
  } | null>(null);
  const requestedRunId = suppliedSnapshot?.sessionId ?? runId;
  const visibleView: LabelWorkspaceView = saved ? 'label' : activeView;

  const openView = (next: LabelWorkspaceView) => {
    if (next === visibleView || (next === 'settings' && saved)) return;
    setTransitionDirection(next === 'settings' ? 'forward' : 'back');
    setActiveView(next);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setBusy(true);
      setError(null);
      try {
        const existingProfile = await repository.getAccountProfile();
        const ownerId =
          existingProfile?.ownerUserId ??
          suppliedSnapshot?.ownerUserId ??
          authOwnerId ??
          'owner-review-local';
        const nextProfile = existingProfile ?? defaultAccountLabelProfile(ownerId);
        let nextSnapshot = suppliedSnapshot;
        let nextSaved: RunLabelSnapshot | null = null;
        if (!profileOnly && requestedRunId) {
          nextSnapshot = nextSnapshot ?? (await repository.getCompletedSnapshot(requestedRunId));
          nextSaved = await repository.getRunLabelSnapshot(requestedRunId);
          if (nextSnapshot) await repository.freezeCompletedSnapshot(nextSnapshot);
        }
        if (cancelled) return;
        setProfile(nextProfile);
        setProfileWasPersisted(Boolean(existingProfile));
        setSnapshot(nextSnapshot ?? null);
        setSaved(nextSaved);
        setLabel(
          nextSaved?.label ?? (nextSnapshot ? labelFromProfile(nextSnapshot, nextProfile) : null),
        );
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Nie udało się odczytać etykiety.');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authOwnerId, profileOnly, repository, requestedRunId, suppliedSnapshot]);

  const activeLogoPath = label?.logoPath ?? profile?.logoPath ?? null;
  const logoUrl = activeLogoPath && resolvedLogo?.path === activeLogoPath ? resolvedLogo.url : null;
  useEffect(() => {
    let cancelled = false;
    if (!activeLogoPath) return;
    void repository
      .createLogoSignedUrl(activeLogoPath)
      .then((url) => {
        if (!cancelled) setResolvedLogo({ path: activeLogoPath, url });
      })
      .catch(() => {
        if (!cancelled) setResolvedLogo({ path: activeLogoPath, url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [activeLogoPath, repository]);

  const preflight = useMemo(() => (label ? buildLabelPreflight(label) : null), [label]);
  const profileMarket = profile ? marketProfile(profile.market) : null;

  const persistProfile = async (next: AccountLabelProfile) => {
    const persisted = await repository.saveAccountProfile(next);
    setProfile(persisted);
    setProfileWasPersisted(true);
    return persisted;
  };

  const saveRunSnapshot = async () => {
    if (!label || !profile || !snapshot || saved) return;
    setBusy(true);
    setError(null);
    try {
      if (!profileWasPersisted) await persistProfile(profile);
      const frozen = await repository.saveRunLabelSnapshot(label);
      setSaved(frozen);
      setLabel(frozen.label);
      onSaved?.(frozen);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie zapisano etykiety.');
    } finally {
      setBusy(false);
    }
  };

  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('input, select, textarea, button, label, [role="spinbutton"]')
    ) {
      swipeStart.current = null;
      return;
    }
    const touch = event.touches[0];
    swipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    const touch = event.changedTouches[0];
    swipeStart.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 56 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
    if (deltaX < 0) openView('settings');
    else openView('label');
  };

  if (busy && !profile) {
    return <p className="py-8 text-sm text-stone-500">Odczytuję profil i snapshot etykiety…</p>;
  }

  if (!profile) {
    return (
      <WorkflowNotice
        eyebrow="Etykieta"
        title="Profil etykiety jest niedostępny"
        description={error ?? 'Spróbuj ponownie za chwilę.'}
        variant="blocking"
        role="alert"
      />
    );
  }

  if (profileOnly) {
    return (
      <div data-testid="label-workspace" data-workspace-mode="profile">
        <Card className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <SectionLabel>Account Label Profile</SectionLabel>
            <div className="mt-5 flex items-center gap-4">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo profilu etykiet" className="size-16 object-contain" />
              ) : (
                <div className="grid size-16 place-items-center border border-ink/10 text-xs text-stone-400">
                  Logo
                </div>
              )}
              <div>
                <h2 className="text-xl font-semibold text-ink">
                  {profile.businessName || 'Nazwa firmy nieuzupełniona'}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {profileMarket?.label} · {profile.labelLanguages.join(', ').toUpperCase()}
                </p>
              </div>
            </div>
          </div>
          <Button onClick={() => setEditing(true)}>Edytuj</Button>
        </Card>
        {error ? <p className="mt-3 text-sm text-status-error">{error}</p> : null}
        {editing ? (
          <ProfileEditor
            profile={profile}
            logoUrl={logoUrl}
            repository={repository}
            onClose={() => setEditing(false)}
            onSave={async (next) => {
              setBusy(true);
              setError(null);
              try {
                await persistProfile(next);
                setEditing(false);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'Nie zapisano profilu.');
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : null}
      </div>
    );
  }

  if (!snapshot || !label) {
    return (
      <WorkflowNotice
        className="my-3"
        eyebrow="Etykieta"
        title="Brak zakończonej partii"
        description="Najpierw zakończ Produkcję. Etykieta powstaje z zatwierdzonego wyniku partii."
        variant="neutral"
        testId="label-workspace-empty"
      />
    );
  }

  const productName = primaryText(label.productName, label.labelLanguages);
  const costs = snapshot.finalProduct.costs;
  const activeMarket = marketProfile(label.market);
  const unresolved = preflight?.items.filter((item) => item.status !== 'ready') ?? [];
  const printBlockedReason = unresolved[0]?.message ?? activeMarket.rendererLimitation;
  const percentages = snapshot.finalResult.percentages;

  return (
    <div
      className="relative min-w-0 overflow-x-hidden text-ink touch-pan-y"
      data-testid="label-workspace"
      data-workspace-mode="run"
      data-active-label-view={visibleView}
      data-run-id={snapshot.sessionId}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        key={visibleView}
        className={cn(
          'space-y-4 p-3 sm:p-4 motion-safe:animate-[labelWorkspaceInFromRight_240ms_cubic-bezier(0.32,0.72,0,1)]',
          transitionDirection === 'back' &&
            'motion-safe:animate-[labelWorkspaceInFromLeft_240ms_cubic-bezier(0.32,0.72,0,1)]',
        )}
      >
        {visibleView === 'label' ? (
          <>
            <Card padding="none" className="overflow-hidden rounded-[22px]">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 p-4 sm:p-5">
                <div>
                  <SectionLabel>Etykieta produktu</SectionLabel>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-ink">{productName}</h2>
                    <span
                      className="rounded-full border border-ink/10 bg-stone-50 px-2.5 py-1 text-xs font-semibold"
                      data-testid="active-label-market"
                    >
                      {activeMarket.flag} {activeMarket.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    Profil rynku steruje wymaganymi polami i wydrukiem.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openView('settings')}
                    disabled={Boolean(saved)}
                  >
                    {saved ? 'Snapshot zapisany' : 'Ustawienia'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => printMasterLabel(label, logoUrl, { draft: true })}
                  >
                    Drukuj podgląd roboczy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => printMasterLabel(label, null, { calibration: true })}
                  >
                    Druk testowy
                  </Button>
                  <Button
                    size="sm"
                    disabled={!preflight?.readyForSystemPrint}
                    onClick={() => printMasterLabel(label, logoUrl)}
                  >
                    PDF / druk systemowy
                  </Button>
                </div>
              </header>
              <div className="border-b border-ink/10 bg-[#f7f5f0] px-4 py-3" role="status">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    className={
                      preflight?.readyForSystemPrint ? 'text-status-success' : 'text-stone-700'
                    }
                  >
                    {preflight?.readyForSystemPrint
                      ? '✓ Gotowa do druku'
                      : `Wydruk zablokowany · ${unresolved.length} pozycji do rozwiązania`}
                  </span>
                  {!preflight?.readyForSystemPrint ? (
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-4"
                      onClick={() => openView('settings')}
                      disabled={Boolean(saved)}
                    >
                      {printBlockedReason}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="border-b border-ink/10 bg-white px-4 py-3 text-[11px] text-stone-600">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <strong className="text-ink">
                    {label.size.widthMm} × {label.size.heightMm} mm
                  </strong>
                  <span>
                    {PRINTER_PROFILES[label.printer.profileId].manufacturer}{' '}
                    {PRINTER_PROFILES[label.printer.profileId].model}
                  </span>
                  <span>{label.printer.dpi} dpi</span>
                  <span>{label.printer.copies} kopii</span>
                  <span>x-height profilu ≥ {activeMarket.minimumLabel.xHeightMm} mm</span>
                </div>
                <p className="mt-1 text-stone-500">
                  Podgląd używa wybranych jednostek mm; PDF/system print korzysta z tej samej
                  geometrii. Zapis do PDF jest dostępny w natywnym oknie drukowania.
                </p>
              </div>
              <div className="overflow-x-auto p-4 sm:p-6" data-testid="consumer-print-boundary">
                <ConsumerLabelPreview label={label} logoUrl={logoUrl} />
              </div>
            </Card>

            <section className="grid gap-3 md:grid-cols-2" data-testid="label-internal-overview">
              <OverviewCard title="Koszt">
                <dl className="space-y-2 text-xs">
                  <OverviewMetric label="Cała partia" value={costs?.total_cost} unit="€" />
                  <OverviewMetric label="1 kg" value={costs?.cost_per_kg} unit="€" />
                  <OverviewMetric
                    label="Porcja 60 g"
                    value={costs?.cost_per_serving_60g}
                    unit="€"
                  />
                </dl>
                <p className="mt-3 text-[11px] text-stone-500">Dane wewnętrzne · poza wydrukiem.</p>
              </OverviewCard>
              <OverviewCard title="Baza techniczna">
                <dl className="space-y-2 text-xs">
                  <OverviewMetric label="Woda" value={percentages.water_percent} unit="%" />
                  <OverviewMetric label="Ciała stałe" value={percentages.solids_percent} unit="%" />
                  <OverviewMetric label="Tłuszcz" value={percentages.fat_percent} unit="%" />
                  <OverviewMetric label="Białko" value={percentages.protein_percent} unit="%" />
                </dl>
              </OverviewCard>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-ink/10 bg-white px-4 py-3">
              <p className="text-xs text-stone-600">
                {saved
                  ? `Niezmienny snapshot etykiety · ${new Date(saved.createdAt).toLocaleString('pl-PL')}`
                  : 'Finalny zapis zamraża rynek, treść, LOT i logo dla tej partii.'}
              </p>
              {saved ? null : (
                <Button
                  size="sm"
                  onClick={() => void saveRunSnapshot()}
                  disabled={busy || !preflight?.readyForSystemPrint}
                >
                  {busy ? 'Zapisywanie…' : 'Zapisz finalną etykietę'}
                </Button>
              )}
            </div>
          </>
        ) : (
          <RunLabelEditor
            label={label}
            logoUrl={logoUrl}
            repository={repository}
            saveAsDefault={saveAsDefault}
            onSaveAsDefaultChange={setSaveAsDefault}
            onClose={() => openView('label')}
            onSave={async (next) => {
              setBusy(true);
              setError(null);
              try {
                if (saveAsDefault) await persistProfile(profileFromLabel(profile, next));
                setLabel(next);
                openView('label');
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'Nie zapisano zmian etykiety.');
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
        {error ? (
          <p className="text-sm text-status-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <nav
        aria-label="Widoki workspace etykiety"
        className="sticky bottom-[var(--label-workspace-bottom-inset,0px)] z-20 flex min-h-11 items-center justify-center gap-2 border-t border-ink/8 bg-white/95 px-4 backdrop-blur"
        data-testid="label-workspace-dots"
      >
        {(['label', 'settings'] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-label={view === 'label' ? 'Pokaż etykietę' : 'Pokaż ustawienia etykiety'}
            aria-current={visibleView === view ? 'step' : undefined}
            disabled={view === 'settings' && Boolean(saved)}
            onClick={() => openView(view)}
            className={cn(
              'pro-focus-ring grid size-8 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-35',
            )}
            data-testid={`label-workspace-dot-${view}`}
          >
            <span
              aria-hidden
              className={cn(
                'block size-1.5 rounded-full border border-ink/35 transition-[width,background-color,border-color]',
                visibleView === view && 'w-4 border-[#b58b32] bg-[#b58b32]',
              )}
            />
          </button>
        ))}
      </nav>
      <style>{`
        @keyframes labelWorkspaceInFromRight { from { opacity: .55; transform: translateX(22px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes labelWorkspaceInFromLeft { from { opacity: .55; transform: translateX(-22px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}

function OverviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="min-w-0 rounded-[18px] border border-ink/10 bg-white p-4 shadow-pro-e0">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </article>
  );
}

function OverviewMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-600">{label}</dt>
      <dd className="font-mono tabular-nums">
        {value == null ? '—' : `${value.toFixed(2)} ${unit}`}
      </dd>
    </div>
  );
}

function ProfileEditor({
  profile,
  logoUrl,
  repository,
  onClose,
  onSave,
}: {
  profile: AccountLabelProfile;
  logoUrl: string | null;
  repository: LabelRepository;
  onClose: () => void;
  onSave: (profile: AccountLabelProfile) => Promise<void>;
}) {
  const [draft, setDraft] = useState(profile);
  const [uploading, setUploading] = useState(false);
  return (
    <DialogShell
      label="Edytuj domyślny profil etykiet"
      testId="label-profile-editor"
      placement="responsive"
      onClose={onClose}
      panelClassName="p-5 sm:w-[min(680px,94vw)]"
    >
      <EditorHeader title="Domyślny profil etykiet" onClose={onClose} />
      <MarketAndIdentityFields
        market={draft.market}
        languages={draft.labelLanguages}
        businessName={draft.businessName}
        operatorName={draft.facilityDefaults.operatorName}
        address={draft.facilityDefaults.address}
        logoUrl={logoUrl}
        uploading={uploading}
        onMarket={(market) =>
          setDraft({
            ...draft,
            market,
            enabledOptionalFields: normalizeEnabledOptionalFields(
              market,
              draft.enabledOptionalFields,
            ),
          })
        }
        onLanguages={(labelLanguages) => setDraft({ ...draft, labelLanguages })}
        onBusinessName={(businessName) => setDraft({ ...draft, businessName })}
        onOperatorName={(operatorName) =>
          setDraft({ ...draft, facilityDefaults: { ...draft.facilityDefaults, operatorName } })
        }
        onAddress={(address) =>
          setDraft({ ...draft, facilityDefaults: { ...draft.facilityDefaults, address } })
        }
        onLogo={async (file) => {
          setUploading(true);
          try {
            const logoPath = await repository.uploadLogo(file);
            setDraft((current) => ({ ...current, logoPath }));
          } finally {
            setUploading(false);
          }
        }}
      />
      <OptionalFieldSettings
        market={draft.market}
        enabled={draft.enabledOptionalFields}
        onChange={(enabledOptionalFields) => setDraft({ ...draft, enabledOptionalFields })}
      />
      <PresentationFields
        format={draft.presentation.format}
        widthMm={draft.presentation.widthMm}
        heightMm={draft.presentation.heightMm}
        copies={draft.presentation.copies}
        onChange={(presentation) =>
          setDraft({
            ...draft,
            presentation: {
              ...presentation,
              printer: normalizePrinterSettings({
                ...draft.presentation.printer,
                widthMm: presentation.widthMm,
                heightMm: presentation.heightMm,
                copies: presentation.copies,
              }),
            },
          })
        }
      />
      <PrinterSettingsFields
        value={draft.presentation.printer}
        onChange={(printer) =>
          setDraft({
            ...draft,
            presentation: {
              ...draft.presentation,
              widthMm: printer.widthMm,
              heightMm: printer.heightMm,
              copies: printer.copies,
              printer,
            },
          })
        }
      />
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          Anuluj
        </Button>
        <Button onClick={() => void onSave(draft)}>Zapisz profil</Button>
      </div>
    </DialogShell>
  );
}

function RunLabelEditor({
  label,
  logoUrl,
  repository,
  saveAsDefault,
  onSaveAsDefaultChange,
  onClose,
  onSave,
}: {
  label: MasterLabelData;
  logoUrl: string | null;
  repository: LabelRepository;
  saveAsDefault: boolean;
  onSaveAsDefaultChange: (value: boolean) => void;
  onClose: () => void;
  onSave: (label: MasterLabelData) => Promise<void>;
}) {
  const [draft, setDraft] = useState(label);
  const [uploading, setUploading] = useState(false);
  const primaryLanguage = draft.labelLanguages[0] ?? 'pl';
  const draftPreflight = useMemo(() => buildLabelPreflight(draft), [draft]);
  const missingFields = useMemo(
    () =>
      new Set(
        draftPreflight.items.filter((item) => item.status === 'missing').map((item) => item.field),
      ),
    [draftPreflight],
  );
  const missing = (field: MasterLabelFieldId) => missingFields.has(field);
  const fieldClass = (field: MasterLabelFieldId, empty = true) =>
    cn(
      SETTINGS_INPUT_CLASS,
      missing(field) &&
        empty &&
        'border-[#a96832] bg-[#fffaf4] ring-1 ring-[#a96832]/15 focus:border-[#8a5b23]',
    );
  const updateText = (
    field: 'productName' | 'legalProductName' | 'storageInstructions' | 'origin' | 'customerNote',
    language: string,
    value: string,
  ) => setDraft({ ...draft, [field]: { ...draft[field], [language]: value } });
  return (
    <Card
      padding="none"
      className="overflow-hidden rounded-[18px] border-ink/10 shadow-pro-e0"
      data-testid="label-settings-view"
    >
      <header className="border-b border-ink/10 bg-[#fffdf8] px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          className="pro-focus-ring -ml-1 min-h-11 px-1 text-xs font-semibold text-stone-600 transition-colors hover:text-ink"
        >
          ← Etykieta
        </button>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel>Ustawienia etykiety</SectionLabel>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
              Profil i dane bieżącej etykiety
            </h2>
          </div>
          <span className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-xs font-semibold text-ink">
            {marketProfile(draft.market).flag} {marketProfile(draft.market).label}
          </span>
        </div>
        <div
          className={cn(
            'mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-3 py-3',
            draftPreflight.missingCount > 0
              ? 'border-[#d8bb8d] bg-[#fbf8f1]'
              : 'border-status-ideal/25 bg-status-ideal/[0.06]',
          )}
          data-testid="label-settings-missing-count"
          role="status"
          aria-live="polite"
        >
          <div>
            <strong className="block text-sm text-ink">
              {draftPreflight.missingCount > 0
                ? `Brakuje ${draftPreflight.missingCount} wymaganych informacji`
                : 'Wszystkie wymagane informacje są uzupełnione'}
            </strong>
            <span className="mt-0.5 block text-xs text-stone-600">
              {draftPreflight.missingCount > 0
                ? 'Uzupełnij oznaczone pola, aby odblokować druk.'
                : 'Pozostają istniejące kontrole profilu prawnego i przeglądu.'}
            </span>
          </div>
          {draftPreflight.missingCount > 0 ? (
            <button
              type="button"
              className="pro-focus-ring min-h-11 px-2 text-xs font-semibold text-[#8a5b23] underline underline-offset-4"
              onClick={(event) => {
                const root = event.currentTarget.closest('[data-testid="label-settings-view"]');
                const control = root?.querySelector<HTMLElement>(
                  '[data-missing-required="true"] input, [data-missing-required="true"] select, [data-missing-required="true"] button',
                );
                control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                control?.focus();
              }}
            >
              Pokaż brakujące
            </button>
          ) : null}
        </div>
      </header>

      <div className="px-4 sm:px-5">
        <SettingsSection title="Rynek i język">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-stone-600">
              Cel etykiety
              <select
                value={draft.purpose}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    purpose: event.currentTarget.value as MasterLabelData['purpose'],
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="retail_consumer">Retail / konsumencka</option>
                <option value="internal_production">Wewnętrzna produkcyjna</option>
                <option value="display_gelateria">Ekspozycja / gelateria</option>
              </select>
            </label>
            <label className="text-xs font-medium text-stone-600">
              Sposób sprzedaży
              <select
                value={draft.packagingContext}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    packagingContext: event.currentTarget
                      .value as MasterLabelData['packagingContext'],
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="prepacked">Prepacked</option>
                <option value="ppds">PPDS / pakowane w miejscu sprzedaży</option>
                <option value="loose_non_prepacked">Loose / nieopakowane</option>
              </select>
            </label>
          </div>
          <div>
            <span className="text-xs font-medium text-stone-600">Jurysdykcja / profil</span>
            <div className="mt-2 grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3">
              {MARKET_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={cn(
                    'pro-focus-ring min-h-11 rounded-[10px] border px-2 text-xs font-semibold transition-colors',
                    draft.market === code
                      ? 'border-ink bg-ink text-white'
                      : 'border-ink/12 bg-white text-ink hover:bg-stone-50',
                  )}
                  data-market-active={draft.market === code ? 'true' : undefined}
                  disabled={!MARKET_PROFILES[code].selectable}
                  title={
                    MARKET_PROFILES[code].selectable
                      ? MARKET_PROFILES[code].jurisdiction
                      : 'RESEARCH / NOT AVAILABLE'
                  }
                  onClick={() => {
                    const nextProfile = MARKET_PROFILES[code];
                    const labelLanguages = [
                      ...new Set([...nextProfile.requiredLanguages, ...draft.labelLanguages]),
                    ];
                    const widthMm = Math.max(draft.size.widthMm, nextProfile.minimumLabel.widthMm);
                    const heightMm = Math.max(
                      draft.size.heightMm,
                      nextProfile.minimumLabel.heightMm,
                    );
                    setDraft({
                      ...draft,
                      market: code,
                      marketProfileVersion: nextProfile.version,
                      labelLanguages,
                      size: { widthMm, heightMm },
                      printer: normalizePrinterSettings({
                        ...draft.printer,
                        widthMm,
                        heightMm,
                      }),
                      enabledOptionalFields: normalizeEnabledOptionalFields(
                        code,
                        draft.enabledOptionalFields,
                      ),
                      regulatoryReview: {
                        translations: false,
                        ingredientOrderAndQuid: false,
                        marketSpecific: false,
                      },
                    });
                  }}
                >
                  {MARKET_PROFILES[code].label}
                  {!MARKET_PROFILES[code].selectable ? ' · research' : ''}
                </button>
              ))}
            </div>
          </div>
          <label className="mt-3 block text-xs font-medium text-stone-600">
            Języki · po przecinku
            <input
              value={draft.labelLanguages.join(', ')}
              onChange={(event) => {
                const parsed = event.currentTarget.value
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean);
                setDraft({ ...draft, labelLanguages: parsed.length > 0 ? parsed : ['pl'] });
              }}
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
        </SettingsSection>

        <SettingsSection title="Firma">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-stone-600">
              Marka / nazwa firmy
              <input
                value={draft.businessName}
                onChange={(event) =>
                  setDraft({ ...draft, businessName: event.currentTarget.value })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
            <RequiredSettingsField field="operator" missing={missing('operator')}>
              <div className="grid gap-3">
                <label className="text-xs font-medium text-stone-600">
                  Operator
                  <input
                    value={draft.operator.operatorName}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        operator: { ...draft.operator, operatorName: event.currentTarget.value },
                      })
                    }
                    className={fieldClass('operator', !draft.operator.operatorName.trim())}
                  />
                </label>
                <label className="text-xs font-medium text-stone-600">
                  Adres operatora
                  <input
                    value={draft.operator.address}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        operator: { ...draft.operator, address: event.currentTarget.value },
                      })
                    }
                    className={fieldClass('operator', !draft.operator.address.trim())}
                  />
                </label>
              </div>
            </RequiredSettingsField>
          </div>
          <label className="mt-3 flex min-h-14 items-center gap-3 rounded-[12px] border border-ink/10 bg-[#fffdf8] p-3 text-xs text-stone-600">
            {logoUrl ? (
              <img src={logoUrl} alt="Aktualne logo" className="size-12 object-contain" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-[10px] border border-ink/10 bg-white text-[10px] text-stone-400">
                Logo
              </span>
            )}
            <span className="min-w-0 flex-1">PNG, JPEG, WebP lub SVG · maks. 5 MB</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={uploading}
              className="max-w-32 text-xs"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                setUploading(true);
                void repository
                  .uploadLogo(file)
                  .then((logoPath) => setDraft((current) => ({ ...current, logoPath })))
                  .finally(() => setUploading(false));
              }}
            />
          </label>
        </SettingsSection>

        <SettingsSection title="Produkt">
          <div className="grid gap-3 sm:grid-cols-2">
            <RequiredSettingsField field="product_name" missing={missing('product_name')}>
              <div className="grid gap-3">
                {draft.labelLanguages.map((language) => (
                  <label key={`name:${language}`} className="text-xs font-medium text-stone-600">
                    Nazwa produktu · {language.toUpperCase()}
                    <input
                      value={draft.productName[language] ?? ''}
                      onChange={(event) =>
                        updateText('productName', language, event.currentTarget.value)
                      }
                      className={fieldClass(
                        'product_name',
                        !(draft.productName[language] ?? '').trim(),
                      )}
                    />
                  </label>
                ))}
              </div>
            </RequiredSettingsField>
            <RequiredSettingsField
              field="legal_product_name"
              missing={missing('legal_product_name')}
            >
              <div className="grid gap-3">
                {draft.labelLanguages.map((language) => (
                  <label key={`legal:${language}`} className="text-xs font-medium text-stone-600">
                    <span className="flex items-center justify-between gap-2">
                      <span>Nazwa prawna · {language.toUpperCase()}</span>
                      {missing('legal_product_name') ? <RequiredBadge /> : null}
                    </span>
                    <input
                      value={draft.legalProductName[language] ?? ''}
                      onChange={(event) =>
                        updateText('legalProductName', language, event.currentTarget.value)
                      }
                      className={fieldClass(
                        'legal_product_name',
                        !(draft.legalProductName[language] ?? '').trim(),
                      )}
                    />
                  </label>
                ))}
              </div>
            </RequiredSettingsField>
            <RequiredSettingsField field="net_quantity" missing={missing('net_quantity')}>
              <label className="text-xs font-medium text-stone-600">
                Masa netto · g
                <input
                  type="number"
                  min={0}
                  value={draft.netQuantityG ?? ''}
                  onChange={(event) =>
                    setDraft({ ...draft, netQuantityG: Number(event.currentTarget.value) || null })
                  }
                  className={cn(
                    fieldClass('net_quantity', !draft.netQuantityG),
                    'font-mono tabular-nums',
                  )}
                />
              </label>
            </RequiredSettingsField>
          </div>
        </SettingsSection>

        {draft.purpose === 'retail_consumer' && ['US', 'CA', 'AU_NZ'].includes(draft.market) ? (
          <RegulatoryNutritionFields
            value={draft}
            missing={draftPreflight.items.some(
              (item) => item.field === 'market_nutrition' && item.status !== 'ready',
            )}
            onChange={setDraft}
          />
        ) : null}

        <SettingsSection title="Daty i identyfikacja">
          <div className="grid gap-3 sm:grid-cols-2">
            <RequiredSettingsField field="lot" missing={missing('lot')}>
              <div className="text-xs font-medium text-stone-600">
                LOT · nadawany automatycznie
                <output
                  className={cn(
                    SETTINGS_INPUT_CLASS,
                    'flex items-center bg-stone-50 font-mono tabular-nums',
                  )}
                >
                  {lotCodeForDisplay(draft.lotCode)}
                </output>
              </div>
            </RequiredSettingsField>
            <label className="text-xs font-medium text-stone-600">
              Data produkcji
              <input
                type="date"
                value={draft.productionDate}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    productionDate: event.currentTarget.value,
                    productionDateReviewed: true,
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
            <RequiredSettingsField field="date_mark" missing={missing('date_mark')}>
              <label className="text-xs font-medium text-stone-600">
                <span className="flex items-center justify-between gap-2">
                  <span>Najlepiej spożyć przed</span>
                  {missing('date_mark') ? <RequiredBadge /> : null}
                </span>
                <input
                  type="date"
                  value={draft.dateMark.date ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      dateMark: {
                        kind: 'best_before',
                        date: event.currentTarget.value || null,
                        basis: 'manual',
                        reviewedByUser: Boolean(event.currentTarget.value),
                      },
                    })
                  }
                  className={fieldClass('date_mark', !draft.dateMark.date)}
                />
              </label>
            </RequiredSettingsField>
          </div>
        </SettingsSection>

        <SettingsSection title="Informacje dodatkowe">
          <RequiredSettingsField field="storage" missing={missing('storage')}>
            <label className="text-xs font-medium text-stone-600">
              <span className="flex items-center justify-between gap-2">
                <span>Przechowywanie · {primaryLanguage.toUpperCase()}</span>
                {missing('storage') ? <RequiredBadge /> : null}
              </span>
              <input
                value={draft.storageInstructions[primaryLanguage] ?? ''}
                onChange={(event) =>
                  updateText('storageInstructions', primaryLanguage, event.currentTarget.value)
                }
                className={fieldClass(
                  'storage',
                  !(draft.storageInstructions[primaryLanguage] ?? '').trim(),
                )}
              />
            </label>
          </RequiredSettingsField>
          <OptionalFieldSettings
            market={draft.market}
            enabled={draft.enabledOptionalFields}
            onChange={(enabledOptionalFields) => setDraft({ ...draft, enabledOptionalFields })}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {draft.enabledOptionalFields.includes('origin') ? (
              <label className="text-xs font-medium text-stone-600">
                Pochodzenie
                <input
                  value={draft.origin[primaryLanguage] ?? ''}
                  onChange={(event) =>
                    updateText('origin', primaryLanguage, event.currentTarget.value)
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
            {draft.enabledOptionalFields.includes('customer_note') ? (
              <label className="text-xs font-medium text-stone-600">
                Nota dla klienta
                <input
                  value={draft.customerNote[primaryLanguage] ?? ''}
                  onChange={(event) =>
                    updateText('customerNote', primaryLanguage, event.currentTarget.value)
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection title="Format">
          <PresentationFields
            format={draft.format}
            widthMm={draft.size.widthMm}
            heightMm={draft.size.heightMm}
            copies={draft.copies}
            onChange={(presentation) =>
              setDraft({
                ...draft,
                format: presentation.format,
                size: { widthMm: presentation.widthMm, heightMm: presentation.heightMm },
                copies: presentation.copies,
                printer: normalizePrinterSettings({
                  ...draft.printer,
                  widthMm: presentation.widthMm,
                  heightMm: presentation.heightMm,
                  copies: presentation.copies,
                }),
              })
            }
          />
          <PrinterSettingsFields
            value={draft.printer}
            onChange={(printer) =>
              setDraft({
                ...draft,
                printer,
                size: { widthMm: printer.widthMm, heightMm: printer.heightMm },
                copies: printer.copies,
              })
            }
          />
        </SettingsSection>

        <SettingsSection title="Weryfikacja">
          <div className="grid gap-2">
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-ink/10 bg-white px-3 text-xs text-ink">
              <input
                type="checkbox"
                className="size-5 accent-ink"
                checked={draft.regulatoryReview.translations}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    regulatoryReview: {
                      ...draft.regulatoryReview,
                      translations: event.currentTarget.checked,
                    },
                  })
                }
              />
              Potwierdzam kompletność tłumaczeń w wymaganych językach.
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-ink/10 bg-white px-3 text-xs text-ink">
              <input
                type="checkbox"
                className="size-5 accent-ink"
                checked={draft.regulatoryReview.ingredientOrderAndQuid}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    regulatoryReview: {
                      ...draft.regulatoryReview,
                      ingredientOrderAndQuid: event.currentTarget.checked,
                    },
                  })
                }
              />
              Potwierdzam kolejność składników i przegląd QUID.
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-ink/10 bg-white px-3 text-xs text-ink">
              <input
                type="checkbox"
                className="size-5 accent-ink"
                checked={draft.regulatoryReview.marketSpecific}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    regulatoryReview: {
                      ...draft.regulatoryReview,
                      marketSpecific: event.currentTarget.checked,
                    },
                  })
                }
              />
              Potwierdzam kontekst sprzedaży i wymagania szczególne rynku.
            </label>
            <RequiredSettingsField field="ingredients" missing={missing('ingredients')}>
              <ReviewLine
                label="Składniki"
                ready={!missing('ingredients')}
                message={
                  missing('ingredients')
                    ? 'Brakuje składników lub canonical ID w danych bieżącej partii.'
                    : 'Dane składników pochodzą z finalnego ACTUAL snapshotu.'
                }
              />
            </RequiredSettingsField>
            <RequiredSettingsField field="nutrition" missing={missing('nutrition')}>
              <ReviewLine
                label="Wartości odżywcze"
                ready={!missing('nutrition')}
                message={
                  missing('nutrition')
                    ? 'Brakuje finalnych obliczeń Nutrition.'
                    : 'Deklaracja korzysta z istniejącej authority Nutrition.'
                }
              />
            </RequiredSettingsField>
            <RequiredSettingsField field="allergens" missing={missing('allergens')}>
              <label
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-[12px] border px-3 text-xs text-ink',
                  missing('allergens') ? 'border-[#a96832] bg-[#fffaf4]' : 'border-ink/10 bg-white',
                )}
              >
                <input
                  type="checkbox"
                  className="size-5 accent-ink"
                  checked={draft.allergens.reviewedByUser}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      allergens: {
                        ...draft.allergens,
                        reviewedByUser: event.currentTarget.checked,
                      },
                    })
                  }
                />
                <span className="flex-1">Potwierdzam przegląd danych alergenowych.</span>
                {missing('allergens') ? <RequiredBadge /> : null}
              </label>
            </RequiredSettingsField>
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-ink/10 bg-white px-3 text-xs text-ink">
              <input
                type="checkbox"
                className="size-5 accent-ink"
                checked={draft.preflightAcknowledged}
                onChange={(event) =>
                  setDraft({ ...draft, preflightAcknowledged: event.currentTarget.checked })
                }
              />
              Sprawdziłem dane etykiety przed wydrukiem.
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-ink/10 bg-[#fffdf8] px-3 text-xs text-ink">
              <input
                type="checkbox"
                className="size-5 accent-ink"
                checked={saveAsDefault}
                onChange={(event) => onSaveAsDefaultChange(event.currentTarget.checked)}
              />
              Zapisz jako domyślne dla przyszłych etykiet.
            </label>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-stone-500">
            Profil prawny pozostaje oznaczony zgodnie z istniejącą macierzą. Gellatti nie deklaruje
            certyfikacji prawnej.
          </p>
        </SettingsSection>
      </div>

      <footer className="sticky bottom-11 z-10 grid grid-cols-2 gap-2 border-t border-ink/10 bg-white/95 p-4 backdrop-blur sm:px-5">
        <Button variant="ghost" onClick={onClose}>
          Anuluj
        </Button>
        <Button onClick={() => void onSave(draft)}>Zastosuj</Button>
      </footer>
    </Card>
  );
}

const SETTINGS_INPUT_CLASS =
  'mt-1 h-11 w-full rounded-[10px] border border-ink/15 bg-white px-3 text-sm text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-ink/35 focus:ring-2 focus:ring-ink/5';

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-ink/8 py-5 last:border-b-0">
      <h3 className="mb-3 text-xs font-semibold tracking-[0.08em] text-stone-600 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RequiredBadge() {
  return (
    <span className="shrink-0 rounded-full border border-[#a96832]/30 bg-[#fff7ed] px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-[#8a5b23] uppercase">
      Wymagane
    </span>
  );
}

function RequiredSettingsField({
  field,
  missing,
  children,
}: {
  field: MasterLabelFieldId;
  missing: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-label-field={field}
      data-missing-required={missing ? 'true' : undefined}
      className="min-w-0"
    >
      {children}
      {missing ? (
        <p className="mt-1 text-[11px] font-medium text-[#8a5b23]">Brak wymaganej wartości</p>
      ) : null}
    </div>
  );
}

function ReviewLine({ label, ready, message }: { label: string; ready: boolean; message: string }) {
  return (
    <div
      className={cn(
        'flex min-h-12 items-start justify-between gap-3 rounded-[12px] border px-3 py-2.5',
        ready ? 'border-ink/10 bg-white' : 'border-[#a96832] bg-[#fffaf4]',
      )}
    >
      <span>
        <strong className="block text-xs text-ink">{label}</strong>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-600">{message}</span>
      </span>
      <span className="shrink-0 font-mono text-[10px] font-semibold text-stone-500">
        {ready ? 'GOTOWE' : 'BRAK'}
      </span>
    </div>
  );
}

const LABEL_FIELD_NAMES: Readonly<Record<MasterLabelFieldId, string>> = {
  product_name: 'Nazwa produktu',
  legal_product_name: 'Nazwa prawna',
  ingredients: 'Składniki',
  allergens: 'Alergeny',
  nutrition: 'Wartości odżywcze',
  net_quantity: 'Masa netto',
  operator: 'Operator',
  storage: 'Przechowywanie',
  date_mark: 'Data trwałości',
  lot: 'LOT',
  logo: 'Logo',
  origin: 'Pochodzenie',
  customer_note: 'Nota dla klienta',
};

function OptionalFieldSettings({
  market,
  enabled,
  onChange,
}: {
  market: MarketProfileCode;
  enabled: MasterLabelFieldId[];
  onChange: (fields: MasterLabelFieldId[]) => void;
}) {
  const profile = marketProfile(market);
  return (
    <fieldset className="mt-4" data-testid="label-field-settings">
      <legend className="text-sm font-semibold text-ink">Pola etykiety</legend>
      <p className="mt-1 text-xs text-stone-500">
        Wymagane pola profilu {profile.label} są zawsze aktywne.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5" data-testid="required-label-fields">
        {profile.requiredFields.map((field) => (
          <span
            key={field}
            className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-600"
          >
            🔒 {LABEL_FIELD_NAMES[field]}
          </span>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3" data-testid="optional-label-fields">
        {profile.optionalFields.map((field) => (
          <label
            key={field}
            className="flex min-h-11 items-center gap-2 rounded-[10px] border border-ink/10 bg-white px-3 text-xs text-ink"
          >
            <input
              type="checkbox"
              className="size-5"
              checked={enabled.includes(field)}
              onChange={(event) =>
                onChange(
                  event.currentTarget.checked
                    ? normalizeEnabledOptionalFields(market, [...enabled, field])
                    : enabled.filter((candidate) => candidate !== field),
                )
              }
            />
            {LABEL_FIELD_NAMES[field]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RegulatoryNutritionFields({
  value,
  missing,
  onChange,
}: {
  value: MasterLabelData;
  missing: boolean;
  onChange: (value: MasterLabelData) => void;
}) {
  const facts = value.regulatoryNutrition;
  const canadaFop = assessCanadaFop(value.nutritionSource, facts);
  const numberOrNull = (raw: string): number | null =>
    raw.trim() === '' ? null : Number.isFinite(Number(raw)) ? Number(raw) : null;
  const updateFacts = (next: Partial<MasterLabelData['regulatoryNutrition']>) =>
    onChange({ ...value, regulatoryNutrition: { ...facts, ...next } });
  const numberField = (
    key: keyof MasterLabelData['regulatoryNutrition'],
    label: string,
    unit: string,
  ) => (
    <label key={key} className="text-xs font-medium text-stone-600">
      {label} · {unit}
      <input
        type="number"
        min={0}
        step="any"
        value={(facts[key] as number | null) ?? ''}
        onChange={(event) => updateFacts({ [key]: numberOrNull(event.currentTarget.value) })}
        className={cn(SETTINGS_INPUT_CLASS, 'font-mono tabular-nums')}
      />
    </label>
  );
  const nutrients: Array<readonly [keyof MasterLabelData['regulatoryNutrition'], string, string]> =
    [
      ['sodiumMgPer100g', 'Sód', 'mg / 100 g'],
      ...(value.market === 'AU_NZ'
        ? []
        : ([
            ['transFatGPer100g', 'Tłuszcze trans', 'g / 100 g'],
            ['cholesterolMgPer100g', 'Cholesterol', 'mg / 100 g'],
            ['calciumMgPer100g', 'Wapń', 'mg / 100 g'],
            ['ironMgPer100g', 'Żelazo', 'mg / 100 g'],
            ['potassiumMgPer100g', 'Potas', 'mg / 100 g'],
          ] as const)),
      ...(value.market === 'US'
        ? ([
            ['addedSugarsGPer100g', 'Cukry dodane', 'g / 100 g'],
            ['vitaminDMcgPer100g', 'Witamina D', 'mcg / 100 g'],
          ] as const)
        : []),
    ];

  return (
    <SettingsSection title={`Nutrition · ${marketProfile(value.market).nutritionFormat}`}>
      <div
        className={cn(
          'rounded-[14px] border p-3',
          missing ? 'border-[#a96832] bg-[#fffaf4]' : 'border-ink/10 bg-[#fffdf8]',
        )}
        data-label-field="market_nutrition"
        data-missing-required={missing ? 'true' : undefined}
      >
        <p className="text-xs leading-relaxed text-stone-600">
          Wartości dodatkowe muszą pochodzić z udokumentowanej authority produktu. Brak danych
          blokuje retail print; system nie zgaduje wartości.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {value.labelLanguages.map((language) => (
            <label key={`serving:${language}`} className="text-xs font-medium text-stone-600">
              Opis porcji · {language.toUpperCase()}
              <input
                value={facts.servingDescription[language] ?? ''}
                onChange={(event) =>
                  updateFacts({
                    servingDescription: {
                      ...facts.servingDescription,
                      [language]: event.currentTarget.value,
                    },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          ))}
          <label className="text-xs font-medium text-stone-600">
            Wielkość porcji · g
            <input
              type="number"
              min={0.1}
              step="any"
              value={facts.servingQuantityG ?? ''}
              onChange={(event) => {
                const servingQuantityG = numberOrNull(event.currentTarget.value);
                onChange({
                  ...value,
                  servingQuantityG,
                  regulatoryNutrition: { ...facts, servingQuantityG },
                });
              }}
              className={cn(SETTINGS_INPUT_CLASS, 'font-mono tabular-nums')}
            />
          </label>
          {numberField('servingsPerContainer', 'Porcje w opakowaniu', 'liczba')}
          {nutrients.map(([key, label, unit]) => numberField(key, label, unit))}
          {value.market === 'CA' ? (
            <>
              {numberField('canadaReferenceAmountG', 'Reference amount', 'g')}
              <label className="text-xs font-medium text-stone-600">
                Klasa produktu FOP
                <select
                  value={facts.canadaFopProductClass}
                  onChange={(event) =>
                    updateFacts({
                      canadaFopProductClass: event.currentTarget
                        .value as MasterLabelData['regulatoryNutrition']['canadaFopProductClass'],
                    })
                  }
                  className={SETTINGS_INPUT_CLASS}
                >
                  <option value="general_food">Żywność ogólna / gelato</option>
                  <option value="main_dish">Danie główne ≥ 200 g</option>
                </select>
              </label>
              <label className="text-xs font-medium text-stone-600">
                FOP / exemption
                <select
                  value={facts.canadaFopExemption}
                  onChange={(event) =>
                    updateFacts({
                      canadaFopExemption: event.currentTarget
                        .value as MasterLabelData['regulatoryNutrition']['canadaFopExemption'],
                    })
                  }
                  className={SETTINGS_INPUT_CLASS}
                >
                  <option value="unresolved">Nierozstrzygnięte</option>
                  <option value="none">Brak wyjątku</option>
                  <option value="exempt">Udokumentowany wyjątek</option>
                  <option value="prohibited">Symbol zabroniony dla kategorii</option>
                </select>
              </label>
              {facts.canadaFopExemption !== 'none' && facts.canadaFopExemption !== 'unresolved' ? (
                <label className="text-xs font-medium text-stone-600 lg:col-span-2">
                  Podstawa wyjątku
                  <input
                    value={facts.canadaFopExemptionReason}
                    onChange={(event) =>
                      updateFacts({ canadaFopExemptionReason: event.currentTarget.value })
                    }
                    className={SETTINGS_INPUT_CLASS}
                  />
                </label>
              ) : null}
            </>
          ) : null}
        </div>
        {value.market === 'CA' ? (
          <div className="mt-3 rounded-[10px] border border-ink/10 bg-white p-3 text-xs text-stone-600">
            <strong className="block text-ink">Canada FOP: {canadaFop.state}</strong>
            <span className="mt-1 block">{canadaFop.reason}</span>
            {canadaFop.state === 'required' && !facts.canadaFopAssetId ? (
              <span className="mt-1 block font-semibold text-[#8a5b23]">
                Wydruk zablokowany: wymagany jest zatwierdzony, oficjalny asset Health Canada.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function PresentationFields({
  format,
  widthMm,
  heightMm,
  copies,
  onChange,
}: {
  format: 'rectangle' | 'round';
  widthMm: number;
  heightMm: number;
  copies: number;
  onChange: (value: {
    format: 'rectangle' | 'round';
    widthMm: number;
    heightMm: number;
    copies: number;
  }) => void;
}) {
  const current = { format, widthMm, heightMm, copies };
  return (
    <fieldset className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <legend className="sr-only">Prezentacja etykiety</legend>
      <label className="text-xs text-stone-600">
        Format
        <select
          value={format}
          onChange={(event) =>
            onChange({ ...current, format: event.currentTarget.value as 'rectangle' | 'round' })
          }
          className={SETTINGS_INPUT_CLASS}
        >
          <option value="rectangle">Prostokąt</option>
          <option value="round">Okrągła</option>
        </select>
      </label>
      <label className="text-xs text-stone-600">
        Szerokość · mm
        <input
          type="number"
          min={20}
          value={widthMm}
          onChange={(event) =>
            onChange({ ...current, widthMm: Math.max(20, Number(event.currentTarget.value) || 20) })
          }
          className={cn(SETTINGS_INPUT_CLASS, 'font-mono tabular-nums')}
        />
      </label>
      <label className="text-xs text-stone-600">
        Wysokość · mm
        <input
          type="number"
          min={20}
          value={heightMm}
          onChange={(event) =>
            onChange({
              ...current,
              heightMm: Math.max(20, Number(event.currentTarget.value) || 20),
            })
          }
          className={cn(SETTINGS_INPUT_CLASS, 'font-mono tabular-nums')}
        />
      </label>
      <label className="text-xs text-stone-600">
        Kopie
        <input
          type="number"
          min={1}
          value={copies}
          onChange={(event) =>
            onChange({ ...current, copies: Math.max(1, Number(event.currentTarget.value) || 1) })
          }
          className={cn(SETTINGS_INPUT_CLASS, 'font-mono tabular-nums')}
        />
      </label>
    </fieldset>
  );
}

function PrinterSettingsFields({
  value,
  onChange,
}: {
  value: LabelPrinterSettings;
  onChange: (value: LabelPrinterSettings) => void;
}) {
  const profile = PRINTER_PROFILES[value.profileId];
  const update = (next: Partial<LabelPrinterSettings>) =>
    onChange(normalizePrinterSettings({ ...value, ...next }));

  return (
    <fieldset className="mt-5 rounded-[14px] border border-ink/10 bg-[#fffdf8] p-3">
      <legend className="px-1 text-sm font-semibold text-ink">Ustawienia drukarki</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-stone-600 sm:col-span-2">
          Drukarka
          <select
            value={value.profileId}
            onChange={(event) => {
              const profileId = event.currentTarget.value as PrinterProfileId;
              const nextProfile = PRINTER_PROFILES[profileId];
              onChange(
                normalizePrinterSettings({
                  ...value,
                  profileId,
                  connection: nextProfile.supportedConnections.includes(value.connection)
                    ? value.connection
                    : nextProfile.supportedConnections[0],
                  dpi: nextProfile.dpiOptions.includes(value.dpi)
                    ? value.dpi
                    : nextProfile.dpiOptions[0],
                }),
              );
            }}
            className={SETTINGS_INPUT_CLASS}
          >
            {Object.values(PRINTER_PROFILES).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.manufacturer} {candidate.model}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-stone-600">
          Połączenie
          <select
            value={value.connection}
            onChange={(event) =>
              update({
                connection: event.currentTarget.value as LabelPrinterSettings['connection'],
              })
            }
            className={SETTINGS_INPUT_CLASS}
          >
            {profile.supportedConnections.map((connection) => (
              <option key={connection} value={connection}>
                {connection === 'system' ? 'Drukarka systemowa' : connection}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-stone-600">
          Rozdzielczość
          <select
            value={value.dpi}
            onChange={(event) => update({ dpi: Number(event.currentTarget.value) })}
            className={SETTINGS_INPUT_CLASS}
          >
            {profile.dpiOptions.map((dpi) => (
              <option key={dpi} value={dpi}>
                {dpi} dpi
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-stone-600 sm:col-span-2">
          Rozmiar etykiety
          <select
            value="custom"
            onChange={(event) => {
              const preset = profile.sizePresets.find(
                (candidate) => candidate.id === event.currentTarget.value,
              );
              if (preset) update({ widthMm: preset.widthMm, heightMm: preset.heightMm });
            }}
            className={SETTINGS_INPUT_CLASS}
          >
            <option value="custom">
              Własny · {value.widthMm} × {value.heightMm} mm
            </option>
            {profile.sizePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-stone-600">
          Orientacja
          <select
            value={value.orientation}
            onChange={(event) =>
              update({
                orientation: event.currentTarget.value as LabelPrinterSettings['orientation'],
              })
            }
            className={SETTINGS_INPUT_CLASS}
          >
            <option value="portrait">Pion</option>
            <option value="landscape">Poziom</option>
          </select>
        </label>
        <label className="text-xs text-stone-600">
          Margines · mm
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={value.marginMm}
            onChange={(event) => update({ marginMm: Number(event.currentTarget.value) || 0 })}
            className={cn(SETTINGS_INPUT_CLASS, 'font-mono tabular-nums')}
          />
        </label>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
        {profile.workflowNote} Bez wykrywania urządzeń i bez deklaracji bezpośredniego Bluetooth.
      </p>
    </fieldset>
  );
}

function EditorHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink/10 pb-4">
      <div>
        <SectionLabel>LabelWorkspace</SectionLabel>
        <h2 className="mt-1 text-lg font-semibold text-ink">{title}</h2>
      </div>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-full border border-ink/15 text-xl"
        aria-label="Zamknij edycję etykiety"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}

function MarketAndIdentityFields({
  market,
  languages,
  businessName,
  operatorName,
  address,
  logoUrl,
  uploading,
  onMarket,
  onLanguages,
  onBusinessName,
  onOperatorName,
  onAddress,
  onLogo,
}: {
  market: MarketProfileCode;
  languages: string[];
  businessName: string;
  operatorName: string;
  address: string;
  logoUrl: string | null;
  uploading: boolean;
  onMarket: (market: MarketProfileCode) => void;
  onLanguages: (languages: string[]) => void;
  onBusinessName: (value: string) => void;
  onOperatorName: (value: string) => void;
  onAddress: (value: string) => void;
  onLogo: (file: File) => Promise<void>;
}) {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <span className="text-xs text-stone-600">Jurysdykcja / profil</span>
        <div className="mt-1 grid grid-cols-3 gap-1 sm:grid-cols-6">
          {MARKET_CODES.map((code) => (
            <button
              key={code}
              type="button"
              className={`min-h-11 rounded-[10px] border px-2 text-xs ${market === code ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white'}`}
              onClick={() => onMarket(code)}
            >
              {MARKET_PROFILES[code].label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-stone-600">
          Języki · po przecinku
          <input
            value={languages.join(', ')}
            onChange={(event) => {
              const parsed = event.currentTarget.value
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
              onLanguages(parsed.length > 0 ? parsed : ['pl']);
            }}
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
        <label className="text-xs text-stone-600">
          Marka / nazwa firmy
          <input
            value={businessName}
            onChange={(event) => onBusinessName(event.currentTarget.value)}
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
        <label className="text-xs text-stone-600">
          Operator
          <input
            value={operatorName}
            onChange={(event) => onOperatorName(event.currentTarget.value)}
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
        <label className="text-xs text-stone-600">
          Adres operatora
          <input
            value={address}
            onChange={(event) => onAddress(event.currentTarget.value)}
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
      </div>
      <label className="flex min-h-14 items-center gap-3 rounded-[12px] border border-ink/10 bg-[#fffdf8] p-3 text-xs text-stone-600">
        {logoUrl ? (
          <img src={logoUrl} alt="Aktualne logo" className="size-12 object-contain" />
        ) : null}
        <span className="flex-1">Logo konta · PNG, JPEG, WebP lub SVG · maks. 5 MB</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={uploading}
          className="max-w-36 text-xs"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void onLogo(file);
          }}
        />
      </label>
    </div>
  );
}
