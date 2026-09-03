import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { DialogShell } from '@/components/ui/DialogShell';
import { SectionLabel } from '@/components/shared/SectionLabel';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import { buildNutritionDeclaration } from '@/data/label/nutritionLabel';
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
import { announceFriendlyLabMoment } from '@/components/shared/friendlyLabMoment';
import {
  PRINTER_PROFILES,
  normalizePrinterSettings,
  type LabelPrinterSettings,
  type PrinterProfileId,
} from './printerProfiles';
import { assessCanadaFop } from './regulatoryNutrition';
import { downloadMasterLabelPdf } from './masterLabelPdf';
import { customerErrorMessage } from '@/copy/customerError';

const MARKET_CODES: readonly MarketProfileCode[] = MARKET_PROFILE_ORDER;
export type LabelWorkspaceView = 'data' | 'settings' | 'label';

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
  const requiredLanguages = marketProfile(profile.market).requiredLanguages;
  const labelLanguages =
    profile.market === 'WORLD'
      ? profile.labelLanguages.length > 0
        ? profile.labelLanguages
        : ['en']
      : [...new Set([...requiredLanguages, ...profile.labelLanguages])];
  return applyAutoLabelLayout(
    buildMasterLabelData({
      masterLabelId: `master-label:${snapshot.sessionId}`,
      snapshot,
      market: profile.market,
      uiLanguage: profile.uiLanguage,
      labelLanguages,
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
    }),
  );
}

