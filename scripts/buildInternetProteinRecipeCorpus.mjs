/**
 * INTERNET PROTEIN RECIPE CORPUS — GENERATOR.
 *
 * Emits `src/features/protein-gelato/__fixtures__/internetProteinRecipes.ts`
 * from the Mapper base. Every ingredient payload is READ from its Mapper row —
 * no composition is authored here — and the Mapper is never written.
 *
 * Each entry is a real, publicly published protein ice-cream / gelato recipe
 * whose page was opened and read, then normalized to a 1000 g PINGÜINO batch
 * through real product authority. Normalization preserves the source's INTENT
 * (protein-source class, fat level, sugar level, flavour family) expressed with
 * real Mapper ingredients, because published recipes are written for consumer
 * kit — "1 scoop", protein shakes, instant pudding mix — and not for a gelato
 * base. Grams are therefore PINGÜINO grams, and the source URL records where
 * the formulation intent came from.
 *
 * Usage: node scripts/buildInternetProteinRecipeCorpus.mjs [--check]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAPPER = 'docs/ingredients/validation/mapper_basement.csv';
const OUT = 'src/features/protein-gelato/__fixtures__/internetProteinRecipes.ts';

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const NUM = new Set(['data_confidence_percent','water_percent','total_solids_percent','fat_percent','saturated_fat_percent','protein_percent','carbohydrate_percent','total_sugars_percent','sucrose_percent','dextrose_percent','glucose_percent','fructose_percent','lactose_percent','polyol_percent','fiber_percent','salt_percent','alcohol_percent','kcal_per_100g','cost_per_kg','pod_value','pac_value','de_value']);

const raw = readFileSync(resolve(process.cwd(), MAPPER));
const grid = parseCsv(raw.toString('utf8'));
const header = grid[0];
const byId = new Map();
for (const cells of grid.slice(1)) {
  if (cells.length < 5) continue;
  const rec = {};
  header.forEach((col, i) => { const v = cells[i] ?? ''; rec[col] = NUM.has(col) ? (v === '' ? null : Number(v)) : v; });
  if (rec.ingredient_id) byId.set(rec.ingredient_id, rec);
}

/* ── ingredient shorthands ─────────────────────────────────────────────── */
const I = {
  wpc80: 'PI-ING-000295', mpc75: 'PI-ING-000237', gelWpc: 'PI-ING-000264',
  smp: 'PI-ING-000270', milk: 'PI-ING-000236', cream: 'PI-ING-000180',
  sucrose: 'PI-ING-000514', dextrose: 'PI-ING-000494', tara: 'PI-ING-000492',
  salt: 'PI-ING-000458', inulin: 'PI-ING-000456',
  cocoa: 'PI-ING-001578', darkChoc: 'PI-ING-000102', pistachio: 'PI-ING-000614',
  raspberry: 'PI-ING-000394', banana: 'PI-ING-000345', skyr: 'PI-ING-001395',
  greekYogurt: 'PI-ING-000204', espresso: 'PI-ING-001657', caramel: 'PI-ING-000009',
  saltedCaramel: 'PI-ING-000078', peanut: 'PI-ING-000412', hazelnut: 'PI-ING-000407',
  coconut: 'PI-ING-000146', strawberry: 'PI-ING-000273', vanilla: 'PI-ING-000173',
  cottage: 'PI-ING-001394', peaProtein: 'PI-ING-000451',
};

/**
 * WEB-ESTIMATED `MOJA CENA` (owner rule, 2026-08-23).
 *
 * A missing price is a data gap, not a formulation defect, and must never stop
 * ECO from being tested. Each of these Mapper rows carries no price, so a
 * current realistic market price was sourced from the open web, normalized to
 * €/kg, and is applied here as a USER-LEVEL `MOJA CENA` exactly as if it had
 * been typed into the app. It is NOT verified product data, it is NEVER written
 * into the Mapper, it never changes a canonical price, and it must never
 * overwrite a real `MOJA CENA` that already exists.
 *
 * PLN→EUR at 4.30 (August 2026). Normal market prices, not promotions.
 */
