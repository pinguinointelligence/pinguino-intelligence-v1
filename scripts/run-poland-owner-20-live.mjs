import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
if (!process.argv.includes(`--project-ref=${STAGING_REF}`)) {
  throw new Error('Refusing: exact staging project ref confirmation is required.');
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
  throw new Error('The staging anonymous API key could not be resolved through the linked CLI.');
}

// The credential remains in the established fixture source and process memory;
// it is never copied into arguments, output, reports or committed artefacts.
const fixtureSource = readFileSync(resolve('scripts/seed-staging-admin.mjs'), 'utf8');
const fixturePassword = /const FIXED_PASSWORD = '([^']+)'/.exec(fixtureSource)?.[1];
if (!fixturePassword) throw new Error('Repository staging fixture password is missing.');

const result = spawnSync(
  process.execPath,
  [
    resolve('node_modules/vitest/vitest.mjs'),
    'run',
    'src/features/product-intelligence/__live__/polandOwner20Pilot.live.test.ts',
    '--reporter=verbose',
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUN_POLAND_OWNER_20_LIVE: 'true',
      POLAND_OWNER_20_STAGING_REF: STAGING_REF,
      PINGUINO_STAGING_FIXTURE_PASSWORD: fixturePassword,
      VITE_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
      VITE_SUPABASE_ANON_KEY: anonKey,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exitCode = result.status ?? 1;
