import type { CustomerProductType } from '@/features/customer-flow/types';
import type { InspirationStartIntent } from './inspirationHandoff';

export type CuratedCollection = 'lost_legendary' | 'natural_icon';
export type CandidateStatus =
  | 'authentic_reproducible'
  | 'adaptable'
  | 'not_suitable'
  | 'research_required';
export type CandidatePublicationStage =
  | 'researched'
  | 'mapper_ready'
  | 'formulated'
  | 'engine_verified'
  | 'kitchen_tested'
  | 'sensory_approved'
  | 'published';
export type CuratedCandidateVisibility = 'customer' | 'owner_review';
export type CandidateProductType = CustomerProductType | 'special_process';
export type CandidateContinent = 'Europe' | 'Asia' | 'Americas' | 'Africa' | 'Oceania';

export interface CandidateSubstitution {
  original: string;
  substitute: string;
  impact: string;
  authenticity_loss: string;
}

export interface CandidateSource {
  label: string;
  url: string;
  kind: 'primary' | 'official' | 'academic' | 'institutional';
}

export interface CuratedRecipeCandidate {
  id: string;
  name: string;
  country: string;
  region: string;
  continent: CandidateContinent;
  collection: CuratedCollection;
  status: CandidateStatus;
  publicationStage: CandidatePublicationStage;
  history_short: string;
  identity_description: string;
  defining_ingredients: readonly string[];
  defining_process: readonly string[];
  canonical_product_type: CandidateProductType;
  original_ingredients: readonly string[];
  substitutions: readonly CandidateSubstitution[];
  required_mapper_ids: readonly string[];
  unavailable_mapper_items: readonly string[];
  difficulty: 'easy' | 'medium' | 'advanced';
  cost_level: 'low' | 'medium' | 'high' | 'luxury';
  equipment_requirements: readonly string[];
  can_open_in_workbench: boolean;
  source_provenance: readonly CandidateSource[];
  internal_notes: string;
}

const source = (
  label: string,
  url: string,
  kind: CandidateSource['kind'] = 'institutional',
): CandidateSource => ({ label, url, kind });

type CandidateSeed = Omit<
  CuratedRecipeCandidate,
  | 'publicationStage'
  | 'substitutions'
  | 'required_mapper_ids'
  | 'unavailable_mapper_items'
  | 'difficulty'
  | 'cost_level'
  | 'equipment_requirements'
  | 'can_open_in_workbench'
  | 'internal_notes'
> &
  Partial<
    Pick<
      CuratedRecipeCandidate,
      | 'publicationStage'
      | 'substitutions'
      | 'required_mapper_ids'
      | 'unavailable_mapper_items'
      | 'difficulty'
      | 'cost_level'
      | 'equipment_requirements'
      | 'can_open_in_workbench'
      | 'internal_notes'
    >
  >;

const candidate = (seed: CandidateSeed): CuratedRecipeCandidate => ({
  publicationStage: 'researched',
  substitutions: [],
  required_mapper_ids: [],
  unavailable_mapper_items: [],
  difficulty: 'medium',
  cost_level: 'medium',
  equipment_requirements: ['standard batch freezer'],
  can_open_in_workbench: false,
  internal_notes: '',
  ...seed,
});

const MATA = source(
  'Juan de la Mata, Arte de repostería (1747)',
  'https://archive.org/details/artedereposteria00mata',
  'primary',
);
const EMY = source(
  'M. Emy, L’Art de bien faire les glaces d’office (1768)',
  'https://gallica.bnf.fr/ark:/12148/bpt6k841611f',
  'primary',
);
const IRANICA = source(
  'Encyclopaedia Iranica — Yakčāl',
  'https://iranicaonline.org/articles/yakcal',
  'academic',
);
const MAFF_AMAZURA = source(
  'Ministry of Agriculture, Forestry and Fisheries — Amazura',
  'https://www.maff.go.jp/e/policies/market/k_ryouri/search_menu/3672/index.html',
  'official',
);
const PERU_DOSSIER = source(
  'Ministerio de Cultura del Perú — dossier de prensa',
  'https://cdn.www.gob.pe/uploads/document/file/6729989/5839385-dossier-de-prensa-pmg-tacna-2024.pdf?v=1722618660',
  'official',
);

