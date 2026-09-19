import { describe, expect, it } from 'vitest';
import { publicationIdentityEligibilityFromStoredProductFacts } from './productPublicationEligibility';

type ExistingSharedProduct = {
  code: string;
  name: string;
  brand: string;
  ean: string;
  shape: 'flat' | 'nested';
};

/** Read-only snapshot of the 33 active shared commercial products audited on 2026-09-08. */
const EXISTING_SHARED_PRODUCTS: readonly ExistingSharedProduct[] = [
  ['PR-ING-007142', 'Cacao Puro', 'La Chocolatera', '8410109121551', 'nested'],
  ['PR-ING-007144', 'HARIBO Quaxi', 'HARIBO', '4001686322536', 'nested'],
  ['PR-ING-007145', 'KIWI', 'Comprital', '', 'flat'],
  ['PR-ING-007146', 'Prima Finezja Kawa mielona', 'Prima', '5900194000273', 'flat'],
  [
    'PR-ING-007147',
    'Krem z orzechów nerkowca GO Active bez dodatku cukrów',
    'GO Active',
    '',
    'flat',
  ],
  ['PR-ING-007148', 'Jogurt Fruvita morelowy', 'Fruvita', '', 'flat'],
  [
    'PR-ING-007149',
    'Nestlé Fitness Chocolate Płatki śniadaniowe w formie batonika',
    'Nestlé',
    '',
    'flat',
  ],
  ['PR-ING-007150', 'LIME Limonka', 'Comprital', '', 'flat'],
  ['PR-ING-007151', 'LATTEDICOCCO Mleko kokosowe', 'Comprital', '', 'flat'],
  [
    'PR-ING-007152',
    'Dr. Oetker Babeczki czekoladowe ze skórką pomarańczy',
    'Dr. Oetker',
    '',
    'flat',
  ],
  [
    'PR-ING-007153',
    'COPERTURA FONDENTE CON POP CORN CARAMELLATO Ciemna czekolada z karmelizowaną kukurydzą',
    'Comprital',
    '',
    'flat',
  ],
  [
    'PR-ING-007154',
    'Śmietanka do zup i sosów Mleczna Dolina 18% do zup i sosów; 18% tłuszczu',
    'Mleczna Dolina',
    '',
    'flat',
  ],
  ['PR-ING-007155', 'GRANI ARANCIA Pomarańczowy', 'Comprital', '', 'flat'],
  ['PR-ING-007156', 'BASE PURE VEGAN P.Z Neutralny', 'Comprital', '', 'flat'],
  ['PR-ING-007157', 'CHIMERA Mleczny z posmakiem masła', 'Comprital', '', 'flat'],
  [
    'PR-ING-007158',
    'Masło Ekstra bez laktozy Mleczna Dolina 82% tłuszczu; bez laktozy',
    'Mleczna Dolina',
    '5900120025578',
    'flat',
  ],
  ['PR-ING-007159', 'CARAMEL MOU GIUBILEO Toffi', 'Comprital', '', 'flat'],
  ['PR-ING-007160', 'FREE LIMONE Cytrynowy', 'Comprital', '', 'flat'],
  ['PR-ING-007161', 'Strawberry & Crisps Waffle Baitz truskawka i chrupki', 'Baitz', '', 'flat'],
  ['PR-ING-007162', 'FROLLINO Ciemna czekolada z ciasteczkami kakaowymi', 'Comprital', '', 'flat'],
  ['PR-ING-007163', 'ANANAS CON PEZZI', 'Comprital', '', 'flat'],
  [
    'PR-ING-007164',
    'Prince Polo Kruchy wafelek z kremem kakaowym z odrobiną czekolady',
    'Prince Polo',
    '',
    'flat',
  ],
  [
    'PR-ING-007169',
    'Glukoza krystaliczna (dekstroza) 500 g',
    'Swojska Piwniczka',
    '5902751322798',
    'flat',
  ],
  [
    'PR-ING-007170',
    'Mleko Polskie 3,2% tł. (pasteryzowane), 1 l',
    'Mlekovita',
    '5900512850016',
    'flat',
  ],
  ['PR-ING-007171', 'Śmietanka Polska 30% UHT, 330 ml', 'Mlekovita', '5900512904443', 'flat'],
  ['PR-ING-007172', 'Mleko płynne Łaciate 3,5%', 'Łaciate', '5900820012434', 'flat'],
  ['PR-ING-007173', 'Leche líquida entera Hacendado', 'Hacendado', '8402001047251', 'flat'],
  [
    'PR-ING-007174',
    'Lait liquide frais entier Alsace Lait',
    'Alsace Lait',
    '3262970109108',
    'flat',
  ],
  ['PR-ING-007195', 'Sport 002', 'Vitamin Well', '7340222800464', 'nested'],
  ['PR-ING-007196', 'Vitamin Well Sport 001', 'Vitamin Well', '7340222800457', 'nested'],
  ['PR-ING-007197', 'Cola Zero', 'Hacendado', '8402001042911', 'nested'],
  ['PR-ING-007199', 'Vitamin well hydrate', 'Vitamin Well', '7350042715213', 'nested'],
  ['PR-ING-007200', 'Vitamin well', 'Vitamin Well AB', '7350042718481', 'nested'],
].map(([code, name, brand, ean, shape]) => ({
  code,
  name,
  brand,
  ean,
  shape,
})) as ExistingSharedProduct[];

const factsFor = (product: ExistingSharedProduct) =>
  product.shape === 'nested'
    ? { identity: { displayName: product.name, brand: product.brand } }
    : { displayName: product.name, brand: product.brand };

describe('SOL-052 current shared registry snapshot', () => {
  it('keeps exactly 32 of 33 shared PR eligible', () => {
    expect(EXISTING_SHARED_PRODUCTS).toHaveLength(33);
    const results = EXISTING_SHARED_PRODUCTS.map((product) => ({
      product,
      eligible: publicationIdentityEligibilityFromStoredProductFacts(factsFor(product)).eligible,
    }));
    expect(results.filter(({ eligible }) => eligible)).toHaveLength(32);
    expect(results.filter(({ eligible }) => !eligible).map(({ product }) => product.code)).toEqual([
      'PR-ING-007200',
    ]);
  });

  it('keeps every valid legacy row in search and every valid legacy EAN in exact lookup', () => {
    const searchable = EXISTING_SHARED_PRODUCTS.filter(
      (product) => publicationIdentityEligibilityFromStoredProductFacts(factsFor(product)).eligible,
    );
    const exactLookup = searchable.filter((product) => product.ean.length > 0);

    expect(searchable).toHaveLength(32);
    expect(exactLookup).toHaveLength(14);
    expect(exactLookup.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['PR-ING-007170', 'PR-ING-007171']),
    );
    expect(searchable.some(({ shape }) => shape === 'flat')).toBe(true);
    expect(exactLookup.some(({ code }) => code === 'PR-ING-007200')).toBe(false);
  });
});
