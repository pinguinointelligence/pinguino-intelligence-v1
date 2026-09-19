/// <reference types="node" />
/**
 * WORK WITH US — the owner's wording rules, enforced.
 *
 * `workWithUsLanes.ts` opens with the rules its copy may not break, and today's
 * copy follows them. Nothing enforced them, so the next edit could break one
 * with every test still green. Each block is one checklist row:
 *
 *   N-TRAIL-05  "FOB" is never published; the trailer line is the owner's exact sentence
 *   L-STORY-02  the equipment manufacturer is never named publicly, and nothing
 *               claims that Gellatti manufactures equipment
 *   L-PRICE-02  no delivered pricing; transport and taxes are left to the quote
 *   O-FRAN-02   no franchise fee, ROI, turnover, CAPEX or margin promise
 *   C-APP-13    the signed-in area is called "Partner" (owner decision 2026-09-10)
 *
 * The scan reads string literals and JSX text, never comments: the rules are
 * written down in comments on purpose, naming exactly what is banned. Admin is
 * outside the public scope, because supplier identity legitimately lives there
 * (L-STORY-02).
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  FRANCHISE_PAGE,
  FRANCHISE_SPLIT_LINE,
  LANES,
  MACHINES_PAGE,
  TRAILER_PAGE,
} from './workWithUsLanes';
import { FRANCHISE_FORMATS } from '@/features/franchise/franchiseFormats';

interface Literal {
  file: string;
  line: number;
  text: string;
}

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const SKIPPED = /(?:\.test\.|\.spec\.|\/pages\/dev\/|\/__fixtures__\/|\/__campaign__\/)/;
const ADMIN = /^src\/(?:features|pages)\/admin\//;

const sourceFiles = (): string[] => {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, item.name);
      if (item.isDirectory()) visit(full);
      else if (/\.tsx?$/.test(item.name) && !SKIPPED.test(full)) files.push(full);
    }
  };
  visit(SOURCE_ROOT);
  return files.sort();
};

const literalsOf = (absolute: string): Literal[] => {
  const source = fs.readFileSync(absolute, 'utf8');
  const file = path.relative(process.cwd(), absolute);
  const tree = ts.createSourceFile(
    absolute,
    source,
    ts.ScriptTarget.Latest,
    true,
    absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: Literal[] = [];
  const add = (node: ts.Node, text: string) => {
    const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
    found.push({ file, line, text: text.trim() });
  };
  const isModuleSpecifier = (node: ts.Node) =>
    (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) &&
    node.parent.moduleSpecifier === node;
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node)) {
      if (!isModuleSpecifier(node)) add(node, node.text);
    } else if (ts.isJsxText(node) && node.getText(tree).trim()) add(node, node.getText(tree));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
};

const PUBLIC: Literal[] = sourceFiles()
  .flatMap(literalsOf)
  .filter((literal) => !ADMIN.test(literal.file));

/** The Work With Us lanes: gateway, lane pages, enquiry forms and their copy. */
const LANE_FILE =
  /^src\/(?:copy\/workWithUsLanes\.ts|copy\/workWithUsLead\.ts|features\/franchise\/|features\/work-with-us\/|pages\/destinations\/(?:LanePage|TrailerPage|MachinesPage|MobileEquipmentPage|WorkWithUsPage)\.tsx$)/;
/** `/franchise` itself is rendered from the shared destinations module. */
const FRANCHISE_FILE = /^src\/pages\/destinations\/GlobalDestinationPages\.tsx$/;

const LANE = PUBLIC.filter((literal) => LANE_FILE.test(literal.file));
const FRANCHISE = PUBLIC.filter(
  (literal) => FRANCHISE_FILE.test(literal.file) || LANE_FILE.test(literal.file),
);

const offending = (literals: Literal[], pattern: RegExp): string[] =>
  literals
    .filter((literal) => pattern.test(literal.text))
    .map((literal) => `${literal.file}:${literal.line} ${JSON.stringify(literal.text)}`);

/** Every string reachable from a copy object, however deeply nested. */
const stringsOf = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(stringsOf)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(stringsOf)
        : [];

const TRAILER_SENTENCE =
  'Przyczepa bazowa od €10,000. Lokalizacja: Niemcy. Maszyna, wyposażenie, branding, transport i podatki dobieramy do projektu.';

const MONEY = /€\s?\d|\d\s?€|\b\d[\d\s.,]*\s?(?:zł|PLN|EUR|euro)\b/i;
// `object-[70%_center]` is a class name, not a promise.
const PERCENT = /(?<![[\w-])\d{1,3}\s?%(?![_\w\]])/;

