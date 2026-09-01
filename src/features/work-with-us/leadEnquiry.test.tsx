/** @vitest-environment jsdom */
/**
 * WORK WITH US — the enquiry surface behind `/work-with-us#lead`.
 *
 * Written for F-1: the three lane CTAs pointed at `#lead` while no element in
 * the app defined that id, so every button landed on the top of the gateway
 * with nothing to submit. These contracts fail if that returns in any form —
 * the anchor disappearing, the CTA no longer carrying its lane, the form
 * pretending to succeed, or a database error reaching a visitor verbatim.
 */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const submitBusinessLead = vi.fn();
vi.mock('@/services/businessLeads', () => ({
  submitBusinessLead: (...args: unknown[]) => submitBusinessLead(...args),
}));

const { LeadEnquirySection } = await import('./LeadEnquirySection');

const originalRect = Element.prototype.getBoundingClientRect;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  submitBusinessLead.mockReset();
  submitBusinessLead.mockResolvedValue({ id: 'x', reference: 'TRL-2026-00007', status: 'new' });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  // jsdom implements no layout, so scrollIntoView is absent on the element.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  // Two tests stub layout on the PROTOTYPE; leaving that in place would quietly
  // reshape every test that runs after them.
  Element.prototype.getBoundingClientRect = originalRect;
});

const mount = (entry = '/work-with-us') => {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <LeadEnquirySection />
      </MemoryRouter>,
    );
  });
  return host;
};

const field = (labelText: string): HTMLInputElement | HTMLSelectElement => {
  const label = [...host.querySelectorAll('label')].find((l) =>
    l.textContent?.includes(labelText),
  );
  if (!label) throw new Error(`no field labelled ${labelText}`);
  // useId() mints ids like ":r0:", which are not valid CSS selectors.
  const control = document.getElementById(label.htmlFor) as
    | HTMLInputElement
    | HTMLSelectElement
    | null;
  if (!control) throw new Error(`label ${labelText} points at no control`);
  return control;
};

const setValue = (control: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto =
    control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(control, value);
  act(() => control.dispatchEvent(new Event('change', { bubbles: true })));
};

/** Let the anchor's re-alignment loop run for a few animation frames. */
const frames = async (count: number) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
  }
};

