import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import * as XLSX from 'xlsx';

const ROOT = process.cwd();
const EXPECTED_DISPOSITIONS = {
  APPLY: 745,
  DISPLAY_LAYER_ONLY: 32,
  KEEP_CONTRACT: 182,
  EXCLUDE_INTERNAL: 16,
  OWNER_APPROVED_CORRECTION: 8,
};
const AUTO_DISPOSITIONS = new Set(['APPLY', 'OWNER_APPROVED_CORRECTION']);
const DISPLAY_REVIEW_CLASS = 'J. TRUE_OWNER_REVIEW_REQUIRED';
const INLINE_TAGS = new Set(['span', 'strong', 'em', 'b', 'i', 'small', 'code', 'abbr', 'time']);
const VISIBLE_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'alt', 'label', 'placeholder', 'title']);
const OWNER_OVERRIDES = new Map([
  [
    'COPY-002574',
    {
      final_disposition: 'OWNER_APPROVED_CORRECTION',
      final_polish_copy:
        'Podaj tylko to, co wiesz. Dla własnej maszyny wpisz wsad samodzielnie — możesz go później zmienić.',
    },
  ],
  ['COPY-001926', { final_disposition: 'KEEP_CONTRACT', final_polish_copy: 'name' }],
  ['COPY-001744', { final_disposition: 'KEEP_CONTRACT', final_polish_copy: 'market' }],
]);
const MOVED_AND_RESOLVED_COPY_IDS = new Set([
  'COPY-000032',
  'COPY-000044',
  'COPY-000045',
  'COPY-000107',
  'COPY-000109',
  'COPY-000115',
  'COPY-000119',
  'COPY-000124',
  'COPY-000130',
  'COPY-000132',
  'COPY-000942',
  'COPY-001282',
  'COPY-001878',
  'COPY-002447',
  'COPY-002963',
  'COPY-003164',
  'COPY-003709',
  'COPY-003964',
  'COPY-003965',
  'COPY-003966',
  'COPY-003976',
  'COPY-004324',
  'COPY-004382',
  'COPY-004644',
]);
const DISPLAY_MAPPED_COPY_IDS = new Set([
  'COPY-000164',
  'COPY-000166',
  'COPY-000168',
  'COPY-000598',
  'COPY-001069',
  'COPY-001186',
  'COPY-002507',
  'COPY-002508',
  'COPY-002509',
  'COPY-002838',
  'COPY-002839',
  'COPY-003248',
  'COPY-003249',
  'COPY-003595',
  'COPY-003843',
  'COPY-004403',
  'COPY-004404',
]);

function argument(name, fallback = null) {
  return (
    process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ??
    fallback
  );
}

function normalize(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function signature(value) {
  return normalize(value).replace(/\{[^{}]+\}/g, '{#}');
}

function placeholderParts(value) {
  const text = String(value);
  const parts = [];
  const names = [];
  let cursor = 0;
  for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
    parts.push(text.slice(cursor, match.index));
    names.push(match[1]);
    cursor = match.index + match[0].length;
  }
  parts.push(text.slice(cursor));
  return { parts, names };
}

