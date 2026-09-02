#!/usr/bin/env node
/**
 * GLOBAL MAIN AUTHORITY — full Mapper capability audit (owner v1.4 §12 / §38).
 *
 * Re-derives the canonical Main capability for every active Mapper row from
 * the SAME inputs the server classifier uses (mapper_basement facts + the
 * published Main policy table) and writes
 * `reports/MAIN_CAPABILITY_MAPPER_AUDIT.csv`.
 *
 * This is a mirror of `public.main_capability_v1` /
 * `public.classify_mapper_product_behavior_v2`, not a second authority. The
 * `--checksum` flag prints the md5 of the derived verdict lines so the result
 * can be proved byte-identical to `public.mapper_main_capability_audit_v1`
 * on the server (see reports/GLOBAL_MAIN_AUTHORITY_2026-08-23.md).
 *
 *   node scripts/auditMainCapability.mjs [--checksum]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MAPPER_CSV = path.join(ROOT, 'docs/ingredients/validation/mapper_basement.csv');
const OUT_CSV = path.join(ROOT, 'reports/MAIN_CAPABILITY_MAPPER_AUDIT.csv');

/* ── published Main policy table (server: product_behavior_policy_versions) ── */
const POLICIES = `
main-banana-fresh-dairy~milk_gelato~fruit~banana~fresh~~10~20~30
main-berry-fresh-dairy~milk_gelato~fruit~berry~fresh~~25~35~45
main-berry-puree-dairy~milk_gelato~fruit~berry~puree~~25~35~45
main-exact-prontociocc-0757-chocolate~chocolate_gelato~chocolate_cocoa~~flavour_paste~PI-ING-000757~9.091~13.043~13.043
main-exact-raspberry-fortefrutto-0732-milk~milk_gelato~fruit~~concentrate~PI-ING-000732~1.961~6.542~6.542
main-exact-raspberry-fortefrutto-0732-sorbet~sorbet~fruit~~concentrate~PI-ING-000732~1.961~6.542~6.542
main-exact-raspberry-fortefrutto-0732-vegan~vegan_gelato~fruit~~concentrate~PI-ING-000732~1.961~6.542~6.542
main-exact-strawberry-fortefrutto-0737-milk~milk_gelato~fruit~~concentrate~PI-ING-000737~1.961~6.542~6.542
main-exact-strawberry-fortefrutto-0737-sorbet~sorbet~fruit~~concentrate~PI-ING-000737~1.961~6.542~6.542
main-exact-strawberry-fortefrutto-0737-vegan~vegan_gelato~fruit~~concentrate~PI-ING-000737~1.961~6.542~6.542
main-fruit-fresh-dairy~milk_gelato~fruit~~fresh~~20~35~45
main-fruit-puree-dairy~milk_gelato~fruit~~puree~~20~35~45
main-kiwi-fresh-dairy~milk_gelato~fruit~kiwi~fresh~~10~15~20
main-pistachio-pure-paste-dairy-0614~milk_gelato~nut~~pure_nut_paste~PI-ING-000614~8~15~15
main-protein-banana-0345~protein_gelato~fruit~banana~fresh~PI-ING-000345~10~17.1~17.1
main-protein-cocoa-1578~protein_gelato~chocolate_cocoa~~cocoa_powder~PI-ING-001578~6~6.1~6.1
main-protein-pistachio-0614~protein_gelato~nut~~pure_nut_paste~PI-ING-000614~10~10~10
main-protein-strawberry-1553~protein_gelato~fruit~berry~fresh~PI-ING-001553~10~49.5~49.5
main-protein-vanilla-0246~protein_gelato~vanilla~~flavour_paste~PI-ING-000246~0.5~4.9~4.9
main-pure-nut-paste-dairy~milk_gelato~nut~~pure_nut_paste~~8~15~15
main-sorbet-lime-fresh-0369~sorbet~fruit~citrus~fresh~PI-ING-000369~60~60~60
main-sorbet-mango-puree-0340~sorbet~fruit~mango_tropical~puree~PI-ING-000340~60~60~60
main-sorbet-strawberry-fresh-1553~sorbet~fruit~berry~fresh~PI-ING-001553~60~60~60
main-vegan-banana-puree-1589~vegan_gelato~fruit~banana~puree~PI-ING-001589~30~86~86
main-vegan-cocoa-powder-1578~vegan_gelato~chocolate_cocoa~~cocoa_powder~PI-ING-001578~6~24~24
main-vegan-pistachio-paste-0614~vegan_gelato~nut~~pure_nut_paste~PI-ING-000614~12~26.6~26.6
main-vegan-strawberry-fresh-1553~vegan_gelato~fruit~berry~fresh~PI-ING-001553~30~74.7~74.7
main-whisky-40-dairy-0038-minus11~milk_gelato~alcohol~~alcoholic_beverage~PI-ING-000038~2~4.9~4.9
`.trim().split('\n').map((line) => {
  const [key, profile, family, subfamily, form, exactId] = line.split('~');
  return { key, profile, family: family || null, subfamily: subfamily || null, form: form || null, exactId: exactId || null };
});

