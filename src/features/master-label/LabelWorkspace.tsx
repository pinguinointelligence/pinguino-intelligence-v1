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
  applyAutoLabelLayout,
  normalizeEnabledOptionalFields,
  type MasterLabelData,
} from './masterLabel';
import { printMasterLabel } from './masterLabelPrint';
import {
  MARKET_PROFILES,
  MARKET_PROFILE_ORDER,
  marketAvailabilityLabel,
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
import { downloadMasterLabelPdf } from './masterLabelPdf';
import { customerErrorMessage } from '@/copy/customerError';
import { responsibleBusinessDetails } from './businessAuthority';

const MARKET_CODES: readonly MarketProfileCode[] = MARKET_PROFILE_ORDER;
export type LabelWorkspaceView = 'data' | 'settings' | 'label';

const LABEL_DATA_FIELDS = new Set([
  'product_name',
  'operator',
  'net_quantity',
  'jurisdiction_context',
]);

const missingLabelDataFields = (label: MasterLabelData): Set<string> =>
  new Set(
    buildLabelPreflight(label)
      .items.filter((item) => item.status === 'missing' && LABEL_DATA_FIELDS.has(item.field))
      .map((item) => item.field),
  );

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
    shelfLifeAuthority: label.shelfLifeAuthority ?? {
      policyId: null,
      authority: '',
      method: 'none',
      shelfLifeDays: null,
      reviewedByUser: false,
    },
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
    shelfLifeAuthority: profile.shelfLifeAuthority,
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
  savedSnapshotId = null,
  profileOnly = false,
  repository: suppliedRepository,
  onSaved,
  initialView = 'data',
}: {
  snapshot?: ProductionCompletionSnapshot | null;
  runId?: string | null;
  savedSnapshotId?: string | null;
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
    initialView === 'data' ? 'back' : 'forward',
  );
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedLogo, setResolvedLogo] = useState<{
    path: string;
    url: string | null;
  } | null>(null);
  const requestedRunId = suppliedSnapshot?.sessionId ?? runId;
  const visibleView: LabelWorkspaceView = saved ? 'label' : activeView;
  const labelDataReady = label ? missingLabelDataFields(label).size === 0 : false;
  const preflight = useMemo(() => (label ? buildLabelPreflight(label) : null), [label]);

  const openView = (next: LabelWorkspaceView) => {
    if (next === visibleView || (next === 'settings' && saved)) return;
    if (next === 'label' && !saved && (preflight?.missingCount ?? 0) > 0) return;
    const order: readonly LabelWorkspaceView[] = ['data', 'settings', 'label'];
    setTransitionDirection(order.indexOf(next) > order.indexOf(visibleView) ? 'forward' : 'back');
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
          nextSaved = savedSnapshotId
            ? await repository.getRunLabelSnapshotById(savedSnapshotId)
            : await repository.getRunLabelSnapshot(requestedRunId);
          if (nextSaved && nextSaved.runId !== requestedRunId) {
            throw new Error('Wybrany zapis etykiety nie należy do wskazanej partii.');
          }
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
          setError(customerErrorMessage(caught, 'labels', 'LABEL_READ_FAILED'));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authOwnerId, profileOnly, repository, requestedRunId, savedSnapshotId, suppliedSnapshot]);

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
      setError(customerErrorMessage(caught, 'labels', 'LABEL_SAVE_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  const startNewVersion = async () => {
    if (!snapshot || !profile || !saved) return;
    setBusy(true);
    setError(null);
    try {
      const latestProfile = (await repository.getAccountProfile()) ?? profile;
      setProfile(latestProfile);
      setSaved(null);
      setLabel(labelFromProfile(snapshot, latestProfile));
      setSaveAsDefault(true);
      setTransitionDirection('back');
      setActiveView('data');
    } catch (caught) {
      setError(customerErrorMessage(caught, 'labels', 'LABEL_READ_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async (draft: boolean) => {
    if (!label || pdfBusy) return;
    setPdfBusy(true);
    setError(null);
    try {
      await downloadMasterLabelPdf(label, logoUrl, { draft });
    } catch (caught) {
      setError(customerErrorMessage(caught, 'labels', 'LABEL_READ_FAILED'));
    } finally {
      setPdfBusy(false);
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
    const order: readonly LabelWorkspaceView[] = ['data', 'settings', 'label'];
    const currentIndex = order.indexOf(visibleView);
    const next = order[currentIndex + (deltaX < 0 ? 1 : -1)];
    if (next) openView(next);
  };

  if (busy && !profile) {
    return <p className="py-8 text-sm text-stone-500">Odczytuję profil i zapis etykiety…</p>;
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
            <SectionLabel>Profil etykiety konta</SectionLabel>
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
                setError(customerErrorMessage(caught, 'labels', 'LABEL_SAVE_FAILED'));
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
  const printBlockedReason =
    unresolved[0]?.message ?? activeMarket.externalAssetRequirement ?? 'Uzupełnij preflight.';
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
                  {saved ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void startNewVersion()}
                    >
                      Nowa wersja
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openView(labelDataReady ? 'settings' : 'data')}
                    >
                      Ustawienia
                    </Button>
                  )}
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
                    variant="ghost"
                    size="sm"
                    disabled={pdfBusy}
                    onClick={() => void downloadPdf(!preflight?.readyForSystemPrint)}
                  >
                    {pdfBusy
                      ? 'Tworzę PDF…'
                      : preflight?.readyForSystemPrint
                        ? 'Pobierz PDF'
                        : 'Pobierz podgląd'}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!preflight?.readyForSystemPrint}
                    onClick={() => printMasterLabel(label, logoUrl)}
                  >
                    Drukuj
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
                      ? preflight.printReadiness === 'PRINT_READY_UNIVERSAL'
                        ? '✓ Gotowa do druku · Universal'
                        : '✓ Gotowa do druku · Regulatory'
                      : `Wydruk zablokowany · ${unresolved.length} pozycji do rozwiązania`}
                  </span>
                  {!preflight?.readyForSystemPrint ? (
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-4"
                      onClick={() => openView(labelDataReady ? 'settings' : 'data')}
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
                  <span>
                    Tekst bazowy {preflight?.geometry.baseFontPt.toFixed(2)} pt · x-height{' '}
                    {preflight?.geometry.xHeightMm.toFixed(2)} mm
                  </span>
                </div>
                <p className="mt-1 text-stone-500">
                  Podgląd, pobrany PDF i wydruk systemowy korzystają z tej samej fizycznej
                  geometrii. PDF nie wymaga podłączonej drukarki.
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
                  ? `Zapisana etykieta partii · ${new Date(saved.createdAt).toLocaleString('pl-PL')}`
                  : 'Finalny zapis zachowa rynek, treść, LOT i logo dla tej partii.'}
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
        ) : visibleView === 'data' ? (
          <LabelDataIntake
            label={label}
            onContinue={(next) => {
              setLabel(next);
              setTransitionDirection('forward');
              setActiveView('settings');
            }}
          />
        ) : (
          <RunLabelEditor
            label={label}
            logoUrl={logoUrl}
            repository={repository}
            saveAsDefault={saveAsDefault}
            onSaveAsDefaultChange={setSaveAsDefault}
            onClose={() => openView('data')}
            onSave={async (next) => {
              setBusy(true);
              setError(null);
              try {
                if (saveAsDefault) await persistProfile(profileFromLabel(profile, next));
                setLabel(next);
                setTransitionDirection('forward');
                setActiveView('label');
              } catch (caught) {
                setError(customerErrorMessage(caught, 'labels', 'LABEL_SAVE_FAILED'));
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
        {(
          [
            ['data', 'Dane do etykiety'],
            ['settings', 'Ustawienia etykiety'],
            ['label', 'Etykieta'],
          ] as const
        ).map(([view, label]) => (
          <button
            key={view}
            type="button"
            aria-label={label}
            aria-current={visibleView === view ? 'step' : undefined}
            disabled={
              Boolean(saved) && view !== 'label'
                ? true
                : (visibleView === 'data' && !labelDataReady && view !== 'data') ||
                  (view === 'label' &&
                    visibleView !== 'label' &&
                    (preflight?.missingCount ?? 0) > 0)
            }
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

function LabelDataIntake({
  label,
  onContinue,
}: {
  label: MasterLabelData;
  onContinue: (label: MasterLabelData) => void;
}) {
  const [draft, setDraft] = useState(label);
  const [initialMissing] = useState(() => missingLabelDataFields(label));
  const [responsibleRole] = useState(() => responsibleBusinessDetails(label).role);
  const currentMissing = missingLabelDataFields(draft);
  const ready = currentMissing.size === 0;
  const party =
    responsibleRole === 'importer'
      ? {
          name: draft.operator.importerName ?? '',
          address: draft.operator.importerAddress ?? '',
          countryCode: draft.operator.importerCountryCode ?? '',
        }
      : responsibleRole === 'distributor'
        ? {
            name: draft.operator.distributorName ?? '',
            address: draft.operator.distributorAddress ?? '',
            countryCode: draft.operator.distributorCountryCode ?? '',
          }
        : {
            name: draft.operator.operatorName,
            address: draft.operator.address,
            countryCode: draft.operator.countryCode,
          };
  const partyLabel =
    responsibleRole === 'importer'
      ? 'Importer'
      : responsibleRole === 'distributor'
        ? 'Dystrybutor'
        : 'Producent / operator';
  const updateParty = (field: 'name' | 'address' | 'countryCode', value: string) => {
    if (responsibleRole === 'importer') {
      const key =
        field === 'name'
          ? 'importerName'
          : field === 'address'
            ? 'importerAddress'
            : 'importerCountryCode';
      setDraft({ ...draft, operator: { ...draft.operator, [key]: value } });
      return;
    }
    if (responsibleRole === 'distributor') {
      const key =
        field === 'name'
          ? 'distributorName'
          : field === 'address'
            ? 'distributorAddress'
            : 'distributorCountryCode';
      setDraft({ ...draft, operator: { ...draft.operator, [key]: value } });
      return;
    }
    const key = field === 'name' ? 'operatorName' : field;
    setDraft({ ...draft, operator: { ...draft.operator, [key]: value } });
  };
  const updatePackageQuantity = (raw: string) => {
    const amount = Number(raw) || null;
    const canada = draft.market === 'CA';
    const grams = amount
      ? canada
        ? draft.regulatoryNutrition.productDensityGPerMl
          ? amount * draft.regulatoryNutrition.productDensityGPerMl
          : null
        : amount
      : null;
    setDraft({
      ...draft,
      netQuantityG: grams,
      packageQuantity: amount
        ? {
            value: amount,
            unit: canada ? 'ml' : 'g',
            netWeightG: grams,
            netVolumeMl: canada ? amount : null,
            source: 'selected_fill',
            confirmedAt: new Date().toISOString(),
          }
        : null,
    });
  };

  return (
    <Card
      padding="none"
      className="mx-auto w-full max-w-xl overflow-hidden rounded-[18px] border-ink/10 shadow-pro-e0"
      data-testid="label-data-intake"
      data-label-market={draft.market}
    >
      <header className="border-b border-ink/10 bg-[#fffdf8] px-4 py-5 sm:px-5">
        <SectionLabel>Dane do etykiety</SectionLabel>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
          Uzupełnij dane do etykiety
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          Pokazujemy tylko informacje potrzebne przed otwarciem ustawień.
        </p>
      </header>

      <div className="grid gap-4 px-4 py-5 sm:px-5">
        {initialMissing.has('product_name')
          ? draft.labelLanguages.map((language) =>
              (label.productName[language] ?? '').trim() ? null : (
                <label key={language} className="text-xs font-medium text-stone-600">
                  Nazwa produktu · {language.toUpperCase()}
                  <input
                    value={draft.productName[language] ?? ''}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        productName: {
                          ...draft.productName,
                          [language]: event.currentTarget.value,
                        },
                      })
                    }
                    className={SETTINGS_INPUT_CLASS}
                    data-label-intake-field="product-name"
                  />
                </label>
              ),
            )
          : null}

        {initialMissing.has('operator') ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {!party.name.trim() ? (
              <label className="text-xs font-medium text-stone-600">
                {partyLabel}
                <input
                  value={party.name}
                  onChange={(event) => updateParty('name', event.currentTarget.value)}
                  className={SETTINGS_INPUT_CLASS}
                  data-label-intake-field="operator-name"
                />
              </label>
            ) : null}
            {!party.address.trim() ? (
              <label className="text-xs font-medium text-stone-600">
                Adres
                <input
                  value={party.address}
                  onChange={(event) => updateParty('address', event.currentTarget.value)}
                  className={SETTINGS_INPUT_CLASS}
                  data-label-intake-field="operator-address"
                />
              </label>
            ) : null}
            {!party.countryCode.trim() ? (
              <label className="text-xs font-medium text-stone-600">
                Kraj · kod ISO
                <input
                  maxLength={2}
                  value={party.countryCode}
                  onChange={(event) =>
                    updateParty('countryCode', event.currentTarget.value.toUpperCase())
                  }
                  className={SETTINGS_INPUT_CLASS}
                  data-label-intake-field="operator-country"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {initialMissing.has('jurisdiction_context') ? (
          <LabelMarketContextField value={draft} onChange={setDraft} />
        ) : null}

        {initialMissing.has('net_quantity') ? (
          <label className="text-xs font-medium text-stone-600">
            {draft.market === 'CA' ? 'Objętość opakowania · mL' : 'Masa opakowania · g'}
            <input
              type="number"
              min={0.1}
              step="any"
              value={
                draft.market === 'CA'
                  ? (draft.packageQuantity?.netVolumeMl ?? '')
                  : (draft.packageQuantity?.netWeightG ?? '')
              }
              onChange={(event) => updatePackageQuantity(event.currentTarget.value)}
              className={cn(SETTINGS_INPUT_CLASS, 'font-mono tabular-nums')}
              data-label-intake-field="package-quantity"
            />
          </label>
        ) : null}

        {initialMissing.size === 0 ? (
          <p className="rounded-[12px] border border-status-ideal/25 bg-status-ideal/[0.06] p-3 text-sm text-stone-700">
            Wszystkie podstawowe dane są już uzupełnione.
          </p>
        ) : null}
      </div>

      <footer className="border-t border-ink/10 bg-white p-4 sm:px-5">
        <Button className="w-full" disabled={!ready} onClick={() => onContinue(draft)}>
          Przejdź do ustawień etykiety
        </Button>
      </footer>
    </Card>
  );
}

function LabelMarketContextField({
  value,
  onChange,
}: {
  value: MasterLabelData;
  onChange: (value: MasterLabelData) => void;
}) {
  const context = value.jurisdictionContext ?? {
    euDestinationCountryCode: '',
    ukRegion: 'unresolved' as const,
    auNzCountry: 'unresolved' as const,
    usSaleContext: 'unresolved' as const,
  };
  if (value.market === 'EU') {
    return (
      <label className="text-xs font-medium text-stone-600">
        Kraj / rynek docelowy · kod ISO
        <input
          maxLength={2}
          value={context.euDestinationCountryCode}
          onChange={(event) =>
            onChange({
              ...value,
              jurisdictionContext: {
                ...context,
                euDestinationCountryCode: event.currentTarget.value.toUpperCase(),
              },
            })
          }
          className={SETTINGS_INPUT_CLASS}
          data-label-intake-field="market-context"
        />
      </label>
    );
  }
  if (value.market === 'UK') {
    return (
      <label className="text-xs font-medium text-stone-600">
        Rynek docelowy
        <select
          value={context.ukRegion}
          onChange={(event) =>
            onChange({
              ...value,
              jurisdictionContext: {
                ...context,
                ukRegion: event.currentTarget.value as 'GB' | 'NI' | 'unresolved',
              },
            })
          }
          className={SETTINGS_INPUT_CLASS}
          data-label-intake-field="market-context"
        >
          <option value="unresolved">Wybierz rynek</option>
          <option value="GB">Great Britain</option>
          <option value="NI">Northern Ireland</option>
        </select>
      </label>
    );
  }
  if (value.market === 'AU_NZ') {
    return (
      <label className="text-xs font-medium text-stone-600">
        Kraj / rynek docelowy
        <select
          value={context.auNzCountry}
          onChange={(event) =>
            onChange({
              ...value,
              jurisdictionContext: {
                ...context,
                auNzCountry: event.currentTarget.value as 'AU' | 'NZ' | 'unresolved',
              },
            })
          }
          className={SETTINGS_INPUT_CLASS}
          data-label-intake-field="market-context"
        >
          <option value="unresolved">Wybierz kraj</option>
          <option value="AU">Australia</option>
          <option value="NZ">New Zealand</option>
        </select>
      </label>
    );
  }
  if (value.market === 'US') {
    return (
      <label className="text-xs font-medium text-stone-600">
        Rynek docelowy
        <select
          value={context.usSaleContext}
          onChange={(event) =>
            onChange({
              ...value,
              jurisdictionContext: {
                ...context,
                usSaleContext: event.currentTarget.value as
                  | 'interstate_retail'
                  | 'food_service'
                  | 'unresolved',
              },
            })
          }
          className={SETTINGS_INPUT_CLASS}
          data-label-intake-field="market-context"
        >
          <option value="unresolved">Wybierz kontekst</option>
          <option value="interstate_retail">Packaged retail</option>
          <option value="food_service">Food service</option>
        </select>
      </label>
    );
  }
  return null;
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
            labelLanguages:
              market === 'WORLD'
                ? ['en']
                : [
                    ...new Set([
                      ...marketProfile(market).requiredLanguages,
                      ...draft.labelLanguages,
                    ]),
                  ],
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
      <details className="mt-4 rounded-[12px] border border-ink/10 bg-[#fffdf8] p-3" open>
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Dane firmy i trwałość · używane ponownie
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-stone-600">
            Kraj / kod kraju
            <input
              value={draft.facilityDefaults.countryCode}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    countryCode: event.currentTarget.value,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-stone-600">
            Strona internetowa
            <input
              value={draft.facilityDefaults.website ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    website: event.currentTarget.value,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-stone-600">
            Kontakt
            <input
              value={draft.facilityDefaults.contact}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    contact: event.currentTarget.value,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-stone-600">
            Importer · nazwa
            <input
              value={draft.facilityDefaults.importerName ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    importerName: event.currentTarget.value,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-stone-600">
            Importer · kod kraju
            <input
              value={draft.facilityDefaults.importerCountryCode ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    importerCountryCode: event.currentTarget.value,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-stone-600 sm:col-span-2">
            Importer · adres fizyczny
            <input
              value={draft.facilityDefaults.importerAddress ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    importerAddress: event.currentTarget.value,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-stone-600">
            Dostawca / dystrybutor · nazwa
            <input
              value={draft.facilityDefaults.distributorName ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    distributorName: event.currentTarget.value,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-stone-600">
            Dostawca / dystrybutor · kod kraju
            <input
              value={draft.facilityDefaults.distributorCountryCode ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    distributorCountryCode: event.currentTarget.value,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-stone-600 sm:col-span-2">
            Dostawca / dystrybutor · adres fizyczny
            <input
              value={draft.facilityDefaults.distributorAddress ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    distributorAddress: event.currentTarget.value,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-stone-600">
            Rola firmy
            <select
              value={draft.facilityDefaults.operatorRole ?? 'producer'}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  facilityDefaults: {
                    ...draft.facilityDefaults,
                    operatorRole: event.currentTarget.value as NonNullable<
                      typeof draft.facilityDefaults.operatorRole
                    >,
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            >
              <option value="producer">Producent</option>
              <option value="manufacturer">Wytwórca</option>
              <option value="packer">Pakujący</option>
              <option value="distributor">Dystrybutor</option>
              <option value="importer">Importer</option>
              <option value="dealer">Sprzedawca</option>
              <option value="supplier">Dostawca</option>
            </select>
          </label>
          <label className="text-xs text-stone-600 sm:col-span-2">
            Źródło i podstawa daty trwałości
            <input
              value={draft.shelfLifeAuthority.authority}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  shelfLifeAuthority: {
                    ...draft.shelfLifeAuthority,
                    authority: event.currentTarget.value,
                  },
                })
              }
              placeholder="Nie ustawiaj, jeśli nie ma zatwierdzonej polityki"
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
        </div>
      </details>
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
    field:
      | 'productName'
      | 'legalProductName'
      | 'storageInstructions'
      | 'origin'
      | 'customerNote'
      | 'shortDescription',
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
          ← Dane do etykiety
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
                ? 'Uzupełnij wymagane pola'
                : 'Wszystkie wymagane informacje są uzupełnione'}
            </strong>
            <span className="mt-0.5 block text-xs text-stone-600">
              {draftPreflight.missingCount > 0
                ? `Brakuje ${draftPreflight.missingCount} informacji. Wszystkie są oznaczone poniżej.`
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
          {draft.market === 'EU' ? (
            <label className="mt-3 block text-xs font-medium text-stone-600">
              Docelowe państwo członkowskie · kod ISO
              <input
                maxLength={2}
                value={draft.jurisdictionContext?.euDestinationCountryCode ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    jurisdictionContext: {
                      euDestinationCountryCode: event.currentTarget.value.toUpperCase(),
                      ukRegion: draft.jurisdictionContext?.ukRegion ?? 'unresolved',
                      auNzCountry: draft.jurisdictionContext?.auNzCountry ?? 'unresolved',
                      usSaleContext: draft.jurisdictionContext?.usSaleContext ?? 'unresolved',
                    },
                  })
                }
                placeholder="np. ES, PL, DE"
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          ) : null}
          {draft.market === 'UK' ? (
            <label className="mt-3 block text-xs font-medium text-stone-600">
              UK sub-context
              <select
                value={draft.jurisdictionContext?.ukRegion ?? 'unresolved'}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    jurisdictionContext: {
                      euDestinationCountryCode:
                        draft.jurisdictionContext?.euDestinationCountryCode ?? '',
                      ukRegion: event.currentTarget.value as 'GB' | 'NI' | 'unresolved',
                      auNzCountry: draft.jurisdictionContext?.auNzCountry ?? 'unresolved',
                      usSaleContext: draft.jurisdictionContext?.usSaleContext ?? 'unresolved',
                    },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="unresolved">Wybierz GB albo Northern Ireland</option>
                <option value="GB">Great Britain</option>
                <option value="NI">Northern Ireland</option>
              </select>
            </label>
          ) : null}
          {draft.market === 'AU_NZ' ? (
            <label className="mt-3 block text-xs font-medium text-stone-600">
              AU/NZ sub-context
              <select
                value={draft.jurisdictionContext?.auNzCountry ?? 'unresolved'}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    jurisdictionContext: {
                      euDestinationCountryCode:
                        draft.jurisdictionContext?.euDestinationCountryCode ?? '',
                      ukRegion: draft.jurisdictionContext?.ukRegion ?? 'unresolved',
                      auNzCountry: event.currentTarget.value as 'AU' | 'NZ' | 'unresolved',
                      usSaleContext: draft.jurisdictionContext?.usSaleContext ?? 'unresolved',
                    },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="unresolved">Wybierz kraj</option>
                <option value="AU">Australia</option>
                <option value="NZ">New Zealand</option>
              </select>
            </label>
          ) : null}
          {draft.market === 'US' ? (
            <label className="mt-3 block text-xs font-medium text-stone-600">
              FDA sale context
              <select
                value={draft.jurisdictionContext?.usSaleContext ?? 'unresolved'}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    jurisdictionContext: {
                      euDestinationCountryCode:
                        draft.jurisdictionContext?.euDestinationCountryCode ?? '',
                      ukRegion: draft.jurisdictionContext?.ukRegion ?? 'unresolved',
                      auNzCountry: draft.jurisdictionContext?.auNzCountry ?? 'unresolved',
                      usSaleContext: event.currentTarget.value as
                        | 'interstate_retail'
                        | 'food_service'
                        | 'unresolved',
                    },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="unresolved">Wybierz kontekst</option>
                <option value="interstate_retail">Packaged retail / interstate commerce</option>
                <option value="food_service">Food service</option>
              </select>
            </label>
          ) : null}
          <div>
            <span className="text-xs font-medium text-stone-600">Jurysdykcja / profil</span>
            <div className="mt-2 grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3">
              {MARKET_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={cn(
                    'pro-focus-ring grid min-h-12 content-center rounded-[10px] border px-2 py-1 text-xs font-semibold transition-colors',
                    draft.market === code
                      ? 'border-ink bg-ink text-white'
                      : 'border-ink/12 bg-white text-ink hover:bg-stone-50',
                  )}
                  data-market-active={draft.market === code ? 'true' : undefined}
                  title={MARKET_PROFILES[code].jurisdiction}
                  onClick={() => {
                    const nextProfile = MARKET_PROFILES[code];
                    const labelLanguages =
                      code === 'WORLD'
                        ? ['en']
                        : [...new Set([...nextProfile.requiredLanguages, ...draft.labelLanguages])];
                    const next = {
                      ...draft,
                      market: code,
                      marketProfileVersion: nextProfile.version,
                      labelLanguages,
                      enabledOptionalFields: normalizeEnabledOptionalFields(
                        code,
                        draft.enabledOptionalFields,
                      ),
                      regulatoryReview: {
                        translations: false,
                        ingredientOrderAndQuid: false,
                        marketSpecific: false,
                      },
                    };
                    setDraft(applyAutoLabelLayout(next));
                  }}
                >
                  <span>{MARKET_PROFILES[code].label}</span>
                  <span className="text-[9px] font-medium opacity-70">
                    {marketAvailabilityLabel(MARKET_PROFILES[code])}
                  </span>
                </button>
              ))}
            </div>
            {draft.market === 'WORLD' ? (
              <p className="mt-3 text-xs text-stone-500">
                Uniwersalna etykieta informacyjna — bez profilu prawnego konkretnego kraju.
              </p>
            ) : null}
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
                setDraft({
                  ...draft,
                  labelLanguages:
                    parsed.length > 0 ? parsed : [draft.market === 'WORLD' ? 'en' : 'pl'],
                });
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
                <label className="text-xs font-medium text-stone-600">
                  Kod kraju operatora
                  <input
                    value={draft.operator.countryCode}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        operator: { ...draft.operator, countryCode: event.currentTarget.value },
                      })
                    }
                    className={fieldClass('operator', !draft.operator.countryCode.trim())}
                  />
                </label>
                <label className="text-xs font-medium text-stone-600">
                  Importer · nazwa / kod kraju
                  <div className="grid grid-cols-[1fr_5rem] gap-2">
                    <input
                      value={draft.operator.importerName ?? ''}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          operator: { ...draft.operator, importerName: event.currentTarget.value },
                        })
                      }
                      className={SETTINGS_INPUT_CLASS}
                    />
                    <input
                      value={draft.operator.importerCountryCode ?? ''}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          operator: {
                            ...draft.operator,
                            importerCountryCode: event.currentTarget.value,
                          },
                        })
                      }
                      className={SETTINGS_INPUT_CLASS}
                    />
                  </div>
                </label>
                <label className="text-xs font-medium text-stone-600">
                  Adres importera
                  <input
                    value={draft.operator.importerAddress ?? ''}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        operator: { ...draft.operator, importerAddress: event.currentTarget.value },
                      })
                    }
                    className={SETTINGS_INPUT_CLASS}
                  />
                </label>
                <label className="text-xs font-medium text-stone-600">
                  Dostawca / dystrybutor · nazwa / kod kraju
                  <div className="grid grid-cols-[1fr_5rem] gap-2">
                    <input
                      value={draft.operator.distributorName ?? ''}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          operator: {
                            ...draft.operator,
                            distributorName: event.currentTarget.value,
                          },
                        })
                      }
                      className={SETTINGS_INPUT_CLASS}
                    />
                    <input
                      value={draft.operator.distributorCountryCode ?? ''}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          operator: {
                            ...draft.operator,
                            distributorCountryCode: event.currentTarget.value,
                          },
                        })
                      }
                      className={SETTINGS_INPUT_CLASS}
                    />
                  </div>
                </label>
                <label className="text-xs font-medium text-stone-600">
                  Adres supplier / distributor
                  <input
                    value={draft.operator.distributorAddress ?? ''}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        operator: {
                          ...draft.operator,
                          distributorAddress: event.currentTarget.value,
                        },
                      })
                    }
                    className={SETTINGS_INPUT_CLASS}
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
              <div className="grid gap-2">
                <label className="text-xs font-medium text-stone-600">
                  Napełnienie opakowania
                  <select
                    value={
                      [75, 100, 125, 250, 500, 1000].includes(
                        draft.market === 'CA'
                          ? (draft.packageQuantity?.netVolumeMl ?? -1)
                          : (draft.packageQuantity?.netWeightG ?? -1),
                      )
                        ? String(
                            draft.market === 'CA'
                              ? draft.packageQuantity?.netVolumeMl
                              : draft.packageQuantity?.netWeightG,
                          )
                        : 'custom'
                    }
                    onChange={(event) => {
                      if (event.currentTarget.value === 'custom') return;
                      const amount = Number(event.currentTarget.value);
                      const canada = draft.market === 'CA';
                      const grams = canada
                        ? draft.regulatoryNutrition.productDensityGPerMl
                          ? amount * draft.regulatoryNutrition.productDensityGPerMl
                          : null
                        : amount;
                      setDraft({
                        ...draft,
                        netQuantityG: grams,
                        packageQuantity: {
                          value: amount === 1000 ? 1 : amount,
                          unit: canada
                            ? amount === 1000
                              ? 'l'
                              : 'ml'
                            : amount === 1000
                              ? 'kg'
                              : 'g',
                          netWeightG: grams,
                          netVolumeMl: canada ? amount : null,
                          source: 'selected_fill',
                          confirmedAt: new Date().toISOString(),
                        },
                      });
                    }}
                    className={fieldClass('net_quantity', !draft.packageQuantity)}
                  >
                    <option value="custom">Własna ilość</option>
                    {draft.market === 'CA' ? (
                      <>
                        <option value="75">75 mL</option>
                        <option value="125">125 mL</option>
                        <option value="250">250 mL</option>
                        <option value="500">500 mL</option>
                        <option value="1000">1 L</option>
                      </>
                    ) : (
                      <>
                        <option value="100">100 g</option>
                        <option value="125">125 g</option>
                        <option value="250">250 g</option>
                        <option value="500">500 g</option>
                        <option value="1000">1 kg</option>
                      </>
                    )}
                  </select>
                </label>
                <label className="text-xs font-medium text-stone-600">
                  {draft.market === 'CA' ? 'Własna objętość netto · mL' : 'Własna masa netto · g'}
                  <input
                    type="number"
                    min={0.1}
                    step="any"
                    value={
                      draft.market === 'CA'
                        ? (draft.packageQuantity?.netVolumeMl ?? '')
                        : (draft.packageQuantity?.netWeightG ?? '')
                    }
                    onChange={(event) => {
                      const amount = Number(event.currentTarget.value) || null;
                      const canada = draft.market === 'CA';
                      const grams = amount
                        ? canada
                          ? draft.regulatoryNutrition.productDensityGPerMl
                            ? amount * draft.regulatoryNutrition.productDensityGPerMl
                            : null
                          : amount
                        : null;
                      setDraft({
                        ...draft,
                        netQuantityG: grams,
                        packageQuantity: amount
                          ? {
                              value: amount,
                              unit: canada ? 'ml' : 'g',
                              netWeightG: grams,
                              netVolumeMl: canada ? amount : null,
                              source: 'selected_fill',
                              confirmedAt: new Date().toISOString(),
                            }
                          : null,
                      });
                    }}
                    className={cn(
                      fieldClass('net_quantity', !draft.packageQuantity),
                      'font-mono tabular-nums',
                    )}
                  />
                </label>
                <p className="text-[11px] text-stone-500">
                  Partia produkcyjna: {draft.actualBatchQuantityG ?? '—'} g. Etykieta używa
                  wyłącznie wybranego fillu opakowania.
                </p>
              </div>
            </RequiredSettingsField>
          </div>
        </SettingsSection>

        {draft.purpose === 'retail_consumer' &&
        ['EU', 'UK', 'US', 'CA', 'AU_NZ'].includes(draft.market) ? (
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
                      shelfLifeAuthority: {
                        policyId: null,
                        authority: 'Business-confirmed manual date',
                        method: 'manual_date',
                        shelfLifeDays: null,
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
            {draft.enabledOptionalFields.includes('short_description') ? (
              <label className="text-xs font-medium text-stone-600">
                Krótki opis
                <input
                  value={draft.shortDescription?.[primaryLanguage] ?? ''}
                  onChange={(event) =>
                    updateText('shortDescription', primaryLanguage, event.currentTarget.value)
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
            {draft.enabledOptionalFields.includes('qr_code') ? (
              <label className="text-xs font-medium text-stone-600">
                Wartość QR
                <input
                  value={draft.qrCodeValue ?? ''}
                  onChange={(event) =>
                    setDraft({ ...draft, qrCodeValue: event.currentTarget.value })
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
            {draft.enabledOptionalFields.includes('gtin') ? (
              <label className="text-xs font-medium text-stone-600">
                Potwierdzony GTIN / EAN
                <input
                  inputMode="numeric"
                  value={draft.gtin ?? ''}
                  onChange={(event) => setDraft({ ...draft, gtin: event.currentTarget.value })}
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
            {draft.enabledOptionalFields.includes('internal_article_id') ? (
              <label className="text-xs font-medium text-stone-600">
                Wewnętrzny identyfikator artykułu
                <input
                  value={draft.internalArticleId ?? ''}
                  onChange={(event) =>
                    setDraft({ ...draft, internalArticleId: event.currentTarget.value })
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
            {draft.enabledOptionalFields.includes('website') ? (
              <label className="text-xs font-medium text-stone-600">
                Strona internetowa
                <input
                  value={draft.operator.website ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      operator: { ...draft.operator, website: event.currentTarget.value },
                    })
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection title="Format">
          <button
            type="button"
            className={cn(
              'pro-focus-ring min-h-11 rounded-[10px] border px-3 text-xs font-semibold',
              draft.layoutMode === 'auto'
                ? 'border-ink bg-ink text-white'
                : 'border-ink/15 bg-white text-ink',
            )}
            onClick={() => setDraft(applyAutoLabelLayout(draft))}
          >
            Auto · wybierz najmniejszy format, który przechodzi preflight
          </button>
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
          <details className="mt-3 rounded-[12px] border border-ink/10 bg-white p-3">
            <summary className="cursor-pointer text-xs font-semibold text-ink">
              Zaawansowane · własne wymiary i kształt
            </summary>
            <PresentationFields
              format={draft.format}
              widthMm={draft.size.widthMm}
              heightMm={draft.size.heightMm}
              copies={draft.copies}
              onChange={(presentation) =>
                setDraft({
                  ...draft,
                  layoutMode: 'manual',
                  format: presentation.format,
                  size: { widthMm: presentation.widthMm, heightMm: presentation.heightMm },
                  copies: presentation.copies,
                  printer: normalizePrinterSettings({
                    ...draft.printer,
                    formatMode: 'custom',
                    widthMm: presentation.widthMm,
                    heightMm: presentation.heightMm,
                    copies: presentation.copies,
                  }),
                })
              }
            />
          </details>
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
              <IngredientAuthorityFields value={draft} onChange={setDraft} />
              <ReviewLine
                label="Składniki"
                ready={!missing('ingredients')}
                message={
                  missing('ingredients')
                    ? 'Brakuje składników lub ich potwierdzonych identyfikatorów w danych bieżącej partii.'
                    : 'Dane składników pochodzą z finalnego zapisu rzeczywistej partii.'
                }
              />
            </RequiredSettingsField>
            <RequiredSettingsField field="nutrition" missing={missing('nutrition')}>
              <ReviewLine
                label="Wartości odżywcze"
                ready={!missing('nutrition')}
                message={
                  missing('nutrition')
                    ? 'Brakuje finalnych obliczeń wartości odżywczych.'
                    : 'Deklaracja korzysta z potwierdzonych danych odżywczych.'
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
        <Button
          data-testid="show-label-preview"
          disabled={draftPreflight.missingCount > 0}
          onClick={() => void onSave(draft)}
        >
          Pokaż etykietę
        </Button>
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

function IngredientAuthorityFields({
  value,
  onChange,
}: {
  value: MasterLabelData;
  onChange: (value: MasterLabelData) => void;
}) {
  const updateIngredient = (
    index: number,
    update: (
      ingredient: MasterLabelData['ingredients'][number],
    ) => MasterLabelData['ingredients'][number],
  ) =>
    onChange({
      ...value,
      ingredients: value.ingredients.map((ingredient, candidate) =>
        candidate === index ? update(ingredient) : ingredient,
      ),
    });
  const emptyNames = () =>
    Object.fromEntries(value.labelLanguages.map((language) => [language, ''])) as Record<
      string,
      string
    >;
  const updateCompoundComponents = (index: number, language: string, raw: string) => {
    const names = raw
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    updateIngredient(index, (ingredient) => {
      if (!ingredient.compound) return ingredient;
      const count = Math.max(names.length, ingredient.compound.components.length);
      const components = Array.from({ length: count }, (_, componentIndex) => ({
        names: {
          ...(ingredient.compound?.components[componentIndex]?.names ?? emptyNames()),
          [language]: names[componentIndex] ?? '',
        },
        actualGrams: ingredient.compound?.components[componentIndex]?.actualGrams ?? null,
      })).filter((component) =>
        value.labelLanguages.some((tag) => Boolean(component.names[tag]?.trim())),
      );
      return {
        ...ingredient,
        compound: { ...ingredient.compound, components },
      };
    });
  };
  const quidMarket = value.market === 'EU' || value.market === 'UK' || value.market === 'AU_NZ';

  return (
    <div className="mb-2 space-y-2" data-testid="label-ingredient-authority-fields">
      {value.ingredients.map((ingredient, index) => (
        <details
          key={ingredient.lineId}
          className="rounded-[12px] border border-ink/10 bg-white p-3"
        >
          <summary className="cursor-pointer text-xs font-semibold text-ink">
            {primaryText(ingredient.names, value.labelLanguages) || 'Składnik'} ·{' '}
            {ingredient.actualGrams.toFixed(1)} g · {ingredient.percent.toFixed(1)}%
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {value.labelLanguages.map((language) => (
              <label key={language} className="text-xs text-stone-600">
                Deklaracja składnika · {language}
                <input
                  value={ingredient.names[language] ?? ''}
                  onChange={(event) =>
                    updateIngredient(index, (current) => ({
                      ...current,
                      names: { ...current.names, [language]: event.currentTarget.value },
                    }))
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
            Rzeczywista masa i kolejność pochodzą z finalnego zapisu zakończonej partii i nie są
            tutaj edytowalne.
          </p>
          <label className="mt-3 flex min-h-11 items-center gap-2 rounded-[10px] border border-ink/10 px-3 text-xs text-ink">
            <input
              type="checkbox"
              className="size-5"
              checked={Boolean(ingredient.compound)}
              onChange={(event) =>
                updateIngredient(index, (current) => ({
                  ...current,
                  compound: event.currentTarget.checked
                    ? {
                        displayName: { ...current.names },
                        components: [],
                        componentsDeclared: true,
                      }
                    : null,
                }))
              }
            />
            To składnik złożony — deklaruj zatwierdzone komponenty
          </label>
          {ingredient.compound ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {value.labelLanguages.map((language) => (
                <div key={language} className="space-y-3">
                  <label className="block text-xs text-stone-600">
                    Nazwa składnika złożonego · {language}
                    <input
                      value={ingredient.compound?.displayName[language] ?? ''}
                      onChange={(event) =>
                        updateIngredient(index, (current) =>
                          current.compound
                            ? {
                                ...current,
                                compound: {
                                  ...current.compound,
                                  displayName: {
                                    ...current.compound.displayName,
                                    [language]: event.currentTarget.value,
                                  },
                                },
                              }
                            : current,
                        )
                      }
                      className={SETTINGS_INPUT_CLASS}
                    />
                  </label>
                  <label className="block text-xs text-stone-600">
                    Komponenty w zatwierdzonej kolejności · {language} · po przecinku
                    <textarea
                      value={(ingredient.compound?.components ?? [])
                        .map((component) => component.names[language] ?? '')
                        .join(', ')}
                      onChange={(event) =>
                        updateCompoundComponents(index, language, event.currentTarget.value)
                      }
                      className="mt-1 min-h-20 w-full resize-y rounded-[10px] border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink/35 focus:ring-2 focus:ring-ink/5"
                    />
                  </label>
                </div>
              ))}
            </div>
          ) : null}
          {quidMarket ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_1fr] sm:items-end">
              <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-ink/10 px-3 text-xs text-ink">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={Boolean(ingredient.quid?.required)}
                  onChange={(event) =>
                    updateIngredient(index, (current) => ({
                      ...current,
                      quid: {
                        required: event.currentTarget.checked,
                        percentage: event.currentTarget.checked ? current.percent : null,
                        reason: current.quid?.reason ?? '',
                        reviewedByUser: false,
                      },
                    }))
                  }
                />
                QUID wymagany
              </label>
              <label className="text-xs text-stone-600">
                Procent
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  disabled={!ingredient.quid?.required}
                  value={ingredient.quid?.percentage ?? ''}
                  onChange={(event) =>
                    updateIngredient(index, (current) => ({
                      ...current,
                      quid: {
                        required: true,
                        percentage:
                          event.currentTarget.value === ''
                            ? null
                            : Number(event.currentTarget.value),
                        reason: current.quid?.reason ?? '',
                        reviewedByUser: current.quid?.reviewedByUser ?? false,
                      },
                    }))
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-ink/10 px-3 text-xs text-ink">
                <input
                  type="checkbox"
                  className="size-5"
                  disabled={!ingredient.quid?.required}
                  checked={Boolean(ingredient.quid?.reviewedByUser)}
                  onChange={(event) =>
                    updateIngredient(index, (current) => ({
                      ...current,
                      quid: {
                        required: true,
                        percentage: current.quid?.percentage ?? current.percent,
                        reason: current.quid?.reason ?? '',
                        reviewedByUser: event.currentTarget.checked,
                      },
                    }))
                  }
                />
                Procent potwierdzony
              </label>
            </div>
          ) : null}
        </details>
      ))}
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
  production_date: 'Data produkcji',
  date_mark: 'Data trwałości',
  lot: 'LOT',
  logo: 'Logo',
  origin: 'Pochodzenie',
  customer_note: 'Nota dla klienta',
  short_description: 'Krótki opis',
  qr_code: 'QR',
  lot_barcode: 'Kod kreskowy LOT',
  gtin: 'GTIN / EAN',
  website: 'Strona internetowa',
  internal_article_id: 'Wewnętrzny identyfikator artykułu',
  batch_id: 'Identyfikator partii',
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
    <SettingsSection title={`Wartości odżywcze · ${marketProfile(value.market).nutritionFormat}`}>
      <div
        className={cn(
          'rounded-[14px] border p-3',
          missing ? 'border-[#a96832] bg-[#fffaf4]' : 'border-ink/10 bg-[#fffdf8]',
        )}
        data-label-field="market_nutrition"
        data-missing-required={missing ? 'true' : undefined}
      >
        <p className="text-xs leading-relaxed text-stone-600">
          Wartości dodatkowe muszą mieć udokumentowane źródło produktu. Brak danych blokuje wydruk
          detaliczny; Gellatti nie zgaduje wartości.
        </p>
        {(value.market === 'EU' || value.market === 'UK') &&
        (value.nutritionSource?.alcohol_g ?? 0) > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-stone-600">
              Zastosowanie deklaracji alkoholu
              <select
                value={value.alcoholDeclarationApplicability ?? 'unresolved'}
                onChange={(event) =>
                  onChange({
                    ...value,
                    alcoholDeclarationApplicability: event.currentTarget.value as NonNullable<
                      MasterLabelData['alcoholDeclarationApplicability']
                    >,
                    alcoholDeclarationReviewed: false,
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="unresolved">Wymaga rozstrzygnięcia</option>
                <option value="not_applicable_non_beverage">
                  Produkt niebędący napojem · % vol nie dotyczy
                </option>
                <option value="required_beverage_over_1_2">Napój &gt;1,2% · % vol wymagane</option>
              </select>
            </label>
            {value.alcoholDeclarationApplicability === 'required_beverage_over_1_2' ? (
              <>
                <label className="text-xs font-medium text-stone-600">
                  Rzeczywista zawartość alkoholu · % vol
                  <input
                    type="number"
                    min={1.21}
                    step="0.1"
                    value={value.alcoholByVolumePercent ?? ''}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        alcoholByVolumePercent: numberOrNull(event.currentTarget.value),
                        alcoholDeclarationReviewed: false,
                      })
                    }
                    className={SETTINGS_INPUT_CLASS}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-xs text-stone-600 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={Boolean(value.alcoholDeclarationReviewed)}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        alcoholDeclarationReviewed: event.currentTarget.checked,
                      })
                    }
                  />
                  Potwierdzam podstawę danych dla % vol
                </label>
              </>
            ) : null}
          </div>
        ) : null}
        {value.market === 'US' || value.market === 'CA' ? (
          <label className="mt-3 block max-w-xs text-xs font-medium text-stone-600">
            Potwierdzona dostępna powierzchnia etykiety · cm²
            <input
              type="number"
              min={0.1}
              step="0.1"
              value={value.availableDisplaySurfaceCm2 ?? ''}
              onChange={(event) =>
                onChange({
                  ...value,
                  availableDisplaySurfaceCm2: numberOrNull(event.currentTarget.value),
                })
              }
              className={cn(SETTINGS_INPUT_CLASS, 'font-mono tabular-nums')}
            />
          </label>
        ) : null}
        {value.market === 'EU' || value.market === 'UK' || value.market === 'AU_NZ' ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {numberField('energyKjPer100g', 'Energia według zasad rynku', 'kJ / 100 g')}
            <label className="text-xs font-medium text-stone-600">
              Podstawa wartości energii
              <select
                value={facts.energyAuthority ?? 'unresolved'}
                onChange={(event) =>
                  updateFacts({
                    energyAuthority: event.currentTarget.value as NonNullable<
                      typeof facts.energyAuthority
                    >,
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="unresolved">Wymaga potwierdzenia</option>
                <option value="market_factors">Współczynniki rynku</option>
                <option value="laboratory">Laboratorium / dokumentacja produktu</option>
              </select>
            </label>
          </div>
        ) : null}
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
          {numberField('servingVolumeMl', 'Objętość porcji', 'mL')}
          {value.market === 'US' || value.market === 'CA'
            ? numberField('productDensityGPerMl', 'Potwierdzona gęstość produktu', 'g / mL')
            : null}
          {nutrients.map(([key, label, unit]) => numberField(key, label, unit))}
          {value.market === 'US' ? (
            <label className="text-xs font-medium text-stone-600">
              Format tabeli FDA Nutrition Facts
              <select
                value={facts.usFormatFamily ?? 'auto'}
                onChange={(event) =>
                  updateFacts({
                    usFormatFamily: event.currentTarget.value as NonNullable<
                      typeof facts.usFormatFamily
                    >,
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="auto">Automatyczny · według RACC i opakowania</option>
                <option value="standard">Standardowy pionowy</option>
                <option value="tabular">Tabelaryczny · tylko mała powierzchnia</option>
                <option value="linear">Liniowy · tylko mała powierzchnia</option>
                <option value="dual_column">Dwie kolumny</option>
              </select>
            </label>
          ) : null}
          {value.market === 'CA' ? (
            <>
              <label className="text-xs font-medium text-stone-600">
                Canadian reference-amount category
                <select
                  value={facts.canadaProductForm ?? 'unresolved'}
                  onChange={(event) =>
                    updateFacts({
                      canadaProductForm: event.currentTarget.value as NonNullable<
                        typeof facts.canadaProductForm
                      >,
                      canadaReferenceAmountG: null,
                      canadaReferenceAmountMl: null,
                    })
                  }
                  className={SETTINGS_INPUT_CLASS}
                >
                  <option value="unresolved">Wybierz formę produktu</option>
                  <option value="tub">Tub / gelato / sorbet · 188 mL</option>
                  <option value="cake_sandwich_cone">Cake / sandwich / cone · 125 mL</option>
                  <option value="single_portion">Pop / bar / cup · 75 mL</option>
                </select>
              </label>
              <label className="text-xs font-medium text-stone-600">
                Canadian NFT format
                <select
                  value={facts.canadaFormatFamily ?? 'auto'}
                  onChange={(event) =>
                    updateFacts({
                      canadaFormatFamily: event.currentTarget.value as NonNullable<
                        typeof facts.canadaFormatFamily
                      >,
                    })
                  }
                  className={SETTINGS_INPUT_CLASS}
                >
                  <option value="auto">Auto · bilingual Figure 3.4(B) / 15% ADS</option>
                  <option value="bilingual_standard">Bilingual standard · Figure 3.4(B)</option>
                </select>
              </label>
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
        <label className="text-xs text-stone-600">
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
          Format
          <select
            value={value.presetId ?? 'custom'}
            onChange={(event) => {
              const preset = profile.sizePresets.find(
                (candidate) => candidate.id === event.currentTarget.value,
              );
              if (preset) {
                update({
                  widthMm: preset.widthMm,
                  heightMm: preset.heightMm,
                  formatMode: 'preset',
                  presetId: preset.id,
                });
              }
            }}
            className={SETTINGS_INPUT_CLASS}
          >
            <option value="custom">
              {value.formatMode === 'auto' ? 'Auto' : 'Własny'} · {value.widthMm} × {value.heightMm}{' '}
              mm
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
          Kopie
          <input
            type="number"
            min={1}
            value={value.copies}
            onChange={(event) => update({ copies: Math.max(1, Number(event.currentTarget.value)) })}
            className={cn(SETTINGS_INPUT_CLASS, 'font-mono tabular-nums')}
          />
        </label>
      </div>
      <details className="mt-3 border-t border-ink/10 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink">
          Zaawansowane ustawienia drukarki
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
        {profile.workflowNote} Oprogramowanie: {profile.softwareVerification}. Sprzęt:{' '}
        {profile.hardwareVerification}.
      </p>
    </fieldset>
  );
}

function EditorHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink/10 pb-4">
      <div>
        <SectionLabel>Edycja etykiety</SectionLabel>
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
              className={`grid min-h-12 content-center rounded-[10px] border px-2 py-1 text-xs ${market === code ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white'}`}
              onClick={() => onMarket(code)}
            >
              <span>{MARKET_PROFILES[code].label}</span>
              <span className="text-[9px] opacity-70">
                {marketAvailabilityLabel(MARKET_PROFILES[code])}
              </span>
            </button>
          ))}
        </div>
        {market === 'WORLD' ? (
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            Uniwersalna etykieta informacyjna — bez profilu prawnego konkretnego kraju.
          </p>
        ) : null}
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
              onLanguages(parsed.length > 0 ? parsed : [market === 'WORLD' ? 'en' : 'pl']);
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
