import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildZip, crc32 } from '../corpus/zip';
import { readZip } from './zipReader';

describe('crc32', () => {
  it('matches the reference vector', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('buildZip', () => {
  it('writes a STORE archive whose entries, sizes and CRCs round-trip', async () => {
    const bin = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]);
    const blob = await buildZip([
      { name: 'README.txt', data: 'hello zip\n' },
      { name: 'frames/00001.bin', data: bin },
      { name: 'blob.json', data: new Blob([JSON.stringify({ a: 1 })]) },
    ]);
    expect(blob.type).toBe('application/zip');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const entries = readZip(bytes);
    expect(entries.map((e) => e.name)).toEqual(['README.txt', 'frames/00001.bin', 'blob.json']);
    for (const e of entries) {
      expect(e.size).toBe(e.data.length);
      expect(crc32(e.data)).toBe(e.crc);
    }
    expect(new TextDecoder().decode(entries[0]!.data)).toBe('hello zip\n');
    expect(Array.from(entries[1]!.data)).toEqual(Array.from(bin));
    expect(JSON.parse(new TextDecoder().decode(entries[2]!.data))).toEqual({ a: 1 });
  });

  it('is accepted by the system unzip when available', async () => {
    const unzip = (() => {
      try {
        return execFileSync('which', ['unzip'], { encoding: 'utf8' }).trim() || null;
      } catch {
        return null;
      }
    })();
    if (!unzip) return;
    const blob = await buildZip([
      { name: 'a/b.txt', data: 'x'.repeat(1000) },
      { name: 'c.bin', data: new Uint8Array(3) },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'scan-lab-zip-'));
    const file = join(dir, 't.zip');
    writeFileSync(file, new Uint8Array(await blob.arrayBuffer()));
    const out = execFileSync(unzip, ['-t', file], { encoding: 'utf8' });
    expect(out).toMatch(/No errors detected/);
  });
});
