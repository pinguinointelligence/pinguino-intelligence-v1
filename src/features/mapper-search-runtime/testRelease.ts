import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMapperSearchRuntime } from './runtime';
import type { MapperReleaseData } from './types';

export function readTestMapperSearchRelease(): MapperReleaseData {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'public/mapper-search-runtime/sa10-final-frozen.json'),
      'utf8',
    ),
  ) as MapperReleaseData;
}

export function createTestMapperSearchRuntime() {
  return createMapperSearchRuntime(readTestMapperSearchRelease());
}
