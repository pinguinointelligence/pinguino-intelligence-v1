// @vitest-environment jsdom
/**
 * OWNER QA 2026-09-07 — what the scanner is allowed to say to a customer.
 *
 * The owner photographed their own phone. The scanner had printed the authority's refusal verbatim:
 *
 *   not ready: INGREDIENTS_EVIDENCE_REQUIRED, PRODUCT_SEMANTICS_UNRESOLVED,
 *   product_semantics_unresolved, roleReadiness:REVIEW, recognition:NORMAL_INGREDIENT/BASE_ONLY
 *
 * A previous report had declared „RAW TECHNICAL MESSAGES: REMOVED" on the strength of a string
 * search over the built bundle. That is why this test renders the REAL `ScanFlow` the phone renders
 * and reads the REAL text nodes: a denylist unit test would have passed on that same day.
 *
 * The refusal itself is untouched — nothing here makes an unready product ready. Only the sentence
 * changes, and the codes stay available to logs, tests and the admin panels through `diagnostics`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDiscovery } from '@/scan-import-v2/__tests__/fakeDiscovery';

vi.mock('@/services/scanImportV2', async () => {
  const fakes = await import('@/scan-import-v2/__tests__/fakes');
  const { FakeDiscovery } = await import('@/scan-import-v2/__tests__/fakeDiscovery');
  const discovery = new FakeDiscovery();
  const p = fakes.ports({ discovery, externalTimeoutMs: 50 });
  (globalThis as Record<string, unknown>)['__scanMessageFakes'] = { discovery };
  return {
    createScanImportV2AppPorts: () => p,
    getScanImportV2AccountId: async () => 'user-1',
  };
});
vi.mock('./scanCoreCapture', () => ({
  ScanCoreCapture: { supported: () => false },
  describeCaptureError: () => 'no camera',
}));

import { ScanFlow } from './ScanFlow';

/** every token from the owner's screenshot, plus the shapes they are examples of */
const FORBIDDEN = [
  'INGREDIENTS_EVIDENCE_REQUIRED',
  'PRODUCT_SEMANTICS_UNRESOLVED',
  'product_semantics_unresolved',
  'roleReadiness',
  'recognition:',
  'NORMAL_INGREDIENT',
  'BASE_ONLY',
  'not ready:',
  'customer_product_not_ready',
  'profile_preview',
  'BASE_RECIPE',
  'ProductBehavior',
];

/** exactly what the deployed pipeline handed the client on the owner's scan */
const OWNER_REASONS = [
  'INGREDIENTS_EVIDENCE_REQUIRED',
  'PRODUCT_SEMANTICS_UNRESOLVED',
  'product_semantics_unresolved',
  'roleReadiness:REVIEW',
  'recognition:NORMAL_INGREDIENT/BASE_ONLY',
];

const UNKNOWN = '4006381333931';

describe('a customer never reads the pipeline', () => {
  let host: HTMLDivElement;
  let root: Root;
  const text = () => host.textContent ?? '';
  const discovery = () =>
    (
      (globalThis as Record<string, unknown>)['__scanMessageFakes'] as {
        discovery: FakeDiscovery;
      }
    ).discovery;

  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  const typeCode = async (code: string) => {
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Kod kreskowy z opakowania"]',
    )!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, code);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent?.trim() === 'Sprawdź')!
        .click();
    });
    await flush();
  };

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const d = discovery();
    d.sessions.clear();
    d.created.clear();
    d.calls.length = 0;
    d.notReadyReasons.clear();
    d.notReadyMissing.clear();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('the refusal the owner photographed reaches no text node on the screen', async () => {
    const d = discovery();
    d.notReadyReasons.set(UNKNOWN, OWNER_REASONS);
    /*
      The owner's own state: the authority's `criticalGaps` are what came back as "what is missing",
      and none of those codes maps to a plain field the customer can fill — so the completion form
      is empty and the screen falls through to the sentence. That fall-through is where the raw
      refusal used to be printed.
    */
    d.notReadyMissing.set(UNKNOWN, ['PRODUCT_SEMANTICS_UNRESOLVED']);
    // the code identified the product, exactly as it did for Cola Zero and Vitamin Well
    d.provider.set(UNKNOWN, { displayName: 'Napój testowy', brand: 'Marka' });

    await act(async () => {
      root.render(<ScanFlow mode="catalog" entryContext="add_product" />);
    });
    await typeCode(UNKNOWN);
    await flush();
    /*
      The refusal only exists once the authority has been ASKED, so the scan has to get that far:
      the customer has no usable photograph and types instead, the pipeline answers "not ready", and
      the screen that comes back is the one the owner photographed.
    */
    await act(async () => {
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent?.trim() === 'Wpiszę dane ręcznie')!
        .click();
    });
    await flush();
    await flush();
    // the pipeline asks the one short family question first; answering it reaches the verdict
    expect(text()).toContain('Co to za produkt?');
    await act(async () => {
      [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Inne')!.click();
    });
    await flush();
    await flush();
    expect(discovery().calls.filter((c) => c === `finalize:${UNKNOWN}`).length).toBeGreaterThan(1);

    const screen = text();
    expect(screen.length).toBeGreaterThan(0);
    for (const token of FORBIDDEN) expect(screen, `leaked: ${token}`).not.toContain(token);
    // and no SCREAMING_SNAKE code of any kind, including ones nobody has written yet
    expect(screen).not.toMatch(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/);
    // a bare uuid is never customer copy either
    expect(screen).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
    // the customer is still told what to do — silence would be its own defect
    expect(screen).toMatch(/etykiet/i);
  });

  it('the codes are still carried, for logs and the admin panels', async () => {
    const { continueDiscovery } = await import('@/scan-import-v2');
    const d = discovery();
    d.notReadyReasons.set(UNKNOWN, OWNER_REASONS);
    d.notReadyMissing.set(UNKNOWN, ['PRODUCT_SEMANTICS_UNRESOLVED']);
    const { identifyCode } = await import('@/scan-import-v2');
    const { ctx } = await import('@/scan-import-v2/__tests__/fakes');
    const identified = identifyCode({
      symbology: 'EAN-13',
      value: UNKNOWN,
      rawValue: UNKNOWN,
      confirmation: { lane: 'fast', agreeingFrames: 2, sources: ['native'] },
      evidence: { moduleNative: 2.3, fill: 0.2, mixedFormats: false },
      timing: { firstSeenAt: 0, completedAt: 200 },
      provenance: { trackId: 't1', harnessBuild: 'test' },
    });
    if (!identified.ok) throw new Error('fixture: the EAN is not valid');
    // a name exists, so the refusal under test is the readiness one, not `identity_required`
    d.provider.set(UNKNOWN, { displayName: 'Napój testowy', brand: 'Marka' });
    const researched = await d.research(identified.identity, ctx());
    if (researched.kind !== 'researched')
      throw new Error('fixture: research did not open a session');
    const result = await continueDiscovery(
      researched.session,
      { type: 'finalize', input: { customerFamily: 'other' } },
      ctx(),
      d,
    );
    expect(result.kind).toBe('discovered_pending');
    if (result.kind !== 'discovered_pending') return;
    // the refusal is unchanged and every code survives — just not on a customer screen
    expect(result.diagnostics).toEqual(OWNER_REASONS);
    expect(result.note).toBeNull();
  });
});
