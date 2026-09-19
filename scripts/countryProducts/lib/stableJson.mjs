// Deterministic, review-friendly JSON: arrays of primitives on one line, small
// objects of primitives on one line (≤ INLINE_OBJECT_LIMIT characters),
// everything else one key per line. Key order is the construction order (the
// builders construct every object in a fixed order and sort every list).

const INLINE_OBJECT_LIMIT = 120;

const isPrimitive = (value) =>
  value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const isFlat = (value) => isPrimitive(value) || (Array.isArray(value) && value.every(isPrimitive));

function format(value, indent) {
  if (isPrimitive(value)) return JSON.stringify(value);
  const next = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(isPrimitive)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    return `[\n${value.map((item) => `${next}${format(item, next)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (entries.length === 0) return '{}';
  if (entries.every(([, item]) => isFlat(item))) {
    const inline = `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${format(item, next)}`).join(', ')} }`;
    if (inline.length <= INLINE_OBJECT_LIMIT) return inline;
  }
  return `{\n${entries.map(([key, item]) => `${next}${JSON.stringify(key)}: ${format(item, next)}`).join(',\n')}\n${indent}}`;
}

/** Stable JSON text with a trailing newline. */
export function formatJson(value) {
  return `${format(value, '')}\n`;
}
