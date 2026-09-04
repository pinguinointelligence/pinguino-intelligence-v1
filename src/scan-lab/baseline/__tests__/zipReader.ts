/** Minimal STORE-only zip reader shared by tests; verifies the writer independently. */
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