export const LOST_LEGENDARY_CANDIDATES: readonly CuratedRecipeCandidate[] = [
  candidate({
    id: 'aguas-heladas-de-la-mata',
    name: 'Aguas heladas de la Mata',
    country: 'Hiszpania',
    region: 'Hiszpania historyczna',
    continent: 'Europe',
    collection: 'lost_legendary',
    status: 'authentic_reproducible',
    history_short: 'Udokumentowana XVIII-wieczna rodzina wodnych lodów i sorbetów.',
    identity_description:
      'Czysty owocowy lub aromatyczny lód oparty na wodzie, cukrze i wyraźnym składniku głównym.',
    defining_ingredients: ['water', 'sugar', 'fruit or botanical infusion'],
    defining_process: ['prepare syrup', 'infuse or press', 'freeze while agitating'],
    canonical_product_type: 'sorbet',
    original_ingredients: ['water', 'sugar', 'fruit or botanical infusion'],
    source_provenance: [MATA],
  }),
  candidate({
    id: 'glace-au-pain-de-seigle-emy',
    name: 'Glace au pain de seigle',
    country: 'Francja',
    region: 'Francja XVIII wieku',
    continent: 'Europe',
    collection: 'lost_legendary',
    status: 'authentic_reproducible',
    history_short: 'Smak lodowy z chleba żytniego opisany w XVIII-wiecznym traktacie Emy’ego.',
    identity_description:
      'Mleczna baza nasycona prażonym, lekko kwaskowym charakterem chleba żytniego.',
    defining_ingredients: ['milk', 'rye bread', 'sugar'],
    defining_process: ['toast bread', 'infuse dairy', 'strain', 'freeze while agitating'],
    canonical_product_type: 'gelato',
    original_ingredients: ['milk', 'rye bread', 'sugar'],
    unavailable_mapper_items: ['rye bread infusion'],
    source_provenance: [EMY],
  }),
  candidate({
    id: 'mughal-persianate-sealed-mould-frozen-dairy',
    name: 'Kulfi w zamkniętej formie',
    country: 'Indie / Pakistan',
    region: 'Azja Południowa',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'authentic_reproducible',
    history_short: 'Gęsty zamrażany deser mleczny utrwalony w tradycjach indo-perskich.',
    identity_description: 'Redukowane mleko zamrażane bez napowietrzania w szczelnej formie.',
    defining_ingredients: ['reduced milk', 'sugar', 'cardamom', 'pistachio'],
    defining_process: ['reduce milk', 'fill sealed moulds', 'freeze in ice and salt'],
    canonical_product_type: 'special_process',
    original_ingredients: ['milk', 'sugar', 'cardamom', 'pistachio'],
    equipment_requirements: ['reduction kettle', 'sealed kulfi moulds', 'ice-salt bath'],
    difficulty: 'advanced',
    source_provenance: [
      source(
        'Ā’īn-i Akbarī — digitised edition',
        'https://archive.org/details/ainiakbari00blocgoog',
        'primary',
      ),
    ],
    internal_notes: 'Technika definiuje produkt; nie klasyfikować jako zwykłe Gelato.',
  }),
  candidate({
    id: 'faloodeh-shirazi',
    name: 'Faloodeh Shirazi',
    country: 'Iran',
    region: 'Shiraz',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'authentic_reproducible',
    history_short: 'Żyjąca irańska tradycja lodowego deseru z cienkimi nitkami skrobiowymi.',
    identity_description:
      'Bardzo zimny syrop różano-cytrusowy z charakterystyczną strukturą makaroników skrobiowych.',
    defining_ingredients: ['starch noodles', 'rosewater', 'sugar syrup', 'lime'],
    defining_process: [
      'make thin starch noodles',
      'freeze syrup',
      'fold noodles into semi-frozen syrup',
    ],
    canonical_product_type: 'sorbet',
    original_ingredients: ['starch noodles', 'rosewater', 'sugar', 'lime'],
    unavailable_mapper_items: ['faloodeh starch noodles', 'food-grade rosewater'],
    equipment_requirements: ['noodle press', 'freezer'],
    difficulty: 'advanced',
    source_provenance: [
      source(
        'Farhang Foundation — Faloodeh Shirazi',
        'https://farhang.org/farhang-flavor/faloodeh-shirazi',
        'institutional',
      ),
      IRANICA,
    ],
  }),
  candidate({
    id: 'levantine-anatolian-dovme-booza',
    name: 'Dövme dondurma — adaptacja',
    country: 'Turcja / Lewant',
    region: 'Anatolia i Lewant',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'adaptable',
    history_short: 'Elastyczna, ubijana tradycja lodów oparta na salepie i intensywnym wyrabianiu.',
    identity_description:
      'Gęsta, rozciągliwa masa o niskim napowietrzeniu i oporze podczas jedzenia.',
    defining_ingredients: ['milk', 'sugar', 'salep', 'mastic where regional'],
    defining_process: ['heat hydration', 'freeze', 'repeated pounding and stretching'],
    canonical_product_type: 'special_process',
    original_ingredients: ['milk', 'sugar', 'wild-orchid salep'],
    substitutions: [
      {
        original: 'wild-orchid salep',
        substitute: 'konjac-based texture system',
        impact: 'Can approximate elasticity, but not the aroma or full cultural identity.',
        authenticity_loss: 'High — it must be labelled as an adaptation, never Maraş dondurması.',
      },
    ],
    unavailable_mapper_items: ['certified lawful salep'],
    equipment_requirements: ['heated batch', 'pounding or stretching equipment'],
    difficulty: 'advanced',
    source_provenance: [
      source(
        'Academic review of traditional dondurma',
        'https://doi.org/10.1590/fst.26017',
        'academic',
      ),
    ],
    internal_notes:
      'Protected/regional naming and CITES-sensitive salep sourcing require legal review.',
  }),
  candidate({
    id: 'heian-amazura-shaved-ice-and-the-lost-syrup',
    name: 'Amazura shaved ice',
    country: 'Japonia',
    region: 'Japonia okresu Heian',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'research_required',
    history_short:
      'Historyczna wzmianka o lodzie z amazurą jest mocna, lecz sam dawny syrop nie ma dziś jednej pewnej rekonstrukcji.',
    identity_description: 'Kruszony lód z dawnym słodkim syropem amazura.',
    defining_ingredients: ['shaved ice', 'amazura syrup'],
    defining_process: ['shave stored ice', 'dress with syrup'],
    canonical_product_type: 'special_process',
    original_ingredients: ['ice', 'amazura'],
    unavailable_mapper_items: ['historically verified amazura'],
    equipment_requirements: ['ice shaver'],
    source_provenance: [MAFF_AMAZURA],
  }),
  candidate({
    id: 'nusantara-coconut-pot-frozen-ices',
    name: 'Nusantara coconut pot ice — adaptacja',
    country: 'Indonezja / Filipiny / Tajlandia',
    region: 'Azja Południowo-Wschodnia',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'adaptable',
    history_short: 'Regionalna rodzina kokosowych lodów rozwijana w kilku odmiennych tradycjach.',
    identity_description:
      'Naturalny kokos i delikatna, ręcznie mrożona struktura; wariant regionalny trzeba nazwać precyzyjnie.',
    defining_ingredients: ['coconut milk', 'sugar', 'regional inclusions'],
    defining_process: ['mix', 'freeze in a rotating or ice-salt pot'],
    canonical_product_type: 'vegan',
    original_ingredients: ['coconut milk', 'sugar'],
    substitutions: [
      {
        original: 'region-specific rotating pot and local inclusions',
        substitute: 'standard batch freezer with a declared regional topping set',
        impact: 'Reproduces the coconut direction, not the full street-service ritual.',
        authenticity_loss: 'Moderate; publish only as a named adaptation.',
      },
    ],
    required_mapper_ids: ['PI-ING-000149'],
    publicationStage: 'mapper_ready',
    can_open_in_workbench: true,
    source_provenance: [
      source(
        'WIPO — Thai GI resources',
        'https://www.wipo.int/ipadvantage/en/details.jsp?id=11948',
        'official',
      ),
    ],
    internal_notes: 'Nie spłaszczać wielu tradycji do jednego „autentycznego” kraju.',
  }),
  candidate({
    id: 'bastani-sonnati-zaferani',
    name: 'Bastani sonnati — adaptacja',
    country: 'Iran',
    region: 'Iran',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'adaptable',
    history_short: 'Żyjąca irańska tradycja szafranowych lodów z różą i pistacją.',
    identity_description:
      'Bogate mleczne lody z szafranem, wodą różaną, pistacją i charakterystycznymi płatkami śmietanki.',
    defining_ingredients: ['milk', 'saffron', 'rosewater', 'pistachio', 'cream flakes'],
    defining_process: ['infuse', 'freeze', 'fold frozen cream flakes'],
    canonical_product_type: 'gelato',
    original_ingredients: ['milk', 'saffron', 'rosewater', 'pistachio', 'cream'],
    substitutions: [
      {
        original: 'traditional frozen cream flakes',
        substitute: 'thin separately frozen cream sheets',
        impact: 'Approximates the inclusion but requires kitchen validation.',
        authenticity_loss: 'Moderate.',
      },
    ],
    required_mapper_ids: ['PI-ING-000236', 'PI-ING-000444'],
    unavailable_mapper_items: ['food-grade rosewater', 'saffron infusion'],
    difficulty: 'advanced',
    cost_level: 'luxury',
    source_provenance: [IRANICA],
  }),
  candidate({
    id: 'sorbetto-di-cioccolata-napoletano',
    name: 'Sorbetto di cioccolata napoletano',
    country: 'Włochy',
    region: 'Neapol',
    continent: 'Europe',
    collection: 'lost_legendary',
    status: 'authentic_reproducible',
    history_short: 'Wczesne neapolitańskie źródła dokumentują wodny sorbet czekoladowy.',
    identity_description: 'Intensywna czekolada w czystej, pozbawionej nabiału bazie wodnej.',
    defining_ingredients: ['dark chocolate or cocoa', 'water', 'sugar'],
    defining_process: ['cook base', 'cool', 'freeze while agitating'],
    canonical_product_type: 'sorbet',
    original_ingredients: ['chocolate', 'water', 'sugar'],
    required_mapper_ids: ['PI-ING-000020'],
    publicationStage: 'mapper_ready',
    can_open_in_workbench: true,
    source_provenance: [
      source(
        'Wellcome Collection — Antonio Latini',
        'https://wellcomecollection.org/works/eazxtq97',
        'primary',
      ),
    ],
  }),
  candidate({
    id: 'scursunera-gelsomino-siciliana',
    name: 'Scursunera al gelsomino',
    country: 'Włochy',
    region: 'Sycylia',
    continent: 'Europe',
    collection: 'lost_legendary',
    status: 'research_required',
    history_short:
      'Sycylijski kierunek jaśminowy wymaga jeszcze mocniejszego źródła pierwotnego i bezpiecznego standardu ekstrakcji.',
    identity_description: 'Delikatny lód jaśminowy o czystym kwiatowym aromacie.',
    defining_ingredients: ['jasmine infusion', 'water', 'sugar'],
    defining_process: ['cold infuse', 'strain', 'freeze'],
    canonical_product_type: 'sorbet',
    original_ingredients: ['jasmine flowers', 'water', 'sugar'],
    unavailable_mapper_items: ['food-grade jasmine with verified dosage'],
    source_provenance: [
      source(
        'Comune di Palermo — cultural food portal',
        'https://www.comune.palermo.it/',
        'official',
      ),
    ],
  }),
  candidate({
    id: 'sharab-maghribi-andalusi-syrup-ice',
    name: 'Sharab maghribi-andaluzyjski',
    country: 'Maroko / Hiszpania historyczna',
    region: 'Maghreb i Al-Andalus',
    continent: 'Africa',
    collection: 'lost_legendary',
    status: 'research_required',
    history_short:
      'Źródła wspierają tradycję syropów, ale nie potwierdzają jeszcze wiarygodnie konkretnego historycznego produktu mrożonego.',
    identity_description: 'Hipoteza lodu aromatyzowanego skoncentrowanym syropem.',
    defining_ingredients: ['aromatic syrup', 'ice'],
    defining_process: ['research required'],
    canonical_product_type: 'special_process',
    original_ingredients: ['syrup', 'ice'],
    unavailable_mapper_items: ['verified historical formula'],
    source_provenance: [
      source(
        'Qatar Digital Library — Arabic culinary manuscripts',
        'https://www.qdl.qa/en',
        'institutional',
      ),
    ],
    internal_notes: 'Nie publikować, dopóki źródło nie potwierdzi mrożonej postaci.',
  }),
  candidate({
    id: 'tang-su-shan-frozen-cream-mountain',
    name: 'Su shan — interpretacja',
    country: 'Chiny',
    region: 'Chiny dynastii Tang',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'adaptable',
    history_short:
      'Historyczne przedstawienia wspierają istnienie schłodzonego deseru mlecznego, lecz dokładna formuła pozostaje niejednoznaczna.',
    identity_description: 'Rzeźbiona lub usypana forma schłodzonej, tłustej masy mlecznej.',
    defining_ingredients: ['dairy fat', 'sweetener'],
    defining_process: ['chill', 'shape', 'serve semi-frozen'],
    canonical_product_type: 'special_process',
    original_ingredients: ['fermented or clarified dairy fat', 'sweetener'],
    substitutions: [
      {
        original: 'uncertain historical dairy medium',
        substitute: 'cultured cream reconstruction',
        impact: 'A modern interpretation, not an exact reproduction.',
        authenticity_loss: 'High until primary-text translation is resolved.',
      },
    ],
    unavailable_mapper_items: ['historically verified dairy medium'],
    source_provenance: [source('National Museum of China', 'https://en.chnmuseum.cn/', 'official')],
  }),
  candidate({
    id: 'joseon-tarak-fermented-royal-milk',
    name: 'Tarak royal milk — hipoteza mrożona',
    country: 'Korea Południowa',
    region: 'Korea okresu Joseon',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'research_required',
    history_short:
      'Tarak-juk ma wiarygodną historię dworską; jej mrożona forma wygląda jednak na współczesną syntezę.',
    identity_description:
      'Fermentowany lub kleikowy profil mleczny rozważany jako współczesny deser mrożony.',
    defining_ingredients: ['milk', 'rice'],
    defining_process: ['historical frozen process not established'],
    canonical_product_type: 'gelato',
    original_ingredients: ['milk', 'rice'],
    unavailable_mapper_items: ['verified frozen-form process'],
    source_provenance: [
      source('National Folk Museum of Korea', 'https://www.nfm.go.kr/english/main.do', 'official'),
    ],
  }),
  candidate({
    id: 'karsambac-kar-helvasi',
    name: 'Karsambaç / kar helvası — adaptacja',
    country: 'Turcja',
    region: 'Anatolia',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'adaptable',
    history_short: 'Regionalna tradycja śniegu lub drobno kruszonego lodu z syropem.',
    identity_description: 'Natychmiast podawany, ziarnisty lód z melasą lub syropem owocowym.',
    defining_ingredients: ['clean shaved ice', 'fruit syrup or molasses'],
    defining_process: ['shave', 'dress', 'serve immediately'],
    canonical_product_type: 'special_process',
    original_ingredients: ['mountain snow', 'syrup'],
    substitutions: [
      {
        original: 'collected mountain snow',
        substitute: 'food-safe machine-shaved ice',
        impact: 'Safer and reproducible but changes the place-specific ritual.',
        authenticity_loss: 'Moderate.',
      },
    ],
    unavailable_mapper_items: ['validated regional syrup'],
    equipment_requirements: ['ice shaver'],
    source_provenance: [
      source('Türkiye Kültür Portalı', 'https://www.kulturportali.gov.tr/', 'official'),
    ],
  }),
  candidate({
    id: 'queso-helado-arequipeno',
    name: 'Queso helado arequipeño',
    country: 'Peru',
    region: 'Arequipa',
    continent: 'Americas',
    collection: 'lost_legendary',
    status: 'authentic_reproducible',
    history_short:
      'Arequipeński deser mleczny wytwarzany tradycyjnie w metalowych naczyniach; mimo nazwy nie jest serem.',
    identity_description: 'Warstwowy, mleczno-kokosowy profil z cynamonem i wanilią.',
    defining_ingredients: ['milk', 'coconut', 'cinnamon', 'vanilla'],
    defining_process: ['infuse', 'cool', 'freeze against a chilled metal bowl'],
    canonical_product_type: 'gelato',
    original_ingredients: ['milk', 'coconut', 'cinnamon', 'vanilla'],
    required_mapper_ids: ['PI-ING-000236', 'PI-ING-000149', 'PI-ING-000400'],
    publicationStage: 'mapper_ready',
    can_open_in_workbench: true,
    source_provenance: [
      PERU_DOSSIER,
      source(
        'Radio Nacional del Perú — festival report',
        'https://www.radionacional.gob.pe/noticias/nacional/xiii-festival-del-queso-helado-arequipeno-celebra-la-tradicion-y-creatividad-local',
        'official',
      ),
    ],
  }),
  candidate({
    id: 'curry-souffles-a-la-ripon',
    name: 'Curry soufflés à la Ripon',
    country: 'Wielka Brytania',
    region: 'Historyczna kuchnia bankietowa',
    continent: 'Europe',
    collection: 'lost_legendary',
    status: 'not_suitable',
    history_short:
      'Historyczna pozycja nie spełnia zasad bezpiecznego, powtarzalnego deseru Gellatti.',
    identity_description: 'Rybo-korzenny, częściowo mrożony suflet wytrawny.',
    defining_ingredients: ['fish', 'curry', 'cream'],
    defining_process: ['savory soufflé process'],
    canonical_product_type: 'special_process',
    original_ingredients: ['fish', 'curry', 'cream'],
    unavailable_mapper_items: ['safe validated formulation'],
    source_provenance: [source('Historic recipe archive', 'https://archive.org/', 'primary')],
    internal_notes:
      'REJECT: wytrawny produkt rybny, istotne ryzyko HACCP i brak realnej wartości w obecnym workbench.',
  }),
  candidate({
    id: 'ambergris-musk-perfumed-ices',
    name: 'Ambergris and musk perfumed ices',
    country: 'Wieloregionalne',
    region: 'Historyczne dwory Europy i Azji',
    continent: 'Europe',
    collection: 'lost_legendary',
    status: 'not_suitable',
    history_short:
      'Historycznie dokumentowane perfumowane kierunki nie mają dziś uczciwej i prawnie bezpiecznej rekonstrukcji.',
    identity_description: 'Lody perfumowane materiałami pochodzenia zwierzęcego.',
    defining_ingredients: ['ambergris', 'musk'],
    defining_process: ['perfume dairy or ice'],
    canonical_product_type: 'special_process',
    original_ingredients: ['ambergris', 'musk'],
    unavailable_mapper_items: ['lawful food-grade ambergris', 'lawful natural musk'],
    source_provenance: [
      source('CITES species-trade guidance', 'https://cites.org/eng', 'official'),
    ],
    internal_notes:
      'REJECT: problematyczne prawnie i etycznie surowce; substytut usuwa definiującą tożsamość.',
  }),
  candidate({
    id: 'egyptian-fermented-barley-buza',
    name: 'Egyptian fermented barley bûza',
    country: 'Egipt',
    region: 'Egipt',
    continent: 'Africa',
    collection: 'lost_legendary',
    status: 'not_suitable',
    history_short: 'To fermentowany napój zbożowy, nie udokumentowany produkt lodowy.',
    identity_description: 'Fermentowany napój o ryzyku pomylenia nazwy z lodami booza.',
    defining_ingredients: ['barley', 'water'],
    defining_process: ['ferment'],
    canonical_product_type: 'special_process',
    original_ingredients: ['barley', 'water'],
    unavailable_mapper_items: ['validated frozen identity'],
    source_provenance: [
      source('Academic fermentation literature', 'https://pubmed.ncbi.nlm.nih.gov/', 'academic'),
    ],
    internal_notes: 'REJECT: błąd kategorii, alkohol/fermentacja i ryzyko nazewnicze.',
  }),
  candidate({
    id: 'pan-asian-shaved-ice-family',
    name: 'Pan-Asian shaved ice family',
    country: 'Wieloregionalne',
    region: 'Azja',
    continent: 'Asia',
    collection: 'lost_legendary',
    status: 'not_suitable',
    history_short: 'Zbyt szeroka etykieta łączy wiele żywych i odmiennych tradycji.',
    identity_description: 'Ogólna kategoria kruszonego lodu z dodatkami.',
    defining_ingredients: ['shaved ice', 'regional toppings'],
    defining_process: ['shave and assemble'],
    canonical_product_type: 'special_process',
    original_ingredients: ['ice', 'region-specific toppings'],
    unavailable_mapper_items: ['single honest canonical identity'],
    source_provenance: [
      source('UNESCO Intangible Cultural Heritage', 'https://ich.unesco.org/', 'official'),
    ],
    internal_notes:
      'REJECT: kulturowe spłaszczenie, brak jednej formuły i brak fazy mrożonej, którą obecny workbench ma bilansować.',
  }),
];