describe('the scan itself', () => {
  it('reads the lane files it is meant to judge', () => {
    // If a lane file moves, the rules must not quietly stop applying to it.
    const files = new Set(LANE.map((literal) => literal.file));
    for (const expected of [
      'src/copy/workWithUsLanes.ts',
      'src/features/franchise/FranchiseInquiryForm.tsx',
      'src/features/franchise/franchiseFormats.ts',
      'src/features/work-with-us/LeadEnquirySection.tsx',
      'src/pages/destinations/WorkWithUsPage.tsx',
    ]) {
      expect(files).toContain(expected);
    }
    expect(PUBLIC.length).toBeGreaterThan(10_000);
  });
});

describe('N-TRAIL-05 — "FOB" is never published', () => {
  it('no public literal contains FOB', () => {
    expect(offending(PUBLIC, /\bFOB\b/i)).toEqual([]);
  });

  it("the trailer line is the owner's exact sentence, and the lane page renders it", () => {
    expect(TRAILER_PAGE.next).toBe(TRAILER_SENTENCE);
    const lanePage = fs.readFileSync(
      path.join(SOURCE_ROOT, 'pages/destinations/LanePage.tsx'),
      'utf8',
    );
    const trailerPage = fs.readFileSync(
      path.join(SOURCE_ROOT, 'pages/destinations/TrailerPage.tsx'),
      'utf8',
    );
    expect(lanePage).toContain('{copy.next}');
    expect(trailerPage).toContain('copy={TRAILER_PAGE}');
  });
});

describe('L-STORY-02 — the manufacturer stays internal', () => {
  it('no public literal names the equipment manufacturer, its brand, series or domain', () => {
    // Identity as recorded in reports/GELLATTI_MACHINE_SPEC_RECONCILIATION.md.
    const identity = /Hangzhou|Gelato Tech|milestac|Galaxy Pro|Galassia|\bMiles\b|\bMILES\b/;
    expect(offending(PUBLIC, identity)).toEqual([]);
  });

  it('nothing claims that Gellatti manufactures the equipment', () => {
    const claim =
      /(?:produkujemy|wytwarzamy|budujemy|konstruujemy)\s+(?:maszyn|sprzęt|urządze|wózk|przyczep)|(?:producent\w*|wytwórc\w*)\s+(?:maszyn|sprzętu|urządzeń|wózków|przyczep)|wyprodukowan\w* przez Gellatti|fabryk\w* Gellatti|Gellatti\s+(?:produkuje|wytwarza)|\bwe (?:manufacture|build|make) (?:our )?(?:machines|equipment|carts|trailers)\b|manufactured by Gellatti/i;
    expect(offending(PUBLIC, claim)).toEqual([]);
  });
});

describe('L-PRICE-02 — no delivered pricing', () => {
  it('no public literal quotes an Incoterm', () => {
    expect(offending(PUBLIC, /\b(?:EXW|FOB|CIF|DDP|DAP|CPT|FCA)\b/)).toEqual([]);
  });

  it('no lane literal promises delivery in the price', () => {
    const delivered =
      /z dostaw\w*|dostaw\w* w cenie|w cenie (?:jest )?(?:transport|dostaw)|z transportem|cen\w* (?:z|wraz z) (?:dostaw|transport)|darmow\w* (?:dostaw|transport)|delivered (?:price|pricing)|price includes (?:delivery|shipping)|free (?:delivery|shipping)/i;
    expect(offending(LANE, delivered)).toEqual([]);
  });

  it("the only price on the lanes is the owner's trailer sentence", () => {
    expect(offending(LANE, MONEY)).toEqual([
      `src/copy/workWithUsLanes.ts:${LANE.find((l) => l.text === TRAILER_SENTENCE)?.line} ${JSON.stringify(TRAILER_SENTENCE)}`,
    ]);
  });

  it('transport and taxes are left to the quote wherever a price is discussed', () => {
    const machinesQuote = MACHINES_PAGE.points.find((point) =>
      /wycen/i.test(point.title + point.body),
    );
    expect(machinesQuote?.body).toMatch(/Transport, podatki/);
    expect(machinesQuote?.body).toMatch(/w wycenie/);
    expect(TRAILER_PAGE.next).toContain('transport i podatki dobieramy do projektu');
  });
});

