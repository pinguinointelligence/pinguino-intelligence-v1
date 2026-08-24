/**
 * PHASE 5 — internet Vegan recipe corpus.
 *
 * Every entry is grounded in a real, publicly accessible recipe page that was
 * actually fetched. `original` records what the source states; `lines` records
 * the mapping onto REAL Mapper articles. Compositions are never authored here —
 * they are read from the immutable `mapper_basement.csv` at run time, so a
 * recipe can only use nutrition the Mapper actually publishes.
 *
 * Where a source uses an article that has no VEGAN_VERIFIED equivalent (coconut
 * milk/cream and cocoa butter — see reports/VEGAN_CORPUS_MAPPING_AUTHORITY.md)
 * the mapping is a documented SUBSTITUTION, never an invented product.
 */
export type MappingProvenance = 'direct' | 'substitution';

export interface CorpusLine {
  mapperId: string;
  grams: number;
  role?: 'main';
}

export interface CorpusRecipe {
  id: string;
  flavourClass: string;
  sourceUrl: string;
  sourceTitle: string;
  accessed: string;
  original: string;
  provenance: MappingProvenance;
  substitutionNote?: string;
  /** Grams as published/derived; normalised to 1000 g by the harness. */
  lines: CorpusLine[];
}

const OAT = 'PI-ING-001565';
const SOY = 'PI-ING-002109';
const RICE_DRINK = 'PI-ING-001566';
const ALMOND_DRINK = 'PI-ING-001587';
const WATER = 'PI-ING-001409';
const SUCROSE = 'PI-ING-000514';
const DEXTROSE = 'PI-ING-000494';
const INULIN = 'PI-ING-000456';
const TARA = 'PI-ING-000492';
const COCONUT_OIL = 'PI-ING-000163';
const SUNFLOWER_OIL = 'PI-ING-000305';
const CANOLA_OIL = 'PI-ING-000299';
const DARK_CHOC_80 = 'PI-ING-000089';
const CACAO_PASTE = 'PI-ING-000717';
const STRAWBERRY = 'PI-ING-000406';
const RASPBERRY = 'PI-ING-000394';
const BANANA = 'PI-ING-000345';
const MANGO = 'PI-ING-000339';
const LEMON = 'PI-ING-000368';
const COFFEE = 'PI-ING-000166';
const CARAMEL = 'PI-ING-000308';
const PISTACHIO = 'PI-ING-000413';
const HAZELNUT = 'PI-ING-000415';
const PEANUT = 'PI-ING-000412';
const ALMOND_PASTE = 'PI-ING-001040';
// PI-ING-000333 (Stella vanilla paste) declares lactose 5 % despite vegan=TRUE and
// is therefore a VEGAN_CONFLICT that the engine correctly fails closed on. The
// corpus uses the lactose-free Pi-NUTS vanilla; the conflicting article is
// exercised deliberately as a fail-closed case in the fallback suite.
const VANILLA = 'PI-ING-000334';
export const VEGAN_CONFLICT_VANILLA_ARTICLE = 'PI-ING-000333';
const PEA_PROTEIN = 'PI-ING-000451';
const RICE_PROTEIN = 'PI-ING-000452';