const MOJA_CENA = [
  { mapperId: I.pistachio, pricePerKg: 46.28, note: '199 zł/kg, 100% pistachio paste 1 kg (retail, normal price)', sourceUrl: 'https://sklepczekolada.pl/produkt/pasta-pistacjowa-100-1kg-pi-nuts/' },
  { mapperId: I.cocoa, pricePerKg: 22.79, note: '97.99 zł/kg, alkalized cocoa powder 1 kg (retail, normal price)', sourceUrl: 'https://trzyziarna.pl/kakao-alkalizowane-proszek-1kg/' },
  { mapperId: I.espresso, pricePerKg: 13.95, note: '~60 zł/kg, 100% arabica beans, wholesale case pricing', sourceUrl: 'https://www.kaweo.pl/pl/c/Kawy-100-Arabica/122/2' },
  { mapperId: I.skyr, pricePerKg: 4.75, note: '20.42 zł/kg, Piątnica Skyr natural 450 g', sourceUrl: 'https://www.frisco.pl/pid,145237/n,piatnica-skyr-jogurt-typu-islandzkiego-naturalny/stn,product' },
  { mapperId: I.cottage, pricePerKg: 9.29, note: '39.96 zł/kg, organic curd cheese (comparable BIO product)', sourceUrl: 'https://www.sklepekologiczny.com.pl/twarog-wiejski-klinek-tlusty-bio-okolo-0-25kg-bio-planet.html' },
];

/* ── the corpus ────────────────────────────────────────────────────────── */
const R = (id, family, title, sourceTitle, sourceUrl, lines) => ({ id, family, title, sourceTitle, sourceUrl, lines });

