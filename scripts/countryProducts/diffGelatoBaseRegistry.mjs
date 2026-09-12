#!/usr/bin/env node
// Delta report between two GELATO base country-product registries.
//
//   node scripts/countryProducts/diffGelatoBaseRegistry.mjs <old.json> <new.json>          # Markdown
//   node scripts/countryProducts/diffGelatoBaseRegistry.mjs <old.json> <new.json> --json   # JSON
//
// Read-only: it compares two files and prints the result.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffRegistries, renderDiffMarkdown } from './lib/diffRegistry.mjs';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const files = argv.filter((entry) => !entry.startsWith('--'));
const unknown = argv.filter((entry) => entry.startsWith('--') && entry !== '--json');
if (files.length !== 2 || unknown.length > 0) {
  process.stderr.write('Usage: node scripts/countryProducts/diffGelatoBaseRegistry.mjs <old.json> <new.json> [--json]\n');
  process.exit(2);
}

const read = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));
const diff = diffRegistries(read(files[0]), read(files[1]));
process.stdout.write(asJson ? `${JSON.stringify(diff, null, 2)}\n` : renderDiffMarkdown(diff));
