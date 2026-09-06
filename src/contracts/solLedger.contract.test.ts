/**
 * Structural contract for the single append-only Gellatti SOL ledger.
 *
 * This test protects numbering and recovery provenance. It does not claim that
 * a product defect is fixed; staging status still requires separate evidence.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const LEDGER_PATH = resolve(process.cwd(), 'docs', 'qa', 'GELLATTI_SOL_LEDGER.md');
const ledger = readFileSync(LEDGER_PATH, 'utf8');
const entries = [
  ...ledger.matchAll(/^- \[[ x]\] \*\*(SOL-(\d{3})) · ([A-Z_]+)(?: · ([A-Z_]+))? —/gm),
].map(([, id, number, status, category]) => ({
  id,
  number: Number(number),
  status,
  category,
}));
const designSubpoints = [
  ...ledger.matchAll(/^\s+\d+\. \*\*(SOL-(\d{3})\.(\d+)) · ([A-Z_]+) —/gm),
].map(([, id, parent, index, status]) => ({
  id,
  parent: Number(parent),
  index: Number(index),
  status,
}));

describe('Gellatti SOL ledger continuity', () => {
  it('contains every append-only ID exactly once from SOL-001 through SOL-050', () => {
    expect(entries.map(({ number }) => number)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    expect(new Set(entries.map(({ id }) => id)).size).toBe(50);
    expect(ledger).toContain(
      'IDs are append-only and are never deleted, moved, renumbered, or reused.',
    );
  });

  it('reserves SOL-051 as the next free main ID without assigning it', () => {
    expect(ledger).toContain('`NEXT_FREE_SOL_ID: SOL-051`');
    expect(entries.some(({ id }) => id === 'SOL-051')).toBe(false);
  });

  it('records no unrecovered gap after restoring SOL-034 through SOL-038', () => {
    expect(ledger).not.toContain('UNRECOVERED_LEDGER_GAP');
    for (let number = 34; number <= 38; number += 1) {
      expect(entries.some(({ id }) => id === `SOL-${String(number).padStart(3, '0')}`)).toBe(true);
    }
  });

  it('keeps SOL-014 in PR-only status until staging proof exists', () => {
    expect(entries.find(({ id }) => id === 'SOL-014')?.status).toBe(
      'RESOLVED_IN_PR_AWAITING_MERGE',
    );
    expect(ledger).toContain(
      'Status można zmienić na `RESOLVED_ON_STAGING` dopiero po zwykłym merge',
    );
  });

  it('records the Owner-accepted SOL-034 resolution on staging', () => {
    expect(entries.find(({ id }) => id === 'SOL-034')?.status).toBe('RESOLVED_ON_STAGING');
    expect(ledger).toContain('PR #204');
    expect(ledger).toContain('merge SHA `6f71ac6a`');
    expect(ledger).toContain('web PASS');
    expect(ledger).toContain('mobile PASS');
    expect(ledger).toContain('prawy podgląd dashboardu PASS');
    expect(ledger).toContain('OWNER ACCEPTED: YES');
  });

  it('records SOL-031 on staging without claiming Owner acceptance', () => {
    expect(entries.find(({ id }) => id === 'SOL-031')?.status).toBe('RESOLVED_ON_STAGING');
    expect(ledger).toContain('PR #208');
    expect(ledger).toContain('merge SHA `cc141bbec4e23ef7bd4df9824fe13075b6ded26f`');
    expect(ledger).toContain('CI merge run `34036953949` PASS');
    expect(ledger).toContain('CI aktualnego staging run `34038500307` PASS');
    expect(ledger).toContain('`OWNER QA PENDING`');
    expect(ledger).toContain('`OWNER ACCEPTED: NO`');
  });

  it('retains the confirmed SOL-039 through SOL-045 findings as TODO', () => {
    for (let number = 39; number <= 45; number += 1) {
      const id = `SOL-${String(number).padStart(3, '0')}`;
      expect(entries.find((entry) => entry.id === id)?.status).toBe('TODO');
    }

    expect(ledger).toContain('SOL-039 · TODO — HOME nie odczytywał opublikowanego werdyktu');
    expect(ledger).toContain('SOL-040 · TODO — HOME nie miał działającego etapu wykonania');
    expect(ledger).toContain('SOL-041 · TODO — frakcyjny stabilizator');
    expect(ledger).toContain('SOL-042 · TODO — odczyt kodu zależy od orientacji produktu');
    expect(ledger).toContain('SOL-043 · TODO — klient widzi surowe statusy techniczne');
    expect(ledger).toContain('SOL-044 · TODO — niejasny lifecycle prywatnego produktu');
    expect(ledger).toContain('SOL-045 · TODO — kamera komputerowa pokazuje kod zbyt rozmyty');
  });

  it('records the Owner-accepted SOL-046 resolution on canonical staging', () => {
    expect(entries.find(({ id }) => id === 'SOL-046')?.status).toBe('RESOLVED_ON_STAGING');
    expect(ledger).toContain(
      'SOL-046 · RESOLVED_ON_STAGING — komunikat o brakującej cenie jest techniczny, za długi i wyświetlany podwójnie',
    );
    expect(ledger).toContain('Wprowadź cenę dla LIME · MASTER MARTINI VARIEGATO · AJ01AQ.');
    expect(ledger).toContain('Nazwa pochodzi z aktualnej receptury, bez hardcode produktu');
    expect(ledger).toContain('staging SHA `f6778265b2bf8f302d446055417524c235eb1c84`');
    expect(ledger).toContain('matematyka kosztów nie została naruszona');
    expect(ledger).toContain('`OWNER ACCEPTED: YES`');
  });

  it('keeps the HOME and PRO DESIGN review penultimate and numbers subpoints independently', () => {
    expect(entries.find(({ id }) => id === 'SOL-047')).toMatchObject({
      status: 'TODO',
      category: 'DESIGN',
    });
    expect(ledger).toContain(
      'SOL-047 · TODO · DESIGN — końcowy, spójny przegląd wyglądu, układu i komunikacji wszystkich powierzchni klienta HOME i PRO',
    );
    expect(designSubpoints).toEqual([
      { id: 'SOL-047.1', parent: 47, index: 1, status: 'TODO' },
      { id: 'SOL-047.2', parent: 47, index: 2, status: 'TODO' },
    ]);
    expect(new Set(designSubpoints.map(({ id }) => id)).size).toBe(designSubpoints.length);
    expect(ledger).toContain('SOL-047.1 · TODO — wynik receptury w PRO');
    expect(ledger).toContain(
      'SOL-047.2 · TODO — ekran Scannera HOME odbiega od zaakceptowanego języka wizualnego HOME',
    );
    expect(ledger).toContain('`NEXT_FREE_DESIGN_SUBPOINT: SOL-047.3`');
    expect(designSubpoints.some(({ id }) => id === 'SOL-047.3')).toBe(false);
    expect(ledger).toContain('DESIGN subpoints are append-only');
    expect(ledger).toMatch(/The final stage remains the full\s+end-to-end test of every flow\./);
  });

  it('appends the two Scanner Owner QA findings without claiming either is fixed', () => {
    expect(entries.find(({ id }) => id === 'SOL-048')?.status).toBe('TODO');
    expect(entries.find(({ id }) => id === 'SOL-049')?.status).toBe('TODO');
    expect(ledger).toContain(
      'SOL-048 · TODO — Scanner pokazuje mikrosekundowe, zmieniające się komunikaty i pozwala spóźnionym odpowiedziom nadpisywać aktualny stan',
    );
    expect(ledger).toContain(
      'SOL-049 · TODO — nowy produkt rozpoznany po dokładnym EAN nie przechodzi pełnego enrichmentu i Mapper Rescue; kończy jako produkt prywatny albo automatycznie zgłoszony do weryfikacji',
    );
    expect(ledger).toContain('EAN `8411092721032`');
    expect(ledger).toContain('EAN `842617014032`');
    expect(ledger).toContain(
      'dokładny EAN → źródła/dowody → Vision/OCR → Mapper Rescue → kanoniczne bramki → Product Registry',
    );
  });

  it('retains unresolved Scanner findings as TODO pending merge and physical Owner QA', () => {
    for (const number of [24, 39, 40, 42, 43, 44, 45]) {
      const id = `SOL-${String(number).padStart(3, '0')}`;
      expect(entries.find((entry) => entry.id === id)?.status).toBe('TODO');
    }
  });

  it('appends the Owner-defined incomplete private-product lifecycle as SOL-050', () => {
    expect(entries.find(({ id }) => id === 'SOL-050')?.status).toBe('TODO');
    expect(ledger).toContain(
      'SOL-050 · TODO — prywatne produkty niegotowe nie mają własnego miejsca, kompletnego edytora ani dobrowolnej ścieżki wysłania do weryfikacji',
    );
    expect(ledger).toContain('Evidence: decyzja Ownera 2026-09-06.');
    expect(ledger).toContain('**Niegotowe**');
    expect(ledger).toContain('**Moje produkty**');
    expect(ledger).toContain('**Product Registry**');
    expect(ledger).toContain('`Wyślij do weryfikacji` jest zawsze dobrowolne');
    expect(ledger).toContain('nic nie może wysyłać się automatycznie');
    expect(ledger).toContain('profil uzyska `engineReady` i gotowość przynajmniej jednej roli');
    expect(ledger).toContain('Mapper, Engine i Product Registry nie są bezpośrednio nadpisywane');
    expect(ledger).toContain('Brak alergenów ani ceny nie zatrzymuje przejścia.');
    expect(ledger).toContain('Nie powstają duplikaty tego samego produktu użytkownika.');
  });

  it('records the proven PR #181 before PR #198 migration order', () => {
    const checkpoint = ledger.slice(
      ledger.indexOf('## SOL-014 migration dependency checkpoint'),
      ledger.indexOf('## Recovery provenance'),
    );
    const orderedAppliedVersions = [
      '20260905103024_base_only_nutrition_label_permission',
      '20260905142334_reclassify_base_only_nutrition_bindings',
      '20260906003955_mapper_lineage_current_binding',
      '20260906004154_reclassify_stale_mapper_lineage_bindings',
    ];

    let previousIndex = -1;
    for (const version of orderedAppliedVersions) {
      const nextIndex = checkpoint.indexOf(`\`${version}\``);
      expect(nextIndex).toBeGreaterThan(previousIndex);
      previousIndex = nextIndex;
    }

    expect(checkpoint).toContain('First synchronize PR #181 with current staging');
    expect(checkpoint).toContain('Only then merge #198 normally');
  });
});
