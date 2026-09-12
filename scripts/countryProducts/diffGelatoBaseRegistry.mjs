#!/usr/bin/env node
// Delta report between two GELATO base country-product registries.
//
//   node scripts/countryProducts/diffGelatoBaseRegistry.mjs <old.json> <new.json>          # Markdown
//   node scripts/countryProducts/diffGelatoBaseRegistry.mjs <old.json> <new.json> --json   # JSON
//   node scripts/countryProducts/diffGelatoBaseRegistry.mjs <old.json> <new.json> --out=<report.md>          # write
//   node scripts/countryProducts/diffGelatoBaseRegistry.mjs <old.json> <new.json> --out=<report.md> --check  # fail on drift
//
// Registries of different workbook versions (V12 → V23) are matched on the
// namespace-free part of their keys (lib/diffRegistry.mjs). Read-only: it
// compares two files and prints (or writes) the result. Run from the
// repository root so the regenerate line of a written report is reproducible.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffRegistries, renderDiffMarkdown } from './lib/diffRegistry.mjs';

const argv = process.argv.slice(2);
const flags = argv.filter((entry) => entry.startsWith('--'));
const files = argv.filter((entry) => !entry.startsWith('--'));
const asJson = flags.includes('--json');
const check = flags.includes('--check');
const out = flags.find((entry) => entry.startsWith('--out='))?.slice('--out='.length) || null;
const unknown = flags.filter((entry) => entry !== '--json' && entry !== '--check' && !entry.startsWith('--out='));
if (files.length !== 2 || unknown.length > 0 || (check && !out)) {
  process.stderr.write(
    'Usage: node scripts/countryProducts/diffGelatoBaseRegistry.mjs <old.json> <new.json> [--json] [--out=<file> [--check]]\n',
  );
  process.exit(2);
}

const read = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));
const diff = diffRegistries(read(files[0]), read(files[1]));
const regenerate = out
  ? `node scripts/countryProducts/diffGelatoBaseRegistry.mjs ${files[0]} ${files[1]}${asJson ? ' --json' : ''} --out=${out}`
  : null;
const text = asJson ? `${JSON.stringify(diff, null, 2)}\n` : renderDiffMarkdown(diff, { regenerate });

if (!out) {
  process.stdout.write(text);
} else if (check) {
  let current = null;
  try {
    current = readFileSync(resolve(out), 'utf8');
  } catch {
    current = null;
  }
  if (current !== text) {
    process.stderr.write(`Drift: ${out} differs from the regenerated delta.\n`);
    process.exit(1);
  }
  process.stdout.write(`OK: ${out} matches the delta ${diff.from.registryId} → ${diff.to.registryId}.\n`);
} else {
  writeFileSync(resolve(out), text);
  process.stdout.write(`Wrote ${out} (${diff.from.registryId} → ${diff.to.registryId}): ${JSON.stringify(diff.counts)}\n`);
}