const RECIPES = [
  R('vanilla-creami', 'vanilla', 'Vanilla protein gelato', 'Ninja Creami Protein Ice Cream (Creamy Vanilla) — Cooked & Loved', 'https://www.cookedandloved.com/recipes/ninja-creami-protein-ice-cream/',
    [[I.milk, 540], [I.cream, 95], [I.wpc80, 105], [I.smp, 45], [I.sucrose, 105], [I.dextrose, 35], [I.vanilla, 70], [I.tara, 5]]),
  R('chocolate-fitfoodie', 'chocolate', 'Chocolate protein gelato', '6-Ingredient Chocolate Protein Ice Cream — Fit Foodie Finds', 'https://fitfoodiefinds.com/chocolate-protein-ice-cream/',
    [[I.milk, 545], [I.cream, 95], [I.wpc80, 110], [I.smp, 40], [I.sucrose, 110], [I.dextrose, 35], [I.cocoa, 60], [I.tara, 5]]),
  R('dark-cocoa-wholesomeyum', 'dark_cocoa', 'Dark cocoa protein gelato', 'Protein Ice Cream Recipe (custard base) — Wholesome Yum', 'https://www.wholesomeyum.com/protein-ice-cream-recipe/',
    [[I.milk, 440], [I.cream, 100], [I.mpc75, 115], [I.smp, 40], [I.sucrose, 115], [I.dextrose, 30], [I.cocoa, 75], [I.darkChoc, 80], [I.tara, 5]]),
  R('strawberry-ricotta-george', 'strawberry', 'Strawberry protein gelato', 'Ninja Creami protein ice cream (5 ways) — George Eats', 'https://georgeats.com/recipes/ninja-creami-protein-ice-cream-5-ways/',
    [[I.milk, 440], [I.cream, 90], [I.wpc80, 105], [I.smp, 40], [I.sucrose, 95], [I.dextrose, 30], [I.strawberry, 195], [I.tara, 5]]),
  R('raspberry-eatcreami', 'raspberry', 'Raspberry protein gelato', 'Protein Ice Cream Recipes for Ninja Creami — eatcreami', 'https://eatcreami.com/recipes/collection/protein-ice-cream',
    [[I.milk, 400], [I.cream, 90], [I.wpc80, 110], [I.smp, 45], [I.sucrose, 110], [I.dextrose, 35], [I.raspberry, 205], [I.tara, 5]]),
  R('banana-proteinchef', 'banana', 'Banana protein gelato', 'Protein Banana Ice Cream Recipe — The Protein Chef', 'https://theproteinchef.co/protein-banana-ice-cream-recipe/',
    [[I.milk, 390], [I.cream, 85], [I.wpc80, 105], [I.smp, 40], [I.sucrose, 70], [I.dextrose, 25], [I.banana, 280], [I.tara, 5]]),
  R('coffee-thatspicychick', 'coffee', 'Coffee protein gelato', 'Ninja Creami Coffee Protein Ice Cream (31g protein) — That Spicy Chick', 'https://thatspicychick.com/ninja-creami-coffee-protein-ice-cream/',
    [[I.milk, 560], [I.cream, 95], [I.wpc80, 110], [I.smp, 45], [I.sucrose, 110], [I.dextrose, 35], [I.espresso, 40], [I.tara, 5]]),
  R('caramel-cookingkatielady', 'caramel', 'Caramel protein gelato', 'Ninja Creami Salted Caramel Protein Ice Cream — Cooking Katie Lady', 'https://cookingkatielady.com/recipe/ninja-creami-salted-caramel-protein-ice-cream/',
    [[I.milk, 450], [I.cream, 80], [I.wpc80, 110], [I.smp, 40], [I.sucrose, 90], [I.dextrose, 30], [I.caramel, 195], [I.tara, 5]]),
  R('salted-caramel-basicswithbails', 'salted_caramel', 'Salted caramel protein gelato', 'Ninja Creami Salted Caramel Ice Cream (40g Protein) — Basics With Bails', 'https://basicswithbails.com/course/dessert/ninja-creami-salted-caramel-ice-cream/',
    [[I.milk, 445], [I.cream, 80], [I.wpc80, 110], [I.smp, 40], [I.sucrose, 85], [I.dextrose, 30], [I.saltedCaramel, 200], [I.salt, 5], [I.tara, 5]]),
  R('pistachio-tastytravelers', 'pistachio', 'Pistachio protein gelato', 'Ninja Creami Pistachio Protein Ice Cream — The Tasty Travelers', 'https://thetastytravelers.com/ninja-creami-pistachio-protein-ice-cream/',
    [[I.milk, 450], [I.cream, 60], [I.wpc80, 110], [I.smp, 45], [I.sucrose, 105], [I.dextrose, 35], [I.pistachio, 190], [I.tara, 5]]),
  R('peanut-georgeats', 'peanut', 'Peanut protein gelato', 'High protein Ninja Creami (53g protein) — George Eats', 'https://georgeats.com/recipes/high-protein-ninja-creami-53g-protein/',
    [[I.milk, 460], [I.cream, 55], [I.wpc80, 115], [I.smp, 45], [I.sucrose, 100], [I.dextrose, 35], [I.peanut, 185], [I.tara, 5]]),
  R('hazelnut-deliciouscrescent', 'hazelnut', 'Hazelnut protein gelato', 'Hazelnut Gelato (Nocciola Gelato) — The Delicious Crescent', 'https://www.thedeliciouscrescent.com/hazelnut-gelato-nocciola-gelato/',
    [[I.milk, 470], [I.cream, 50], [I.wpc80, 115], [I.smp, 45], [I.sucrose, 105], [I.dextrose, 35], [I.hazelnut, 175], [I.tara, 5]]),
  R('coconut-sweetsimplethings', 'coconut', 'Coconut protein gelato', 'Healthy Ninja Creami Coconut Ice Cream (High Protein) — The Sweet Simple Things', 'https://thesweetsimplethings.com/healthy-ninja-creami-coconut-ice-cream-high-protein/',
    [[I.milk, 470], [I.cream, 45], [I.wpc80, 115], [I.smp, 45], [I.sucrose, 105], [I.dextrose, 35], [I.coconut, 180], [I.tara, 5]]),
  R('yogurt-mattsfitchef', 'yogurt', 'Yogurt protein gelato', 'Low Calorie Protein Ice Cream (20 g Protein) — Matt\\u2019s Fit Chef', 'https://mattsfitchef.com/protein-ice-cream/',
    [[I.greekYogurt, 300], [I.milk, 300], [I.cream, 55], [I.wpc80, 100], [I.smp, 45], [I.sucrose, 120], [I.dextrose, 45], [I.inulin, 30], [I.tara, 5]]),
  R('skyr-icelandicprovisions', 'skyr', 'Skyr protein gelato', 'High Protein Non-Dairy Ice Cream Recipe with Skyr — Icelandic Provisions', 'https://www.tiktok.com/@icelandicprovisions/video/7442055216071003423',
    [[I.skyr, 340], [I.milk, 290], [I.cream, 60], [I.wpc80, 95], [I.smp, 40], [I.sucrose, 120], [I.dextrose, 45], [I.inulin, 5], [I.tara, 5]]),
  R('whey-heavy-gelatobalancing', 'whey_heavy', 'Whey-heavy protein gelato', 'High-Protein Gelato Recipe — 15g Per Serving, No Chalk', 'https://freegelatobalancing.app/blog/high-protein-gelato',
    [[I.milk, 470], [I.wpc80, 100], [I.smp, 50], [I.cream, 70], [I.sucrose, 110], [I.dextrose, 30], [I.inulin, 30], [I.tara, 5], [I.vanilla, 135]]),
  R('casein-heavy-gelatobalancing', 'casein_heavy', 'Milk-protein-heavy gelato', 'High-Protein Gelato Recipe — micellar casein guidance', 'https://freegelatobalancing.app/blog/high-protein-gelato',
    [[I.milk, 465], [I.mpc75, 120], [I.smp, 45], [I.cream, 75], [I.sucrose, 110], [I.dextrose, 30], [I.inulin, 30], [I.vanilla, 120], [I.tara, 5]]),
  R('mixed-protein-noaprotein', 'mixed_protein', 'Mixed-protein gelato', 'Ninja Creami Protein Ice Cream: The Complete Guide — NOA Protein', 'https://www.noaprotein.com/blogs/education/ninja-creami-protein-ice-cream',
    [[I.milk, 440], [I.wpc80, 60], [I.mpc75, 55], [I.gelWpc, 40], [I.smp, 45], [I.cream, 70], [I.sucrose, 110], [I.dextrose, 35], [I.vanilla, 140], [I.tara, 5]]),
  R('low-fat-tastesbetter', 'low_fat', 'Low-fat protein gelato', 'High Protein Ice Cream — Tastes Better From Scratch', 'https://tastesbetterfromscratch.com/protein-ice-cream/',
    [[I.milk, 520], [I.cottage, 130], [I.wpc80, 105], [I.smp, 55], [I.sucrose, 110], [I.dextrose, 40], [I.inulin, 35], [I.tara, 5]]),
  R('high-fat-eatingbirdfood', 'high_fat', 'High-fat protein gelato', 'High Protein Ice Cream Recipe — Eating Bird Food', 'https://www.eatingbirdfood.com/protein-ice-cream/',
    [[I.milk, 340], [I.cream, 195], [I.wpc80, 110], [I.smp, 40], [I.sucrose, 105], [I.dextrose, 35], [I.vanilla, 130], [I.darkChoc, 40], [I.tara, 5]]),
];

