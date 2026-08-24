import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CharcoalPanel } from '@/components/ui/CharcoalPanel';
import { DialogShell } from '@/components/ui/DialogShell';
import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import { buildLabelPreflight, buildMasterLabelData, type MasterLabelData } from './masterLabel';
import { printMasterLabel } from './masterLabelPrint';
import { MARKET_PROFILES, marketProfile, type MarketProfileCode } from './marketProfiles';
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
  const ingredients = label.ingredients
    .map((ingredient) => primaryText(ingredient.names, label.labelLanguages))
    .join(', ');
  const allergens = [...label.allergens.declared, ...label.allergens.labelStatements].join('; ');
  const costs = snapshot.finalProduct.costs;

  return (
    <div className="space-y-4" data-testid="label-workspace" data-workspace-mode="run">
      <Card padding="none" className="overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 p-5">
          <div>
            <SectionLabel>LabelWorkspace · ACTUAL Production Snapshot</SectionLabel>
            <h2 className="mt-2 text-xl font-semibold text-ink">{productName}</h2>
            <p className="mt-1 text-sm text-stone-500">
              {label.businessName || label.operator.operatorName || 'Profil firmy nieuzupełniony'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={Boolean(saved)}
            >
              {saved ? 'Snapshot zapisany' : 'Edytuj'}
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

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <article className="p-5" aria-label="Podgląd etykiety konsumenckiej">
            <div className="mx-auto max-w-2xl border-2 border-ink p-5">
              <div className="flex items-start justify-between gap-4 border-b-2 border-ink pb-4">
                <div>
                  <strong className="block text-2xl text-ink">{productName}</strong>
                  <span className="text-sm text-stone-600">
                    {primaryText(label.legalProductName, label.labelLanguages) ||
                      'Nazwa prawna do uzupełnienia'}
                  </span>
                </div>
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-14 max-w-28 object-contain" />
                ) : null}
              </div>
              <p className="mt-4 text-sm leading-relaxed">
                <strong>Składniki:</strong> {ingredients}
              </p>
              <p className="mt-3 text-sm">
                <strong>Alergeny:</strong> {allergens || 'wymagają potwierdzenia'}
              </p>
              {label.nutritionDeclaration ? (
                <table className="mt-5 w-full border-t-2 border-ink text-sm">
                  <caption className="py-2 text-left font-semibold">
                    Wartość odżywcza w 100 g
                  </caption>
                  <tbody>
                    {label.nutritionDeclaration.rows.map((row) => (
                      <tr key={row.key} className="border-t border-ink/15">
                        <th
                          className={`py-1.5 text-left font-normal ${row.indented ? 'pl-4' : ''}`}
                        >
                          {row.label}
                        </th>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {row.valueDisplay ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-ink pt-3 text-sm">
                <div>
                  <dt className="text-stone-500">Masa netto</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {label.netQuantityG ?? '—'} g
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">LOT</dt>
                  <dd className="font-mono">{label.lotCode || '—'}</dd>
                </div>
              </dl>
            </div>
          </article>

          <aside className="border-t border-ink/10 bg-[#EFE8DC]/45 p-5 lg:border-t-0 lg:border-l">
            <SectionLabel>Podsumowanie wewnętrzne Gellatti</SectionLabel>
            <dl className="mt-5 space-y-4">
              <div>
                <dt className="text-xs text-stone-500">Faktyczna partia</dt>
                <dd>
                  <MetricValue value={snapshot.actualFinalMassG} unit="g" size="lg" />
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-stone-500">Production Run</dt>
                  <dd className="mt-1 truncate font-mono text-xs">{snapshot.sessionId}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Wersja receptury</dt>
                  <dd className="mt-1 font-mono text-sm">
                    v{snapshot.source.recipeVersionNumber ?? '—'}
                  </dd>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-ink/10 pt-4">
                <div>
                  <dt className="text-xs text-stone-500">Koszt partii</dt>
                  <dd>
                    <MetricValue
                      value={costs?.total_cost ?? '—'}
                      unit={costs?.total_cost == null ? undefined : '€'}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Koszt / kg</dt>
                  <dd>
                    <MetricValue
                      value={costs?.cost_per_kg ?? '—'}
                      unit={costs?.cost_per_kg == null ? undefined : '€'}
                    />
                  </dd>
                </div>
              </div>
            </dl>
            <p className="mt-5 border-t border-ink/10 pt-4 text-xs leading-relaxed text-stone-600">
              Koszty są wyłącznie informacją wewnętrzną. Nie trafiają do konsumenckiego wydruku.
            </p>
          </aside>
        </div>
      </Card>

      <CharcoalPanel
        padding="md"
        className="flex flex-wrap items-center justify-between gap-4 rounded-md"
      >
        <div>
          <SectionLabel tone="ivory">Historyczna reprodukowalność</SectionLabel>
          <p className="mt-2 text-sm text-ivory/70">
            {saved
              ? `Immutable Run Label Snapshot · ${new Date(saved.createdAt).toLocaleString('pl-PL')}`
              : 'Po zapisie ta etykieta nie zmieni się wraz z przyszłym logo ani profilem konta.'}
          </p>
        </div>
        {saved ? null : (
          <Button variant="ivory" size="sm" onClick={() => void saveRunSnapshot()} disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Zapisz finalną etykietę'}
          </Button>
        )}
      </CharcoalPanel>
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
        onMarket={(market) => setDraft({ ...draft, market })}
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
    field: 'productName' | 'legalProductName' | 'storageInstructions',
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
          setDraft({ ...draft, market, marketProfileVersion: MARKET_PROFILES[market].version })
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
        <label className="text-xs text-stone-600">
          LOT
          <input
            value={draft.lotCode}
            onChange={(event) => setDraft({ ...draft, lotCode: event.currentTarget.value })}
            className="mt-1 h-11 w-full border border-ink/15 px-3 text-sm text-ink"
          />
        </label>
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
