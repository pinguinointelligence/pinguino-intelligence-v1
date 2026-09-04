import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildZip, crc32 } from '../corpus/zip';

interface Entry {
  name: string;
  size: number;
  crc: number;
  offset: number;
  data: Uint8Array;
}

/** Minimal STORE-only zip reader used to verify the writer independently. */
export function readZip(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('no EOCD');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header');
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (view.getUint32(offset, true) !== 0x04034b50) throw new Error('bad local header');
    const localNameLen = view.getUint16(offset + 26, true);
    const localExtraLen = view.getUint16(offset + 28, true);
    const start = offset + 30 + localNameLen + localExtraLen;
    entries.push({ name, size, crc, offset, data: bytes.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

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