/* ── published taxonomy aliases (server: product_taxonomy_aliases) ────────── */
const SUBFAMILY_ALIASES = {
  berry: ['strawberry', 'strawberries', 'truskawka', 'truskawki', 'fresa', 'erdbeere', 'fragola', 'fraise',
    'raspberry', 'raspberries', 'blackberry', 'blackberries', 'blueberry', 'blueberries', 'redcurrant',
    'blackcurrant', 'currant', 'currants', 'gooseberry', 'cranberry', 'cranberries', 'elderberry',
    'malina', 'maliny', 'borowka', 'jagoda', 'porzeczka', 'frambuesa', 'arandano', 'mora',
    'himbeere', 'heidelbeere', 'lampone', 'mirtillo', 'framboise', 'myrtille'],
  banana: ['banana', 'bananas', 'banan', 'platano', 'banane'],
  kiwi: ['kiwi'],
  citrus: ['lemon', 'lime', 'orange', 'grapefruit', 'mandarin', 'tangerine', 'clementine', 'bergamot',
    'yuzu', 'citrus', 'citron', 'cytryna', 'limonka', 'pomarancza', 'limon', 'naranja', 'pomelo',
    'limone', 'arancia'],
  mango_tropical: ['mango', 'passion', 'passionfruit', 'maracuya', 'pineapple', 'papaya', 'guava',
    'lychee', 'marakuja', 'ananas', 'papaja', 'pina'],
};
/** Only `fruit` currently owns subfamily nodes in the published taxonomy. */
const SUBFAMILY_PARENT = 'fruit';

/* ── mapper_behavior_family_v2 ────────────────────────────────────────────── */
function family(category, subcategory) {
  const c = (category || '').toLowerCase();
  const s = (subcategory || '').toLowerCase();
  if (s === 'honey') return 'honey';
  if (s.includes('caramel') || s === 'kajmak') return 'caramel';
  if (s.includes('vanilla')) return 'vanilla';
  if (c === 'fruit') return 'fruit';
  if (c === 'nut' || c === 'nut_paste') return 'nut';
  if (c === 'chocolate' || c === 'cocoa') return 'chocolate_cocoa';
  if (c === 'coffee' || c === 'coffee_tea' || s.includes('coffee') || s === 'espresso_coffee') return 'coffee';
  if (c === 'alcohol') return 'alcohol';
  if (c === 'coconut') return 'coconut';
  if (c === 'bakery' || c === 'bakery_inclusion') return 'bakery_cookie';
  if (c === 'spice' || c === 'botanical') return 'spice_herb';
  if (c === 'dairy' && [
    'mascarpone_cheese', 'natural_yogurt', 'skyr_yoghurt', 'greek_yogurt', 'yoghurt_9_percent',
    'fermented_milk_drink', 'cream_cheese', 'soft_cheese', 'blue_cheese', 'brie_cheese',
    'blue_cheese_roquefort', 'parmesan_cheese', 'fatty_cottage_cheese', 'fatty_cottage_cheese_8_percent',
  ].includes(s)) return 'dairy_flavour';
  return null;
}

/* ── mapper_behavior_form_v2 ──────────────────────────────────────────────── */
function form(category, subcategory) {
  const c = (category || '').toLowerCase();
  const s = (subcategory || '').toLowerCase();
  if (s.includes('juice_concentrate')) return 'concentrate';
  if (s.includes('concentrate')) return 'concentrate';
  if (s.includes('fresh')) return 'fresh';
  if (s.includes('frozen')) return 'frozen';
  if (s.includes('puree')) return 'puree';
  if (s.includes('juice')) return 'juice';
  if (s.includes('extract')) return 'extract';
  if (s === 'espresso_coffee') return 'espresso';
  if (s.includes('dark_chocolate')) return 'dark_chocolate';
  if (s.includes('milk_chocolate')) return 'milk_chocolate';
  if (s.includes('cocoa_mass')) return 'cocoa_mass';
  if (s.includes('cocoa_powder')) return 'cocoa_powder';
  if (s.includes('powder')) return 'powder';
  if (c === 'alcohol' && s.includes('cream_liqueur')) return 'cream_liqueur';
  if (c === 'alcohol') return 'alcoholic_beverage';
  if (c === 'flavor_paste' || c === 'flavour_paste') return 'flavour_paste';
  if (s.includes('syrup')) return 'syrup';
  if (s.includes('paste')) return 'paste';
  if ((c === 'nut' || c === 'nut_paste') && [
    'pistachio', 'almond', 'peanut', 'walnut', 'cashew', 'pecan', 'hazelnut', 'brazil_nuts',
    'chestnut', 'macadamia',
  ].includes(s)) return 'whole_nut';
  if (s.includes('dried')) return 'dried';
  if (s.includes('peel')) return 'peel';
  if (s.includes('drink') || ['milk', 'fresh_milk', 'water', 'cream'].includes(s)) return 'liquid';
  return null;
}