const natural = (
  seed: Omit<
    CandidateSeed,
    | 'collection'
    | 'continent'
    | 'country'
    | 'region'
    | 'status'
    | 'history_short'
    | 'source_provenance'
  > &
    Partial<
      Pick<
        CandidateSeed,
        'continent' | 'country' | 'region' | 'history_short' | 'source_provenance'
      >
    >,
): CuratedRecipeCandidate =>
  candidate({
    collection: 'natural_icon',
    status: 'authentic_reproducible',
    continent: 'Europe',
    country: 'Kierunek naturalny',
    region: 'Bez chronionej nazwy regionalnej',
    history_short: 'Współczesny kierunek premium zbudowany wokół prawdziwego składnika.',
    source_provenance: [
      source(
        'Gellatti · standard jakości składników',
        'https://pinguinointelligence.com/',
        'institutional',
      ),
    ],
    publicationStage: 'mapper_ready',
    can_open_in_workbench: true,
    ...seed,
  });

export const NATURAL_ICON_CANDIDATES: readonly CuratedRecipeCandidate[] = [
  natural({
    id: 'pistacchio-puro',
    name: 'Pistacchio Puro',
    identity_description: 'Prawdziwa pasta pistacjowa 100%, prażone kawałki i naturalny kolor.',
    defining_ingredients: ['100% pistachio paste', 'roasted pistachio pieces'],
    defining_process: ['balance around real nut solids', 'fold roasted pieces after freezing'],
    canonical_product_type: 'gelato',
    original_ingredients: ['pistachio'],
    required_mapper_ids: ['PI-ING-000444'],
    cost_level: 'luxury',
    internal_notes: 'Nie używać Bronte DOP bez certyfikowanego surowca i zgodnego etykietowania.',
  }),
  natural({
    id: 'latte-puro',
    name: 'Latte Puro',
    identity_description:
      'Czysty, świeży smak dobrego mleka bez fałszywej geograficznej obietnicy.',
    defining_ingredients: ['whole milk'],
    defining_process: ['gentle pasteurisation', 'low flavour masking'],
    canonical_product_type: 'gelato',
    original_ingredients: ['milk'],
    required_mapper_ids: ['PI-ING-000236'],
    cost_level: 'high',
  }),
  natural({
    id: 'vaniglia-intera',
    name: 'Vaniglia Intera',
    identity_description:
      'Wanilia z realnej pasty lub ziaren, bez generycznego aromatu jako głównej osi.',
    defining_ingredients: ['vanilla bean paste'],
    defining_process: ['infuse', 'mature'],
    canonical_product_type: 'gelato',
    original_ingredients: ['vanilla'],
    required_mapper_ids: ['PI-ING-000400'],
    cost_level: 'high',
  }),
  natural({
    id: 'cioccolato-fondente',
    name: 'Cioccolato Fondente',
    identity_description: 'Ciemna czekolada o wyraźnym kakao, bez rozmycia słodyczą.',
    defining_ingredients: ['dark chocolate'],
    defining_process: ['emulsify chocolate into the base'],
    canonical_product_type: 'gelato',
    original_ingredients: ['dark chocolate'],
    required_mapper_ids: ['PI-ING-000020'],
    cost_level: 'high',
  }),
  natural({
    id: 'nocciola-fresca',
    name: 'Nocciola Fresca',
    identity_description: 'Świeżo prażony orzech laskowy z naturalną tłustością i lekką teksturą.',
    defining_ingredients: ['hazelnut paste', 'roasted hazelnut'],
    defining_process: ['fresh roast', 'grind', 'fold pieces'],
    canonical_product_type: 'gelato',
    original_ingredients: ['hazelnut'],
    unavailable_mapper_items: ['verified 100% hazelnut paste'],
    publicationStage: 'researched',
    can_open_in_workbench: false,
    cost_level: 'high',
  }),
  natural({
    id: 'caffe-puro',
    name: 'Caffè Puro',
    identity_description: 'Kawa parzona dla aromatu, nie tylko słodki aromat kawowy.',
    defining_ingredients: ['fresh espresso or cold brew concentrate'],
    defining_process: ['extract', 'cool rapidly', 'balance around coffee solids'],
    canonical_product_type: 'gelato',
    original_ingredients: ['coffee'],
    unavailable_mapper_items: ['verified coffee concentrate'],
    publicationStage: 'researched',
    can_open_in_workbench: false,
  }),
  natural({
    id: 'cocco-naturale',
    name: 'Cocco Naturale',
    identity_description: 'Naturalne mleko kokosowe z odrobiną rzeczywistej tekstury owocu.',
    defining_ingredients: ['coconut milk', 'toasted coconut'],
    defining_process: ['hydrate', 'freeze', 'fold coconut'],
    canonical_product_type: 'vegan',
    original_ingredients: ['coconut'],
    required_mapper_ids: ['PI-ING-000149'],
    cost_level: 'high',
  }),
  natural({
    id: 'mandorla-e-miele',
    name: 'Mandorla e Miele',
    identity_description:
      'Migdał i prawdziwy miód, nazwane neutralnie bez podszywania się pod chronioną tradycję.',
    defining_ingredients: ['almond paste', 'honey'],
    defining_process: ['balance variable honey sugars'],
    canonical_product_type: 'gelato',
    original_ingredients: ['almond', 'honey'],
    unavailable_mapper_items: ['verified almond paste', 'declared honey composition'],
    publicationStage: 'researched',
    can_open_in_workbench: false,
    cost_level: 'high',
  }),
  natural({
    id: 'fragola-intera',
    name: 'Fragola Intera',
    identity_description: 'Duży udział prawdziwej truskawki i czysty owocowy finisz.',
    defining_ingredients: ['strawberry'],
    defining_process: ['prepare fruit', 'preserve fresh aroma'],
    canonical_product_type: 'sorbet',
    original_ingredients: ['strawberry'],
    required_mapper_ids: ['PI-ING-001553'],
    cost_level: 'high',
  }),
  natural({
    id: 'matcha-puro',
    name: 'Matcha Puro',
    identity_description:
      'Herbaciana gorycz i świeży aromat prawdziwej matchy, nie cukrowy aromat zielonej herbaty.',
    defining_ingredients: ['culinary matcha'],
    defining_process: ['disperse without scorching', 'protect from oxidation'],
    canonical_product_type: 'gelato',
    original_ingredients: ['matcha'],
    unavailable_mapper_items: ['verified culinary matcha'],
    publicationStage: 'researched',
    can_open_in_workbench: false,
    cost_level: 'high',
  }),
];