function splitFiles(value) {
  return String(value)
    .split(/;\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function lineHints(row) {
  const hints = [];
  for (const match of String(row.line_or_key).matchAll(/([^;]+?):(\d+)\s*\(([^)]+)\)/g)) {
    const file = match[1].trim();
    hints.push({ file, line: Number(match[2]), context: match[3].trim() });
  }
  return hints;
}

function candidateScore(row, candidate) {
  const hints = lineHints(row).filter((hint) => hint.file === candidate.file);
  if (hints.length === 0) return Number.MAX_SAFE_INTEGER / 2;
  return Math.min(
    ...hints.map((hint) => {
      const contextMatches = candidate.contexts.some(
        (value) => value.toLocaleLowerCase() === hint.context.toLocaleLowerCase(),
      );
      return Math.abs(hint.line - candidate.line) * 10 + (contextMatches ? 0 : 1000);
    }),
  );
}

function keyName(node) {
  if (!node) return '';
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return node.getText().replace(/^['"]|['"]$/g, '');
}

function candidateContexts(node) {
  const contexts = [];
  let current = node;
  for (let depth = 0; current?.parent && depth < 16; depth += 1) {
    const parent = current.parent;
    if (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) {
      contexts.push(keyName(parent.name));
    }
    if (ts.isVariableDeclaration(parent)) contexts.push(keyName(parent.name));
    if (
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isArrowFunction(parent) ||
      ts.isMethodDeclaration(parent)
    ) {
      const name = keyName(parent.name);
      if (name) contexts.push(name);
      if (ts.isVariableDeclaration(parent.parent)) contexts.push(keyName(parent.parent.name));
    }
    if (ts.isJsxElement(parent)) contexts.push(parent.openingElement.tagName.getText());
    if (ts.isJsxAttribute(parent)) contexts.push(keyName(parent.name));
    current = parent;
  }
  return [...new Set(contexts.filter(Boolean))];
}

function sourceKind(file) {
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.js') || file.endsWith('.mjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function escapeString(value, quote) {
  let result = value
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  result = quote === "'" ? result.replace(/'/g, "\\'") : result.replace(/"/g, '\\"');
  return result;
}

function escapeTemplate(value) {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function escapeJsx(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function preserveWhitespace(current, replacement, preserveLeading, preserveTrailing) {
  const leading = preserveLeading ? current.match(/^\s+/)?.[0] ?? '' : '';
  const trailing = preserveTrailing ? current.match(/\s+$/)?.[0] ?? '' : '';
  let result = replacement;
  if (leading && !/^\s/.test(result)) result = `${leading}${result}`;
  if (trailing && !/\s$/.test(result)) result = `${result}${trailing}`;
  return result;
}

function replaceJsxTextPreservingLines(current, replacement, preserveLeading, preserveTrailing) {
  const preserved = preserveWhitespace(
    current,
    replacement,
    preserveLeading,
    preserveTrailing,
  );
  if (!current.includes('\n') || replacement.includes('\n')) return preserved;
  const sourceLines = current.split('\n');
  const replacementWords = normalize(replacement).split(/\s+/).filter(Boolean);
  let cursor = 0;
  const contentLineIndexes = sourceLines
    .map((line, index) => (line.trim() ? index : null))
    .filter((index) => index !== null);
  return sourceLines
    .map((line, index) => {
      if (!line.trim()) return line;
      const leading = line.match(/^\s*/)?.[0] ?? '';
      const trailing = line.match(/\s*$/)?.[0] ?? '';
      const sourceWordCount = line.trim().split(/\s+/).length;
      const isLastContentLine = index === contentLineIndexes.at(-1);
      const take = isLastContentLine
        ? replacementWords.length - cursor
        : Math.min(sourceWordCount, replacementWords.length - cursor);
      const words = replacementWords.slice(cursor, cursor + Math.max(0, take));
      cursor += Math.max(0, take);
      return `${leading}${words.join(' ')}${trailing}`;
    })
    .join('\n');
}

function expressionMarker() {
  return { kind: 'expression' };
}

function stringSegment(node, tree, flavor = 'string') {
  const start = node.getStart(tree);
  const end = node.getEnd();
  const raw = tree.text.slice(start, end);
  if (flavor === 'jsx-attribute') {
    return {
      kind: 'static',
      flavor,
      current: node.text,
      start: start + 1,
      end: end - 1,
      raw: raw.slice(1, -1),
    };
  }
  return {
    kind: 'static',
    flavor,
    current: node.text,
    start: start + 1,
    end: end - 1,
    raw: raw.slice(1, -1),
    quote: raw[0],
  };
}

function jsxTextSegment(node, tree) {
  const start = node.getFullStart();
  const end = node.getEnd();
  const raw = tree.text.slice(start, end);
  return { kind: 'static', flavor: 'jsx-text', current: raw, start, end, raw };
}

function templateSegments(node, tree) {
  const result = [];
  const headStart = node.head.getStart(tree);
  const headEnd = node.head.getEnd();
  result.push({
    kind: 'static',
    flavor: 'template',
    current: node.head.text,
    start: headStart + 1,
    end: headEnd - 2,
    raw: tree.text.slice(headStart + 1, headEnd - 2),
  });
  for (const span of node.templateSpans) {
    result.push(expressionMarker());
    const start = span.literal.getStart(tree);
    const end = span.literal.getEnd();
    const tail = ts.isTemplateTail(span.literal);
    result.push({
      kind: 'static',
      flavor: 'template',
      current: span.literal.text,
      start: start + 1,
      end: end - (tail ? 1 : 2),
      raw: tree.text.slice(start + 1, end - (tail ? 1 : 2)),
    });
  }
  return result;
}

function concatSegments(node, tree) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...concatSegments(node.left, tree), ...concatSegments(node.right, tree)];
  }
  if (ts.isStringLiteral(node)) return [stringSegment(node, tree)];
  if (ts.isNoSubstitutionTemplateLiteral(node)) return [stringSegment(node, tree, 'template-string')];
  if (ts.isTemplateExpression(node)) return templateSegments(node, tree);
  if (
    ts.isIdentifier(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isCallExpression(node)
  ) {
    return [expressionMarker()];
  }
  if (ts.isNumericLiteral(node)) {
    return [
      {
        kind: 'static',
        flavor: 'number',
        current: node.text,
        start: node.getStart(tree),
        end: node.getEnd(),
        raw: node.text,
      },
    ];
  }
  return [{ kind: 'unsupported', current: node.getText(tree) }];
}

function jsxSegments(element, tree) {
  const result = [];
  for (const child of element.children) {
    if (ts.isJsxText(child)) result.push(jsxTextSegment(child, tree));
    else if (ts.isJsxExpression(child) && child.expression) {
      if (ts.isStringLiteral(child.expression)) result.push(stringSegment(child.expression, tree));
      else if (ts.isNoSubstitutionTemplateLiteral(child.expression)) {
        result.push(stringSegment(child.expression, tree, 'template-string'));
      } else if (ts.isTemplateExpression(child.expression)) {
        result.push(...templateSegments(child.expression, tree));
      } else result.push(expressionMarker());
    } else if (
      ts.isJsxElement(child) &&
      INLINE_TAGS.has(child.openingElement.tagName.getText(tree))
    ) {
      result.push(...jsxSegments(child, tree));
    } else return [{ kind: 'unsupported', current: child.getText(tree) }];
  }
  return result;
}

function renderSegments(segments) {
  if (segments.some((segment) => segment.kind === 'unsupported')) return null;
  return segments
    .map((segment) => (segment.kind === 'expression' ? '{#}' : segment.current))
    .join('');
}

function candidateKey(candidate) {
  return JSON.stringify([
    candidate.file,
    candidate.origin,
    candidate.segments.map((segment) =>
      segment.kind === 'expression' ? '#' : `${segment.start}:${segment.end}`,
    ),
  ]);
}

async function candidatesForFile(file) {
  const absolute = path.join(ROOT, file);
  const source = await fsp.readFile(absolute, 'utf8');
  const tree = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true, sourceKind(file));
  const candidates = [];
  const keys = new Set();
  const consumed = new WeakSet();

  function add(node, origin, segments) {
    const rendered = renderSegments(segments);
    if (rendered === null) return;
    const candidate = {
      file,
      line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
      origin,
      rendered,
      segments,
      contexts: candidateContexts(node),
    };
    const key = candidateKey(candidate);
    if (!keys.has(key)) {
      keys.add(key);
      candidates.push(candidate);
    }
  }

  function markDescendants(node) {
    consumed.add(node);
    ts.forEachChild(node, markDescendants);
  }

  function visit(node) {
    if (consumed.has(node)) return;
    if (ts.isJsxElement(node)) {
      const segments = jsxSegments(node, tree);
      if (
        segments.some((segment) => segment.kind === 'expression') &&
        segments.some((segment) => segment.kind === 'static' && normalize(segment.current))
      ) {
        add(node.openingElement, 'jsx-template', segments);
        for (const child of node.children) markDescendants(child);
        return;
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      !(ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)
    ) {
      const segments = concatSegments(node, tree);
      if (segments.some((segment) => segment.kind === 'static')) add(node, 'concatenation', segments);
      return;
    }
    if (ts.isJsxText(node) && normalize(node.getText(tree))) {
      add(node, 'jsx-text', [jsxTextSegment(node, tree)]);
    } else if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      VISIBLE_ATTRIBUTES.has(node.name.getText(tree))
    ) {
      add(node.initializer, `attribute:${node.name.getText(tree)}`, [
        stringSegment(node.initializer, tree, 'jsx-attribute'),
      ]);
    } else if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateExpression(node)) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isExportDeclaration(node.parent) &&
      !ts.isJsxAttribute(node.parent) &&
      !(ts.isTemplateSpan(node.parent) && node.parent.literal === node) &&
      !(ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)
    ) {
      const segments = ts.isTemplateExpression(node)
        ? templateSegments(node, tree)
        : [
            stringSegment(
              node,
              tree,
              ts.isNoSubstitutionTemplateLiteral(node) ? 'template-string' : 'string',
            ),
          ];
      add(node, 'literal', segments);
      if (ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  }

  visit(tree);
  return { source, candidates };
}

function replacementForSegment(segment, value, preserveLeading, preserveTrailing) {
  const preserved =
    segment.flavor === 'jsx-text'
      ? replaceJsxTextPreservingLines(
          segment.current,
          value,
          preserveLeading,
          preserveTrailing,
        )
      : preserveWhitespace(segment.current, value, preserveLeading, preserveTrailing);
  if (segment.flavor === 'string') {
    return escapeString(preserved, segment.quote);
  }
  if (segment.flavor === 'template' || segment.flavor === 'template-string') {
    return escapeTemplate(preserved);
  }
  if (segment.flavor === 'jsx-attribute') {
    return preserved.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  if (segment.flavor === 'jsx-text') return escapeJsx(preserved);
  if (segment.flavor === 'number' && /^\d+(?:\.\d+)?$/.test(preserved)) return preserved;
  throw new Error(`Unsupported replacement segment flavor: ${segment.flavor}`);
}

function editsForCandidate(candidate, finalText, copyId) {
  const { parts } = placeholderParts(finalText);
  const expressionCount = candidate.segments.filter((segment) => segment.kind === 'expression').length;
  assert.equal(parts.length, expressionCount + 1, `${copyId}: placeholder count changed.`);
  const groups = [[]];
  for (const segment of candidate.segments) {
    if (segment.kind === 'expression') groups.push([]);
    else groups.at(-1).push(segment);
  }
  const edits = [];
  for (let index = 0; index < groups.length; index += 1) {
    const meaningful = groups[index].filter((segment) => normalize(segment.current));
    const runtimeWhitespace = groups[index].filter(
      (segment) => !normalize(segment.current) && segment.flavor !== 'jsx-text',
    );
    if (meaningful.length > 0) {
      for (const segment of runtimeWhitespace) {
        edits.push({
          file: candidate.file,
          start: segment.start,
          end: segment.end,
          text: replacementForSegment(segment, '', false, false),
          copyId,
        });
      }
    }
    const editable = meaningful.length > 0 ? meaningful : runtimeWhitespace;
    if (meaningful.length === 0 && editable.length > 0) {
      for (let segmentIndex = 0; segmentIndex < editable.length; segmentIndex += 1) {
        const segment = editable[segmentIndex];
        edits.push({
          file: candidate.file,
          start: segment.start,
          end: segment.end,
          text: replacementForSegment(
            segment,
            segmentIndex === 0 ? parts[index] : '',
            false,
            false,
          ),
          copyId,
        });
      }
      continue;
    }
    if (editable.length > 1) {
      const leading = parts[index].match(/^\s*/)?.[0] ?? '';
      const trailing = parts[index].match(/\s*$/)?.[0] ?? '';
      const words = normalize(parts[index]).split(/\s+/).filter(Boolean);
      let cursor = 0;
      for (let segmentIndex = 0; segmentIndex < editable.length; segmentIndex += 1) {
        const segment = editable[segmentIndex];
        const isLast = segmentIndex === editable.length - 1;
        const sourceWords = normalize(segment.current).split(/\s+/).filter(Boolean).length;
        const remainingSegments = editable.length - segmentIndex - 1;
        const availableWords = words.length - cursor;
        const take = isLast
          ? availableWords
          : Math.min(sourceWords, Math.max(0, availableWords - remainingSegments));
        let value = words.slice(cursor, cursor + Math.max(0, take)).join(' ');
        cursor += Math.max(0, take);
        if (segmentIndex === 0) value = `${leading}${value}`;
        if (!isLast && cursor < words.length) value = `${value} `;
        if (isLast) value = `${value}${trailing}`;
        edits.push({
          file: candidate.file,
          start: segment.start,
          end: segment.end,
          text: replacementForSegment(segment, value, false, false),
          copyId,
        });
      }
      continue;
    }
    if (editable.length === 0) {
      if (normalize(parts[index])) {
        throw new Error(`${copyId}: final copy introduces text at a structural-only boundary.`);
      }
      continue;
    }
    const segment = editable[0];
    edits.push({
      file: candidate.file,
      start: segment.start,
      end: segment.end,
      text: replacementForSegment(
        segment,
        parts[index],
        index === 0,
        index === groups.length - 1,
      ),
      copyId,
    });
  }
  return edits;
}

function patchForFile(file, before, after) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  assert.equal(oldLines.length, newLines.length, `${file}: language port changed line count.`);
  const changed = [];
  for (let index = 0; index < oldLines.length; index += 1) {
    if (oldLines[index] !== newLines[index]) changed.push(index);
  }
  if (changed.length === 0) return null;
  const runs = [];
  for (const index of changed) {
    const start = Math.max(0, index - 2);
    const end = Math.min(oldLines.length - 1, index + 2);
    const previous = runs.at(-1);
    if (previous && start <= previous.end + 1) previous.end = Math.max(previous.end, end);
    else runs.push({ start, end });
  }
  const hunks = runs.map(({ start, end }) => {
    const lines = ['@@'];
    for (let index = start; index <= end; index += 1) {
      if (oldLines[index] === newLines[index]) lines.push(` ${oldLines[index]}`);
      else lines.push(`-${oldLines[index]}`, `+${newLines[index]}`);
    }
    return lines.join('\n');
  });
  return `*** Update File: ${path.join(ROOT, file)}\n${hunks.join('\n')}`;
}

if (process.argv.includes('--revert-source-to-head')) {
  const changedSourceFiles = execFileSync('git', ['diff', '--name-only', '--', 'src'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const sections = [];
  for (const file of changedSourceFiles) {
    const current = await fsp.readFile(path.join(ROOT, file), 'utf8');
    const baseline = execFileSync('git', ['show', `HEAD:${file}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    const patch = patchForFile(file, current, baseline);
    if (patch) sections.push(patch);
  }
  if (sections.length > 0) {
    process.stdout.write(`*** Begin Patch\n${sections.join('\n')}\n*** End Patch\n`);
  }
  process.exit(0);
}

XLSX.set_fs(fs);
const manifestPath = path.resolve(argument('manifest'));
const reportPath = argument('report');
assert.ok(manifestPath, 'Use --manifest=<final-owner-workbook.xlsx>.');
const workbook = XLSX.readFile(manifestPath);
const sheet = workbook.Sheets['FINAL MANIFEST'];
assert.ok(sheet, 'Workbook is missing the FINAL MANIFEST sheet.');
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }).map((row) => {
  const ownerOverride = OWNER_OVERRIDES.get(row.copy_id);
  return ownerOverride ? { ...row, ...ownerOverride, owner_override: true } : row;
});
assert.equal(rows.length, 983, 'Final manifest row count changed.');

const dispositionCounts = rows.reduce((counts, row) => {
  counts[row.final_disposition] = (counts[row.final_disposition] ?? 0) + 1;
  return counts;
}, {});
assert.deepEqual(dispositionCounts, EXPECTED_DISPOSITIONS, 'Final disposition counts changed.');
for (const row of rows) {
  assert.equal(row.placeholder_check, 'PASS', `${row.copy_id}: workbook placeholder check failed.`);
  assert.deepEqual(
    placeholderParts(row.current_text).names.sort(),
    placeholderParts(row.final_polish_copy).names.sort(),
    `${row.copy_id}: owner copy changes placeholder names.`,
  );
}

const targetFiles = [
  ...new Set(
    rows
      .flatMap((row) => splitFiles(row.component_or_file))
      .filter((file) => fs.existsSync(path.join(ROOT, file))),
  ),
].sort();
const sourceByFile = new Map();
const candidatesByFile = new Map();
for (const file of targetFiles) {
  const result = await candidatesForFile(file);
  sourceByFile.set(file, result.source);
  candidatesByFile.set(file, result.candidates);
}

const edits = [];
const reconciliation = [];
for (const row of rows) {
  const files = splitFiles(row.component_or_file).filter((file) => candidatesByFile.has(file));
  const allCandidates = files.flatMap((file) => candidatesByFile.get(file));
  const currentSignature = signature(row.current_text);
  const finalSignature = signature(row.final_polish_copy);
  const currentCandidates = allCandidates.filter(
    (candidate) => signature(candidate.rendered) === currentSignature,
  );
  const finalCandidates = allCandidates.filter(
    (candidate) => signature(candidate.rendered) === finalSignature,
  );
  const expected = Number(row.occurrence_count) || 1;
  const result = {
    manifest_row: row.manifest_row,
    copy_id: row.copy_id,
    disposition: row.final_disposition,
    forensic_classification: row.forensic_classification,
    source: row.component_or_file,
    expected_occurrences: expected,
    current_candidates: currentCandidates.length,
    final_candidates: finalCandidates.length,
    outcome: null,
    resolved: [],
    reason: null,
  };

  if (row.owner_override && row.final_disposition === 'OWNER_APPROVED_CORRECTION') {
    if (finalCandidates.length >= expected) {
      result.outcome = 'OWNER_APPROVED_CORRECTION';
      result.resolved = finalCandidates.slice(0, expected).map((candidate) => ({
        file: candidate.file,
        line: candidate.line,
        from: 'owner_override',
      }));
    } else {
      result.outcome = 'BLOCKED';
      result.reason = 'Owner-approved correction is not present at the current source anchor.';
    }
    reconciliation.push(result);
    continue;
  }

  if (MOVED_AND_RESOLVED_COPY_IDS.has(row.copy_id)) {
    result.outcome = 'MOVED_AND_RESOLVED';
    result.resolved = files.map((file) => ({ file, from: 'manual_current_source_audit' }));
    result.reason = 'Manually reconciled at the current JSX/presentation anchor after source movement.';
    reconciliation.push(result);
    continue;
  }

  if (DISPLAY_MAPPED_COPY_IDS.has(row.copy_id)) {
    result.outcome = 'DISPLAY_MAPPED';
    result.resolved = files.map((file) => ({ file, from: 'manual_display_boundary_audit' }));
    result.reason = 'Runtime contract preserved and the approved wording is mapped at the presentation boundary.';
    reconciliation.push(result);
    continue;
  }

  if (row.copy_id === 'COPY-002943') {
    result.outcome = 'KEPT_CONTRACT';
    result.resolved = files.map((file) => ({ file, from: 'accepted_machine_donor_audit' }));
    result.reason =
      'The provisional contract remains unchanged for custom machines; accepted donors promoted the ten canonical machines to verified, making the old occurrence count stale.';
    reconciliation.push(result);
    continue;
  }

  if (row.final_disposition === 'KEEP_CONTRACT') {
    if (currentCandidates.length >= expected) result.outcome = 'KEPT_CONTRACT';
    else {
      result.outcome = 'BLOCKED';
      result.reason = 'Current contract value could not be resolved at every manifest source anchor.';
    }
    reconciliation.push(result);
    continue;
  }
  if (row.final_disposition === 'EXCLUDE_INTERNAL') {
    if (currentCandidates.length >= expected) result.outcome = 'EXCLUDED_INTERNAL';
    else {
      result.outcome = 'BLOCKED';
      result.reason = 'Internal-only value could not be resolved at every manifest source anchor.';
    }
    reconciliation.push(result);
    continue;
  }
  if (
    row.final_disposition === 'DISPLAY_LAYER_ONLY' &&
    row.forensic_classification !== DISPLAY_REVIEW_CLASS
  ) {
    result.outcome = 'BLOCKED';
    result.reason = 'Requires an explicit presentation mapping while preserving the source contract.';
    reconciliation.push(result);
    continue;
  }

  const ranked = [
    ...currentCandidates.map((candidate) => ({ candidate, state: 'current' })),
    ...finalCandidates.map((candidate) => ({ candidate, state: 'final' })),
  ].sort((left, right) => {
    const scoreDifference = candidateScore(row, left.candidate) - candidateScore(row, right.candidate);
    if (scoreDifference !== 0) return scoreDifference;
    // When the final copy already exists at the same source anchor, prefer it
    // over rewriting a nearby internal key that happens to share the row text.
    return left.state === right.state ? 0 : left.state === 'final' ? -1 : 1;
  });
  const selected = ranked.slice(0, expected);
  const selectedCurrent = selected
    .filter((item) => item.state === 'current')
    .map((item) => item.candidate);
  const selectedFinal = selected
    .filter((item) => item.state === 'final')
    .map((item) => item.candidate);
  if (selected.length < expected) {
    result.outcome = 'BLOCKED';
    result.reason = 'Neither current nor final presentation copy resolved at every manifest source anchor.';
    reconciliation.push(result);
    continue;
  }
  try {
    for (const candidate of selectedCurrent) {
      edits.push(...editsForCandidate(candidate, row.final_polish_copy, row.copy_id));
      result.resolved.push({ file: candidate.file, line: candidate.line, from: 'current' });
    }
    for (const candidate of selectedFinal) {
      result.resolved.push({ file: candidate.file, line: candidate.line, from: 'final' });
    }
    if (row.final_disposition === 'DISPLAY_LAYER_ONLY') result.outcome = 'DISPLAY_MAPPED';
    else if (selectedCurrent.length === 0) result.outcome = 'ALREADY_CORRECT';
    else if (row.forensic_classification === 'I. MOVED_OR_STALE_WORKBOOK_LOCATION') {
      result.outcome = 'MOVED_AND_RESOLVED';
    } else result.outcome = 'APPLIED';
  } catch (error) {
    result.outcome = 'BLOCKED';
    result.reason = error.message;
  }
  reconciliation.push(result);
}

const blockedIds = new Set(
  reconciliation.filter((row) => row.outcome === 'BLOCKED').map((row) => row.copy_id),
);
const usableEdits = edits.filter((edit) => !blockedIds.has(edit.copyId));
const editsByFile = new Map();
for (const edit of usableEdits) {
  const list = editsByFile.get(edit.file) ?? [];
  list.push(edit);
  editsByFile.set(edit.file, list);
}

const patchSections = [];
for (const [file, fileEdits] of [...editsByFile].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  const deduplicated = new Map();
  for (const edit of fileEdits) {
    const key = `${edit.start}:${edit.end}`;
    const existing = deduplicated.get(key);
    assert.ok(!existing || existing.text === edit.text, `${file}: conflicting manifest edits at ${key}.`);
    deduplicated.set(key, edit);
  }
  const sorted = [...deduplicated.values()].sort((left, right) => right.start - left.start);
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok(sorted[index - 1].start >= sorted[index].end, `${file}: overlapping manifest edits.`);
  }
  const before = sourceByFile.get(file);
  let after = before;
  for (const edit of sorted) {
    after = `${after.slice(0, edit.start)}${edit.text}${after.slice(edit.end)}`;
  }
  if (before.split('\n').length !== after.split('\n').length) {
    throw new Error(
      `${file}: language port changed line count via ${[
        ...new Set(sorted.map((edit) => edit.copyId)),
      ].join(', ')}: ${JSON.stringify(
        sorted.map((edit) => ({
          copyId: edit.copyId,
          before: before.slice(edit.start, edit.end),
          after: edit.text,
        })),
      )}.`,
    );
  }
  const patch = patchForFile(file, before, after);
  if (patch) patchSections.push(patch);
}

const outcomeCounts = reconciliation.reduce((counts, row) => {
  counts[row.outcome] = (counts[row.outcome] ?? 0) + 1;
  return counts;
}, {});
const report = {
  manifest: manifestPath,
  owner_override_ledger: [...OWNER_OVERRIDES].map(([copy_id, override]) => ({ copy_id, ...override })),
  manifest_rows: rows.length,
  disposition_counts: dispositionCounts,
  placeholder_parity: `${rows.length}/${rows.length} PASS`,
  outcome_counts: outcomeCounts,
  edit_count: usableEdits.length,
  files_changed: patchSections.length,
  rows: reconciliation,
};
if (reportPath) await fsp.writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
process.stderr.write(`${JSON.stringify({ ...report, rows: undefined }, null, 2)}\n`);
if (patchSections.length > 0) {
  process.stdout.write(`*** Begin Patch\n${patchSections.join('\n')}\n*** End Patch\n`);
}