const submit = async () => {
  const form = host.querySelector('form')!;
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

const fillValid = () => {
  setValue(field('Imię i nazwisko'), 'Anna Kowalska');
  setValue(field('E-mail'), 'anna@example.com');
};

describe('the anchor every lane CTA points at', () => {
  it('renders an element with id="lead"', () => {
    expect(mount().querySelector('#lead')).not.toBeNull();
  });

  it('offers all four commercial paths in customer words, never internal codes', () => {
    const options = [...mount().querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(options).toContain('Przyczepa Gellatti');
    expect(options).toContain('Maszyny i wyposażenie');
    expect(options).toContain('Wózki mobilne');
    expect(options).toContain('Franczyza');
    for (const code of ['machine', 'mobile', 'trailer', 'franchise']) {
      expect(options).not.toContain(code);
    }
  });

  it('scrolls itself into view when the URL asks for #lead', async () => {
    mount('/work-with-us#lead');
    await frames(3);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('does not scroll when the visitor merely opens the gateway', async () => {
    mount('/work-with-us');
    await frames(3);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('re-aligns while the images above it are still pushing it down', async () => {
    /**
     * Measured on staging: arriving from /machines scrolled to y=112 while the
     * section's real position was y=4127, because the gateway's images had not
     * loaded when the first scroll ran. A single scroll leaves the visitor at
     * the top of the page — the dead CTA, one step further along.
     */
    let top = 100;
    const moving = vi.fn(() => {
      top += 500; // the section keeps sliding down as content loads above it
      return { top, bottom: top + 400, left: 0, right: 0, width: 800, height: 400 } as DOMRect;
    });
    Element.prototype.getBoundingClientRect = moving;

    mount('/work-with-us#lead');
    await frames(4);

    expect((Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBeGreaterThan(1);
  });

  it('stops re-aligning once the section holds still', async () => {
    Element.prototype.getBoundingClientRect = vi.fn(
      () => ({ top: 120, bottom: 520, left: 0, right: 0, width: 800, height: 400 }) as DOMRect,
    );
    mount('/work-with-us#lead');
    await frames(10);
    const settledCalls = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls
      .length;
    await frames(10);
    // A stable page must not be scrolled again on every frame, forever.
    expect((Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      settledCalls,
    );
  });
});

describe('lane attribution', () => {
  it('preselects the subject the visitor arrived from', () => {
    mount('/work-with-us?from=%2Ftrailer#lead');
    expect((field('Czego dotyczy') as HTMLSelectElement).value).toBe('trailer');
  });

  it('records where the question started, even after the subject changes', async () => {
    mount('/work-with-us?from=%2Fmachines#lead');
    setValue(field('Czego dotyczy'), 'trailer'); // asked about the trailer, from /machines
    fillValid();
    await submit();
    expect(submitBusinessLead).toHaveBeenCalledWith(
      expect.objectContaining({ leadType: 'trailer', sourceRoute: '/machines' }),
    );
  });

  it('ignores a route it does not own rather than storing it', async () => {
    mount('/work-with-us?from=https%3A%2F%2Fevil.example%2Fx#lead');
    setValue(field('Czego dotyczy'), 'machine');
    fillValid();
    await submit();
    expect(submitBusinessLead).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRoute: '/work-with-us' }),
    );
  });

  it('sends only fields the stored authority defines', async () => {
    mount('/work-with-us?from=%2Fmobile#lead');
    fillValid();
    await submit();
    const [firstCall] = submitBusinessLead.mock.calls;
    expect(firstCall).toBeDefined();
    const sent = Object.keys(firstCall![0] as Record<string, unknown>);
    const allowed = [
      'leadType', 'fullName', 'email', 'phone', 'country', 'city', 'message',
      'sourceRoute', 'modelOrFormat', 'configuration',
    ];
    expect(sent.filter((k) => !allowed.includes(k))).toEqual([]);
  });
});

describe('it refuses honestly rather than pretending', () => {
  it('does not submit, and names the field, when the subject is unchosen', async () => {
    mount('/work-with-us'); // no lane, so nothing is preselected
    fillValid();
    await submit();
    expect(submitBusinessLead).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Wybierz, czego dotyczy zapytanie.');
  });

  it('does not submit an empty name or a malformed address', async () => {
    mount('/work-with-us?from=%2Ftrailer#lead');
    setValue(field('E-mail'), 'not-an-address');
    await submit();
    expect(submitBusinessLead).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Podaj imię i nazwisko');
    expect(host.textContent).toContain('poprawnym formacie');
  });

  it('shows no success state when the write fails', async () => {
    submitBusinessLead.mockRejectedValue(new Error('lead_email_required'));
    mount('/work-with-us?from=%2Ftrailer#lead');
    fillValid();
    await submit();
    expect(host.textContent).not.toContain('Zapytanie przyjęte');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('never shows the database its own words', async () => {
    submitBusinessLead.mockRejectedValue(new Error('lead_full_name_required'));
    mount('/work-with-us?from=%2Ftrailer#lead');
    fillValid();
    await submit();
    for (const leak of ['lead_full_name_required', 'business_leads', 'unsupported_lead_type']) {
      expect(host.textContent).not.toContain(leak);
    }
  });
});

describe('a confirmed lead is a real one', () => {
  it('shows the reference the record actually got, not a generated one', async () => {
    mount('/work-with-us?from=%2Ftrailer#lead');
    fillValid();
    await submit();
    expect(host.textContent).toContain('Zapytanie przyjęte');
    expect(host.textContent).toContain('TRL-2026-00007');
  });

  it('a second click cannot mint a second lead', async () => {
    // No canonical server-side idempotency exists for this function, so the
    // guarantee has to hold here: the handler refuses to re-enter while busy.
    let release: (v: unknown) => void = () => {};
    submitBusinessLead.mockReturnValue(new Promise((r) => { release = r; }));
    mount('/work-with-us?from=%2Ftrailer#lead');
    fillValid();
    const form = host.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(submitBusinessLead).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(async () => {
      release({ id: 'x', reference: 'TRL-2026-00008', status: 'new' });
    });
  });
});

describe('the lane CTAs reach the anchor', () => {
  it('every CTA carries its own route to the enquiry surface', () => {
    const source = readFileSync('src/pages/destinations/LanePage.tsx', 'utf8');
    // The dead form took a page's CTA to a bare "#lead" that nothing rendered.
    expect(source).not.toContain('"/work-with-us#lead"');
    expect(source).toContain('`/work-with-us?from=${encodeURIComponent(pathname)}#lead`');
    expect(source.match(/to=\{leadHref\}/g)).toHaveLength(3);
  });

  it('the gateway actually renders the section the CTAs point at', () => {
    const gateway = readFileSync('src/pages/destinations/WorkWithUsPage.tsx', 'utf8');
    expect(gateway).toContain('<LeadEnquirySection />');
  });
});