export const CURATED_RECIPE_CANDIDATES: readonly CuratedRecipeCandidate[] = [
  ...LOST_LEGENDARY_CANDIDATES,
  ...NATURAL_ICON_CANDIDATES,
];

export function isPublishableCandidate(candidateValue: CuratedRecipeCandidate): boolean {
  return (
    candidateValue.publicationStage === 'published' &&
    (candidateValue.status === 'authentic_reproducible' || candidateValue.status === 'adaptable') &&
    candidateValue.canonical_product_type !== 'special_process' &&
    candidateValue.can_open_in_workbench &&
    candidateValue.unavailable_mapper_items.length === 0
  );
}

export function visibleCuratedCandidates({
  visibility = 'customer',
  collection,
}: {
  visibility?: CuratedCandidateVisibility;
  collection?: CuratedCollection;
} = {}): CuratedRecipeCandidate[] {
  return CURATED_RECIPE_CANDIDATES.filter(
    (entry) =>
      (collection === undefined || entry.collection === collection) &&
      (visibility === 'owner_review'
        ? entry.status !== 'not_suitable'
        : isPublishableCandidate(entry)),
  );
}

export interface CountryNavigationItem {
  country: string;
  continent: CandidateContinent;
  count: number;
}

export function hasPublicCountryIdentity(entry: CuratedRecipeCandidate): boolean {
  return entry.country !== 'Kierunek naturalny' && entry.country !== 'Wieloregionalne';
}