describe('O-FRAN-02 — no invented franchise promise', () => {
  it('names no fee, ROI, payback, turnover, revenue, margin, profit or CAPEX', () => {
    const promise =
      /\bROI\b|zwrot\w* (?:z )?inwestycj|okres\w* zwrotu|\bpayback\b|opłat\w* (?:franczyzow|licencyjn|wstępn|marketingow)|\broyalt|\bmarż|\bobr[oó]t|przych[oó]d|\bCAPEX\b|\bzysk|zarobi|gwarantowan|franchise fee|turnover|\bmargin|\brevenue|\bprofit/i;
    expect(offending(FRANCHISE, promise)).toEqual([]);
  });

  it('states no amount and no percentage in any franchise copy', () => {
    const franchiseCopy = [
      ...stringsOf(LANES.franchise),
      ...stringsOf(FRANCHISE_PAGE),
      ...stringsOf(FRANCHISE_FORMATS),
      FRANCHISE_SPLIT_LINE,
    ];
    expect(franchiseCopy.filter((text) => MONEY.test(text) || PERCENT.test(text))).toEqual([]);
    expect(
      offending(
        FRANCHISE.filter((l) => FRANCHISE_FILE.test(l.file)),
        MONEY,
      ),
    ).toEqual([]);
    expect(offending(FRANCHISE, PERCENT)).toEqual([]);
  });

  it('leaves terms and investment to a conversation, in so many words', () => {
    // The page asks ONE question at the end, and the line above the button is
    // where it says that the specifics are not published. Rebuilt 2026-09-18:
    // the sentence moved from the retired „Podział ról" note to the contact
    // block, and the Franchise page must still render it.
    expect(FRANCHISE_PAGE.next).toMatch(/ustalamy indywidualnie/);
    expect(FRANCHISE_SPLIT_LINE).toMatch(/Gellatti dostarcza system/);
    const franchisePage = fs.readFileSync(
      path.join(SOURCE_ROOT, 'pages/destinations/GlobalDestinationPages.tsx'),
      'utf8',
    );
    expect(franchisePage).toContain('note={FRANCHISE_PAGE.next}');
    expect(franchisePage).toContain('<FranchiseInquiryForm');
    expect(franchisePage).toContain('{FRANCHISE_SPLIT_LINE}');
  });
});

describe('C-APP-13 — the signed-in area is "Partner"', () => {
  const read = (relative: string) => fs.readFileSync(path.join(SOURCE_ROOT, relative), 'utf8');
  const partnerPage = read('pages/community/PartnerPage.tsx');

  it('the account mode switcher calls the mode Partner and opens /partner', () => {
    expect(read('features/shell/AccountModeSwitcher.tsx')).toContain(
      "partner: { label: 'Partner', to: '/partner' },",
    );
  });

  it('the dashboard is titled Partner', () => {
    expect(partnerPage).toContain('title="Partner"');
  });

  it('nothing rendered inside /partner says Affiliate', () => {
    // PartnerPage, its own feature imports, and the application status copy.
    const imported = [
      ...partnerPage.matchAll(/from '@\/(features\/(?:affiliate|partner-application)\/[^']+)'/g),
    ].map((match) => `src/${match[1]}`);
    const inside = (file: string) =>
      /^src\/pages\/community\/Partner[^/]*\.tsx$/.test(file) ||
      /^src\/features\/partner-application\//.test(file) ||
      file === 'src/copy/cooperation.ts' ||
      imported.some((module) => file === `${module}.ts` || file === `${module}.tsx`);
    expect(imported.length).toBeGreaterThan(0);
    expect(
      offending(
        PUBLIC.filter((literal) => inside(literal.file)),
        /affiliate/i,
      ),
    ).toEqual([]);
  });

  it('the affiliate copy that names the dashboard "Panel Affiliate" stays unrendered', () => {
    // `copy/affiliate.ts` still defines cta.approved, panel.openPanel and
    // state.approvedTitle / approvedBody ("Otwórz Panel Affiliate", "Jesteś w
    // programie Affiliate"). None is rendered today. Wiring one in would name
    // the signed-in area Affiliate, which the owner decided against, so it has
    // to be a decision rather than an accident.
    const renderers = sourceFiles()
      .map((absolute) => path.relative(process.cwd(), absolute))
      .filter((file) => file !== 'src/copy/affiliate.ts')
      .filter((file) => {
        const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
        return (
          source.includes("from '@/copy/affiliate'") &&
          /\bcta\.approved\b|\bopenPanel\b|\bapprovedTitle\b|\bapprovedBody\b/.test(source)
        );
      });
    expect(renderers).toEqual([]);
  });
});
