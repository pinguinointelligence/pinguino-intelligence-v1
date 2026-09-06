import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const read = (...segments: string[]): string =>
  fs.readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8');

const MATERIAL_SURFACES = [
  ['components', 'shared', 'friendlyLabMoment.ts'],
  ['features', 'customer-shell', 'customerShellCopy.ts'],
  ['features', 'product-scanner', 'LiveProductScanner.tsx'],
  ['features', 'product-scanner', 'scannerErrors.ts'],
  ['features', 'ingredient-builder', 'IngredientPicker.tsx'],
  ['features', 'ingredient-builder', 'ServerIngredientPicker.tsx'],
  ['features', 'pro-core', 'ProRecalcPanel.tsx'],
  ['features', 'pro-core', 'ProWorkbar.tsx'],
  ['features', 'pro-workbench', 'RecipeAxisScale.tsx'],
  ['features', 'pro-workbench', 'friendlyLabRecipeCopy.ts'],
  ['features', 'pro-workbench', 'RecipeProfilePanel.tsx'],
  ['features', 'recipes', 'useCanonicalRecipeSave.ts'],
  ['features', 'constraint-studio', 'constraintStudioCopy.ts'],
  ['features', 'constraint-studio', 'customerConstraintStudioPresentation.ts'],
  ['features', 'constraint-studio', 'previewIssueMessage.ts'],
  ['features', 'constraint-studio', 'ui', 'ConstraintPreviewCard.tsx'],
  ['features', 'pi-monitor', 'piMonitor.ts'],
  ['features', 'production-workspace', 'ProductionCockpit.tsx'],
  ['features', 'production-workspace', 'ProductionWorkspaceHeader.tsx'],
  ['features', 'production-workspace', 'useProductionWorkspace.ts'],
  ['features', 'master-label', 'LabelWorkspace.tsx'],
  ['features', 'studioFlow', 'studioFlowCopy.ts'],
  ['pages', 'destinations', 'GlobalDestinationPages.tsx'],
  ['copy', 'community.ts'],
] as const;

interface Literal {
  file: string;
  text: string;
}

const materialLiterals = (): Literal[] => {
  const literals: Literal[] = [];
  for (const segments of MATERIAL_SURFACES) {
    const source = read(...segments);
    const file = segments.join('/');
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteralLike(node)) literals.push({ file, text: node.text.trim() });
      else if (ts.isJsxText(node) && node.getText(ast).trim()) {
        literals.push({ file, text: node.getText(ast).trim() });
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return literals;
};

describe('Gellatti Friendly Lab — material runtime copy', () => {
  const literals = materialLiterals();
  const joined = literals.map(({ text }) => text).join('\n');

  it('uses Human → Truth → Next Step on the mandatory served-proof surfaces', () => {
    const expected = [
      'Jeszcze nie widzę smaku. Dodaj go poniżej i ruszamy dalej.',
      'Produkt dodany do Twojego katalogu.',
      'Jeszcze jeden krok. Potwierdź ustawienia, a potem przeliczymy recepturę.',
      'Liczymy balans receptury…',
      'Sprawdź proponowaną korektę.',
      'Perfetto. Receptura jest gotowa.',
      'Gotowe. Receptura zapisana.',
      'Sprawdź korektę i zastosuj ją, jeśli Ci odpowiada.',
      'Wszystko gotowe do rozpoczęcia partii',
      'Możemy dostosować tę partię',
      'Gellattissimo! Partia gotowa.',
      'Gotowe. Etykieta czeka na druk.',
      'Nie mamy teraz połączenia. Sprawdź sieć i spróbuj ponownie.',
    ];
    for (const text of expected) expect(joined).toContain(text);
  });

  it('removes the visible legacy phrases named in the owner brief', () => {
    expect(joined).not.toContain('Najpierw potwierdź ustawienia receptury.');
    expect(joined).not.toContain('Proponowana korekta jest gotowa do zastosowania.');
    expect(joined).not.toContain('Operacja jest zakończona.');
    expect(joined).not.toContain('Wydruk zablokowany');
    expect(joined).not.toContain('Reference-linked profile');
    expect(joined).not.toContain('PAC/POD from approved reference');
    expect(joined).not.toContain('Silnik liczy wszystko na bieżąco');
    expect(joined).not.toContain('Wynik Preview');
    expect(joined).not.toContain('zakończeniu runu');
    expect(joined).not.toContain('składniki ACTUAL');
    expect(joined).not.toContain('otwórz Preview');
  });

  it('keeps Gellatti as one gender-neutral voice', () => {
    const violations = literals.filter(({ text }) => /Gellatti\s+[a-ząćęłńóśźż]+ło\b/iu.test(text));
    expect(violations).toEqual([]);
  });

  it('reserves Italian accents for the two remaining approved positive moments', () => {
    const italian = literals.filter(({ text }) =>
      /\b(?:Mamma mia|Perfetto|Andiamo|Gellattissimo|Bellissimo)\b/i.test(text),
    );
    expect(italian).toEqual([
      {
        file: 'components/shared/friendlyLabMoment.ts',
        text: 'Gellattissimo! Partia gotowa.',
      },
      {
        file: 'features/pro-workbench/friendlyLabRecipeCopy.ts',
        text: 'Perfetto. Receptura jest gotowa.',
      },
    ]);
  });

  it('keeps Italian accents out of errors, safety, regulatory and billing copy', () => {
    const protectedCopy = [
      read('copy', 'customerError.ts'),
      read('features', 'product-scanner', 'scannerErrors.ts'),
      read('features', 'master-label', 'LabelWorkspace.tsx'),
      read('pages', 'destinations', 'SubscriptionPage.tsx'),
      read('pages', 'landing', 'landingCopy.ts'),
    ].join('\n');
    expect(protectedCopy).not.toMatch(
      /\b(?:Mamma mia|Perfetto|Andiamo|Gellattissimo|Bellissimo)\b/i,
    );
  });
});