export function publicCountryNavigation(
  candidates: readonly CuratedRecipeCandidate[] = CURATED_RECIPE_CANDIDATES,
): CountryNavigationItem[] {
  const counts = new Map<string, CountryNavigationItem>();
  for (const entry of candidates.filter(
    (candidateValue) =>
      isPublishableCandidate(candidateValue) && hasPublicCountryIdentity(candidateValue),
  )) {
    const key = `${entry.continent}:${entry.country}`;
    const current = counts.get(key);
    counts.set(key, {
      country: entry.country,
      continent: entry.continent,
      count: (current?.count ?? 0) + 1,
    });
  }
  return [...counts.values()].sort(
    (a, b) => a.continent.localeCompare(b.continent) || a.country.localeCompare(b.country, 'pl'),
  );
}

export function candidateStartIntent(entry: CuratedRecipeCandidate): InspirationStartIntent | null {
  if (
    !entry.can_open_in_workbench ||
    entry.canonical_product_type === 'special_process' ||
    entry.status === 'not_suitable' ||
    entry.status === 'research_required'
  )
    return null;

  const productType = entry.canonical_product_type;
  const adaptation =
    entry.status === 'adaptable'
      ? entry.substitutions
          .map((item) => `${item.original} → ${item.substitute}: ${item.authenticity_loss}`)
          .join(' ')
      : null;
  return {
    source: 'curated_collection',
    sourceId: entry.id,
    title: entry.name,
    productType,
    definingIngredients: entry.defining_ingredients,
    canonicalIngredientIds: entry.required_mapper_ids,
    adaptationWarning: adaptation,
    prompt: `${productType}: ${entry.name}. Kierunek składników: ${entry.defining_ingredients.join(', ')}.`,
  };
}