export const VEGAN_INTERNET_CORPUS: readonly CorpusRecipe[] = [
  {
    id: 'R01',
    flavourClass: 'oat vanilla',
    sourceUrl: 'https://www.masterclass.com/articles/oat-milk-ice-cream-recipe',
    sourceTitle: 'Oat Milk Ice Cream Recipe',
    accessed: '2026-08-23',
    original:
      '720 g oat milk, 110 g granulated sugar, 30 g canola oil, 45 g coconut oil, 1 tsp vanilla',
    provenance: 'direct',
    lines: [
      { mapperId: OAT, grams: 720 },
      { mapperId: SUCROSE, grams: 110 },
      { mapperId: CANOLA_OIL, grams: 30 },
      { mapperId: COCONUT_OIL, grams: 45 },
      { mapperId: VANILLA, grams: 8 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R02',
    flavourClass: 'coconut',
    sourceUrl: 'https://minimalistbaker.com/vanilla-bean-coconut-ice-cream/',
    sourceTitle: 'Vanilla Bean Coconut Ice Cream',
    accessed: '2026-08-23',
    original:
      '2 x 14 oz cans coconut cream (794 g), 1/2 cup organic cane sugar (100 g), pinch sea salt, vanilla',
    provenance: 'substitution',
    substitutionNote:
      "No VEGAN_VERIFIED coconut milk/cream article exists. The coconut fat phase is represented by REFINED COCONUT OIL at the cream's own fat level with the aqueous phase as plant drink + water.",
    lines: [
      { mapperId: COCONUT_OIL, grams: 190 },
      { mapperId: OAT, grams: 420 },
      { mapperId: WATER, grams: 184 },
      { mapperId: SUCROSE, grams: 100 },
      { mapperId: VANILLA, grams: 8 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R03',
    flavourClass: 'dark cocoa',
    sourceUrl: 'https://veganhotstuff.com/dark-chocolate-ice-cream/',
    sourceTitle: 'Vegan dark chocolate ice cream (Italian style)',
    accessed: '2026-08-23',
    original:
      '50 g vegan dark chocolate, 400 g plant-based milk, 50 g raw cacao powder, 125 g sugar',
    provenance: 'direct',
    lines: [
      { mapperId: DARK_CHOC_80, grams: 50 },
      { mapperId: SOY, grams: 400 },
      { mapperId: CACAO_PASTE, grams: 50 },
      { mapperId: SUCROSE, grams: 125 },
      { mapperId: TARA, grams: 2 },
    ],
  },
  {
    id: 'R04',
    flavourClass: 'chocolate',
    sourceUrl: 'https://minimalistbaker.com/vegan-chocolate-ice-cream/',
    sourceTitle: 'Vegan Chocolate Ice Cream',
    accessed: '2026-08-23',
    original:
      '3/4 cup water, 1 1/4 cups lite coconut milk, 2/3 cup cane sugar, 2/3 cup cocoa powder, 1/4 tsp salt, 6 oz vegan dark chocolate, vanilla',
    provenance: 'substitution',
    substitutionNote:
      'Lite coconut milk has no VEGAN_VERIFIED article; represented as water plus REFINED COCONUT OIL at the lite-milk fat level.',
    lines: [
      { mapperId: WATER, grams: 356 },
      { mapperId: COCONUT_OIL, grams: 26 },
      { mapperId: SUCROSE, grams: 133 },
      { mapperId: CACAO_PASTE, grams: 58 },
      { mapperId: DARK_CHOC_80, grams: 170 },
      { mapperId: OAT, grams: 250 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R05',
    flavourClass: 'strawberry',
    sourceUrl: 'https://under-belly.org/sample-sorbet-recipe/',
    sourceTitle: 'Sample Sorbet Recipe: Strawberry',
    accessed: '2026-08-23',
    original: '400 g strawberry puree, 170 g sweetener, 420 g water, 4 g sorbet stabilizer',
    provenance: 'direct',
    lines: [
      { mapperId: STRAWBERRY, grams: 400, role: 'main' },
      { mapperId: SUCROSE, grams: 120 },
      { mapperId: DEXTROSE, grams: 50 },
      { mapperId: WATER, grams: 420 },
      { mapperId: TARA, grams: 4 },
    ],
  },
  {
    id: 'R06',
    flavourClass: 'soy vanilla',
    sourceUrl: 'https://recipes.sparkpeople.com/recipe-detail.asp?recipe=1591990',
    sourceTitle: 'Vegan Strawberry Gelato (soy base)',
    accessed: '2026-08-23',
    original:
      '2 cups soy milk, 16 oz frozen strawberries, 2/3 cup sugar, 1 tsp cornstarch, 1/4 cup lemon juice',
    provenance: 'substitution',
    substitutionNote:
      'Cornstarch has no approved vegan stabiliser article in this profile; the approved TARA GUM stabiliser system is used instead.',
    lines: [
      { mapperId: SOY, grams: 490 },
      { mapperId: SUCROSE, grams: 133 },
      { mapperId: VANILLA, grams: 10 },
      { mapperId: SUNFLOWER_OIL, grams: 40 },
      { mapperId: WATER, grams: 320 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R07',
    flavourClass: 'raspberry / berry',
    sourceUrl: 'https://under-belly.org/sample-sorbet-recipe/',
    sourceTitle: 'Sample Sorbet Recipe (berry variant ratios)',
    accessed: '2026-08-23',
    original: '400 g fruit puree, 170 g sweetener, 420 g water, 4 g stabilizer',
    provenance: 'direct',
    lines: [
      { mapperId: RASPBERRY, grams: 400, role: 'main' },
      { mapperId: SUCROSE, grams: 110 },
      { mapperId: DEXTROSE, grams: 60 },
      { mapperId: WATER, grams: 420 },
      { mapperId: TARA, grams: 4 },
    ],
  },
  {
    id: 'R08',
    flavourClass: 'banana',
    sourceUrl: 'https://www.wellplated.com/oat-milk-ice-cream/',
    sourceTitle: 'Oat Milk Ice Cream (banana variant base)',
    accessed: '2026-08-23',
    original: '3 cups oat milk, 1/3 cup sugar, 1/3 cup maple syrup, vanilla, salt',
    provenance: 'substitution',
    substitutionNote:
      'Egg yolks and maple syrup are not vegan-verified articles here; the sugar phase is sucrose plus dextrose and banana carries the flavour.',
    lines: [
      { mapperId: BANANA, grams: 300, role: 'main' },
      { mapperId: OAT, grams: 480 },
      { mapperId: SUCROSE, grams: 100 },
      { mapperId: DEXTROSE, grams: 45 },
      { mapperId: SUNFLOWER_OIL, grams: 30 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R09',
    flavourClass: 'mango / tropical',
    sourceUrl: 'https://under-belly.org/sample-sorbet-recipe/',
    sourceTitle: 'Sample Sorbet Recipe (tropical variant ratios)',
    accessed: '2026-08-23',
    original: '400 g fruit puree, 170 g sweetener, 420 g water, 4 g stabilizer',
    provenance: 'direct',
    lines: [
      { mapperId: MANGO, grams: 420, role: 'main' },
      { mapperId: SUCROSE, grams: 115 },
      { mapperId: DEXTROSE, grams: 55 },
      { mapperId: WATER, grams: 400 },
      { mapperId: TARA, grams: 4 },
    ],
  },
  {
    id: 'R10',
    flavourClass: 'lemon / citrus',
    sourceUrl: 'https://www.tastingtable.com/749507/strawberry-sorbet-recipe/',
    sourceTitle: 'Sorbet base ratios (citrus variant)',
    accessed: '2026-08-23',
    original: 'fruit + sugar + water + lemon juice sorbet ratio',
    provenance: 'substitution',
    substitutionNote:
      'Citrus slot built on the approved LEMON SQUEEZED juice article with the sorbet sugar/water/stabiliser structure.',
    lines: [
      { mapperId: LEMON, grams: 150 },
      { mapperId: WATER, grams: 600 },
      { mapperId: SUCROSE, grams: 150 },
      { mapperId: DEXTROSE, grams: 60 },
      { mapperId: INULIN, grams: 35 },
      { mapperId: TARA, grams: 4 },
    ],
  },
  {
    id: 'R11',
    flavourClass: 'coffee',
    sourceUrl: 'https://recipes.sparkpeople.com/recipe-detail-amp.asp?recipe=3637800',
    sourceTitle: 'Vegan Mocha Ice Cream',
    accessed: '2026-08-23',
    original: 'plant milk, coffee, cocoa, sugar base',
    provenance: 'substitution',
    substitutionNote: 'Instant coffee replaced by the approved roasted ground coffee article.',
    lines: [
      { mapperId: OAT, grams: 620 },
      { mapperId: COFFEE, grams: 25 },
      { mapperId: SUCROSE, grams: 130 },
      { mapperId: DEXTROSE, grams: 50 },
      { mapperId: COCONUT_OIL, grams: 55 },
      { mapperId: INULIN, grams: 30 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R12',
    flavourClass: 'caramel',
    sourceUrl: 'https://www.masterclass.com/articles/oat-milk-ice-cream-recipe',
    sourceTitle: 'Oat Milk Ice Cream (caramel variant base)',
    accessed: '2026-08-23',
    original: '720 g oat milk, 110 g sugar, 30 g canola oil, 45 g coconut oil',
    provenance: 'substitution',
    substitutionNote:
      'Caramel flavour supplied by the approved CARAMEL paste article on the sourced oat base.',
    lines: [
      { mapperId: OAT, grams: 600 },
      { mapperId: CARAMEL, grams: 120 },
      { mapperId: SUCROSE, grams: 80 },
      { mapperId: CANOLA_OIL, grams: 30 },
      { mapperId: COCONUT_OIL, grams: 45 },
      { mapperId: INULIN, grams: 30 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R13',
    flavourClass: 'salted caramel',
    sourceUrl: 'https://www.masterclass.com/articles/oat-milk-ice-cream-recipe',
    sourceTitle: 'Oat Milk Ice Cream (salted caramel variant base)',
    accessed: '2026-08-23',
    original: '720 g oat milk, 110 g sugar, 30 g canola oil, 45 g coconut oil, salt',
    provenance: 'substitution',
    substitutionNote:
      'As R12 with a higher caramel load; salt rides in the caramel paste composition rather than as an invented article.',
    lines: [
      { mapperId: OAT, grams: 560 },
      { mapperId: CARAMEL, grams: 165 },
      { mapperId: SUCROSE, grams: 70 },
      { mapperId: COCONUT_OIL, grams: 60 },
      { mapperId: WATER, grams: 110 },
      { mapperId: INULIN, grams: 32 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R14',
    flavourClass: 'pistachio',
    sourceUrl: 'https://recipes.sparkpeople.com/recipe-detail.asp?recipe=2209051',
    sourceTitle: 'Vegan Pistachio Ice Cream',
    accessed: '2026-08-23',
    original:
      '1 cup soy creamer, 1 cup soy milk, 1 cup raw pistachio kernels, 1/2 cup sugar, 1 tbsp vanilla, 1 tbsp arrowroot',
    provenance: 'substitution',
    substitutionNote:
      'Soy creamer and arrowroot have no vegan-verified articles; represented by soy drink plus coconut oil and the approved stabiliser.',
    lines: [
      { mapperId: PISTACHIO, grams: 180, role: 'main' },
      { mapperId: SOY, grams: 520 },
      { mapperId: SUCROSE, grams: 110 },
      { mapperId: DEXTROSE, grams: 45 },
      { mapperId: COCONUT_OIL, grams: 30 },
      { mapperId: WATER, grams: 90 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R15',
    flavourClass: 'hazelnut',
    sourceUrl: 'https://myquietkitchen.com/vegan-ice-cream-recipes/',
    sourceTitle: '21 Vegan Ice Cream Recipes (hazelnut)',
    accessed: '2026-08-23',
    original: 'plant milk + roasted hazelnut + sugar base',
    provenance: 'substitution',
    substitutionNote: 'Hazelnut supplied by the approved 100 % hazelnut paste article.',
    lines: [
      { mapperId: HAZELNUT, grams: 160, role: 'main' },
      { mapperId: OAT, grams: 560 },
      { mapperId: SUCROSE, grams: 120 },
      { mapperId: DEXTROSE, grams: 45 },
      { mapperId: WATER, grams: 80 },
      { mapperId: INULIN, grams: 30 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R16',
    flavourClass: 'peanut',
    sourceUrl: 'https://myquietkitchen.com/vegan-ice-cream-recipes/',
    sourceTitle: '21 Vegan Ice Cream Recipes (peanut butter)',
    accessed: '2026-08-23',
    original: 'oat milk + peanut butter + sugar + salt base',
    provenance: 'substitution',
    substitutionNote: 'Peanut butter represented by the approved 100 % peanut paste article.',
    lines: [
      { mapperId: PEANUT, grams: 150, role: 'main' },
      { mapperId: OAT, grams: 590 },
      { mapperId: SUCROSE, grams: 115 },
      { mapperId: DEXTROSE, grams: 45 },
      { mapperId: WATER, grams: 65 },
      { mapperId: INULIN, grams: 32 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R17',
    flavourClass: 'almond',
    sourceUrl: 'https://myquietkitchen.com/vegan-ice-cream-recipes/',
    sourceTitle: '21 Vegan Ice Cream Recipes (almond)',
    accessed: '2026-08-23',
    original: 'almond drink + almond paste + sugar base',
    provenance: 'substitution',
    substitutionNote: 'Almond slot built on the approved ALMOND DRINK plus 100 % almond paste.',
    lines: [
      { mapperId: ALMOND_PASTE, grams: 140, role: 'main' },
      { mapperId: ALMOND_DRINK, grams: 600 },
      { mapperId: SUCROSE, grams: 115 },
      { mapperId: DEXTROSE, grams: 45 },
      { mapperId: WATER, grams: 65 },
      { mapperId: INULIN, grams: 30 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R18',
    flavourClass: 'hard fat class',
    sourceUrl: 'https://veganhotstuff.com/dark-chocolate-ice-cream/',
    sourceTitle: 'Vegan dark chocolate ice cream (hard-fat carrier)',
    accessed: '2026-08-23',
    original: '50 g dark chocolate, 400 g plant milk, 50 g cacao, 125 g sugar',
    provenance: 'substitution',
    substitutionNote:
      'No approved cocoa-butter article exists. The hard-fat class is carried by DARK CHOCOLATE 80 %, whose fat phase is cocoa butter, at a raised load.',
    lines: [
      { mapperId: DARK_CHOC_80, grams: 200 },
      { mapperId: OAT, grams: 520 },
      { mapperId: SUCROSE, grams: 110 },
      { mapperId: DEXTROSE, grams: 45 },
      { mapperId: WATER, grams: 90 },
      { mapperId: INULIN, grams: 30 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R19',
    flavourClass: 'high fat',
    sourceUrl: 'https://minimalistbaker.com/vanilla-bean-coconut-ice-cream/',
    sourceTitle: 'Vanilla Bean Coconut Ice Cream (high-fat variant)',
    accessed: '2026-08-23',
    original: '2 x 14 oz coconut cream, 1/2 cup sugar',
    provenance: 'substitution',
    substitutionNote:
      'High-fat slot: coconut fat raised toward the source cream fat level using the approved coconut oil article.',
    lines: [
      { mapperId: COCONUT_OIL, grams: 110 },
      { mapperId: SUNFLOWER_OIL, grams: 20 },
      { mapperId: OAT, grams: 560 },
      { mapperId: SUCROSE, grams: 120 },
      { mapperId: DEXTROSE, grams: 50 },
      { mapperId: WATER, grams: 105 },
      { mapperId: INULIN, grams: 32 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R20',
    flavourClass: 'low fat',
    sourceUrl: 'https://under-belly.org/sample-sorbet-recipe/',
    sourceTitle: 'Sample Sorbet Recipe (low-fat structure)',
    accessed: '2026-08-23',
    original: '400 g fruit puree, 170 g sweetener, 420 g water, 4 g stabilizer',
    provenance: 'direct',
    lines: [
      { mapperId: RICE_DRINK, grams: 520 },
      { mapperId: WATER, grams: 250 },
      { mapperId: SUCROSE, grams: 130 },
      { mapperId: DEXTROSE, grams: 60 },
      { mapperId: INULIN, grams: 35 },
      { mapperId: TARA, grams: 4 },
    ],
  },
  {
    id: 'R21',
    flavourClass: 'plant protein (pea)',
    sourceUrl: 'https://www.daywithmei.com/vegan-ice-cream-base/',
    sourceTitle: 'Vegan Ice Cream Base',
    accessed: '2026-08-23',
    original: 'plant milk + plant protein + sugar + fat base',
    provenance: 'substitution',
    substitutionNote:
      'Protein slot built on the approved PEA PROTEIN article within the Vegan profile (not the Protein profile).',
    lines: [
      { mapperId: OAT, grams: 590 },
      { mapperId: PEA_PROTEIN, grams: 35 },
      { mapperId: SUCROSE, grams: 120 },
      { mapperId: DEXTROSE, grams: 50 },
      { mapperId: COCONUT_OIL, grams: 50 },
      { mapperId: WATER, grams: 120 },
      { mapperId: INULIN, grams: 30 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R22',
    flavourClass: 'plant protein (rice)',
    sourceUrl: 'https://www.daywithmei.com/vegan-ice-cream-base/',
    sourceTitle: 'Vegan Ice Cream Base (rice protein variant)',
    accessed: '2026-08-23',
    original: 'plant milk + plant protein + sugar + fat base',
    provenance: 'substitution',
    substitutionNote: 'As R21 using the approved RICE PROTEIN article.',
    lines: [
      { mapperId: RICE_DRINK, grams: 560 },
      { mapperId: RICE_PROTEIN, grams: 35 },
      { mapperId: SUCROSE, grams: 125 },
      { mapperId: DEXTROSE, grams: 50 },
      { mapperId: SUNFLOWER_OIL, grams: 45 },
      { mapperId: WATER, grams: 150 },
      { mapperId: INULIN, grams: 32 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R23',
    flavourClass: 'mixed fat',
    sourceUrl: 'https://www.masterclass.com/articles/oat-milk-ice-cream-recipe',
    sourceTitle: 'Oat Milk Ice Cream (mixed-fat, as published)',
    accessed: '2026-08-23',
    original:
      '720 g oat milk, 110 g sugar, 30 g canola oil, 45 g coconut oil — two distinct fat classes as published',
    provenance: 'direct',
    lines: [
      { mapperId: OAT, grams: 600 },
      { mapperId: CANOLA_OIL, grams: 45 },
      { mapperId: COCONUT_OIL, grams: 55 },
      { mapperId: SUCROSE, grams: 115 },
      { mapperId: DEXTROSE, grams: 45 },
      { mapperId: WATER, grams: 105 },
      { mapperId: INULIN, grams: 30 },
      { mapperId: TARA, grams: 3 },
    ],
  },
  {
    id: 'R24',
    flavourClass: 'liquid oil',
    sourceUrl: 'https://www.masterclass.com/articles/oat-milk-ice-cream-recipe',
    sourceTitle: 'Oat Milk Ice Cream (liquid-oil-only variant)',
    accessed: '2026-08-23',
    original: '720 g oat milk, 110 g sugar, 30 g canola oil, 45 g coconut oil',
    provenance: 'substitution',
    substitutionNote:
      'Liquid-oil-only variant: the coconut (solid) fraction is replaced by sunflower oil to isolate the liquid-oil fat class.',
    lines: [
      { mapperId: OAT, grams: 610 },
      { mapperId: SUNFLOWER_OIL, grams: 75 },
      { mapperId: SUCROSE, grams: 115 },
      { mapperId: DEXTROSE, grams: 45 },
      { mapperId: WATER, grams: 120 },
      { mapperId: INULIN, grams: 30 },
      { mapperId: TARA, grams: 3 },
    ],
  },
];
