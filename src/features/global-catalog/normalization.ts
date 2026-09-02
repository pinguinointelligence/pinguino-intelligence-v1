const DIACRITIC_MARKS = /[\u0300-\u036f]/g;
const NON_WORD = /[^a-z0-9]+/g;

const FAMILY_ALIASES: Record<string, readonly string[]> = {
  strawberry: ['strawberry', 'strawberries', 'truskawka', 'truskawki', 'fresa', 'fresas', 'erdbeere', 'erdbeeren', 'fragola', 'fragole', 'fraise', 'fraises'],
  chocolate: ['chocolate', 'chocolat', 'schokolade', 'czekolada', 'cioccolato', 'chocolate'],
  pistachio: ['pistachio', 'pistacja', 'pistazie', 'pistacho', 'pistacchio', 'pistache'],
  mango: ['mango'],
  vanilla: ['vanilla', 'wanilia', 'vanille', 'vainilla', 'vaniglia'],
  coffee: ['coffee', 'kawa', 'kaffee', 'cafe', 'caffe'],
  banana: ['banana', 'banan', 'banane', 'platano'],
};

const ALIAS_TO_FAMILY = new Map(
  Object.entries(FAMILY_ALIASES).flatMap(([family, aliases]) =>
    aliases.map((alias) => [normalizeCatalogText(alias), family] as const),
  ),
);

export function normalizeCatalogText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(DIACRITIC_MARKS, '')
    .toLocaleLowerCase('en')
    .replace(NON_WORD, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeCatalogToken(value: string): string {
  return normalizeCatalogText(value).replace(/\s/g, '');
}

export function canonicalFamilyFor(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeCatalogText(value);
  for (const token of normalized.split(' ')) {
    const family = ALIAS_TO_FAMILY.get(token);
    if (family) return family;
  }
  return ALIAS_TO_FAMILY.get(normalized) ?? null;
}

export function aliasesForFamily(family: string | null): string[] {
  if (!family) return [];
  return [...(FAMILY_ALIASES[family] ?? [])];
}

export function normalizeEan(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function isValidGtin(value: string | null): boolean {
  const normalized = normalizeEan(value);
  if (!normalized || ![8, 12, 13, 14].includes(normalized.length)) return false;
  const digits = normalized.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function normalizeNetQuantity(value: number | null, unit: string | null): { value: number | null; unit: 'g' | 'ml' | null } {
  if (value === null || !Number.isFinite(value) || value <= 0 || !unit) return { value: null, unit: null };
  switch (unit.toLocaleLowerCase('en')) {
    case 'g': return { value, unit: 'g' };
    case 'kg': return { value: value * 1000, unit: 'g' };
    case 'ml': return { value, unit: 'ml' };
    case 'l': return { value: value * 1000, unit: 'ml' };
    default: return { value: null, unit: null };
  }
}

export function normalizedIdentityKey(input: {
  brand: string | null;
  name: string | null;
  variant: string | null;
  market: string | null;
}): string {
  return [input.brand, input.name, input.variant, input.market]
    .map((part) => normalizeCatalogText(part ?? ''))
    .join('|');
}

export function normalizedCompositionFingerprint(input: {
  ingredientsText: string | null;
  allergensText: string | null;
  nutrition: object;
}): string {
  const nutrition = (Object.entries(input.nutrition) as Array<[string, number | string | null]>)
    .filter(([, value]) => value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${typeof value === 'number' ? value.toFixed(2) : normalizeCatalogText(value ?? '')}`)
    .join('|');
  return `${normalizeCatalogText(input.ingredientsText ?? '')}|${normalizeCatalogText(input.allergensText ?? '')}|${nutrition}`;
}