/* ── build ─────────────────────────────────────────────────────────────── */
const n = (v) => (v === null || v === undefined ? 0 : v);
const payload = (mapperId) => {
  const row = byId.get(mapperId);
  if (!row) throw new Error(`Mapper row missing: ${mapperId}`);
  const comp = {
    water_percent: n(row.water_percent), solids_percent: n(row.total_solids_percent),
    fat_percent: n(row.fat_percent), protein_percent: n(row.protein_percent),
    carbohydrate_percent: n(row.carbohydrate_percent), sugar_percent: n(row.total_sugars_percent),
    sucrose_percent: n(row.sucrose_percent), glucose_percent: n(row.glucose_percent),
    dextrose_percent: n(row.dextrose_percent), fructose_percent: n(row.fructose_percent),
    lactose_percent: n(row.lactose_percent), polyol_percent: n(row.polyol_percent),
    fiber_percent: n(row.fiber_percent), salt_percent: n(row.salt_percent),
    alcohol_percent: n(row.alcohol_percent), kcal_per_100g: n(row.kcal_per_100g),
  };
  if (row.saturated_fat_percent !== null && row.saturated_fat_percent !== undefined) {
    comp.saturated_fat_percent = row.saturated_fat_percent;
  }
  return {
    mapperId,
    displayName: (row.ingredient_name_display || '').trim() || row.ingredient_name_internal,
    category: row.ingredient_category, composition: comp,
    pod_value: row.pod_value, pac_value: row.pac_value, de_value: row.de_value,
    cost_per_kg: row.cost_per_kg, cost_currency: row.currency || null,
    confidence_score: n(row.data_confidence_percent),
    verified: String(row.verification_status || '').startsWith('Verified'),
  };
};

const seenFamily = new Set();
const built = RECIPES.map((r) => {
  const total = r.lines.reduce((s, [, g]) => s + g, 0);
  if (total !== 1000) throw new Error(`${r.id}: lines sum to ${total} g, expected exactly 1000 g`);
  if (seenFamily.has(r.family)) throw new Error(`duplicate family ${r.family}`);
  seenFamily.add(r.family);
  return { id: r.id, family: r.family, title: r.title, sourceTitle: r.sourceTitle, sourceUrl: r.sourceUrl,
    lines: r.lines.map(([mapperId, grams]) => ({ grams, ...payload(mapperId) })) };
});
if (built.length < 20) throw new Error(`corpus has ${built.length} recipes, minimum 20`);

