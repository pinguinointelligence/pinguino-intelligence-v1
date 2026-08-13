import { useEffect, useMemo } from 'react';
import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import { buildLabelPreflight } from './masterLabel';
import { printMasterLabel } from './masterLabelPrint';
import { MARKET_PROFILES, marketProfile, type MarketProfileCode } from './marketProfiles';
import { masterLabelIdForSnapshot, useMasterLabelStore } from './masterLabelStore';
import {
  buildRecipeBehaviorAuthority,
  recipeBehaviorModuleGate,
} from '@/features/product-intelligence';

const MARKET_CODES: readonly MarketProfileCode[] = ['EU', 'US', 'CA', 'UK', 'AU_NZ', 'CUSTOM'];

export function MasterLabelEditor({
  snapshot,
  printLabel = 'Drukuj · Systemowa',
}: {
  snapshot: ProductionCompletionSnapshot;
  printLabel?: string;
}) {
  const label = useMasterLabelStore((state) => state.label);
  const initialize = useMasterLabelStore((state) => state.initializeFromSnapshot);
  const replace = useMasterLabelStore((state) => state.replace);
  const behaviorAuthority = useMemo(
    () => buildRecipeBehaviorAuthority({
      items: snapshot.finalActualInput.items,
      toppings: snapshot.productComposition.toppings,
      snapshots: snapshot.productComposition.behaviorSnapshots ?? {},
    }),
    [snapshot],
  );
  const behaviorGate = useMemo(
    () => recipeBehaviorModuleGate(behaviorAuthority, 'MASTER_LABEL'),
    [behaviorAuthority],
  );

  useEffect(() => {
    initialize({
      masterLabelId: masterLabelIdForSnapshot(snapshot),
      snapshot,
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
    });
  }, [initialize, snapshot]);
  const active = label?.sourceCompletionSessionId === snapshot.sessionId ? label : null;
  const preflight = useMemo(() => (active ? buildLabelPreflight(active) : null), [active]);

  if (!behaviorGate.ready) {
    return (
      <ReadinessFrame
        state="W PRZYGOTOWANIU"
        title="Master Label zablokowany"
        tone="dark"
        details={{
          limitation: behaviorGate.reason ?? 'Brak zamrożonych danych produktu.',
          calculationImpact: 'Nie zmienia receptury ani zakończonej partii.',
          remaining: 'Uzupełnij i zatwierdź dane wersji produktu.',
        }}
      >
        <p className="text-xs text-white/65">{behaviorGate.reason}</p>
      </ReadinessFrame>
    );
  }

  if (!active || !preflight) {
    return (
      <p className="m-3 rounded-[22px] border border-white/10 bg-[#f7f5f0] p-4 text-xs text-stone-600 shadow-pro-e1">
        Przygotowywanie Master Label…
      </p>
    );
  }
  const profile = marketProfile(active.market);
  const primaryLanguage = active.labelLanguages[0] ?? 'pl';
  const updateLanguageText = (
    field: 'productName' | 'legalProductName' | 'storageInstructions' | 'customerNote',
    language: string,
    value: string,
  ) => replace({ ...active, [field]: { ...active[field], [language]: value } });

  return (
    <div
      className="m-3 space-y-3 rounded-[22px] border border-white/10 bg-[#f7f5f0] p-4 text-ink shadow-pro-e1"
      data-testid="master-label-editor"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.12em] text-stone-600 uppercase">
            Master Label
          </p>
          <h3 className="text-sm font-semibold text-ink">Etykieta z faktycznej partii</h3>
        </div>
        <span className="border border-nonprod/35 bg-nonprod/[0.06] px-2 py-1 text-[10px] font-semibold text-nonprod">
          {profile.status === 'RESEARCH_REQUIRED' ? 'RESEARCH' : profile.status}
        </span>
      </div>

      <section className="border border-ink/10 p-2">
        <p className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-stone-600 uppercase">
          Rynek sprzedaży
        </p>
        <div className="grid grid-cols-3 gap-1">
          {MARKET_CODES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() =>
                replace({
                  ...active,
                  market: code,
                  marketProfileVersion: MARKET_PROFILES[code].version,
                  preflightAcknowledged: false,
                })
              }
              className={`min-h-11 border px-2 text-[10px] font-semibold ${active.market === code ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink'}`}
            >
              {MARKET_PROFILES[code].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-nonprod">{profile.rendererLimitation}</p>
      </section>

      <section className="grid grid-cols-2 gap-2 border border-ink/10 p-2">
        <label className="col-span-2">
          <span className="mb-1 block text-[10px] text-stone-600">
            Języki etykiety · oddzielone przecinkiem
          </span>
          <input
            value={active.labelLanguages.join(', ')}
            onChange={(event) => {
              const languages = event.currentTarget.value
                .split(',')
                .map((language) => language.trim())
                .filter(Boolean);
              replace({ ...active, labelLanguages: languages.length ? languages : ['pl'] });
            }}
            className="h-11 w-full border border-ink/15 px-2 text-xs"
          />
        </label>
        {active.labelLanguages.map((language) => (
          <div key={language} className="col-span-2 grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-[10px] text-stone-600">
                Nazwa · {language.toUpperCase()}
              </span>
              <input
                value={active.productName[language] ?? ''}
                onChange={(event) =>
                  updateLanguageText('productName', language, event.currentTarget.value)
                }
                className="h-11 w-full border border-ink/15 px-2 text-xs"
              />
            </label>
            <label>
              <span className="mb-1 block text-[10px] text-stone-600">
                Nazwa prawna · {language.toUpperCase()}
              </span>
              <input
                value={active.legalProductName[language] ?? ''}
                onChange={(event) =>
                  updateLanguageText('legalProductName', language, event.currentTarget.value)
                }
                className="h-11 w-full border border-ink/15 px-2 text-xs"
              />
            </label>
          </div>
        ))}
        <label>
          <span className="mb-1 block text-[10px] text-stone-600">Masa netto opakowania · g</span>
          <input
            type="number"
            min={0}
            value={active.netQuantityG ?? ''}
            onChange={(event) =>
              replace({ ...active, netQuantityG: Number(event.currentTarget.value) || null })
            }
            className="h-11 w-full border border-ink/15 px-2 font-mono text-xs"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] text-stone-600">LOT</span>
          <input
            value={active.lotCode}
            onChange={(event) => replace({ ...active, lotCode: event.currentTarget.value })}
            className="h-11 w-full border border-ink/15 px-2 text-xs"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] text-stone-600">Operator</span>
          <input
            value={active.operator.operatorName}
            onChange={(event) =>
              replace({
                ...active,
                operator: { ...active.operator, operatorName: event.currentTarget.value },
              })
            }
            className="h-11 w-full border border-ink/15 px-2 text-xs"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] text-stone-600">Adres operatora</span>
          <input
            value={active.operator.address}
            onChange={(event) =>
              replace({
                ...active,
                operator: { ...active.operator, address: event.currentTarget.value },
              })
            }
            className="h-11 w-full border border-ink/15 px-2 text-xs"
          />
        </label>
        <label className="col-span-2">
          <span className="mb-1 block text-[10px] text-stone-600">
            Przechowywanie · {primaryLanguage.toUpperCase()}
          </span>
          <input
            value={active.storageInstructions[primaryLanguage] ?? ''}
            onChange={(event) =>
              updateLanguageText('storageInstructions', primaryLanguage, event.currentTarget.value)
            }
            className="h-11 w-full border border-ink/15 px-2 text-xs"
          />
        </label>
      </section>

      <section className="grid grid-cols-2 gap-2 border border-ink/10 p-2">
        <label>
          <span className="mb-1 block text-[10px] text-stone-600">Data produkcji</span>
          <input
            type="date"
            value={active.productionDate}
            onChange={(event) =>
              replace({
                ...active,
                productionDate: event.currentTarget.value,
                productionDateReviewed: true,
              })
            }
            className="h-11 w-full border border-ink/15 px-2 text-xs"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] font-semibold text-nonprod">
            Najlepiej spożyć · WYMAGA POTWIERDZENIA
          </span>
          <input
            type="date"
            value={active.dateMark.date ?? ''}
            onChange={(event) =>
              replace({
                ...active,
                dateMark: {
                  kind: 'best_before',
                  date: event.currentTarget.value || null,
                  basis: 'manual',
                  reviewedByUser: Boolean(event.currentTarget.value),
                },
              })
            }
            className="h-11 w-full border border-nonprod/35 px-2 text-xs"
          />
        </label>
        <p className="col-span-2 text-[10px] leading-relaxed text-stone-600">
          PINGÜINO nie dodaje dni do daty produkcji. Data wymaga podstawy i potwierdzenia
          użytkownika.
        </p>
      </section>

      <ReadinessFrame
        state={active.allergens.status === 'complete' ? 'DO PRZEGLĄDU' : 'W PRZYGOTOWANIU'}
        title="Alergeny"
        compact
        details={{
          limitation:
            'EngineIngredient nie przenosi jeszcze zweryfikowanych danych alergenowych Mapper.',
          calculationImpact: 'Nie zmienia obliczeń receptury; blokuje gotowość etykiety.',
          remaining: 'Rehydratować zweryfikowane alergeny po canonical ingredient ID.',
        }}
      >
        <p className="text-[10px] text-stone-600">
          WYMAGA WERYFIKACJI. Nie deklarujemy „brak alergenów”.
        </p>
      </ReadinessFrame>

      <section className="border border-ink/10 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-stone-600">Format</span>
          <select
            value={active.format}
            onChange={(event) =>
              replace({ ...active, format: event.currentTarget.value as 'rectangle' | 'round' })
            }
            className="h-11 border border-ink/15 px-2 text-xs"
          >
            <option value="rectangle">Prostokąt</option>
            <option value="round">Okrągła</option>
          </select>
          <span className="text-[10px] text-stone-600">Kopie</span>
          <input
            type="number"
            min={1}
            value={active.copies}
            onChange={(event) =>
              replace({ ...active, copies: Math.max(1, Number(event.currentTarget.value) || 1) })
            }
            className="h-11 w-16 border border-ink/15 px-2 font-mono text-xs"
          />
        </div>
        <p className="mt-2 text-[10px] text-stone-600">Drukarka: Systemowa</p>
      </section>

      <section className="border border-ink/10 p-2" data-testid="master-label-preflight">
        <h4 className="text-xs font-semibold text-ink">Gotowość etykiety</h4>
        <ul className="mt-2 space-y-1">
          {preflight.items.map((item) => (
            <li key={item.field} className="flex items-start justify-between gap-2 text-[10px]">
              <span>
                {item.status === 'ready' ? '✓' : '!'} {item.label}
              </span>
              <span className={item.status === 'ready' ? 'text-status-ideal' : 'text-nonprod'}>
                {item.message}
              </span>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex min-h-11 items-center gap-2 text-[10px] text-ink">
          <input
            type="checkbox"
            className="size-5 shrink-0"
            checked={active.preflightAcknowledged}
            onChange={(event) =>
              replace({ ...active, preflightAcknowledged: event.currentTarget.checked })
            }
          />
          Sprawdziłem dane etykiety przed wydrukiem.
        </label>
        <p className="mt-2 text-[10px] leading-relaxed text-stone-600">
          Etykieta została przygotowana na podstawie danych receptury, produkcji i informacji
          podanych przez użytkownika. Nie jest certyfikatem prawnym.
        </p>
        <button
          type="button"
          disabled={!preflight.readyForSystemPrint}
          onClick={() => printMasterLabel(active)}
          className="mt-3 h-11 w-full bg-ink px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-700"
        >
          {printLabel}
        </button>
      </section>
    </div>
  );
}
