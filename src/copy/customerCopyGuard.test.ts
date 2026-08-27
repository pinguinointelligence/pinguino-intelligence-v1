import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

interface LiteralEntry {
  file: string;
  line: number;
  text: string;
}

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const SKIPPED_PATH = /(?:\.test\.|\.spec\.|\/pages\/dev\/|\/__fixtures__\/|\/__campaign__\/)/;

const sourceFiles = (): string[] => {
  const result: string[] = [];
  const visit = (directory: string) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, item.name);
      if (item.isDirectory()) visit(fullPath);
      else if (/\.tsx?$/.test(item.name) && !SKIPPED_PATH.test(fullPath)) result.push(fullPath);
    }
  };
  visit(SOURCE_ROOT);
  return result.sort();
};

const isModuleSpecifier = (node: ts.Node): boolean =>
  (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) &&
  node.parent.moduleSpecifier === node;

const literalEntries = (): LiteralEntry[] => {
  const entries: LiteralEntry[] = [];
  for (const absolutePath of sourceFiles()) {
    const source = fs.readFileSync(absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      absolutePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      absolutePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const relative = path.relative(process.cwd(), absolutePath);
    const add = (node: ts.Node, text: string) => {
      if (isModuleSpecifier(node)) return;
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      entries.push({ file: relative, line, text: text.trim() });
    };
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteralLike(node)) add(node, node.text);
      else if (ts.isJsxText(node) && node.getText(sourceFile).trim())
        add(node, node.getText(sourceFile));
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return entries;
};

const formatEntries = (entries: LiteralEntry[]): string =>
  entries.map((entry) => `${entry.file}:${entry.line} ${JSON.stringify(entry.text)}`).join('\n');

const isPrimaryCopyFile = (file: string): boolean =>
  file.endsWith('.tsx') ||
  file.startsWith('src/copy/') ||
  /(?:Copy|copy|Presentation|presentation)\.ts$/.test(file) ||
  /\/(?:piMonitor|formulate|productSearch|practicalRecipe|mainCapability|recipeDirectionTargets|optimizationPreviewPolicy)\.ts$/.test(
    file,
  );

describe('customer copy guard', () => {
  const entries = literalEntries();

  it('keeps the retired public brand out of customer-visible literals', () => {
    const violations = entries.filter(
      (entry) =>
        /PINGÜINO|PINGUINO/.test(entry.text) &&
        !entry.text.includes('.md') &&
        !entry.text.includes('.xlsx') &&
        !/^[A-Z0-9_]+$/.test(entry.text),
    );
    expect(formatEntries(violations)).toBe('');
  });

  it('keeps the public document metadata on the Gellatti brand', () => {
    const document = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(document).toContain('<title>GELLATTI — FRIENDLY LAB</title>');
    expect(document).toContain(
      'content="GELLATTI — przyjazne laboratorium receptur lodowych. Od pomysłu do gotowej partii."',
    );
    expect(document).not.toMatch(/PINGÜINO|PINGUINO/);
  });

  it('keeps primary copy free of retired actions and internal implementation language', () => {
    const forbidden =
      /Przelicz z PI|Monitor PI|PI Calculated|class-derived|MAPPER BINDING REQUIRED|PRODUCT DATA INCOMPLETE|ACTUAL Production|immutable snapshot|canonical authority|repository unavailable|\bProductBehavior\b|\bRLS\b|\bEngine\b|\bMapper\b/;
    const diagnosticAllowlist = new Set([
      'src/copy/en.ts\0Wersja Engine',
      'src/copy/en.ts\0Rewizja Monitor/Engine',
      'src/copy/en.ts\0Engine g',
    ]);
    const violations = entries.filter(
      (entry) =>
        isPrimaryCopyFile(entry.file) &&
        !entry.file.includes('/design-review/') &&
        !diagnosticAllowlist.has(`${entry.file}\0${entry.text}`) &&
        forbidden.test(entry.text),
    );
    expect(formatEntries(violations)).toBe('');
  });

  it('allows only the four approved Italian success moments', () => {
    const italian = entries.filter((entry) =>
      /\b(?:Mamma mia|Perfetto|Andiamo|Gellattissimo|Bellissimo)\b/i.test(entry.text),
    );
    expect(italian.map(({ file, text }) => ({ file, text }))).toEqual([
      {
        file: 'src/copy/en.ts',
        text: 'Perfetto. Domyślna maszyna została zapisana.',
      },
      {
        file: 'src/features/constraint-studio/ui/ConstraintPreviewCard.tsx',
        text: 'Gellattissimo! Wybrany profil osiągnięty.',
      },
      {
        file: 'src/features/pro-workbench/RecipeProfilePanel.tsx',
        text: 'Perfetto. Receptura jest gotowa.',
      },
      {
        file: 'src/features/production-workspace/ProductionWorkspaceHeader.tsx',
        text: 'Gellattissimo! Partia gotowa.',
      },
    ]);
  });

  it('uses the canonical production start action', () => {
    const cockpit = fs.readFileSync(
      path.join(SOURCE_ROOT, 'features/production-workspace/ProductionCockpit.tsx'),
      'utf8',
    );
    expect(cockpit).toContain("'Rozpocznij partię'");
    expect(cockpit).not.toContain('Rozpocznij nową partię');
  });

  it('does not place a caught raw error message directly into primary UI state', () => {
    const violations: string[] = [];
    for (const absolutePath of sourceFiles().filter((file) => file.endsWith('.tsx'))) {
      const source = fs.readFileSync(absolutePath, 'utf8');
      if (
        /set[A-Za-z]*Error\([^\n]*(?:caught|error)\s+instanceof\s+Error\s*\?\s*(?:caught|error)\.message/.test(
          source,
        )
      ) {
        violations.push(path.relative(process.cwd(), absolutePath));
      }
    }
    expect(violations).toEqual([]);
  });
});
