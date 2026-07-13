import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  CandidateList,
  IngredientResolutionSheet,
  ResolutionLineList,
} from './ingredientResolutionView';
import {
  createResolutionState,
  openSheet,
  pickProduct,
  selectForm,
} from '../ingredientResolution';
import { NOT_ENGINE_READY_MESSAGE } from '../contracts';
import { RESOLUTION_LINE_SEEDS, pickableProduct } from '../__fixtures__/resolutionFixtures';

const render = (el: ReactElement) => renderToStaticMarkup(el);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const state = () => createResolutionState({ workingRecipeId: 'wc-1', lines: RESOLUTION_LINE_SEEDS });
const noop = () => {};

describe('ResolutionLineList', () => {
  it('lists every requirement line by its Polish ingredient name', () => {
    const t = text(render(<ResolutionLineList lines={state().lines} onOpen={noop} />));
    expect(t).toContain('Czekolada');
    expect(t).toContain('Whisky');
    expect(t).toContain('Bazylia');
  });

  it('shows the honest not-ready message on a blocked line', () => {
    const s = pickProduct(state(), 'flavor:whisky', pickableProduct('PR-FIX-WHISKY'));
    const t = text(render(<ResolutionLineList lines={s.lines} onOpen={noop} />));
    expect(t).toContain(NOT_ENGINE_READY_MESSAGE);
  });
});

describe('IngredientResolutionSheet', () => {
  const sheet = (lineId: string, s = openSheet(state(), lineId)) => (
    <IngredientResolutionSheet
      line={s.lines.find((l) => l.line.lineId === lineId)!}
      onSelectForm={noop}
      onAction={noop}
      onPickCandidate={noop}
      onSearch={noop}
      searchQuery=""
      onSearchQueryChange={noop}
      onClose={noop}
    />
  );

  it('shows the FIVE fresh/herb forms for a herb line before any product action', () => {
    const t = text(render(sheet('flavor:basil')));
    for (const label of ['świeża', 'suszona', 'pasta', 'ekstrakt', 'napar']) {
      expect(t).toContain(label);
    }
    // product actions are hidden during the form step
    expect(t).not.toContain('Wyszukaj w katalogu');
  });

  it('shows all Polish actions for a non-herb line (with candidates)', () => {
    const t = text(render(sheet('flavor:chocolate')));
    for (const label of [
      'Wybierz produkt',
      'Wyszukaj w katalogu',
      'Skanuj etykietę',
      'Dodaj produkt ręcznie',
      'Nie mam tego składnika',
      'Zastąp składnik',
      'Po co jest ten składnik?',
    ]) {
      expect(t).toContain(label);
    }
  });

  it('hides `Wybierz produkt` when the line has no attached candidates', () => {
    const t = text(render(sheet('flavor:whisky')));
    expect(t).not.toContain('Wybierz produkt');
    expect(t).toContain('Wyszukaj w katalogu');
  });

  it('after picking a form, the herb line shows the action list', () => {
    let s = openSheet(state(), 'flavor:basil');
    s = selectForm(s, 'flavor:basil', 'napar');
    const t = text(render(sheet('flavor:basil', s)));
    expect(t).toContain('Wyszukaj w katalogu');
  });
});

describe('CandidateList', () => {
  it('renders an honest empty state when there are no matches', () => {
    const t = text(render(<CandidateList candidates={[]} onPick={noop} />));
    expect(t).toContain('Brak dopasowań');
  });

  it('renders candidate names with their concrete match reason', () => {
    const t = text(
      render(
        <CandidateList
          candidates={[{ productId: 'A', displayName: 'Ciemna czekolada 70%', matchedOn: 'exact_name' }]}
          onPick={noop}
        />,
      ),
    );
    expect(t).toContain('Ciemna czekolada 70%');
    expect(t).toContain('dokładna nazwa');
  });
});
