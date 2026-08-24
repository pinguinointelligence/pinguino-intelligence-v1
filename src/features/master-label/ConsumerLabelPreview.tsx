import type { MasterLabelData } from './masterLabel';
import { marketProfile } from './marketProfiles';

const primaryText = (value: Record<string, string>, languages: readonly string[]): string =>
  languages.map((language) => value[language]).find((text) => text?.trim()) ?? '';

const safeAllergenStatements = (label: MasterLabelData): string[] =>
  [...new Set([...label.allergens.declared, ...label.allergens.labelStatements])].filter(
    (value) => !['none_declared', 'none declared'].includes(value.trim().toLowerCase()),
  );

export function ConsumerLabelPreview({
  label,
  logoUrl,
}: {
  label: MasterLabelData;
  logoUrl: string | null;
}) {
  const profile = marketProfile(label.market);
  const productName = primaryText(label.productName, label.labelLanguages);
  const legalName = primaryText(label.legalProductName, label.labelLanguages);
  const ingredients = label.ingredients
    .map((ingredient) => primaryText(ingredient.names, label.labelLanguages))
    .join(', ');
  const allergens = safeAllergenStatements(label);
  const storage = primaryText(label.storageInstructions, label.labelLanguages);
  const origin = primaryText(label.origin, label.labelLanguages);
  const customerNote = primaryText(label.customerNote, label.labelLanguages);
  const showLogo = label.enabledOptionalFields.includes('logo') && Boolean(logoUrl);
  const showOrigin = label.enabledOptionalFields.includes('origin') && Boolean(origin);
  const showCustomerNote =
    label.enabledOptionalFields.includes('customer_note') && Boolean(customerNote);

  return (
    <article
      className="mx-auto w-full max-w-[680px] border-2 border-ink bg-[#fffdf8] p-4 text-ink shadow-[0_18px_60px_rgba(36,33,28,0.10)] sm:p-6"
      aria-label="Podgląd etykiety konsumenckiej"
      data-testid="label-consumer-preview"
      data-market={label.market}
      data-label-layout={profile.consumerLayout}
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-ink/20 pb-3 text-[11px] font-semibold uppercase tracking-[0.16em]">
        <span data-testid="label-market-indicator">
          {profile.flag} {profile.label}
        </span>
        <span className="text-stone-500">{profile.jurisdiction}</span>
      </div>
      <header className="flex items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div className="min-w-0">
          <strong className="block text-2xl leading-tight text-ink">{productName}</strong>
          <span className={legalName ? 'text-sm text-stone-600' : 'text-sm text-status-error'}>
            {legalName || 'Uzupełnij nazwę prawną'}
          </span>
          {label.businessName ? (
            <span className="mt-1 block text-xs text-stone-500">{label.businessName}</span>
          ) : null}
        </div>
        {showLogo ? <img src={logoUrl!} alt="" className="h-14 max-w-28 object-contain" /> : null}
      </header>
      <p className="mt-4 text-sm leading-relaxed">
        <strong>Składniki:</strong> {ingredients}
      </p>
      {allergens.length > 0 ? (
        <p className="mt-3 text-sm" data-testid="consumer-allergens">
          <strong>Alergeny:</strong> {allergens.join('; ')}
        </p>
      ) : null}
      {label.nutritionDeclaration ? (
        <table className="mt-5 w-full border-t-2 border-ink text-sm">
          <caption className="py-2 text-left font-semibold">
            {profile.consumerLayout === 'market_review'
              ? `Dane żywieniowe · ${profile.label} · podgląd roboczy`
              : 'Wartość odżywcza w 100 g'}
          </caption>
          <tbody>
            {label.nutritionDeclaration.rows.map((row) => (
              <tr key={row.key} className="border-t border-ink/15">
                <th className={`py-1.5 text-left font-normal ${row.indented ? 'pl-4' : ''}`}>
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
            {label.netQuantityG ? `${label.netQuantityG} g` : 'Do uzupełnienia'}
          </dd>
        </div>
        <div>
          <dt className="text-stone-500">LOT</dt>
          <dd className="font-mono" data-testid="consumer-lot">
            {label.lotCode}
          </dd>
        </div>
        {label.dateMark.date ? (
          <div>
            <dt className="text-stone-500">
              {label.dateMark.kind === 'use_by' ? 'Należy spożyć do' : 'Najlepiej spożyć przed'}
            </dt>
            <dd className="font-mono">{label.dateMark.date}</dd>
          </div>
        ) : null}
        {showOrigin ? (
          <div>
            <dt className="text-stone-500">Pochodzenie</dt>
            <dd>{origin}</dd>
          </div>
        ) : null}
      </dl>
      {storage ? (
        <p className="mt-4 text-xs leading-relaxed">
          <strong>Przechowywanie:</strong> {storage}
        </p>
      ) : null}
      {showCustomerNote ? <p className="mt-2 text-xs leading-relaxed">{customerNote}</p> : null}
      {label.operator.operatorName || label.operator.address ? (
        <footer className="mt-4 border-t border-ink/20 pt-3 text-xs text-stone-600">
          {[label.operator.operatorName, label.operator.address].filter(Boolean).join(' · ')}
        </footer>
      ) : null}
    </article>
  );
}
