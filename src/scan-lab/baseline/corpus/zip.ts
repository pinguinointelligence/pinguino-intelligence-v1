/**
 * Minimal ZIP writer (STORE method, no compression) that assembles the archive from Blob parts so a large corpus
 * never has to live in one contiguous ArrayBuffer — the export must stay inside iOS Safari's memory ceiling.
 */
let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  CRC_TABLE = table;
  return table;
}

export function crc32(bytes: Uint8Array, seed = 0): number {
  const table = crcTable();
  let c = seed ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = table[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  name: string;
  data: Blob | Uint8Array | string;
  /** Optional modification time; defaults to the DOS epoch so output is deterministic in tests. */
  mtime?: Date;
}

function dosDateTime(d: Date | undefined): { time: number; date: number } {
  if (!d) return { time: 0, date: 0x21 };
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}
function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/** Builds a ZIP as a Blob. Reads each entry once to compute its CRC; entries are appended as Blob parts. */
export async function buildZip(entries: ZipEntryInput[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    let bytes: Uint8Array;
    let blob: Blob;
    if (typeof entry.data === 'string') {
      const encoded = encoder.encode(entry.data);
      bytes = encoded;
      blob = new Blob([encoded as Uint8Array<ArrayBuffer>]);
    } else if (entry.data instanceof Blob) {
      blob = entry.data;
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      bytes = entry.data;
      blob = new Blob([entry.data as Uint8Array<ArrayBuffer>]);
    }
    const crc = crc32(bytes);
    const size = bytes.length;
    const { time, date } = dosDateTime(entry.mtime);
    const local = new Uint8Array(new ArrayBuffer(30 + nameBytes.length));
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20);
    u16(lv, 6, 0x0800); // UTF-8 names
    u16(lv, 8, 0); // STORE
    u16(lv, 10, time);
    u16(lv, 12, date);
    u32(lv, 14, crc);
    u32(lv, 18, size);
    u32(lv, 22, size);
    u16(lv, 26, nameBytes.length);
    u16(lv, 28, 0);
    local.set(nameBytes, 30);
    parts.push(local, blob);
    const cd = new Uint8Array(new ArrayBuffer(46 + nameBytes.length));
    const cv = new DataView(cd.buffer);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u16(cv, 8, 0x0800);
    u16(cv, 10, 0);
    u16(cv, 12, time);
    u16(cv, 14, date);
    u32(cv, 16, crc);
    u32(cv, 20, size);
    u32(cv, 24, size);
    u16(cv, 28, nameBytes.length);
    u16(cv, 30, 0);
    u16(cv, 32, 0);
    u16(cv, 34, 0);
    u16(cv, 36, 0);
    u32(cv, 38, 0);
    u32(cv, 42, offset);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length + size;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const cd of central) {
    parts.push(cd);
    centralSize += cd.length;
  }
  const end = new Uint8Array(new ArrayBuffer(22));
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50);
  u16(ev, 4, 0);
  u16(ev, 6, 0);
  u16(ev, 8, central.length);
  u16(ev, 10, central.length);
  u32(ev, 12, centralSize);
  u32(ev, 16, centralStart);
  u16(ev, 20, 0);
  parts.push(end);
  return new Blob(parts, { type: 'application/zip' });
}
