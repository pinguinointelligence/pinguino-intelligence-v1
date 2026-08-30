/**
 * GELLATTI HOME — staging-only Community QA seed (§103–§105, §107).
 *
 * WHY THIS EXISTS RATHER THAN RAW SQL: `saved_recipes` carries
 * `recipe_behavior_write_guard_v1`, which refuses any write without an authenticated
 * session. That guard is correct, and planting rows past it would invalidate the very
 * thing the seed is meant to prove. So this script signs in as real staging QA users
 * and writes through the app's OWN RPCs — `gellatti_claim_creator_handle_v1`,
 * `gellatti_publish_recipe_v1`, `gellatti_record_derivation_v1` — which is what §105
 * means by "legitimate staging QA/Admin paths".
 *
 * It also means the lineage ROOT is computed by the database exactly as it is for a
 * real user, so the §38 attribution fix is exercised rather than hand-stamped.
 *
 * SAFETY
 *  - refuses to run against anything but the approved staging project ref;
 *  - takes every credential from the environment (§105: no password in the repo);
 *  - marks every row it creates so `--cleanup` can remove exactly those and nothing else.
 *
 * NOT part of `npm test` (§119). Run explicitly:
 *   GELLATTI_QA_PASSWORD=… npm run home:seed-community
 *   GELLATTI_QA_PASSWORD=… npm run home:seed-community -- --cleanup
 */
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
/** Every seeded row carries this marker so cleanup can be exact (§103). */
export const QA_SEED_MARKER = 'QA-STAGING-SEED';
const HANDLE_PREFIX = 'qa-seed-';

const arg = (name) => process.argv.includes(name);
const projectRef = process.argv.find((v) => v.startsWith('--project-ref='))?.split('=')[1]
  ?? STAGING_REF;

if (projectRef !== STAGING_REF) {
  throw new Error(`Refusing: this seed runs ONLY against staging (${STAGING_REF}).`);
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? `https://${STAGING_REF}.supabase.co`;
if (new URL(SUPABASE_URL).hostname !== `${STAGING_REF}.supabase.co`) {
  throw new Error('Refusing: SUPABASE_URL is not the approved staging project.');
}
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PASSWORD = process.env.GELLATTI_QA_PASSWORD;
if (!ANON_KEY) throw new Error('SUPABASE_ANON_KEY is required.');
if (!PASSWORD) throw new Error('GELLATTI_QA_PASSWORD is required (never hard-code it).');

/**
 * §107's chain: Maria creates A, Tomek derives B from A, Anna derives C from B.
 * Both B and C must publicly credit MARIA.
 */
const CHAIN = [
  { email: 'home@home.com',   handle: `${HANDLE_PREFIX}maria`, name: 'Maria QA', title: `${QA_SEED_MARKER} A — Maria original` },
  { email: 'pro@pro.com',     handle: `${HANDLE_PREFIX}tomek`, name: 'Tomek QA', title: `${QA_SEED_MARKER} B — Tomek variant` },
  { email: 'test1@test1.com', handle: `${HANDLE_PREFIX}anna`,  name: 'Anna QA',  title: `${QA_SEED_MARKER} C — Anna variant of Tomek` },
];

const signIn = async (email) => {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { client, userId: data.user.id };
};

const rpc = async (client, fn, params) => {
  const { data, error } = await client.rpc(fn, params);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

async function seed() {
  const created = [];
  let parentPublicationId = null;

  for (const [index, person] of CHAIN.entries()) {
    const { client } = await signIn(person.email);

    await rpc(client, 'gellatti_claim_creator_handle_v1', {
      p_handle: person.handle,
      p_display_name: person.name,
      p_bio: QA_SEED_MARKER,
      p_country: null,
      p_city: null,
      p_avatar_url: null,
      p_is_public: true,
    });

    // ONE canonical call: `create_recipe_with_v1` creates the aggregate, its meta row
    // and immutable v1 together. Inserting into `saved_recipes` directly leaves
    // `saved_recipe_meta` empty, and every later step then reports "unknown recipe" —
    // the aggregate is the unit, not the table.
    const createdRecipe = await rpc(client, 'create_recipe_with_v1', {
      p_name: person.title,
      p_description: QA_SEED_MARKER,
      p_recipe_input: { items: [] },
      p_batch_grams: 1000,
      p_total_batch_g: 1000,
      p_engine_version: QA_SEED_MARKER,
      p_config_version: QA_SEED_MARKER,
      p_mapper_dataset_version: QA_SEED_MARKER,
      p_product_profile: 'sorbet',
      p_temperature_c: -13,
      // `source` is CHECK-constrained to the known provenance vocabulary; the seed
      // uses a real value rather than inventing one. The QA marker lives in the note,
      // the title and the tags, where it belongs.
      p_source: 'imported',
      p_note: QA_SEED_MARKER,
      // The composition shape is CHECK-constrained on saved_recipes: schemaVersion 1,
      // BASE_FORMULATION scope, and three arrays. An empty object is refused, so the
      // seed supplies the real empty composition rather than a partial one.
      p_product_composition: {
        schemaVersion: '1',
        baseScope: 'BASE_FORMULATION',
        baseOrder: [],
        toppings: [],
        migrationAmbiguities: [],
      },
      p_serving_profile: null,
      p_active_engine_label: QA_SEED_MARKER,
    });
    const recipeId =
      createdRecipe?.recipe_id ?? createdRecipe?.id ?? createdRecipe?.recipe?.id;
    if (!recipeId) throw new Error(`create_recipe_with_v1 returned no id: ${JSON.stringify(createdRecipe)}`);

    // Derivation BEFORE publishing: the database computes the root itself, exactly as
    // it does for a real user — which is what makes this a proof and not a fixture.
    if (parentPublicationId !== null) {
      await rpc(client, 'gellatti_record_derivation_v1', {
        p_derived_recipe_id: recipeId,
        p_relation: 'remix',
        p_publication_id: parentPublicationId,
        p_share_link_id: null,
      });
    }

    const published = await rpc(client, 'gellatti_publish_recipe_v1', {
      p_recipe_id: recipeId,
      p_version_number: 1,
      p_slug: `${HANDLE_PREFIX}${index === 0 ? 'a' : index === 1 ? 'b' : 'c'}`,
      p_title: person.title,
      p_description: QA_SEED_MARKER,
      p_image_url: null,
      p_category: null,
      p_tags: [QA_SEED_MARKER],
    });

    const publicationId = published?.publication_id ?? published?.[0]?.publication_id;
    created.push({ ...person, recipeId, publicationId });
    parentPublicationId = publicationId;
    console.log(`seeded ${person.handle} → publication ${publicationId}`);
  }

  // §107 verification, read back through the PUBLIC card the way a visitor sees it.
  const reader = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  for (const entry of created) {
    const card = await rpc(reader, 'gellatti_publication_card_v1', {
      p_publication_id: entry.publicationId,
    });
    console.log(
      `${entry.handle}: based_on = ${JSON.stringify(card?.based_on ?? null)}`,
    );
  }
  console.log('\nEXPECTED (§38): B and C both name MARIA — never Tomek.');
}

async function cleanup() {
  for (const person of CHAIN) {
    const { client } = await signIn(person.email);
    // Own rows only — RLS would refuse anything else, which is the point.
    const { error } = await client.from('saved_recipes').delete().eq('name', person.title);
    if (error) console.warn(`cleanup ${person.email}: ${error.message}`);
    else console.log(`cleaned ${person.email}`);
  }
}

await (arg('--cleanup') ? cleanup() : seed());
