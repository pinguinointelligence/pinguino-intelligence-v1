import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const MAPPER_SLOT = 'PI-ING-000236';
const EXPECTED = Object.freeze({
  ES: Object.freeze({ brand: 'Hacendado', ean: '8402001047251' }),
  PL: Object.freeze({ brand: 'Łaciate', ean: '5900820012434' }),
  FR: Object.freeze({ brand: 'Alsace Lait', ean: '3262970109108' }),
});

const projectRef = process.argv.find((entry) => entry.startsWith('--project-ref='))?.split('=')[1];
if (projectRef !== STAGING_REF) {
  throw new Error('Refusing: exact pinguino-staging project ref confirmation is required.');
}

const apiKeys = JSON.parse(
  execFileSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', STAGING_REF, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ),
);
const anonKey = apiKeys.find((row) => row.name === 'anon' && row.type === 'legacy')?.api_key;
if (typeof anonKey !== 'string' || anonKey.length < 100) {
  throw new Error('The staging anonymous API key could not be resolved.');
}

const fixtureSource = readFileSync(resolve('scripts/seed-staging-admin.mjs'), 'utf8');
const fixturePassword = /const FIXED_PASSWORD = '([^']+)'/.exec(fixtureSource)?.[1];
if (!fixturePassword) throw new Error('Repository staging fixture password is missing.');

const clientFor = async (email = null) => {
  const client = createClient(STAGING_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!email) return client;
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: fixturePassword,
  });
  if (error || !data.session?.access_token) {
    throw new Error(`Staging QA authentication failed for ${email}.`);
  }
  return client;
};

const resolveSlot = async (client, productCountry) => {
  const { data, error } = await client.rpc('resolve_country_product_slots_v1', {
    p_mapper_ingredient_ids: [MAPPER_SLOT],
    p_product_country: productCountry,
    p_product_profile: 'milk_gelato',
  });
  if (error) throw new Error(`Resolver failed for ${productCountry}: ${error.message}`);
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`Resolver returned ${data?.length ?? 0} rows for ${productCountry}.`);
  }
  return data[0];
};

const assertExact = (row, resolutionCountry, source, productCountry = resolutionCountry) => {
  const expected = EXPECTED[productCountry];
  if (
    row.resolution_source !== source ||
    row.resolution_country !== resolutionCountry ||
    row.brand !== expected.brand ||
    row.mapped_ingredient_id !== MAPPER_SLOT ||
    row.usable_in_base !== true ||
    !row.eans?.includes(expected.ean)
  ) {
    throw new Error(
      `Unexpected ${resolutionCountry}/${source}/${productCountry} resolution: ${JSON.stringify(row)}`,
    );
  }
};

const guest = await clientFor();
const guestRows = {};
for (const country of Object.keys(EXPECTED)) {
  const row = await resolveSlot(guest, country);
  assertExact(row, country, 'COUNTRY_PRIMARY_DEFAULT');
  guestRows[country] = row;
}

const home = await clientFor('home@home.com');
const homePoland = await resolveSlot(home, 'PL');
assertExact(homePoland, 'PL', 'COUNTRY_PRIMARY_DEFAULT');

const pro = await clientFor('pro@pro.com');
const proPreferred = await resolveSlot(pro, 'ES');
assertExact(proPreferred, 'ES', 'USER_PREFERRED', 'PL');

process.stdout.write(
  `${JSON.stringify(
    {
      projectRef: STAGING_REF,
      guest: Object.fromEntries(
        Object.entries(guestRows).map(([country, row]) => [
          country,
          {
            source: row.resolution_source,
            brand: row.brand,
            eans: row.eans,
            mappedIngredientId: row.mapped_ingredient_id,
            usableInBase: row.usable_in_base,
          },
        ]),
      ),
      home: {
        requestedCountry: 'PL',
        source: homePoland.resolution_source,
        brand: homePoland.brand,
        eans: homePoland.eans,
      },
      pro: {
        accountCountry: 'ES',
        source: proPreferred.resolution_source,
        preferredBrand: proPreferred.brand,
        preferredEans: proPreferred.eans,
      },
    },
    null,
    2,
  )}\n`,
);
