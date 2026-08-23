// @vitest-environment jsdom
/**
 * Verified rating — the submit/update control (§42).
 *
 * The DATABASE rules are proven live on staging (a non-maker is refused with
 * `rating_requires_confirmed_make`, the upsert keeps one active rating per
 * user). This file proves the SCREEN behaves correspondingly: that a
 * non-maker is never even offered the control, that an existing rating opens
 * pre-selected and updates rather than duplicating, and that the aggregate is
 * refreshed after a write.
 *
 * The last case is the important one: it forces the control to be refused by a
 * server that disagrees with the client, which is what makes the client's
 * `can_rate` advisory rather than authoritative.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const myRating = vi.fn<(publicationId: string) => Promise<unknown>>();
const ratePublication =
  vi.fn<(publicationId: string, stars: number, review?: string | null) => Promise<unknown>>();

vi.mock('@/services/community', () => ({
  myRating: (id: string) => myRating(id),
  ratePublication: (id: string, stars: number, review?: string | null) =>
    ratePublication(id, stars, review),
}));

const { RatePublication } = await import('./RatePublication');

const PUB = 'pub-1';
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const onRated = vi.fn();

const render = async () => {
  await act(async () => {
    root.render(<RatePublication publicationId={PUB} onRated={onRated} />);
  });
};

const stars = () => [...container.querySelectorAll('[role="radio"]')] as HTMLButtonElement[];
const submitButton = () =>
  [...container.querySelectorAll('button')].find((node) =>
    /Zapisz ocenę|Zaktualizuj ocenę|…/.test(node.textContent ?? ''),
  ) as HTMLButtonElement | undefined;

const clickStar = async (value: number) => {
  await act(async () => {
    stars()[value - 1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const clickSubmit = async () => {
  await act(async () => {
    submitButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  myRating.mockReset();
  ratePublication.mockReset();
  onRated.mockReset();
  ratePublication.mockResolvedValue({ rated: true, stars: 5 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('eligibility — a confirmed make and nothing else', () => {
  it('a maker gets the control', async () => {
    myRating.mockResolvedValue({ ok: true, can_rate: true, confirmed_makes: 1 });
    await render();
    expect(stars()).toHaveLength(5);
    expect(container.textContent).toContain('Ocena zweryfikowana');
  });

  it('a NON-maker is not offered it at all', async () => {
    myRating.mockResolvedValue({ ok: true, can_rate: false, confirmed_makes: 0 });
    await render();
    expect(stars()).toHaveLength(0);
    expect(container.textContent).toBe('');
  });

  it('viewing, copying or remixing does not qualify — only confirmed_makes does', async () => {
    // The control's only eligibility input is `can_rate`, which the server
    // derives from recipe_make_events. There is no prop for „used" or
    // „remixed", so a copy cannot make the control appear.
    myRating.mockResolvedValue({ ok: true, can_rate: false, confirmed_makes: 0 });
    await render();
    expect(stars()).toHaveLength(0);
  });

  it('renders nothing when the read fails or the user is signed out', async () => {
    myRating.mockRejectedValue(new Error('authentication required'));
    await render();
    expect(stars()).toHaveLength(0);
  });
});

describe('submitting a first rating', () => {
  beforeEach(() => {
    myRating.mockResolvedValue({ ok: true, can_rate: true, confirmed_makes: 2 });
  });

  it('offers 1–5 stars and submits the chosen value once', async () => {
    await render();
    expect(stars()).toHaveLength(5);
    expect(submitButton()?.textContent).toContain('Zapisz ocenę');

    await clickStar(4);
    expect(stars()[3]!.getAttribute('aria-checked')).toBe('true');

    myRating.mockResolvedValue({ ok: true, can_rate: true, confirmed_makes: 2, stars: 4 });
    await clickSubmit();

    expect(ratePublication).toHaveBeenCalledTimes(1);
    expect(ratePublication).toHaveBeenCalledWith(PUB, 4, undefined);
  });

  it('refreshes the aggregate after a successful write', async () => {
    await render();
    await clickStar(5);
    myRating.mockResolvedValue({ ok: true, can_rate: true, confirmed_makes: 2, stars: 5 });
    await clickSubmit();
    expect(onRated).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Zapisano ocenę.');
  });

  it('cannot submit without choosing a value', async () => {
    await render();
    expect(submitButton()?.disabled).toBe(true);
    expect(container.textContent).toContain('—');
    // and it never shows a misleading 0.0
    expect(container.textContent).not.toContain('0.0');
    expect(container.textContent).not.toContain('0 / 5');
  });
});

describe('updating an existing rating — one active rating per user', () => {
  beforeEach(() => {
    myRating.mockResolvedValue({
      ok: true,
      can_rate: true,
      confirmed_makes: 1,
      stars: 3,
      rated_at: '2026-08-20T10:00:00Z',
    });
  });

  it('opens with the current rating selected and offers an UPDATE', async () => {
    await render();
    expect(stars()[2]!.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('3 / 5');
    expect(submitButton()?.textContent).toContain('Zaktualizuj ocenę');
  });

  it('will not re-submit an unchanged rating', async () => {
    await render();
    expect(submitButton()?.disabled).toBe(true);
    expect(ratePublication).not.toHaveBeenCalled();
  });

  it('a second submit UPDATES through the same single path, never duplicating', async () => {
    await render();
    await clickStar(5);
    myRating.mockResolvedValue({ ok: true, can_rate: true, confirmed_makes: 1, stars: 5 });
    await clickSubmit();

    // one call, one path — the RPC upserts on (publication, user)
    expect(ratePublication).toHaveBeenCalledTimes(1);
    expect(ratePublication).toHaveBeenCalledWith(PUB, 5, undefined);
    expect(container.textContent).toContain('5 / 5');
    expect(submitButton()?.textContent).toContain('Zaktualizuj ocenę');
  });

  it('a double click submits once', async () => {
    await render();
    await clickStar(1);
    let release: (value: unknown) => void = () => {};
    ratePublication.mockImplementation(
      () => new Promise((resolve) => { release = resolve; }) as Promise<unknown>,
    );
    await act(async () => {
      submitButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      submitButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(ratePublication).toHaveBeenCalledTimes(1);
    await act(async () => { release({ rated: true, stars: 1 }); });
  });
});

describe('the client cannot forge eligibility', () => {
  it('a server refusal is surfaced, not swallowed', async () => {
    // A tampered client claims it may rate; the server disagrees.
    myRating.mockResolvedValue({ ok: true, can_rate: true, confirmed_makes: 0 });
    ratePublication.mockRejectedValue(new Error('rating_requires_confirmed_make'));
    await render();
    await clickStar(5);
    await clickSubmit();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Ocenić może tylko osoba, która wykonała tę recepturę.',
    );
    expect(onRated).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Zapisano ocenę.');
  });

  it('the control never sends an eligibility claim — only the id and the stars', async () => {
    myRating.mockResolvedValue({ ok: true, can_rate: true, confirmed_makes: 1 });
    await render();
    await clickStar(2);
    myRating.mockResolvedValue({ ok: true, can_rate: true, confirmed_makes: 1, stars: 2 });
    await clickSubmit();
    const [publicationId, starValue, review] = ratePublication.mock.calls[0]!;
    expect(publicationId).toBe(PUB);
    expect(starValue).toBe(2);
    expect(review).toBeUndefined();
    expect(ratePublication.mock.calls[0]).toHaveLength(3);
  });
});

describe('accessibility (§62)', () => {
  it('is a labelled radiogroup with per-star labels, not shape alone', async () => {
    myRating.mockResolvedValue({ ok: true, can_rate: true, confirmed_makes: 1, stars: 4 });
    await render();
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(
      'Ocena zweryfikowana',
    );
    expect(stars().map((node) => node.getAttribute('aria-label'))).toEqual([
      '1 / 5',
      '2 / 5',
      '3 / 5',
      '4 / 5',
      '5 / 5',
    ]);
    // the numeric value is present in text, never only as filled glyphs
    expect(container.textContent).toContain('4 / 5');
  });
});
