import {
  MAPPER_SEARCH_RELEASE_ID,
  MAPPER_SEARCH_RELEASE_SHA256,
  MAPPER_SEARCH_RELEASE_URL,
} from './generated/releaseManifest';
import { createMapperSearchRuntime, type MapperSearchRuntime } from './runtime';
import type {
  MapperReleaseData,
  MapperSearchResolution,
  ResolveMapperSearchOptions,
  SearchGapsTelemetry,
} from './types';

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto unavailable for release verification');
  return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

let runtimePromise: Promise<MapperSearchRuntime> | null = null;

export async function loadMapperSearchRuntime(): Promise<MapperSearchRuntime> {
  runtimePromise ??= (async () => {
    const response = await fetch(MAPPER_SEARCH_RELEASE_URL, {
      cache: 'force-cache',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error(`Mapper/Search release unavailable (${response.status})`);
    }
    const source = await response.text();
    const actualSha = await sha256(source);
    if (actualSha !== MAPPER_SEARCH_RELEASE_SHA256) {
      throw new Error(
        `Mapper/Search release SHA mismatch (${actualSha}/${MAPPER_SEARCH_RELEASE_SHA256})`,
      );
    }
    const release = JSON.parse(source) as MapperReleaseData;
    if (release.releaseId !== MAPPER_SEARCH_RELEASE_ID) {
      throw new Error(`Mapper/Search release ID mismatch (${release.releaseId})`);
    }
    return createMapperSearchRuntime(release);
  })();
  return runtimePromise;
}

const SESSION_KEY = 'pinguino.mapper-search-gaps.v1';
const MAX_SESSION_RECORDS = 100;

/** Bounded, review-only telemetry. It never changes aliases or learns routes. */
export const browserSearchGapsTelemetry: SearchGapsTelemetry = {
  record(record) {
    if (typeof window === 'undefined') return;
    const payload = { ...record, recordedAt: new Date().toISOString() };
    try {
      const existing = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? '[]') as unknown;
      const rows = Array.isArray(existing) ? existing : [];
      window.sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify([...rows, payload].slice(-MAX_SESSION_RECORDS)),
      );
    } catch {
      // Storage may be disabled; the review event still exposes the gap safely.
    }
    window.dispatchEvent(new CustomEvent('pinguino:search-gaps', { detail: payload }));
  },
};

export async function resolveMapperSearch(
  input: string,
  options: ResolveMapperSearchOptions = {},
): Promise<MapperSearchResolution> {
  const runtime = await loadMapperSearchRuntime();
  return runtime.resolve(input, {
    ...options,
    telemetry: options.telemetry ?? browserSearchGapsTelemetry,
  });
}

export function resetMapperSearchRuntimeForTests(): void {
  runtimePromise = null;
}
