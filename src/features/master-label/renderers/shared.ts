import type { MasterLabelData, MasterLabelIngredient, MultilingualText } from '../masterLabel';
import { packageQuantityForDisplay } from '../masterLabel';
import {
  MARKET_ALLERGEN_RULES,
  marketAllergenDisplay,
  resolveMarketAllergen,
} from '../allergenTaxonomy';
import type { MarketProfileCode } from '../marketProfiles';
import { responsibleBusinessDetails } from '../businessAuthority';

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const textFor = (value: MultilingualText | undefined, language: string): string =>
  value?.[language]?.trim() ?? Object.values(value ?? {}).find((text) => text?.trim()) ?? '';

export const primaryText = (value: MultilingualText, languages: readonly string[]): string =>
  languages.map((language) => value[language]).find((text) => text?.trim()) ?? '';

const regexEscape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function emphasizeConfirmedAllergens(
  market: MarketProfileCode,
  declaration: string,
  confirmed: readonly string[],
): string {
  const terms = confirmed
    .flatMap((value) => {
      const rule = resolveMarketAllergen(market, value);
      return rule ? [rule.display, ...rule.aliases] : [];
    })
    .filter((term) => term.length > 1)
    .sort((a, b) => b.length - a.length);
  if (terms.length === 0) return escapeHtml(declaration);
  const pattern = new RegExp(`(${[...new Set(terms)].map(regexEscape).join('|')})`, 'giu');
  let cursor = 0;
  let html = '';
  for (const match of declaration.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(declaration.slice(cursor, index));
    html += `<strong class="allergen-term">${escapeHtml(match[0])}</strong>`;
    cursor = index + match[0].length;
  }
  return html + escapeHtml(declaration.slice(cursor));
}

function compoundDeclaration(ingredient: MasterLabelIngredient, language: string): string {
  if (!ingredient.compound?.componentsDeclared || ingredient.compound.components.length === 0) {
    return textFor(ingredient.names, language);
  }
  const name =
    textFor(ingredient.compound.displayName, language) || textFor(ingredient.names, language);
  const components = [...ingredient.compound.components]
    .sort((a, b) => (b.actualGrams ?? -1) - (a.actualGrams ?? -1))
    .map((component) => textFor(component.names, language))
    .filter(Boolean)
    .join(', ');
  return `${name} (${components})`;
}

export function ingredientDeclarationHtml(data: MasterLabelData, language: string): string {
  return data.ingredients
    .map((ingredient) => {
      const declaration = compoundDeclaration(ingredient, language);
      const emphasized = emphasizeConfirmedAllergens(
        data.market,
        declaration,
        data.allergens.declared,
      );
      const quid = ingredient.quid;
      const marketUsesPercentage =
        data.market === 'EU' || data.market === 'UK' || data.market === 'AU_NZ';
      return marketUsesPercentage && quid?.required && quid.percentage !== null
        ? `${emphasized} (${quid.percentage.toFixed(1).replace(/\.0$/, '')}%)`
        : emphasized;
    })
    .join(', ');
}

export function ingredientDeclarationText(data: MasterLabelData, language: string): string {
  return data.ingredients
    .map((ingredient) => {
      const declaration = compoundDeclaration(ingredient, language);
      const quid = ingredient.quid;
      const marketUsesPercentage =
        data.market === 'EU' || data.market === 'UK' || data.market === 'AU_NZ';
      return marketUsesPercentage && quid?.required && quid.percentage !== null
        ? `${declaration} (${quid.percentage.toFixed(1).replace(/\.0$/, '')}%)`
        : declaration;
    })
    .join(', ');
}

export function allergenDisplayValues(data: MasterLabelData): string[] {
  return [
    ...new Set(
      data.allergens.declared
        .map((value) => marketAllergenDisplay(data.market, value))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

export function allergenEmphasisTerms(data: MasterLabelData): string[] {
  const values = new Set<string>();
  for (const declared of data.allergens.declared) {
    const rule = resolveMarketAllergen(data.market, declared);
    if (!rule) continue;
    const display = marketAllergenDisplay(data.market, declared);
    if (display) values.add(display);
    values.add(rule.display);
    for (const alias of rule.aliases) values.add(alias);
  }
  return [...values];
}

export const netQuantityHtml = (data: MasterLabelData, heading = 'Net quantity'): string =>
  `<div class="label-fact net-quantity"><span>${escapeHtml(heading)}</span><strong>${escapeHtml(packageQuantityForDisplay(data))}</strong></div>`;

export const traceabilityHtml = (data: MasterLabelData, bilingual = false): string => {
  const dateHeading = data.dateMark.kind === 'use_by' ? 'Use by' : 'Best before';
  return `<div class="traceability"><div><span>LOT</span><strong data-testid="consumer-lot">${escapeHtml(data.lotCode)}</strong></div><div><span>${bilingual ? 'Production / Production' : 'Production date'}</span><strong>${escapeHtml(data.productionDate)}</strong></div>${data.dateMark.date ? `<div><span>${bilingual ? `${dateHeading} / Date` : dateHeading}</span><strong>${escapeHtml(data.dateMark.date)}</strong></div>` : ''}</div>`;
};

export const businessHtml = (data: MasterLabelData, bilingual = false): string => {
  const responsible = responsibleBusinessDetails(data);
  const names = [data.businessName, responsible.name]
    .map((value) => value.trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);
  const business = [
    ...names,
    responsible.address,
    responsible.countryCode,
    data.enabledOptionalFields.includes('website') ? data.operator.website : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return business
    ? `<footer class="business"><span>${bilingual ? 'Dealer / Fournisseur' : 'Business'}</span> ${escapeHtml(business)}</footer>`
    : '';
};

export const storageHtml = (
  data: MasterLabelData,
  languages: readonly string[],
  headings: readonly string[] = ['Storage'],
): string =>
  languages
    .map((language, index) => {
      const value = textFor(data.storageInstructions, language);
      return value
        ? `<p class="storage" lang="${escapeHtml(language)}"><strong>${escapeHtml(headings[index] ?? headings[0] ?? 'Storage')}:</strong> ${escapeHtml(value)}</p>`
        : '';
    })
    .join('');

export const originHtml = (data: MasterLabelData, languages: readonly string[]): string => {
  const requiredForSharedAuNz = data.market === 'AU_NZ';
  if (!requiredForSharedAuNz && !data.enabledOptionalFields.includes('origin')) return '';
  const origin = primaryText(data.origin, languages);
  return origin ? `<p class="origin"><strong>Origin:</strong> ${escapeHtml(origin)}</p>` : '';
};

export const requiredMarketAllergenTerms = (market: MarketProfileCode): readonly string[] =>
  MARKET_ALLERGEN_RULES[market].map((rule) => rule.display);

export const numberText = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits).replace(/\.0$/, '');

export const perServing = (per100: number, servingG: number): number => (per100 * servingG) / 100;
