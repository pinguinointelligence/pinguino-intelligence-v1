import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DialogShell } from '@/components/ui/DialogShell';
import { MetricValue } from '@/components/shared/MetricValue';
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
import {
  defaultAccountLabelProfile,
  resolveLabelRepository,
  type AccountLabelProfile,
  type LabelRepository,
  type RunLabelSnapshot,
} from '@/services/labels/labelRepository';
import { useAuthStore } from '@/stores/authStore';

const MARKET_CODES: readonly MarketProfileCode[] = ['EU', 'US', 'CA', 'UK', 'AU_NZ', 'CUSTOM'];

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
  });
}

export function LabelWorkspace({
  snapshot: suppliedSnapshot = null,
  runId = null,
  profileOnly = false,
  repository: suppliedRepository,
  onSaved,
}: {
  snapshot?: ProductionCompletionSnapshot | null;
  runId?: string | null;
  profileOnly?: boolean;
  repository?: LabelRepository;
  onSaved?: (snapshot: RunLabelSnapshot) => void;
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
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedLogo, setResolvedLogo] = useState<{
    path: string;
    url: string | null;
  } | null>(null);
  const requestedRunId = suppliedSnapshot?.sessionId ?? runId;

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

  if (busy && !profile) {
    return <p className="py-8 text-sm text-stone-500">Odczytuję profil i snapshot etykiety…</p>;
  }

  if (!profile) {
    return (
      <p className="border border-status-error/25 p-4 text-sm text-status-error" role="alert">
        {error ?? 'Profil etykiety jest niedostępny.'}
      </p>
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
      <div className="border-y border-ink/10 py-8" data-testid="label-workspace-empty">
        <h2 className="text-lg font-semibold text-ink">Brak zakończonej partii</h2>
        <p className="mt-2 text-sm text-stone-500">
          Etykieta powstaje wyłącznie z immutable ACTUAL Production Snapshot.
        </p>
      </div>
    );
  }

  const productName = primaryText(label.productName, label.labelLanguages);
  const costs = snapshot.finalProduct.costs;
  const nutrition = label.nutritionSource;
  const activeMarket = marketProfile(label.market);
  const missing = preflight?.items.filter((item) => item.status === 'missing') ?? [];
  const printBlockedReason = missing[0]?.message ?? activeMarket.rendererLimitation;
  const percentages = snapshot.finalResult.percentages;

  return (
    <div
      className="space-y-4 p-3 text-ink sm:p-4"
      data-testid="label-workspace"
      data-workspace-mode="run"
    >
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
              onClick={() => setEditing(true)}
              disabled={Boolean(saved)}
            >
              {saved ? 'Snapshot zapisany' : 'Ustawienia'}
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
              className={preflight?.readyForSystemPrint ? 'text-status-success' : 'text-stone-700'}
            >
              {preflight?.readyForSystemPrint
                ? 'Gotowa do wydruku'
                : `Wydruk zablokowany · ${missing.length > 0 ? `${missing.length} wymaganych pól` : `profil ${activeMarket.label} wymaga weryfikacji`}`}
            </span>
            {!preflight?.readyForSystemPrint ? (
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => setEditing(true)}
                disabled={Boolean(saved)}
              >
                {printBlockedReason}
              </button>
            ) : null}
          </div>
        </div>
        <div className="p-4 sm:p-6" data-testid="consumer-print-boundary">
          <ConsumerLabelPreview label={label} logoUrl={logoUrl} />
        </div>
      </Card>

      <section
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        data-testid="label-internal-overview"
      >
        <OverviewCard title="Składniki">
          <dl className="space-y-2">
            {label.ingredients.map((ingredient) => (
              <div key={ingredient.lineId} className="flex justify-between gap-3 text-xs">
                <dt className="min-w-0 truncate text-stone-600">
                  {primaryText(ingredient.names, label.labelLanguages)}
                </dt>
                <dd className="shrink-0 font-mono tabular-nums">
                  {ingredient.actualGrams.toFixed(0)} g
                </dd>
              </div>
            ))}
          </dl>
        </OverviewCard>
        <OverviewCard title="Wartości odżywcze">
          <MetricValue
            value={nutrition?.kcal ?? '—'}
            unit={nutrition ? 'kcal / 100 g' : undefined}
            size="lg"
          />
          <p className="mt-2 text-xs text-stone-500">Z finalnej, faktycznej partii.</p>
        </OverviewCard>
        <OverviewCard title="Koszt">
          <dl className="space-y-2 text-xs">
            <OverviewMetric label="Cała partia" value={costs?.total_cost} unit="€" />
            <OverviewMetric label="1 kg" value={costs?.cost_per_kg} unit="€" />
            <OverviewMetric label="Porcja 60 g" value={costs?.cost_per_serving_60g} unit="€" />
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
            disabled={busy || missing.length > 0}
          >
            {busy ? 'Zapisywanie…' : 'Zapisz finalną etykietę'}
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-sm text-status-error" role="alert">
          {error}
        </p>
      ) : null}

      {editing && !saved ? (
        <RunLabelEditor
          label={label}
          logoUrl={logoUrl}
          repository={repository}
          saveAsDefault={saveAsDefault}
          onSaveAsDefaultChange={setSaveAsDefault}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            setBusy(true);
            setError(null);
            try {
              setLabel(next);
              if (saveAsDefault) await persistProfile(profileFromLabel(profile, next));
              setEditing(false);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Nie zapisano zmian etykiety.');
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
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
        onChange={(presentation) => setDraft({ ...draft, presentation })}
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
  const updateText = (
    field: 'productName' | 'legalProductName' | 'storageInstructions' | 'origin' | 'customerNote',
    language: string,
    value: string,
  ) => setDraft({ ...draft, [field]: { ...draft[field], [language]: value } });
  return (
    <DialogShell
      label="Edytuj etykietę zakończonej partii"
      testId="label-run-editor"
      placement="responsive"
      onClose={onClose}
      panelClassName="p-5 sm:w-[min(760px,94vw)]"
    >
      <EditorHeader title="Etykieta zakończonej partii" onClose={onClose} />
      <MarketAndIdentityFields
        market={draft.market}
        languages={draft.labelLanguages}
        businessName={draft.businessName}
        operatorName={draft.operator.operatorName}
        address={draft.operator.address}
        logoUrl={logoUrl}
        uploading={uploading}
        onMarket={(market) =>
          setDraft({
            ...draft,
            market,
            marketProfileVersion: MARKET_PROFILES[market].version,
            enabledOptionalFields: normalizeEnabledOptionalFields(
              market,
              draft.enabledOptionalFields,
            ),
          })
        }
        onLanguages={(labelLanguages) => setDraft({ ...draft, labelLanguages })}
        onBusinessName={(businessName) => setDraft({ ...draft, businessName })}
        onOperatorName={(operatorName) =>
          setDraft({ ...draft, operator: { ...draft.operator, operatorName } })
        }
        onAddress={(address) => setDraft({ ...draft, operator: { ...draft.operator, address } })}
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {draft.labelLanguages.flatMap((language) => [
          <label key={`name:${language}`} className="text-xs text-stone-600">
            Nazwa · {language.toUpperCase()}
            <input
              value={draft.productName[language] ?? ''}
              onChange={(event) => updateText('productName', language, event.currentTarget.value)}
              className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
            />
          </label>,
          <label key={`legal:${language}`} className="text-xs text-stone-600">
            Nazwa prawna · {language.toUpperCase()}
            <input
              value={draft.legalProductName[language] ?? ''}
              onChange={(event) =>
                updateText('legalProductName', language, event.currentTarget.value)
              }
              className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
            />
          </label>,
        ])}
        <label className="text-xs text-stone-600">
          Masa netto · g
          <input
            type="number"
            min={0}
            value={draft.netQuantityG ?? ''}
            onChange={(event) =>
              setDraft({ ...draft, netQuantityG: Number(event.currentTarget.value) || null })
            }
            className="mt-1 h-11 w-full border border-ink/15 px-3 font-mono text-sm text-ink"
          />
        </label>
        <div className="text-xs text-stone-600">
          LOT · nadawany automatycznie
          <output className="mt-1 flex h-11 w-full items-center border border-ink/10 bg-stone-50 px-3 font-mono text-sm text-ink">
            {draft.lotCode}
          </output>
        </div>
        <label className="text-xs text-stone-600">
          Przechowywanie
          <input
            value={draft.storageInstructions[primaryLanguage] ?? ''}
            onChange={(event) =>
              updateText('storageInstructions', primaryLanguage, event.currentTarget.value)
            }
            className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-stone-600">
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
            className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-stone-600">
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
              })
            }
            className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
          />
        </label>
        {draft.enabledOptionalFields.includes('origin') ? (
          <label className="text-xs text-stone-600">
            Pochodzenie
            <input
              value={draft.origin[primaryLanguage] ?? ''}
              onChange={(event) => updateText('origin', primaryLanguage, event.currentTarget.value)}
              className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
            />
          </label>
        ) : null}
        {draft.enabledOptionalFields.includes('customer_note') ? (
          <label className="text-xs text-stone-600">
            Nota dla klienta
            <input
              value={draft.customerNote[primaryLanguage] ?? ''}
              onChange={(event) =>
                updateText('customerNote', primaryLanguage, event.currentTarget.value)
              }
              className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
            />
          </label>
        ) : null}
      </div>
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
          })
        }
      />
      <label className="mt-4 flex min-h-11 items-center gap-3 text-xs text-ink">
        <input
          type="checkbox"
          className="size-5"
          checked={draft.allergens.reviewedByUser}
          onChange={(event) =>
            setDraft({
              ...draft,
              allergens: { ...draft.allergens, reviewedByUser: event.currentTarget.checked },
            })
          }
        />
        Potwierdzam przegląd danych alergenowych.
      </label>
      <label className="mt-2 flex min-h-11 items-center gap-3 text-xs text-ink">
        <input
          type="checkbox"
          className="size-5"
          checked={draft.preflightAcknowledged}
          onChange={(event) =>
            setDraft({ ...draft, preflightAcknowledged: event.currentTarget.checked })
          }
        />
        Sprawdziłem dane etykiety przed wydrukiem.
      </label>
      <label className="mt-2 flex min-h-11 items-center gap-3 border-t border-ink/10 pt-3 text-xs text-ink">
        <input
          type="checkbox"
          className="size-5"
          checked={saveAsDefault}
          onChange={(event) => onSaveAsDefaultChange(event.currentTarget.checked)}
        />
        Zapisz jako domyślne dla przyszłych etykiet.
      </label>
      <p className="mt-3 text-xs leading-relaxed text-stone-500">
        Profil prawny pozostaje oznaczony zgodnie z istniejącą macierzą. Gellatti nie deklaruje
        certyfikacji prawnej.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          Anuluj
        </Button>
        <Button onClick={() => void onSave(draft)}>Zastosuj</Button>
      </div>
    </DialogShell>
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
    <fieldset className="mt-4 border-t border-ink/10 pt-4" data-testid="label-field-settings">
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
            className="flex min-h-11 items-center gap-2 border border-ink/10 px-3 text-xs text-ink"
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
    <fieldset className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/10 pt-4 sm:grid-cols-4">
      <legend className="sr-only">Prezentacja etykiety</legend>
      <label className="text-xs text-stone-600">
        Format
        <select
          value={format}
          onChange={(event) =>
            onChange({ ...current, format: event.currentTarget.value as 'rectangle' | 'round' })
          }
          className="mt-1 h-11 w-full border border-ink/15 bg-white px-3 text-sm text-ink"
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
          className="mt-1 h-11 w-full border border-ink/15 px-3 font-mono text-sm text-ink"
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
          className="mt-1 h-11 w-full border border-ink/15 px-3 font-mono text-sm text-ink"
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
          className="mt-1 h-11 w-full border border-ink/15 px-3 font-mono text-sm text-ink"
        />
      </label>
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
              className={`min-h-11 border px-2 text-xs ${market === code ? 'border-ink bg-ink text-white' : 'border-ink/15'}`}
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
            className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-stone-600">
          Marka / nazwa firmy
          <input
            value={businessName}
            onChange={(event) => onBusinessName(event.currentTarget.value)}
            className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-stone-600">
          Operator
          <input
            value={operatorName}
            onChange={(event) => onOperatorName(event.currentTarget.value)}
            className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-stone-600">
          Adres operatora
          <input
            value={address}
            onChange={(event) => onAddress(event.currentTarget.value)}
            className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
          />
        </label>
      </div>
      <label className="flex min-h-14 items-center gap-3 border border-ink/10 p-3 text-xs text-stone-600">
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