const priced = MOJA_CENA.map((entry) => {
  const row = byId.get(entry.mapperId);
  if (!row) throw new Error(`Mapper row missing for MOJA CENA: ${entry.mapperId}`);
  if (row.cost_per_kg !== null && row.cost_per_kg !== undefined) {
    throw new Error(`${entry.mapperId} already carries a catalogue price — never override it with a web estimate`);
  }
  return { ...entry, displayName: (row.ingredient_name_display || '').trim(), currency: 'EUR' };
});

const mapperSha = createHash('sha256').update(raw).digest('hex');
const body = `/**
 * INTERNET PROTEIN RECIPE CORPUS — GENERATED, DO NOT EDIT BY HAND.
 *
 * Regenerate with \`npm run protein:corpus\`; \`--check\` guards drift.
 *
 * ${built.length} real, publicly published protein ice-cream / gelato recipes.
 * Every page was opened and read; \`sourceUrl\` records where each formulation
 * intent came from. Each is normalized to a 1000 g PINGÜINO batch through real
 * product authority, and EVERY ingredient payload below is read straight from
 * its Mapper row — no composition is authored in the generator or in this file.
 *
 * Published recipes are written for consumer kit ("1 scoop", protein shakes,
 * instant pudding mix), not for a gelato base, so normalization preserves the
 * source's INTENT — protein-source class, fat level, sugar level, flavour
 * family — expressed with real Mapper ingredients. The grams are PINGÜINO
 * grams. These are deliberately REALISTIC rather than pre-balanced: several
 * drafts start outside the approved bands, which is the point of the torture.
 *
 * Source of truth: ${MAPPER}
 * Mapper SHA-256 at generation: ${mapperSha}
 * The Mapper base is never written by this file or its generator.
 */
import type { IngredientComponentProfile } from '@/engine';

export interface InternetRecipeLine {
  grams: number;
  mapperId: string;
  displayName: string;
  category: string;
  composition: IngredientComponentProfile;
  pod_value: number | null;
  pac_value: number | null;
  de_value: number | null;
  cost_per_kg: number | null;
  cost_currency: string | null;
  confidence_score: number;
  verified: boolean;
}

export interface InternetProteinRecipe {
  id: string;
  /** Flavour/structure family — one per recipe, all ${built.length} distinct. */
  family: string;
  title: string;
  sourceTitle: string;
  sourceUrl: string;
  lines: readonly InternetRecipeLine[];
}

/**
 * WEB-ESTIMATED \`MOJA CENA\` (owner rule, 2026-08-23).
 *
 * A missing price is a data gap, not a formulation defect, and must never stop
 * ECO being tested. Each Mapper row below carries NO catalogue price, so a
 * current realistic market price was sourced from the open web, normalized to
 * €/kg, and is applied as a USER-LEVEL \`MOJA CENA\` exactly as if it had been
 * typed into the app. It is NOT verified product data, it is NEVER written into
 * the Mapper, it never changes a canonical price, and it must never overwrite a
 * real \`MOJA CENA\` that already exists. PLN→EUR at 4.30 (August 2026); normal
 * market prices, never promotional ones. The generator refuses to emit an entry
 * for any row that already has a catalogue price.
 */
export interface WebEstimatedMojaCena {
  mapperId: string;
  displayName: string;
  pricePerKg: number;
  currency: string;
  /** Where the price came from and what it was normalized from. */
  note: string;
  sourceUrl: string;
}

export const WEB_ESTIMATED_MOJA_CENA: readonly WebEstimatedMojaCena[] = ${JSON.stringify(priced, null, 2)};

export const INTERNET_PROTEIN_RECIPES: readonly InternetProteinRecipe[] = ${JSON.stringify(built, null, 2)};

/** Mapper SHA-256 this corpus was generated from. */
export const INTERNET_CORPUS_MAPPER_SHA256 = '${mapperSha}';
`;

const outPath = resolve(process.cwd(), OUT);
if (process.argv.includes('--check')) {
  const existing = readFileSync(outPath, 'utf8');
  if (existing !== body) {
    console.error('Internet protein recipe corpus is STALE. Run: npm run protein:corpus');
    process.exit(1);
  }
  console.log(`Internet protein recipe corpus verified (${built.length} recipes, ${priced.length} MOJA CENA, mapper ${mapperSha.slice(0, 12)}…)`);
} else {
  writeFileSync(outPath, body);
  console.log(`Internet protein recipe corpus generated (${built.length} recipes, ${priced.length} MOJA CENA, mapper ${mapperSha.slice(0, 12)}…)`);
}