/* ── mapper_behavior_subfamily_v3 (semantic; no exact-id whitelist) ───────── */
function subfamily(fam, category, subcategory, name) {
  if (fam !== SUBFAMILY_PARENT) return null;
  const tokens = new Set(
    `${name || ''} ${subcategory || ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
  );
  const hits = [];
  for (const [node, aliases] of Object.entries(SUBFAMILY_ALIASES)) {
    for (const alias of aliases) if (tokens.has(alias)) hits.push({ node, alias });
  }
  if (hits.length > 0) {
    hits.sort((a, b) => b.alias.length - a.alias.length || a.node.localeCompare(b.node));
    return hits[0].node;
  }
  const s = (subcategory || '').toLowerCase();
  if ((category || '').toLowerCase() === 'fruit') {
    if (s.includes('citrus') || s.includes('lemon') || s.includes('lime') || s.includes('orange')) return 'citrus';
    if (s.includes('tropical')) return 'mango_tropical';
  }
  return null;
}

/**
 * §25: an exact reviewed policy still supplies taxonomy that coarse legacy
 * category/subcategory alone cannot express (vanilla paste, pure nut paste,
 * fruit concentrate). It is calibration metadata, refactored rather than
 * deleted, and it keeps precedence over the derived value — exactly as
 * `classify_mapper_product_behavior_v2` does on the server.
 */
function policyTaxonomy(ingredientId, key) {
  const rows = POLICIES.filter((p) => p.exactId === ingredientId && p[key]);
  return rows.length > 0 ? rows[rows.length - 1][key] : null;
}

const STRUCTURAL_CATEGORIES = new Set([
  'sweetener', 'stabilizer', 'fiber', 'emulsifier', 'starch', 'acid', 'colorant',
  'functional_additive', 'additive',
]);
const TOPPING_CATEGORIES = new Set([
  'confectionery_inclusion', 'bakery_inclusion', 'decorative_inclusion', 'variegate', 'coating',
]);
const FLAVOUR_CATEGORIES = new Set([
  'fruit', 'fruit_powder', 'flavor_paste', 'flavor_powder', 'flavor_syrup', 'flavor_concentrate',
  'chocolate', 'cocoa', 'nut', 'nut_paste', 'coffee', 'coffee_tea', 'alcohol', 'beverage',
  'confectionery_spread',
]);
const FLAVOUR_FAMILIES = new Set([
  'coconut', 'bakery_cookie', 'spice_herb', 'vanilla', 'caramel', 'honey', 'dairy_flavour',
]);

/** classify_mapper_product_behavior_v2 behaviour role. */
function behaviorRole(row, fam, frm) {
  const c = (row.ingredient_category || '').toLowerCase();
  const s = (row.ingredient_subcategory || '').toLowerCase();
  if (c === 'protein') return 'PROTEIN_CONTRIBUTOR_ONLY';
  if (TOPPING_CATEGORIES.has(c)) return 'TOPPING_ONLY';
  if (STRUCTURAL_CATEGORIES.has(c) || s === 'water') return 'STRUCTURAL_ONLY';
  if (FLAVOUR_CATEGORIES.has(c) || FLAVOUR_FAMILIES.has(fam)) {
    return fam !== null && frm !== null ? 'MAIN_ALLOWED' : 'UNKNOWN_REQUIRES_EVIDENCE';
  }
  return 'STANDARD_ONLY';
}

function matchingPolicies(id, fam, sub, frm) {
  return POLICIES.filter((p) =>
    (p.exactId === null || p.exactId === id) &&
    (p.family === null || p.family === fam) &&
    (p.subfamily === null || p.subfamily === sub) &&
    (p.form === null || p.form === frm),
  );
}

/* ── CSV plumbing ─────────────────────────────────────────────────────────── */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false; }
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}
const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/* ── main ─────────────────────────────────────────────────────────────────── */
const parsed = parseCsv(fs.readFileSync(MAPPER_CSV, 'utf8'));
const header = parsed[0];
const rows = parsed.slice(1)
  .filter((r) => r.length > 5 && r[0])
  .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));

const audit = rows.map((row) => {
  const id = row.ingredient_id;
  const fam = policyTaxonomy(id, 'family')
    ?? family(row.ingredient_category, row.ingredient_subcategory);
  const frm = policyTaxonomy(id, 'form')
    ?? form(row.ingredient_category, row.ingredient_subcategory);
  const sub = policyTaxonomy(id, 'subfamily')
    ?? subfamily(fam, row.ingredient_category, row.ingredient_subcategory, row.ingredient_name_display);
  const roleBeforeCoverage = behaviorRole(row, fam, frm);
  const approved = String(row.approved_for_base).toUpperCase() === 'TRUE'
    && String(row.approved_for_engines).toUpperCase() === 'TRUE';
  const policies = matchingPolicies(id, fam, sub, frm);
  const exact = POLICIES.some((p) => p.exactId === id);
  // The classifier promotes a covered flavour carrier to MAIN_PROFILE_SPECIFIC.
  const role = policies.length > 0 &&
    ['MAIN_ALLOWED', 'UNKNOWN_REQUIRES_EVIDENCE'].includes(roleBeforeCoverage)
    ? 'MAIN_PROFILE_SPECIFIC'
    : roleBeforeCoverage;

  let capability;
  let blockedReason = '';
  if (!approved) { capability = 'MAIN_TECHNICAL_BLOCKED'; blockedReason = 'base_recipe_not_approved'; }
  else if (role === 'STRUCTURAL_ONLY') { capability = 'MAIN_TECHNICAL_BLOCKED'; blockedReason = 'structural_product_not_flavour_main'; }
  else if (role === 'TOPPING_ONLY') { capability = 'MAIN_TECHNICAL_BLOCKED'; blockedReason = 'post_process_product_not_base_main'; }
  else if (role === 'PROTEIN_CONTRIBUTOR_ONLY') { capability = 'MAIN_TECHNICAL_BLOCKED'; blockedReason = 'protein_contributor_not_flavour_main'; }
  else if (role === 'STANDARD_ONLY') { capability = 'MAIN_TECHNICAL_BLOCKED'; blockedReason = 'standard_product_not_flavour_main'; }
  else capability = policies.length > 0 ? 'MAIN_CAPABLE' : 'MAIN_CAPABLE_UNCALIBRATED';

  const calibration = capability !== 'MAIN_CAPABLE'
    ? 'NONE'
    : exact ? 'EXACT_PRODUCT' : 'FAMILY';

  return {
    ingredient_id: id,
    name: row.ingredient_name_display,
    category: row.ingredient_category,
    subcategory: row.ingredient_subcategory,
    family: fam ?? '',
    subfamily: sub ?? '',
    form: frm ?? '',
    role,
    profiles: [...new Set(policies.map((p) => p.profile))].sort().join('|'),
    capability,
    calibration_level: calibration,
    policy: policies.map((p) => p.key).sort().join('|'),
    // Exactly what `mapper_main_capability_audit_v1.policies` projects, so the
    // local audit can be proved byte-identical to the server view.
    serverPolicyProjection: [...new Set(policies.map((p) => `${p.profile}:${p.key}`))]
      .sort()
      .map((entry) => entry.replace('main-', ''))
      .join('|'),
    blocked_reason: blockedReason,
    provenance: 'mapper_basement v1.0 + published product_behavior_policy_versions',
    confidence: row.verification_status || '',
  };
});

const columns = [
  'ingredient_id', 'name', 'category', 'subcategory', 'family', 'subfamily', 'form', 'role',
  'profiles', 'capability', 'calibration_level', 'policy', 'blocked_reason', 'provenance', 'confidence',
];
const csv = [columns.join(','), ...audit.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n');
fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
fs.writeFileSync(OUT_CSV, `${csv}\n`);

/** Same normalised shape the server audit view emits, for cross-verification. */
const checksumLines = audit
  .slice()
  .sort((a, b) => a.ingredient_id.localeCompare(b.ingredient_id))
  .map((r) => [
    r.ingredient_id, r.family, r.subfamily, r.form, r.role, r.capability, r.calibration_level,
    r.capability === 'MAIN_CAPABLE' ? r.serverPolicyProjection : '',
  ].join('|'))
  .join('\n');
const checksum = crypto.createHash('md5').update(checksumLines).digest('hex');

const counts = audit.reduce((acc, r) => ({ ...acc, [r.capability]: (acc[r.capability] ?? 0) + 1 }), {});
process.stdout.write(`${OUT_CSV}\nrows: ${audit.length}\n`);
for (const [key, value] of Object.entries(counts).sort()) process.stdout.write(`${key}: ${value}\n`);
process.stdout.write(`checksum(md5): ${checksum}\n`);
if (process.argv.includes('--checksum')) {
  fs.writeFileSync(
    path.join(ROOT, 'reports/.main-capability-checksum.txt'),
    `${checksum}\n`,
  );
}