export function LabelWorkspace({
  snapshot: suppliedSnapshot = null,
  runId = null,
  savedSnapshotId = null,
  profileOnly = false,
  repository: suppliedRepository,
  onSaved,
  initialView = 'data',
  settingsHome = 'inline',
}: {
  snapshot?: ProductionCompletionSnapshot | null;
  runId?: string | null;
  savedSnapshotId?: string | null;
  profileOnly?: boolean;
  repository?: LabelRepository;
  onSaved?: (snapshot: RunLabelSnapshot) => void;
  initialView?: LabelWorkspaceView;
  /**
   * OWNER DECISION (2026-08-30) — label settings live in ONE place.
   *
   * `'inline'` (Produkcja → Etykiety, `/labels`) keeps the settings view here:
   * that surface is the canonical home for jurisdiction, operator, packaging
   * and every other persistent label setting.
   *
   * `'production'` (the PRO workbench `Etykieta` tab) removes the settings view
   * from this instance entirely and sends the reader to `/labels` instead. The
   * workbench tab is the CURRENT label plus the fields still missing for it —
   * not a second settings screen. No settings code is deleted or copied; the
   * same authority simply renders in one place.
   */
  settingsHome?: 'inline' | 'production';
}) {
  const settingsLiveHere = settingsHome === 'inline';
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
  const [activeView, setActiveView] = useState<LabelWorkspaceView>(
    initialView === 'settings' && !settingsLiveHere ? 'data' : initialView,
  );
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
  const preflight = useMemo(() => (label ? buildLabelPreflight(label) : null), [label]);
  const labelDataReady = preflight?.readyForSystemPrint ?? false;
  /* OWNER DECISION (2026-08-30) — in the PRO workbench the LABEL comes first.
     At home (`/labels`) an incomplete label still opens on its data view, which
     is the settings-and-completion surface. In the workbench that would put a
     form in front of the thing the reader came to see, so the label stays on
     screen and the missing fields are stacked underneath it instead. */
  const visibleView: LabelWorkspaceView = saved
    ? 'label'
    : !labelDataReady
      ? settingsLiveHere
        ? 'data'
        : 'label'
      : activeView;
  /** The workbench stacks preview → missing data → actions in one flow. */
  const stackMissingDataUnderLabel = !settingsLiveHere && !saved && !labelDataReady;

  const openView = (next: LabelWorkspaceView) => {
    if (next === 'settings' && !settingsLiveHere) return;
    if (next === visibleView || (next === 'settings' && saved)) return;
    if (next === 'label' && !saved && !labelDataReady) return;
    const order: readonly LabelWorkspaceView[] = ['data', 'label', 'settings'];
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
    const order: readonly LabelWorkspaceView[] = settingsLiveHere
      ? ['data', 'label', 'settings']
      : ['data', 'label'];
    const currentIndex = order.indexOf(visibleView);
    const next = order[currentIndex + (deltaX < 0 ? 1 : -1)];
    if (next) openView(next);
  };

  if (busy && !profile) {
    return <p className="py-8 text-sm text-[var(--g-text-secondary)]">Sprawdzamy profil i zapis etykiety…</p>;
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
                <div className="grid size-16 place-items-center border border-[var(--g-line)] text-xs text-[var(--g-text-muted)]">
                  Logo
                </div>
              )}
              <div>
                <h2 className="text-xl font-semibold text-ink">
                  {profile.businessName || 'Nazwa firmy nieuzupełniona'}
                </h2>
                <p className="mt-1 text-sm text-[var(--g-text-secondary)]">
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
        title="Jeszcze nie ma partii do etykiety"
        description="Zakończ produkcję, a przygotujemy etykietę z zatwierdzonego wyniku partii."
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
    unresolved[0]?.message ?? activeMarket.externalAssetRequirement ?? 'Uzupełnij wymagane dane.';
  const percentages = snapshot.finalResult.percentages;
  const announceReadyTransition = (next: MasterLabelData) => {
    const nextReady = buildLabelPreflight(next).readyForSystemPrint;
    if (!labelDataReady && nextReady) {
      announceFriendlyLabMoment('label-ready', `label:${next.masterLabelId}:ready`);
    }
    return nextReady;
  };

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
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--g-line)] p-4 sm:p-5">
                <div>
                  <SectionLabel>Etykieta produktu</SectionLabel>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-ink">{productName}</h2>
                    <span
                      className="rounded-full border border-[var(--g-line)] bg-[var(--g-ivory)] px-2.5 py-1 text-xs font-semibold"
                      data-testid="active-label-market"
                    >
                      {activeMarket.flag} {activeMarket.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--g-text-secondary)]">
                    Wybrany rynek wyznacza wymagane dane i układ wydruku
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
                    <SettingsEntry
                      settingsLiveHere={settingsLiveHere}
                      onOpen={() => openView(labelDataReady ? 'settings' : 'data')}
                    />
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
              {!preflight?.readyForSystemPrint ? (
                <div
                  className="border-b border-[var(--g-line)] bg-[var(--g-ivory-deep)] px-4 py-3"
                  role="status"
                  data-testid="label-print-blocked-message"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[var(--g-ink)]">
                      Do wydruku brakuje: {unresolved.length}{' '}
                      {unresolved.length === 1 ? 'pozycja' : 'pozycji'}
                    </span>
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-4"
                      onClick={() =>
                        openView(settingsLiveHere && labelDataReady ? 'settings' : 'data')
                      }
                      disabled={Boolean(saved)}
                    >
                      {printBlockedReason}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="border-b border-[var(--g-line)] bg-white px-4 py-3 text-[11px] text-[var(--g-text-secondary)]">
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
                    Czytelność {preflight?.geometry.baseFontPt.toFixed(2)} pt · wysokość znaków{' '}
                    {preflight?.geometry.xHeightMm.toFixed(2)} mm
                  </span>
                </div>
                <p className="mt-1 text-[var(--g-text-secondary)]">
                  Podgląd, PDF i wydruk zachowują ten sam układ i wymiary. PDF możesz przygotować
                  bez podłączonej drukarki.
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
                <p className="mt-3 text-[11px] text-[var(--g-text-secondary)]">Dane wewnętrzne · poza wydrukiem</p>
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

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--g-line)] bg-white px-4 py-3">
              <p className="text-xs text-[var(--g-text-secondary)]">
                {saved
                  ? `Etykieta partii zapisana · ${new Date(saved.createdAt).toLocaleString('pl-PL')}`
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
            {stackMissingDataUnderLabel ? (
              <div data-testid="label-missing-data-stack">
                <CompactRunLabelEditor
                  label={label}
                  onSave={async (next) => {
                    announceReadyTransition(next);
                    setLabel(next);
                  }}
                />
              </div>
            ) : null}
          </>
        ) : visibleView === 'data' ? (
          <CompactRunLabelEditor
            label={label}
            onSave={async (next) => {
              announceReadyTransition(next);
              setLabel(next);
              setTransitionDirection('forward');
              setActiveView('label');
            }}
          />
        ) : (
          <CompactRunLabelSettings
            label={label}
            saveAsDefault={saveAsDefault}
            onSaveAsDefaultChange={setSaveAsDefault}
            onClose={() => openView('label')}
            onSave={async (next) => {
              setBusy(true);
              setError(null);
              try {
                if (saveAsDefault) await persistProfile(profileFromLabel(profile, next));
                const nextReady = announceReadyTransition(next);
                setLabel(next);
                setTransitionDirection('forward');
                setActiveView(nextReady ? 'label' : 'data');
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

      {settingsLiveHere ? (
      <nav
        aria-label="Widoki workspace etykiety"
        className="sticky bottom-[var(--label-workspace-bottom-inset,0px)] z-20 flex min-h-11 items-center justify-center gap-2 border-t border-[var(--g-line-quiet)] bg-white/95 px-4 backdrop-blur"
        data-testid="label-workspace-dots"
      >
        {(
          settingsLiveHere
            ? ([
                ['data', 'Dane do etykiety'],
                ['label', 'Etykieta'],
                ['settings', 'Ustawienia etykiety'],
              ] as const)
            : ([
                ['data', 'Dane do etykiety'],
                ['label', 'Etykieta'],
              ] as const)
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
                  (view === 'label' && visibleView !== 'label' && !labelDataReady)
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
                visibleView === view && 'w-4 border-[var(--g-orange)] bg-[var(--g-orange)]',
              )}
            />
          </button>
        ))}
      </nav>
      ) : null}
      <style>{`
        @keyframes labelWorkspaceInFromRight { from { opacity: .55; transform: translateX(22px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes labelWorkspaceInFromLeft { from { opacity: .55; transform: translateX(-22px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}

function OverviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="min-w-0 rounded-[18px] border border-[var(--g-line)] bg-white p-4 shadow-pro-e0">
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
      <dt className="text-[var(--g-text-secondary)]">{label}</dt>
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
      <details className="mt-4 rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)] p-[18px]" open>
        <summary className="cursor-pointer text-[14px] leading-[1.35] font-bold text-[var(--g-ink)]">
          Dane firmy i trwałość · używane ponownie
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)] sm:col-span-2">
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
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)] sm:col-span-2">
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
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)] sm:col-span-2">
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

const QUICK_PRINTER_IDS: readonly PrinterProfileId[] = [
  'system_a4_letter',
  'zebra_zd421_300',
  'brother_ql_1110nwbc',
  'aimo_243bt',
];

function CompactRunLabelSettings({
  label,
  saveAsDefault,
  onSaveAsDefaultChange,
  onClose,
  onSave,
}: {
  label: MasterLabelData;
  saveAsDefault: boolean;
  onSaveAsDefaultChange: (value: boolean) => void;
  onClose: () => void;
  onSave: (label: MasterLabelData) => Promise<void>;
}) {
  const [draft, setDraft] = useState(label);
  const changeMarket = (market: MarketProfileCode) => {
    const nextProfile = marketProfile(market);
    const labelLanguages =
      market === 'WORLD'
        ? ['en']
        : [...new Set([...nextProfile.requiredLanguages, ...draft.labelLanguages])];
    setDraft(
      applyAutoLabelLayout({
        ...draft,
        market,
        marketProfileVersion: nextProfile.version,
        labelLanguages,
        enabledOptionalFields: normalizeEnabledOptionalFields(market, draft.enabledOptionalFields),
        jurisdictionContext: {
          euDestinationCountryCode:
            market === 'EU' ? (draft.jurisdictionContext?.euDestinationCountryCode ?? '') : '',
          ukRegion:
            market === 'UK' ? (draft.jurisdictionContext?.ukRegion ?? 'unresolved') : 'unresolved',
          auNzCountry: 'unresolved',
          usSaleContext:
            market === 'US'
              ? (draft.jurisdictionContext?.usSaleContext ?? 'unresolved')
              : 'unresolved',
        },
        preflightAcknowledged: false,
      }),
    );
  };

  return (
    <Card
      padding="none"
      className="mx-auto max-w-3xl overflow-hidden rounded-[22px] border-[var(--g-line)] shadow-pro-e1"
      data-testid="label-settings-view"
    >
      <header className="border-b border-[var(--g-line)] bg-white px-4 py-5 sm:px-6">
        <button
          type="button"
          onClick={onClose}
          className="pro-focus-ring -ml-1 min-h-11 px-1 text-xs font-semibold text-[var(--g-text-secondary)] hover:text-ink"
        >
          ← Etykieta
        </button>
        <SectionLabel>Ustawienia etykiety</SectionLabel>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink">
          Profil, format i drukarka
        </h2>
        <p className="mt-1 text-sm text-[var(--g-text-secondary)]">
          Tylko konfiguracja. Brakujące dane produktu zawsze wracają do kroku 1.
        </p>
      </header>

      <div className="px-4 sm:px-6">
        <SettingsSection title="Rynek i język">
          <label className="block text-xs font-medium text-[var(--g-text-secondary)]">
            Rynek sprzedaży
            <select
              data-testid="label-market-select"
              value={draft.market}
              onChange={(event) => changeMarket(event.currentTarget.value as MarketProfileCode)}
              className={SETTINGS_INPUT_CLASS}
            >
              {MARKET_CODES.map((code) => (
                <option key={code} value={code}>
                  {MARKET_PROFILES[code].label}
                  {code === 'WORLD' ? ' — tylko informacyjnie' : ''}
                </option>
              ))}
            </select>
          </label>
          {draft.market === 'AU_NZ' ? (
            <p className="mt-2 text-xs text-[var(--g-text-secondary)]" data-testid="au-nz-shared-profile-note">
              Jeden wspólny profil. Automatycznie stosuje bezpieczny zestaw wymagań Australii i
              Nowej Zelandii.
            </p>
          ) : null}
          {draft.market === 'WORLD' ? (
            <p className="mt-2 rounded-[10px] border border-[#9b5f55]/30 bg-[#fff7f5] px-3 py-2 text-xs font-semibold text-[#7e4037]">
              ETYKIETA WEWNĘTRZNA / INFORMACYJNA · NIEZWERYFIKOWANA DO SPRZEDAŻY DETALICZNEJ
            </p>
          ) : null}
          <label className="mt-3 block text-xs font-medium text-[var(--g-text-secondary)]">
            Języki etykiety · po przecinku
            <input
              value={draft.labelLanguages.join(', ')}
              onChange={(event) => {
                const parsed = event.currentTarget.value
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean);
                const required = marketProfile(draft.market).requiredLanguages;
                setDraft({
                  ...draft,
                  labelLanguages: [...new Set([...required, ...(parsed.length ? parsed : ['en'])])],
                  preflightAcknowledged: false,
                });
              }}
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
        </SettingsSection>

        <SettingsSection title="Drukarka i format">
          <button
            type="button"
            className={cn(
              'pro-focus-ring min-h-11 rounded-[10px] border px-3 text-xs font-semibold',
              draft.layoutMode === 'auto'
                ? 'border-ink bg-ink text-white'
                : 'border-[var(--g-line)] bg-white text-ink',
            )}
            onClick={() => setDraft(applyAutoLabelLayout(draft))}
          >
            Format: Auto
          </button>
          <CompactPrinterFields
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
          <details className="mt-3 rounded-[12px] border border-[var(--g-line)] bg-white p-3">
            <summary className="cursor-pointer text-xs font-semibold text-ink">
              Własny rozmiar i ustawienia zaawansowane
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

        <label className="my-5 flex min-h-12 items-center gap-3 rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)] px-3 text-xs text-ink">
          <input
            type="checkbox"
            className="size-5 accent-ink"
            checked={saveAsDefault}
            onChange={(event) => onSaveAsDefaultChange(event.currentTarget.checked)}
          />
          Zapamiętaj jako domyślne dla następnych etykiet.
        </label>
      </div>

      <footer className="sticky bottom-11 z-10 grid grid-cols-2 gap-2 border-t border-[var(--g-line)] bg-white/95 p-4 backdrop-blur sm:px-6">
        <Button variant="ghost" onClick={onClose}>
          Wstecz
        </Button>
        <Button data-testid="apply-label-settings" onClick={() => void onSave(draft)}>
          Zastosuj ustawienia
        </Button>
      </footer>
    </Card>
  );
}

function CompactPrinterFields({
  value,
  onChange,
}: {
  value: LabelPrinterSettings;
  onChange: (value: LabelPrinterSettings) => void;
}) {
  const setProfile = (profileId: PrinterProfileId) => {
    const profile = PRINTER_PROFILES[profileId];
    onChange(
      normalizePrinterSettings({
        ...value,
        profileId,
        connection: profile.supportedConnections.includes(value.connection)
          ? value.connection
          : profile.supportedConnections[0],
        dpi: profile.dpiOptions.includes(value.dpi) ? value.dpi : profile.dpiOptions[0],
      }),
    );
  };
  const profile = PRINTER_PROFILES[value.profileId];
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-[var(--g-text-secondary)]">
        Drukarka
        <select
          value={QUICK_PRINTER_IDS.includes(value.profileId) ? value.profileId : 'more'}
          onChange={(event) =>
            event.currentTarget.value !== 'more' &&
            setProfile(event.currentTarget.value as PrinterProfileId)
          }
          className={SETTINGS_INPUT_CLASS}
        >
          {QUICK_PRINTER_IDS.map((id) => (
            <option key={id} value={id}>
              {id === 'system_a4_letter'
                ? 'PDF / drukarka systemowa'
                : `${PRINTER_PROFILES[id].manufacturer} ${PRINTER_PROFILES[id].model}`}
            </option>
          ))}
          <option value="more">Więcej drukarek…</option>
        </select>
      </label>
      <label className="text-xs font-medium text-[var(--g-text-secondary)]">
        Format
        <select
          value={value.presetId ?? 'auto'}
          onChange={(event) => {
            const preset = profile.sizePresets.find(
              (candidate) => candidate.id === event.currentTarget.value,
            );
            onChange(
              normalizePrinterSettings(
                preset
                  ? {
                      ...value,
                      widthMm: preset.widthMm,
                      heightMm: preset.heightMm,
                      formatMode: 'preset',
                      presetId: preset.id,
                    }
                  : { ...value, formatMode: 'auto', presetId: null },
              ),
            );
          }}
          className={SETTINGS_INPUT_CLASS}
        >
          <option value="auto">Auto</option>
          {profile.sizePresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <details className="sm:col-span-2 rounded-[10px] border border-[var(--g-line)] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink">Więcej drukarek</summary>
        <label className="mt-2 block text-xs font-medium text-[var(--g-text-secondary)]">
          Pełna lista
          <select
            value={value.profileId}
            onChange={(event) => setProfile(event.currentTarget.value as PrinterProfileId)}
            className={SETTINGS_INPUT_CLASS}
          >
            {Object.values(PRINTER_PROFILES).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.id === 'system_a4_letter'
                  ? 'PDF / drukarka systemowa'
                  : `${candidate.manufacturer} ${candidate.model}`}
              </option>
            ))}
          </select>
        </label>
      </details>
    </div>
  );
}

export function LegacyRunLabelSettings({
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
  const updateOptionalText = (
    field: 'origin' | 'customerNote' | 'shortDescription',
    value: string,
  ) => setDraft({ ...draft, [field]: { ...draft[field], [primaryLanguage]: value } });

  return (
    <Card
      padding="none"
      className="overflow-hidden rounded-[18px] border-[var(--g-line)] shadow-pro-e0"
      data-testid="label-settings-view"
    >
      <header className="border-b border-[var(--g-line)] bg-[var(--g-ivory)] px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          className="pro-focus-ring -ml-1 min-h-11 px-1 text-xs font-semibold text-[var(--g-text-secondary)] transition-colors hover:text-ink"
        >
          ← Etykieta
        </button>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel>Ustawienia etykiety</SectionLabel>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
              Profil, format i drukarka
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--g-text-secondary)]">
              Konfiguracja wydruku i opcjonalnych elementów. Obowiązkowe dane uzupełnia się w kroku
              1
            </p>
          </div>
          <span className="rounded-full border border-[var(--g-line)] bg-white px-2.5 py-1 text-xs font-semibold text-ink">
            {marketProfile(draft.market).flag} {marketProfile(draft.market).label}
          </span>
        </div>
      </header>

      <div className="px-4 sm:px-5">
        <SettingsSection title="Rynek i profil">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <option value="retail_consumer">Detaliczna / konsumencka</option>
                <option value="internal_production">Wewnętrzna produkcyjna</option>
                <option value="display_gelateria">Ekspozycja / gelateria</option>
              </select>
            </label>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <option value="prepacked">Produkt paczkowany</option>
                <option value="ppds">PPDS / pakowane w miejscu sprzedaży</option>
                <option value="loose_non_prepacked">Loose / nieopakowane</option>
              </select>
            </label>
          </div>
          <div className="mt-3">
            <span className="text-xs font-medium text-[var(--g-text-secondary)]">Jurysdykcja / profil</span>
            <div className="mt-2 grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3">
              {MARKET_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={cn(
                    'pro-focus-ring grid min-h-12 content-center rounded-[10px] border px-2 py-1 text-xs font-semibold transition-colors',
                    draft.market === code
                      ? 'border-ink bg-ink text-white'
                      : 'border-[var(--g-line)] bg-white text-ink hover:bg-[var(--g-ivory)]',
                  )}
                  data-market-active={draft.market === code ? 'true' : undefined}
                  title={MARKET_PROFILES[code].jurisdiction}
                  onClick={() => {
                    const nextProfile = MARKET_PROFILES[code];
                    const labelLanguages =
                      code === 'WORLD'
                        ? ['en']
                        : [...new Set([...nextProfile.requiredLanguages, ...draft.labelLanguages])];
                    setDraft(
                      applyAutoLabelLayout({
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
                        preflightAcknowledged: false,
                      }),
                    );
                  }}
                >
                  <span>{MARKET_PROFILES[code].label}</span>
                  <span className="text-[9px] font-medium opacity-70">
                    {marketAvailabilityLabel(MARKET_PROFILES[code])}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <label className="mt-3 block text-xs font-medium text-[var(--g-text-secondary)]">
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

        <SettingsSection title="Marka i elementy opcjonalne">
          <label className="block text-xs font-medium text-[var(--g-text-secondary)]">
            Marka / nazwa firmy
            <input
              value={draft.businessName}
              onChange={(event) => setDraft({ ...draft, businessName: event.currentTarget.value })}
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
          <label className="mt-3 flex min-h-14 items-center gap-3 rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)] p-3 text-xs text-[var(--g-text-secondary)]">
            {logoUrl ? (
              <img src={logoUrl} alt="Aktualne logo" className="size-12 object-contain" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-[10px] border border-[var(--g-line)] bg-white text-[10px] text-[var(--g-text-muted)]">
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
          <OptionalFieldSettings
            market={draft.market}
            enabled={draft.enabledOptionalFields}
            onChange={(enabledOptionalFields) => setDraft({ ...draft, enabledOptionalFields })}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {draft.enabledOptionalFields.includes('origin') ? (
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Pochodzenie
                <input
                  value={draft.origin[primaryLanguage] ?? ''}
                  onChange={(event) => updateOptionalText('origin', event.currentTarget.value)}
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
            {draft.enabledOptionalFields.includes('customer_note') ? (
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Nota dla klienta
                <input
                  value={draft.customerNote[primaryLanguage] ?? ''}
                  onChange={(event) =>
                    updateOptionalText('customerNote', event.currentTarget.value)
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
            {draft.enabledOptionalFields.includes('short_description') ? (
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Krótki opis
                <input
                  value={draft.shortDescription?.[primaryLanguage] ?? ''}
                  onChange={(event) =>
                    updateOptionalText('shortDescription', event.currentTarget.value)
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
            {draft.enabledOptionalFields.includes('qr_code') ? (
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Potwierdzony GTIN / EAN
                <input
                  inputMode="numeric"
                  value={draft.gtin ?? ''}
                  onChange={(event) => setDraft({ ...draft, gtin: event.currentTarget.value })}
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection title="Format i drukarka">
          <button
            type="button"
            className={cn(
              'pro-focus-ring min-h-11 rounded-[10px] border px-3 text-xs font-semibold',
              draft.layoutMode === 'auto'
                ? 'border-ink bg-ink text-white'
                : 'border-[var(--g-line)] bg-white text-ink',
            )}
            onClick={() => setDraft(applyAutoLabelLayout(draft))}
          >
            Auto · wybierz najmniejszy format, który spełnia wymagania wydruku
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
          <details className="mt-3 rounded-[12px] border border-[var(--g-line)] bg-white p-3">
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

        <label className="my-5 flex min-h-12 items-center gap-3 rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)] px-3 text-xs text-ink">
          <input
            type="checkbox"
            className="size-5 accent-ink"
            checked={saveAsDefault}
            onChange={(event) => onSaveAsDefaultChange(event.currentTarget.checked)}
          />
          Zapisz konfigurację jako domyślną dla przyszłych etykiet.
        </label>
      </div>

      <footer className="sticky bottom-11 z-10 grid grid-cols-2 gap-2 border-t border-[var(--g-line)] bg-white/95 p-4 backdrop-blur sm:px-5">
        <Button variant="ghost" onClick={onClose}>
          Wróć do etykiety
        </Button>
        <Button data-testid="apply-label-settings" onClick={() => void onSave(draft)}>
          Zastosuj ustawienia
        </Button>
      </footer>
    </Card>
  );
}

const EU_DESTINATIONS = [
  ['AT', 'Austria', 'de'],
  ['BE', 'Belgium', 'nl'],
  ['BG', 'Bulgaria', 'bg'],
  ['HR', 'Croatia', 'hr'],
  ['CY', 'Cyprus', 'el'],
  ['CZ', 'Czechia', 'cs'],
  ['DE', 'Germany', 'de'],
  ['DK', 'Denmark', 'da'],
  ['EE', 'Estonia', 'et'],
  ['ES', 'Spain', 'es'],
  ['FI', 'Finland', 'fi'],
  ['FR', 'France', 'fr'],
  ['GR', 'Greece', 'el'],
  ['HU', 'Hungary', 'hu'],
  ['IE', 'Ireland', 'en'],
  ['IT', 'Italy', 'it'],
  ['LT', 'Lithuania', 'lt'],
  ['LU', 'Luxembourg', 'fr'],
  ['LV', 'Latvia', 'lv'],
  ['MT', 'Malta', 'en'],
  ['NL', 'Netherlands', 'nl'],
  ['PL', 'Poland', 'pl'],
  ['PT', 'Portugal', 'pt'],
  ['RO', 'Romania', 'ro'],
  ['SE', 'Sweden', 'sv'],
  ['SI', 'Slovenia', 'sl'],
  ['SK', 'Slovakia', 'sk'],
] as const;

function missingCtaLabel(count: number): string {
  if (count === 0) return 'Pokaż etykietę';
  if (count === 1) return 'Uzupełnij 1 pole';
  if (count >= 2 && count <= 4) return `Uzupełnij ${count} pola`;
  return `Uzupełnij ${count} pól`;
}

function CompactRunLabelEditor({
  label,
  onSave,
}: {
  label: MasterLabelData;
  onSave: (label: MasterLabelData) => Promise<void>;
}) {
  const [draft, setDraft] = useState(label);
  const [splitPackages, setSplitPackages] = useState(false);
  const [packageCount, setPackageCount] = useState(1);
  const printDraft = useMemo(
    () => (draft.layoutMode === 'auto' ? applyAutoLabelLayout(draft) : draft),
    [draft],
  );
  const preflight = useMemo(() => buildLabelPreflight(printDraft), [printDraft]);
  const blockers = preflight.items.filter((item) => item.status !== 'ready');
  const missing = (field: string) => blockers.some((item) => item.field === field);
  const actualMass = draft.actualBatchQuantityG ?? 0;
  const setText = (
    field: 'productName' | 'legalProductName' | 'storageInstructions' | 'origin',
    language: string,
    value: string,
  ) => setDraft({ ...draft, [field]: { ...draft[field], [language]: value } });
  const setPackageMass = (mass: number | null) =>
    setDraft({
      ...draft,
      netQuantityG: mass,
      packageQuantity: mass
        ? {
            value: mass,
            unit: 'g',
            netWeightG: mass,
            netVolumeMl: draft.packageQuantity?.netVolumeMl ?? null,
            source: splitPackages ? 'selected_fill' : 'measured_fill',
            confirmedAt: new Date().toISOString(),
          }
        : null,
    });
  const completedFacts = [
    ['Nazwa produktu', !missing('product_name')],
    ['Rzeczywista masa partii', actualMass > 0],
    ['LOT', !missing('lot')],
    ['Składniki', !missing('ingredients')],
    ['Alergeny', !missing('allergens')],
    ['Wartości odżywcze', !missing('nutrition')],
  ] as const;

  return (
    <Card
      padding="none"
      className="mx-auto max-w-3xl overflow-hidden rounded-[22px] border-[var(--g-line)] shadow-pro-e1"
      data-testid="label-data-intake"
      data-label-market={draft.market}
    >
      <header className="border-b border-[var(--g-line)] bg-white px-4 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionLabel>Dane do etykiety</SectionLabel>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink">
              Dokończ etykietę
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--g-text-secondary)]">
              Pokazujemy tylko informacje, których nie możemy bezpiecznie uzupełnić z tej partii.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--g-line)] bg-[var(--g-ivory)] px-2.5 py-1 text-xs font-semibold">
            {marketProfile(draft.market).flag} {marketProfile(draft.market).label}
          </span>
        </div>
        {draft.market === 'WORLD' ? (
          <div className="mt-4 rounded-[12px] border border-[#9b5f55]/35 bg-[#fff7f5] px-3 py-2 text-xs font-semibold text-[#7e4037]">
            ETYKIETA WEWNĘTRZNA / INFORMACYJNA · NIEZWERYFIKOWANA DO SPRZEDAŻY DETALICZNEJ
          </div>
        ) : null}
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-6">
        <section className="rounded-[16px] border border-status-ideal/20 bg-status-ideal/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Uzupełnione z produkcji</h3>
            <span className="text-[10px] font-semibold tracking-[0.08em] text-status-success uppercase">
              Dane rzeczywiste
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {completedFacts.map(([name, ready]) => (
              <div key={name} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-[var(--g-text-secondary)]">
                  {name === 'Nazwa produktu'
                    ? primaryText(draft.productName, draft.labelLanguages) || name
                    : name === 'Rzeczywista masa partii'
                      ? `${name} · ${actualMass} g`
                      : name}
                </span>
                <span className={ready ? 'font-semibold text-status-success' : 'text-[var(--g-attention-ink)]'}>
                  {ready ? '✓ GOTOWE' : 'WYMAGA DANYCH'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          className={cn(
            'rounded-[16px] border bg-white p-4',
            missing('net_quantity') ? 'border-[var(--g-attention-ink)]/55 bg-[var(--g-attention-surface)]' : 'border-[var(--g-line)]',
          )}
          data-label-field="net_quantity"
          data-missing-required={missing('net_quantity') ? 'true' : undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Opakowanie</h3>
              <p className="mt-0.5 text-xs text-[var(--g-text-secondary)]">
                Domyślnie cała zakończona partia jest jednym opakowaniem.
              </p>
            </div>
            {!missing('net_quantity') ? (
              <span className="text-[10px] font-semibold text-status-success">✓ GOTOWE</span>
            ) : (
              <RequiredBadge />
            )}
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-3 rounded-[12px] bg-[var(--g-ivory)] px-3 text-sm font-medium text-ink">
            <input
              type="radio"
              name="package-mode"
              checked={!splitPackages}
              onChange={() => {
                setSplitPackages(false);
                setPackageCount(1);
                setPackageMass(actualMass || null);
              }}
            />
            Cała partia = jedno opakowanie
          </label>
          {!splitPackages ? (
            <label className="mt-3 block text-xs font-medium text-[var(--g-text-secondary)]">
              Masa netto · g
              <input
                data-testid="whole-batch-package-mass"
                type="number"
                min={0.1}
                step="any"
                value={draft.packageQuantity?.netWeightG ?? ''}
                onChange={(event) => setPackageMass(Number(event.currentTarget.value) || null)}
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          ) : null}
          <label className="mt-2 flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={splitPackages}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setSplitPackages(checked);
                if (!checked) {
                  setPackageCount(1);
                  setPackageMass(actualMass || null);
                }
              }}
            />
            Dzielę na kilka opakowań
          </label>
          {splitPackages ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Masa jednego opakowania · g
                <input
                  type="number"
                  min={0.1}
                  step="any"
                  value={draft.packageQuantity?.netWeightG ?? ''}
                  onChange={(event) => setPackageMass(Number(event.currentTarget.value) || null)}
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Liczba opakowań
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={packageCount}
                  onChange={(event) => {
                    const count = Math.max(1, Math.floor(Number(event.currentTarget.value) || 1));
                    setPackageCount(count);
                    setPackageMass(actualMass > 0 ? actualMass / count : null);
                  }}
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            </div>
          ) : null}
          {draft.market === 'CA' ? (
            <label className="mt-3 block text-xs font-medium text-[var(--g-text-secondary)]">
              Obowiązkowa objętość netto dla Canada · mL
              <input
                type="number"
                min={0.1}
                step="any"
                value={draft.packageQuantity?.netVolumeMl ?? ''}
                onChange={(event) => {
                  const ml = Number(event.currentTarget.value) || null;
                  setDraft({
                    ...draft,
                    packageQuantity: ml
                      ? {
                          value: ml,
                          unit: 'ml',
                          netVolumeMl: ml,
                          netWeightG: draft.packageQuantity?.netWeightG ?? null,
                          source: 'selected_fill',
                          confirmedAt: new Date().toISOString(),
                        }
                      : null,
                  });
                }}
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          ) : null}
        </section>

        {missing('jurisdiction_context') ? (
          <MissingDataCard field="jurisdiction_context" title="Kontekst sprzedaży">
            {draft.market === 'EU' ? (
              <label className="block text-xs font-medium text-[var(--g-text-secondary)]">
                Docelowe państwo członkowskie
                <select
                  value={draft.jurisdictionContext?.euDestinationCountryCode ?? ''}
                  onChange={(event) => {
                    const destination = EU_DESTINATIONS.find(
                      ([code]) => code === event.currentTarget.value,
                    );
                    const language = destination?.[2];
                    setDraft({
                      ...draft,
                      labelLanguages: language
                        ? [...new Set([...draft.labelLanguages, language])]
                        : draft.labelLanguages,
                      jurisdictionContext: {
                        euDestinationCountryCode: event.currentTarget.value,
                        ukRegion: draft.jurisdictionContext?.ukRegion ?? 'unresolved',
                        auNzCountry: 'unresolved',
                        usSaleContext: draft.jurisdictionContext?.usSaleContext ?? 'unresolved',
                      },
                    });
                  }}
                  className={SETTINGS_INPUT_CLASS}
                >
                  <option value="">Wybierz kraj sprzedaży</option>
                  {EU_DESTINATIONS.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : draft.market === 'UK' ? (
              <label className="block text-xs font-medium text-[var(--g-text-secondary)]">
                Obszar sprzedaży
                <select
                  value={draft.jurisdictionContext?.ukRegion ?? 'unresolved'}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      jurisdictionContext: {
                        euDestinationCountryCode:
                          draft.jurisdictionContext?.euDestinationCountryCode ?? '',
                        ukRegion: event.currentTarget.value as 'GB' | 'NI' | 'unresolved',
                        auNzCountry: 'unresolved',
                        usSaleContext: draft.jurisdictionContext?.usSaleContext ?? 'unresolved',
                      },
                    })
                  }
                  className={SETTINGS_INPUT_CLASS}
                >
                  <option value="unresolved">Wybierz obszar</option>
                  <option value="GB">Wielka Brytania</option>
                  <option value="NI">Irlandia Północna</option>
                </select>
              </label>
            ) : draft.market === 'US' ? (
              <label className="block text-xs font-medium text-[var(--g-text-secondary)]">
                Sposób sprzedaży
                <select
                  value={draft.jurisdictionContext?.usSaleContext ?? 'unresolved'}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      jurisdictionContext: {
                        euDestinationCountryCode:
                          draft.jurisdictionContext?.euDestinationCountryCode ?? '',
                        ukRegion: draft.jurisdictionContext?.ukRegion ?? 'unresolved',
                        auNzCountry: 'unresolved',
                        usSaleContext: event.currentTarget.value as
                          | 'interstate_retail'
                          | 'food_service'
                          | 'unresolved',
                      },
                    })
                  }
                  className={SETTINGS_INPUT_CLASS}
                >
                  <option value="unresolved">Wybierz sposób sprzedaży</option>
                  <option value="interstate_retail">Pakowany produkt detaliczny</option>
                  <option value="food_service">Food service</option>
                </select>
              </label>
            ) : null}
          </MissingDataCard>
        ) : null}

        {missing('product_name') ? (
          <MissingTextFields
            field="product_name"
            title="Nazwa produktu"
            languages={draft.labelLanguages}
            values={draft.productName}
            onChange={(language, value) => setText('productName', language, value)}
          />
        ) : null}
        {missing('legal_product_name') ? (
          <MissingTextFields
            field="legal_product_name"
            title="Prawna nazwa produktu"
            languages={draft.labelLanguages}
            values={draft.legalProductName}
            onChange={(language, value) => setText('legalProductName', language, value)}
          />
        ) : null}
        {missing('operator') ? <MissingOperatorFields value={draft} onChange={setDraft} /> : null}
        {missing('date_mark') ? (
          <MissingDataCard field="date_mark" title="Data trwałości">
            <label className="block text-xs font-medium text-[var(--g-text-secondary)]">
              Najlepiej spożyć przed
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
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          </MissingDataCard>
        ) : null}
        {missing('production_date') ? (
          <MissingDataCard field="production_date" title="Data produkcji">
            <label className="block text-xs font-medium text-[var(--g-text-secondary)]">
              Data zakończenia produkcji
              <input
                type="date"
                value={draft.productionDate}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    productionDate: event.currentTarget.value,
                    productionDateReviewed: Boolean(event.currentTarget.value),
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          </MissingDataCard>
        ) : null}
        {missing('lot') ? (
          <MissingDataCard field="lot" title="Identyfikator partii Nr partii">
            <label className="block text-xs font-medium text-[var(--g-text-secondary)]">
              LOT
              <input
                value={draft.lotCode}
                onChange={(event) => setDraft({ ...draft, lotCode: event.currentTarget.value })}
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          </MissingDataCard>
        ) : null}
        {missing('storage') ? (
          <MissingTextFields
            field="storage"
            title="Warunki przechowywania"
            languages={draft.labelLanguages}
            values={draft.storageInstructions}
            onChange={(language, value) => setText('storageInstructions', language, value)}
          />
        ) : null}
        {missing('origin') ? (
          <MissingTextFields
            field="origin"
            title="Kraj pochodzenia · wymagany przez wspólny profil AU/NZ"
            languages={draft.labelLanguages}
            values={draft.origin}
            onChange={(language, value) => setText('origin', language, value)}
          />
        ) : null}
        {missing('ingredients') ? (
          <MissingDataCard field="ingredients" title="Deklaracja składników">
            <IngredientAuthorityFields value={draft} onChange={setDraft} />
          </MissingDataCard>
        ) : null}
        {missing('allergens') ? (
          <MissingDataCard field="allergens" title="Alergeny">
            {draft.allergens.status === 'complete' ? (
              <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
                <input
                  type="checkbox"
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
                Potwierdzam deklarację:{' '}
                {[...draft.allergens.declared, ...draft.allergens.mayContain].join(', ') ||
                  'brak zadeklarowanych alergenów'}
                .
              </label>
            ) : (
              <p className="text-xs leading-relaxed text-[#7e4037]">
                Brakuje potwierdzonych danych źródłowych składników. Nie można ich zastąpić potwierdzeniem
                na tym ekranie.
              </p>
            )}
          </MissingDataCard>
        ) : null}
        {missing('nutrition') ? (
          <MissingDataCard field="nutrition" title="Wartości odżywcze">
            <p className="text-xs text-[#7e4037]">
              Brakuje finalnego obliczenia bieżącej partii. Etykieta nie przelicza ani nie zgaduje
              tych danych.
            </p>
          </MissingDataCard>
        ) : null}
        {missing('market_nutrition') ? (
          <CompactMarketNutritionFields value={draft} onChange={setDraft} />
        ) : null}
        {missing('alcohol_declaration') ? (
          <MissingAlcoholFields value={draft} onChange={setDraft} />
        ) : null}
        {missing('acknowledgement') ? (
          <MissingDataCard field="acknowledgement" title="Ostatnie potwierdzenie">
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.preflightAcknowledged}
                onChange={(event) =>
                  setDraft({ ...draft, preflightAcknowledged: event.currentTarget.checked })
                }
              />
              Sprawdziłem dane etykiety przed wydrukiem.
            </label>
          </MissingDataCard>
        ) : null}

        {missing('languages') ? (
          <MissingDataCard field="languages" title="Wymagane języki etykiety">
            <label className="block text-xs font-medium text-[var(--g-text-secondary)]">
              Kody języków · po przecinku
              <input
                value={draft.labelLanguages.join(', ')}
                onChange={(event) => {
                  const parsed = event.currentTarget.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean);
                  setDraft({
                    ...draft,
                    labelLanguages: [
                      ...new Set([...marketProfile(draft.market).requiredLanguages, ...parsed]),
                    ],
                  });
                }}
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          </MissingDataCard>
        ) : null}

        {blockers
          .filter((item) => ['profile', 'canada_fop', 'geometry', 'printer'].includes(item.field))
          .map((item) => (
            <div
              key={item.field}
              data-label-field={item.field}
              className="rounded-[14px] border border-[#9b5f55]/35 bg-[#fff7f5] p-4"
            >
              <strong className="text-sm text-[#7e4037]">{item.label}</strong>
              <p className="mt-1 text-xs leading-relaxed text-[var(--g-ink)]">{item.message}</p>
            </div>
          ))}
      </div>

      <footer className="sticky bottom-11 z-10 border-t border-[var(--g-line)] bg-white/95 p-4 backdrop-blur sm:px-6">
        {blockers.length > 0 ? (
          <p
            className="mb-2 text-center text-xs text-[var(--g-text-secondary)]"
            data-testid="label-cta-blocked-reason"
          >
            {blockers[0]?.message}
          </p>
        ) : null}
        <Button
          className="w-full"
          data-testid="show-label-preview"
          disabled={blockers.length > 0}
          onClick={() => void onSave(printDraft)}
        >
          {missingCtaLabel(blockers.length)}
        </Button>
      </footer>
    </Card>
  );
}

function MissingDataCard({
  field,
  title,
  children,
}: {
  field: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      data-label-field={field}
      data-missing-required="true"
      className="rounded-[16px] border border-[var(--g-attention-ink)]/55 bg-[var(--g-attention-surface)] p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <RequiredBadge />
      </div>
      {children}
    </section>
  );
}

function MissingTextFields({
  field,
  title,
  languages,
  values,
  onChange,
}: {
  field: string;
  title: string;
  languages: readonly string[];
  values: Record<string, string>;
  onChange: (language: string, value: string) => void;
}) {
  return (
    <MissingDataCard field={field} title={title}>
      <div className="grid gap-3 sm:grid-cols-2">
        {languages.map((language) => (
          <label key={language} className="text-xs font-medium text-[var(--g-text-secondary)]">
            {title} · {language.toUpperCase()}
            <input
              value={values[language] ?? ''}
              onChange={(event) => onChange(language, event.currentTarget.value)}
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
        ))}
      </div>
    </MissingDataCard>
  );
}

function MissingOperatorFields({
  value,
  onChange,
}: {
  value: MasterLabelData;
  onChange: (value: MasterLabelData) => void;
}) {
  const needsImporter = value.market === 'EU' || value.market === 'UK' || value.market === 'CA';
  const needsDistributor = value.market === 'AU_NZ';
  return (
    <MissingDataCard
      field="operator"
      title={needsDistributor ? 'Dostawca · Australia / Nowa Zelandia' : 'Dane firmy odpowiedzialnej'}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-[var(--g-text-secondary)]">
          Operator / producent
          <input
            value={value.operator.operatorName}
            onChange={(event) =>
              onChange({
                ...value,
                operator: { ...value.operator, operatorName: event.currentTarget.value },
              })
            }
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
        <label className="text-xs font-medium text-[var(--g-text-secondary)]">
          Adres operatora
          <input
            value={value.operator.address}
            onChange={(event) =>
              onChange({
                ...value,
                operator: { ...value.operator, address: event.currentTarget.value },
              })
            }
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
        <label className="text-xs font-medium text-[var(--g-text-secondary)]">
          Kod kraju operatora
          <input
            maxLength={2}
            value={value.operator.countryCode}
            onChange={(event) =>
              onChange({
                ...value,
                operator: {
                  ...value.operator,
                  countryCode: event.currentTarget.value.toUpperCase(),
                },
              })
            }
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
        {needsImporter ? (
          <>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              Importer / dealer na rynku
              <input
                value={value.operator.importerName ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    operator: { ...value.operator, importerName: event.currentTarget.value },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              Adres importera / dealera
              <input
                value={value.operator.importerAddress ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    operator: { ...value.operator, importerAddress: event.currentTarget.value },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              Kod kraju importera
              <input
                maxLength={2}
                value={value.operator.importerCountryCode ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    operator: {
                      ...value.operator,
                      importerCountryCode: event.currentTarget.value.toUpperCase(),
                    },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          </>
        ) : null}
        {needsDistributor ? (
          <>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              Dostawca / dystrybutor
              <input
                value={value.operator.distributorName ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    operator: { ...value.operator, distributorName: event.currentTarget.value },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              Adres dostawcy
              <input
                value={value.operator.distributorAddress ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    operator: { ...value.operator, distributorAddress: event.currentTarget.value },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              Kod kraju dostawcy
              <input
                maxLength={2}
                value={value.operator.distributorCountryCode ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    operator: {
                      ...value.operator,
                      distributorCountryCode: event.currentTarget.value.toUpperCase(),
                    },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          </>
        ) : null}
      </div>
    </MissingDataCard>
  );
}

function CompactMarketNutritionFields({
  value,
  onChange,
}: {
  value: MasterLabelData;
  onChange: (value: MasterLabelData) => void;
}) {
  const facts = value.regulatoryNutrition;
  const num = (raw: string) => {
    const parsed = raw.trim() === '' ? null : Number(raw);
    return parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const updateFact = (field: keyof typeof facts, raw: string) =>
    onChange({ ...value, regulatoryNutrition: { ...facts, [field]: num(raw) } });
  const numberField = (field: keyof typeof facts, label: string) => (
    <label key={field} className="text-xs font-medium text-[var(--g-text-secondary)]">
      {label}
      <input
        type="number"
        min={0}
        step="any"
        value={(facts[field] as number | null | undefined) ?? ''}
        onChange={(event) => updateFact(field, event.currentTarget.value)}
        className={SETTINGS_INPUT_CLASS}
      />
    </label>
  );
  const saturatedFatAuthorityMissing =
    value.nutritionSource?.saturated_fat_g === null ||
    value.saturatedFatAuthority?.status === 'missing' ||
    !value.saturatedFatAuthority?.sourceReferences.some((reference) => reference.trim().length > 0);
  const sourceMissing =
    value.nutritionSource &&
    (saturatedFatAuthorityMissing || value.nutritionSource.sugars_g === null);
  const updateSaturatedFatValue = (raw: string) => {
    if (!value.nutritionSource) return;
    const saturatedFat = num(raw);
    const sourceReferences = value.saturatedFatAuthority?.sourceReferences ?? [];
    const sourceReady = sourceReferences.some((reference) => reference.trim().length > 0);
    const nutritionSource = {
      ...value.nutritionSource,
      saturated_fat_g: saturatedFat,
    };
    onChange({
      ...value,
      nutritionSource,
      nutritionDeclaration: buildNutritionDeclaration(nutritionSource),
      saturatedFatAuthority: {
        status: saturatedFat !== null && sourceReady ? 'manual_final_value' : 'missing',
        sourceReferences,
        missingIngredientNames: value.saturatedFatAuthority?.missingIngredientNames ?? [],
      },
    });
  };
  const updateSaturatedFatSource = (raw: string) => {
    const sourceReference = raw.trim();
    const saturatedFat = value.nutritionSource?.saturated_fat_g ?? null;
    onChange({
      ...value,
      saturatedFatAuthority: {
        status: saturatedFat !== null && sourceReference ? 'manual_final_value' : 'missing',
        sourceReferences: sourceReference ? [sourceReference] : [],
        missingIngredientNames: value.saturatedFatAuthority?.missingIngredientNames ?? [],
      },
    });
  };
  return (
    <MissingDataCard
      field="market_nutrition"
      title={`Dane do tabeli · ${marketProfile(value.market).label}`}
    >
      <p className="mb-3 text-xs leading-relaxed text-[var(--g-text-secondary)]">
        Tylko pola, których nie ma w finalnych danych partii lub profilu rynku.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {sourceMissing && saturatedFatAuthorityMissing ? (
          <div className="grid gap-2 sm:col-span-2">
            {value.saturatedFatAuthority?.missingIngredientNames.length ? (
              <p className="text-[11px] leading-relaxed text-[var(--g-attention-ink)]">
                Brak potwierdzonych danych składników:{' '}
                {value.saturatedFatAuthority.missingIngredientNames.join(', ')}. Wymagana jest
                potwierdzona wartość zamiast wartości zastępczej.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Tłuszcze nasycone · g / 100 g produktu
                <input
                  data-label-nutrition-source="saturated_fat_g"
                  type="number"
                  min={0}
                  step="any"
                  value={value.nutritionSource?.saturated_fat_g ?? ''}
                  onChange={(event) => updateSaturatedFatValue(event.currentTarget.value)}
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Źródło potwierdzenia
                <input
                  data-label-nutrition-authority="saturated_fat_source"
                  value={value.saturatedFatAuthority?.sourceReferences[0] ?? ''}
                  onChange={(event) => updateSaturatedFatSource(event.currentTarget.value)}
                  placeholder="Np. karta produktu, raport laboratorium"
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            </div>
          </div>
        ) : null}
        {sourceMissing && value.nutritionSource?.sugars_g === null ? (
          <label className="text-xs font-medium text-[var(--g-text-secondary)]">
            Cukry · g / 100 g
            <input
              data-label-nutrition-source="sugars_g"
              type="number"
              min={0}
              step="any"
              value=""
              onChange={(event) => {
                const nutritionSource = {
                  ...value.nutritionSource!,
                  sugars_g: num(event.currentTarget.value),
                };
                onChange({
                  ...value,
                  nutritionSource,
                  nutritionDeclaration: buildNutritionDeclaration(nutritionSource),
                });
              }}
              className={SETTINGS_INPUT_CLASS}
            />
          </label>
        ) : null}
        {(value.market === 'EU' || value.market === 'UK' || value.market === 'AU_NZ') &&
        (facts.energyKjPer100g === null || facts.energyKjPer100g === undefined)
          ? numberField('energyKjPer100g', 'Energia · kJ / 100 g')
          : null}
        {(value.market === 'EU' || value.market === 'UK' || value.market === 'AU_NZ') &&
        facts.energyAuthority === 'unresolved' ? (
          <label className="text-xs font-medium text-[var(--g-text-secondary)]">
            Podstawa energii
            <select
              value={facts.energyAuthority}
              onChange={(event) =>
                onChange({
                  ...value,
                  regulatoryNutrition: {
                    ...facts,
                    energyAuthority: event.currentTarget.value as 'market_factors' | 'laboratory',
                  },
                })
              }
              className={SETTINGS_INPUT_CLASS}
            >
              <option value="unresolved">Wybierz podstawę</option>
              <option value="market_factors">Współczynniki rynku</option>
              <option value="laboratory">Laboratorium</option>
            </select>
          </label>
        ) : null}
        {value.market === 'AU_NZ' || value.market === 'US' || value.market === 'CA'
          ? value.labelLanguages.map((language) => (
              <label key={language} className="text-xs font-medium text-[var(--g-text-secondary)]">
                Opis porcji · {language.toUpperCase()}
                <input
                  value={facts.servingDescription[language] ?? ''}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      regulatoryNutrition: {
                        ...facts,
                        servingDescription: {
                          ...facts.servingDescription,
                          [language]: event.currentTarget.value,
                        },
                      },
                    })
                  }
                  className={SETTINGS_INPUT_CLASS}
                />
              </label>
            ))
          : null}
        {value.market === 'AU_NZ' || value.market === 'US' || value.market === 'CA'
          ? numberField('servingQuantityG', 'Wielkość porcji · g')
          : null}
        {value.market === 'AU_NZ' || value.market === 'US'
          ? numberField('servingsPerContainer', 'Liczba porcji w opakowaniu')
          : null}
        {value.market === 'AU_NZ' || value.market === 'US' || value.market === 'CA'
          ? numberField('sodiumMgPer100g', 'Sód · mg / 100 g')
          : null}
        {value.market === 'US' || value.market === 'CA' ? (
          <>
            {numberField('transFatGPer100g', 'Tłuszcze trans · g / 100 g')}
            {numberField('cholesterolMgPer100g', 'Cholesterol · mg / 100 g')}
            {numberField('calciumMgPer100g', 'Wapń · mg / 100 g')}
            {numberField('ironMgPer100g', 'Żelazo · mg / 100 g')}
            {numberField('potassiumMgPer100g', 'Potas · mg / 100 g')}
          </>
        ) : null}
        {value.market === 'US' ? (
          <>
            {numberField('productDensityGPerMl', 'Gęstość produktu · g / mL')}
            {numberField('addedSugarsGPer100g', 'Cukry dodane · g / 100 g')}
            {numberField('vitaminDMcgPer100g', 'Witamina D · µg / 100 g')}
          </>
        ) : null}
        {value.market === 'CA' ? (
          <>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              Forma produktu
              <select
                value={facts.canadaProductForm ?? 'unresolved'}
                onChange={(event) =>
                  onChange({
                    ...value,
                    regulatoryNutrition: {
                      ...facts,
                      canadaProductForm: event.currentTarget.value as NonNullable<
                        typeof facts.canadaProductForm
                      >,
                    },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="unresolved">Wybierz formę</option>
                <option value="tub">Kubek / gelato / sorbet · 188 mL</option>
                <option value="cake_sandwich_cone">Tort / sandwich / rożek · 125 mL</option>
                <option value="single_portion">Patyczek / porcja · 75 mL</option>
              </select>
            </label>
            {numberField('servingVolumeMl', 'Objętość porcji · mL')}
            {numberField('productDensityGPerMl', 'Gęstość produktu · g / mL')}
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              Dostępna powierzchnia etykiety · cm²
              <input
                type="number"
                min={0.1}
                step="any"
                value={value.availableDisplaySurfaceCm2 ?? ''}
                onChange={(event) =>
                  onChange({ ...value, availableDisplaySurfaceCm2: num(event.currentTarget.value) })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              FOP (Kanada)
              <select
                value={facts.canadaFopExemption}
                onChange={(event) =>
                  onChange({
                    ...value,
                    regulatoryNutrition: {
                      ...facts,
                      canadaFopExemption: event.currentTarget
                        .value as typeof facts.canadaFopExemption,
                    },
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              >
                <option value="unresolved">Wymaga rozstrzygnięcia</option>
                <option value="none">Brak wyjątku</option>
                <option value="exempt">Udokumentowany wyjątek</option>
                <option value="prohibited">Symbol niedozwolony</option>
              </select>
            </label>
          </>
        ) : null}
      </div>
    </MissingDataCard>
  );
}

function MissingAlcoholFields({
  value,
  onChange,
}: {
  value: MasterLabelData;
  onChange: (value: MasterLabelData) => void;
}) {
  return (
    <MissingDataCard field="alcohol_declaration" title="Deklaracja alkoholu">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-[var(--g-text-secondary)]">
          Rodzaj produktu
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
            <option value="unresolved">Wybierz</option>
            <option value="not_applicable_non_beverage">Żywność niebędąca napojem</option>
            <option value="required_beverage_over_1_2">Napój powyżej 1,2% vol</option>
          </select>
        </label>
        {value.alcoholDeclarationApplicability === 'required_beverage_over_1_2' ? (
          <>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
              Rzeczywista zawartość · % vol
              <input
                type="number"
                min={1.21}
                step="0.1"
                value={value.alcoholByVolumePercent ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    alcoholByVolumePercent: Number(event.currentTarget.value) || null,
                    alcoholDeclarationReviewed: false,
                  })
                }
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(value.alcoholDeclarationReviewed)}
                onChange={(event) =>
                  onChange({ ...value, alcoholDeclarationReviewed: event.currentTarget.checked })
                }
              />
              Potwierdzam podstawę % vol.
            </label>
          </>
        ) : null}
      </div>
    </MissingDataCard>
  );
}

export function LegacyRunLabelEditor({
  label,
  logoUrl,
  repository,
  onSave,
}: {
  label: MasterLabelData;
  logoUrl: string | null;
  repository: LabelRepository;
  onSave: (label: MasterLabelData) => Promise<void>;
}) {
  const [draft, setDraft] = useState(label);
  const [uploading, setUploading] = useState(false);
  const primaryLanguage = draft.labelLanguages[0] ?? 'pl';
  const draftPreflight = useMemo(() => buildLabelPreflight(draft), [draft]);
  const blockingCount = draftPreflight.items.filter((item) => item.status !== 'ready').length;
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
        'border-[var(--g-attention-ink)] bg-[var(--g-attention-surface)] ring-1 ring-[var(--g-attention-ink)]/15 focus:border-[var(--g-attention-ink)]',
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
      className="overflow-hidden rounded-[18px] border-[var(--g-line)] shadow-pro-e0"
      data-testid="label-data-intake"
      data-label-market={draft.market}
    >
      <header className="border-b border-[var(--g-line)] bg-[var(--g-ivory)] px-4 py-4 sm:px-5">
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel>Dane do etykiety</SectionLabel>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
              Uzupełnij wszystko przed podglądem
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--g-text-secondary)]">
              To jedyne miejsce na obowiązkowe dane. Etykietę pokażemy dopiero, gdy będzie gotowa do
              druku i eksportu PDF.
            </p>
          </div>
          <span className="rounded-full border border-[var(--g-line)] bg-white px-2.5 py-1 text-xs font-semibold text-ink">
            {marketProfile(draft.market).flag} {marketProfile(draft.market).label}
          </span>
        </div>
        <div
          className={cn(
            'mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-3 py-3',
            blockingCount > 0
              ? 'border-[var(--g-line-strong)] bg-[var(--g-ivory)]'
              : 'border-status-ideal/25 bg-status-ideal/[0.06]',
          )}
          data-testid="label-data-missing-count"
          role="status"
          aria-live="polite"
        >
          <div>
            <strong className="block text-sm text-ink">
              {blockingCount > 0
                ? 'Uzupełnij wymagane pola'
                : 'Wszystkie wymagane informacje są uzupełnione'}
            </strong>
            <span className="mt-0.5 block text-xs text-[var(--g-text-secondary)]">
              {blockingCount > 0
                ? `Do gotowego wydruku brakuje ${blockingCount} pozycji. Wszystkie są dostępne na tym ekranie.`
                : 'Możesz przejść bezpośrednio do gotowej etykiety.'}
            </span>
          </div>
          {blockingCount > 0 ? (
            <button
              type="button"
              className="pro-focus-ring min-h-11 px-2 text-xs font-semibold text-[var(--g-attention-ink)] underline underline-offset-4"
              onClick={(event) => {
                const root = event.currentTarget.closest('[data-testid="label-data-intake"]');
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
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <option value="retail_consumer">Detaliczna / konsumencka</option>
                <option value="internal_production">Wewnętrzna produkcyjna</option>
                <option value="display_gelateria">Ekspozycja / gelateria</option>
              </select>
            </label>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <option value="prepacked">Produkt paczkowany</option>
                <option value="ppds">PPDS / pakowane w miejscu sprzedaży</option>
                <option value="loose_non_prepacked">Loose / nieopakowane</option>
              </select>
            </label>
          </div>
          {draft.market === 'EU' ? (
            <label className="mt-3 block text-xs font-medium text-[var(--g-text-secondary)]">
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
                placeholder="Np. ES, PL, DE"
                className={SETTINGS_INPUT_CLASS}
              />
            </label>
          ) : null}
          {draft.market === 'UK' ? (
            <label className="mt-3 block text-xs font-medium text-[var(--g-text-secondary)]">
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
                <option value="unresolved">Wybierz GB albo Irlandię Północną</option>
                <option value="GB">Wielka Brytania</option>
                <option value="NI">Irlandia Północna</option>
              </select>
            </label>
          ) : null}
          {draft.market === 'AU_NZ' ? (
            <label className="mt-3 block text-xs font-medium text-[var(--g-text-secondary)]">
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
                <option value="NZ">Nowa Zelandia</option>
              </select>
            </label>
          ) : null}
          {draft.market === 'US' ? (
            <label className="mt-3 block text-xs font-medium text-[var(--g-text-secondary)]">
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
                <option value="interstate_retail">Sprzedaż detaliczna w opakowaniu / handel międzystanowy (USA)</option>
                <option value="food_service">Food service</option>
              </select>
            </label>
          ) : null}
          <div>
            <span className="text-xs font-medium text-[var(--g-text-secondary)]">Jurysdykcja / profil</span>
            <div className="mt-2 grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3">
              {MARKET_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={cn(
                    'pro-focus-ring grid min-h-12 content-center rounded-[10px] border px-2 py-1 text-xs font-semibold transition-colors',
                    draft.market === code
                      ? 'border-ink bg-ink text-white'
                      : 'border-[var(--g-line)] bg-white text-ink hover:bg-[var(--g-ivory)]',
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
              <p className="mt-3 text-xs text-[var(--g-text-secondary)]">
                Uniwersalna etykieta informacyjna — bez profilu prawnego konkretnego kraju.
              </p>
            ) : null}
          </div>
          <label className="mt-3 block text-xs font-medium text-[var(--g-text-secondary)]">
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
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
          <label className="mt-3 flex min-h-14 items-center gap-3 rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)] p-3 text-xs text-[var(--g-text-secondary)]">
            {logoUrl ? (
              <img src={logoUrl} alt="Aktualne logo" className="size-12 object-contain" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-[10px] border border-[var(--g-line)] bg-white text-[10px] text-[var(--g-text-muted)]">
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
                  <label key={`name:${language}`} className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                  <label key={`legal:${language}`} className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <p className="text-[11px] text-[var(--g-text-secondary)]">
                  Partia produkcyjna: {draft.actualBatchQuantityG ?? '—'} g. Etykieta używa
                  wyłącznie wybranego fillu opakowania
                </p>
              </div>
            </RequiredSettingsField>
          </div>
        </SettingsSection>

        {draft.purpose === 'retail_consumer' ? (
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
              <div className="text-xs font-medium text-[var(--g-text-secondary)]">
                Nr partii · nadawany automatycznie
                <output
                  className={cn(
                    SETTINGS_INPUT_CLASS,
                    'flex items-center bg-[var(--g-ivory)] font-mono tabular-nums',
                  )}
                >
                  {lotCodeForDisplay(draft.lotCode)}
                </output>
              </div>
            </RequiredSettingsField>
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                : 'border-[var(--g-line)] bg-white text-ink',
            )}
            onClick={() => setDraft(applyAutoLabelLayout(draft))}
          >
            Auto · wybierz najmniejszy format, który spełnia wymagania wydruku
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
          <details className="mt-3 rounded-[12px] border border-[var(--g-line)] bg-white p-3">
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
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-[var(--g-line)] bg-white px-3 text-xs text-ink">
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
              Potwierdzam kompletność tłumaczeń w wymaganych językach
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-[var(--g-line)] bg-white px-3 text-xs text-ink">
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
              Potwierdzam kolejność składników i przegląd QUID
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-[var(--g-line)] bg-white px-3 text-xs text-ink">
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
              Potwierdzam kontekst sprzedaży i wymagania szczególne rynku
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
                  missing('allergens') ? 'border-[var(--g-attention-ink)] bg-[var(--g-attention-surface)]' : 'border-[var(--g-line)] bg-white',
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
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-[var(--g-line)] bg-white px-3 text-xs text-ink">
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
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--g-text-secondary)]">
            Profil prawny pozostaje oznaczony zgodnie z istniejącą macierzą. Gellatti nie deklaruje
            certyfikacji prawnej.
          </p>
        </SettingsSection>
      </div>

      <footer className="sticky bottom-11 z-10 border-t border-[var(--g-line)] bg-white/95 p-4 backdrop-blur sm:px-5">
        <Button
          className="w-full"
          data-testid="show-label-preview"
          disabled={!draftPreflight.readyForSystemPrint}
          onClick={() => void onSave(draft)}
        >
          Pokaż etykietę
        </Button>
      </footer>
    </Card>
  );
}

const SETTINGS_INPUT_CLASS =
  'mt-1 h-11 w-full rounded-[10px] border border-[var(--g-line)] bg-white px-3 text-sm text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-ink/35 focus:ring-2 focus:ring-ink/5';

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[var(--g-line-quiet)] py-5 last:border-b-0">
      <h3 className="mb-3 text-xs font-semibold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RequiredBadge() {
  return (
    <span className="shrink-0 rounded-full border border-[var(--g-attention-ink)]/30 bg-[var(--g-attention-surface)] px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-[var(--g-attention-ink)] uppercase">
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
        <p className="mt-1 text-[11px] font-medium text-[var(--g-attention-ink)]">Brak wymaganej wartości</p>
      ) : null}
    </div>
  );
}

function ReviewLine({ label, ready, message }: { label: string; ready: boolean; message: string }) {
  return (
    <div
      className={cn(
        'flex min-h-12 items-start justify-between gap-3 rounded-[12px] border px-3 py-2.5',
        ready ? 'border-[var(--g-line)] bg-white' : 'border-[var(--g-attention-ink)] bg-[var(--g-attention-surface)]',
      )}
    >
      <span>
        <strong className="block text-xs text-ink">{label}</strong>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--g-text-secondary)]">{message}</span>
      </span>
      <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--g-text-secondary)]">
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
          className="rounded-[12px] border border-[var(--g-line)] bg-white p-3"
        >
          <summary className="cursor-pointer text-xs font-semibold text-ink">
            {primaryText(ingredient.names, value.labelLanguages) || 'Składnik'} ·{' '}
            {ingredient.actualGrams.toFixed(1)} g · {ingredient.percent.toFixed(1)}%
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {value.labelLanguages.map((language) => (
              <label key={language} className="text-xs text-[var(--g-text-secondary)]">
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
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--g-text-secondary)]">
            Rzeczywista masa i kolejność pochodzą z finalnego zapisu zakończonej partii i nie są
            tutaj edytowalne.
          </p>
          <label className="mt-3 flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--g-line)] px-3 text-xs text-ink">
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
                  <label className="block text-xs text-[var(--g-text-secondary)]">
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
                  <label className="block text-xs text-[var(--g-text-secondary)]">
                    Komponenty w zatwierdzonej kolejności · {language} · po przecinku
                    <textarea
                      value={(ingredient.compound?.components ?? [])
                        .map((component) => component.names[language] ?? '')
                        .join(', ')}
                      onChange={(event) =>
                        updateCompoundComponents(index, language, event.currentTarget.value)
                      }
                      className="mt-1 min-h-20 w-full resize-y rounded-[10px] border border-[var(--g-line)] bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink/35 focus:ring-2 focus:ring-ink/5"
                    />
                  </label>
                </div>
              ))}
            </div>
          ) : null}
          {quidMarket ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_1fr] sm:items-end">
              <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--g-line)] px-3 text-xs text-ink">
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
              <label className="text-xs text-[var(--g-text-secondary)]">
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
              <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--g-line)] px-3 text-xs text-ink">
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
  lot: 'Nr partii',
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
      <p className="mt-1 text-xs text-[var(--g-text-secondary)]">
        Wymagane pola profilu {profile.label} są zawsze aktywne
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5" data-testid="required-label-fields">
        {profile.requiredFields.map((field) => (
          <span
            key={field}
            className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-[var(--g-text-secondary)]"
          >
            🔒 {LABEL_FIELD_NAMES[field]}
          </span>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3" data-testid="optional-label-fields">
        {profile.optionalFields.map((field) => (
          <label
            key={field}
            className="flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--g-line)] bg-white px-3 text-xs text-ink"
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
  const [editableNutritionSourceKeys] = useState(
    () =>
      new Set(
        (['saturated_fat_g', 'sugars_g'] as const).filter(
          (key) => value.nutritionSource?.[key] === null,
        ),
      ),
  );
  const updateFacts = (next: Partial<MasterLabelData['regulatoryNutrition']>) =>
    onChange({ ...value, regulatoryNutrition: { ...facts, ...next } });
  const updateMissingNutritionSource = (key: 'saturated_fat_g' | 'sugars_g', raw: string) => {
    if (!value.nutritionSource) return;
    const parsed = numberOrNull(raw);
    const nutritionSource = {
      ...value.nutritionSource,
      [key]: parsed !== null && parsed >= 0 ? parsed : null,
    };
    onChange({
      ...value,
      nutritionSource,
      nutritionDeclaration: buildNutritionDeclaration(nutritionSource),
    });
  };
  const numberField = (
    key: keyof MasterLabelData['regulatoryNutrition'],
    label: string,
    unit: string,
  ) => (
    <label key={key} className="text-xs font-medium text-[var(--g-text-secondary)]">
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
          missing ? 'border-[var(--g-attention-ink)] bg-[var(--g-attention-surface)]' : 'border-[var(--g-line)] bg-[var(--g-ivory)]',
        )}
        data-label-field="market_nutrition"
        data-missing-required={missing ? 'true' : undefined}
      >
        <p className="text-xs leading-relaxed text-[var(--g-text-secondary)]">
          Wartości dodatkowe muszą mieć udokumentowane źródło produktu. Brak danych blokuje wydruk
          detaliczny; Gellatti nie zgaduje wartości.
        </p>
        {value.nutritionSource ? (
          <div
            className="mt-3 grid gap-3 sm:grid-cols-2"
            data-testid="label-nutrition-source-completion"
          >
            {(
              [
                ['saturated_fat_g', 'Tłuszcze nasycone'],
                ['sugars_g', 'Cukry'],
              ] as const
            ).map(([key, label]) => {
              const confirmed = value.nutritionSource?.[key] !== null;
              const editable = editableNutritionSourceKeys.has(key);
              return (
                <label key={key} className="text-xs font-medium text-[var(--g-text-secondary)]">
                  {label} · g / 100 g
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={value.nutritionSource?.[key] ?? ''}
                    disabled={!editable}
                    data-label-nutrition-source={key}
                    onChange={(event) =>
                      updateMissingNutritionSource(key, event.currentTarget.value)
                    }
                    className={cn(
                      SETTINGS_INPUT_CLASS,
                      'font-mono tabular-nums disabled:bg-[var(--g-ivory)] disabled:text-[var(--g-text-secondary)]',
                    )}
                  />
                  <span className="mt-1 block text-[11px] text-[var(--g-text-secondary)]">
                    {confirmed
                      ? 'Wartość pochodzi z finalnych danych partii.'
                      : 'Brakującą wartość wpisz wyłącznie na podstawie potwierdzonej dokumentacji.'}
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}
        {(value.market === 'EU' || value.market === 'UK') &&
        (value.nutritionSource?.alcohol_g ?? 0) > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
                <label className="flex min-h-11 items-center gap-2 text-xs text-[var(--g-text-secondary)] sm:col-span-2">
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
          <label className="mt-3 block max-w-xs text-xs font-medium text-[var(--g-text-secondary)]">
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
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
            <label key={`serving:${language}`} className="text-xs font-medium text-[var(--g-text-secondary)]">
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
          <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
            <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Kanadyjska kategoria ilości referencyjnej
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
                  <option value="single_portion">Lód na patyku / baton / kubeczek · 75 mL</option>
                </select>
              </label>
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                Kanadyjski format NFT
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
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
              <label className="text-xs font-medium text-[var(--g-text-secondary)]">
                FOP / zwolnienie
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
                <label className="text-xs font-medium text-[var(--g-text-secondary)] lg:col-span-2">
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
          <div className="mt-3 rounded-[10px] border border-[var(--g-line)] bg-white p-3 text-xs text-[var(--g-text-secondary)]">
            <strong className="block text-ink">Canada FOP: {canadaFop.state}</strong>
            <span className="mt-1 block">{canadaFop.reason}</span>
            {canadaFop.state === 'required' && !facts.canadaFopAssetId ? (
              <span className="mt-1 block font-semibold text-[var(--g-attention-ink)]">
                Nie można wydrukować: wymagany jest zatwierdzony, oficjalny materiał Health Canada.
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
      <label className="text-xs text-[var(--g-text-secondary)]">
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
      <label className="text-xs text-[var(--g-text-secondary)]">
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
      <label className="text-xs text-[var(--g-text-secondary)]">
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
      <label className="text-xs text-[var(--g-text-secondary)]">
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
    <fieldset className="mt-5 rounded-[14px] border border-[var(--g-line)] bg-[var(--g-ivory)] p-3">
      <legend className="px-1 text-sm font-semibold text-ink">Ustawienia drukarki</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[var(--g-text-secondary)]">
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
        <label className="text-xs text-[var(--g-text-secondary)]">
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
        <label className="text-xs text-[var(--g-text-secondary)]">
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
        <label className="text-xs text-[var(--g-text-secondary)]">
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
      <details className="mt-3 border-t border-[var(--g-line)] pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink">
          Zaawansowane ustawienia drukarki
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)]">
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
          <label className="text-xs text-[var(--g-text-secondary)]">
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
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--g-text-secondary)]">
        {profile.workflowNote} Oprogramowanie: {profile.softwareVerification}. Sprzęt:{' '}
        {profile.hardwareVerification}.
      </p>
    </fieldset>
  );
}

/**
 * The one settings entry point.
 *
 * OWNER DECISION (2026-08-30): label settings live ONLY under Produkcja →
 * Etykiety. Where they live, this opens them in place. Where they do not — the
 * PRO workbench `Etykieta` tab — it sends the reader to that one home instead
 * of rendering a second copy of the same screen.
 */
function SettingsEntry({
  settingsLiveHere,
  onOpen,
}: {
  settingsLiveHere: boolean;
  onOpen: () => void;
}) {
  if (settingsLiveHere) {
    return (
      <Button variant="ghost" size="sm" onClick={onOpen}>
        Ustawienia
      </Button>
    );
  }
  return (
    <Link
      to="/labels"
      className={cn(buttonClasses('ghost', 'sm'), 'shrink-0')}
      data-testid="label-settings-home-link"
    >
      Zmień ustawienia
    </Link>
  );
}

function EditorHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    /* GELLATTI V2.1 §5 — the approved settings vocabulary, applied inside the
       modal the Owner kept (decision 2026-08-30: Ustawienia etykiety stays a
       modal inside /labels; no standalone route). Eyebrow 10/1.25 at 0.08em,
       section title 22/1.2/700 at -0.025em, hairlines on `--g-line`. */
    <div className="flex items-center justify-between gap-4 border-b border-[var(--g-line)] pb-4">
      <div>
        <span className="block text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
          Edycja etykiety
        </span>
        <h2 className="mt-1 text-[22px] leading-[1.2] font-bold tracking-[-0.025em] text-[var(--g-ink)]">
          {title}
        </h2>
      </div>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-full border border-[var(--g-line)] text-xl"
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
        <span className="text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
          Jurysdykcja / profil
        </span>
        {/* V2.1: the approved chooser marks the selected profile with a doubled
            INK edge on white, not a filled tile — the inset shadow draws the
            second pixel without changing the box, so nothing reflows on
            selection. */}
        <div className="mt-1 grid grid-cols-3 gap-1 sm:grid-cols-6">
          {MARKET_CODES.map((code) => (
            <button
              key={code}
              type="button"
              className={`grid min-h-12 content-center rounded-[10px] border bg-white px-2 py-1 text-xs ${market === code ? 'border-[var(--g-ink)] text-[var(--g-ink)] shadow-[inset_0_0_0_1px_var(--g-ink)]' : 'border-[var(--g-line)]'}`}
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
          <p className="mt-2 text-xs leading-relaxed text-[var(--g-text-secondary)]">
            Uniwersalna etykieta informacyjna — bez profilu prawnego konkretnego kraju.
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
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
        <label className="text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
          Marka / nazwa firmy
          <input
            value={businessName}
            onChange={(event) => onBusinessName(event.currentTarget.value)}
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
        <label className="text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
          Operator
          <input
            value={operatorName}
            onChange={(event) => onOperatorName(event.currentTarget.value)}
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
        <label className="text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
          Adres operatora
          <input
            value={address}
            onChange={(event) => onAddress(event.currentTarget.value)}
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
      </div>
      <label className="flex min-h-14 items-center gap-3 rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)] p-[18px] text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
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
