/**
 * OWNER ACCEPTANCE — the items from the Scanner QA list that were not yet pinned by a contract.
 * (3,4,5,6,7,11,12 are pinned by rotatedCropSOL042, desktopCameraSOL045, customerSafeNotice,
 *  canonicalScannerEntries, scanFlow.boundary and edgeFunctionSourceImports.)
 *
 *  1. the same phone, guest and signed in — identical camera profile, crop and transform
 *  2. the zoom does not change after 5, 15 and 30 seconds
 *  8. a private, READY product can be added to a recipe
 *  9. a found product reaches the recipe and is not dropped afterwards
 * 10. a NOT-ready product never shows a falsely active "add"
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TargetStateMachine } from '@/scan-core/stateMachine';
import { Tracker } from '@/scan-core/track';

const FLOW = readFileSync('src/features/scan-flow/ScanFlow.tsx', 'utf8');
const CAPTURE = readFileSync('src/features/scan-flow/scanCoreCapture.ts', 'utf8');

describe('1 — one camera for every entry', () => {
  it('the capture asks for the SAME profile however the scanner was opened', () => {
    /*
      The proof that matters is a negative one: no constraint, plane, crop or transform anywhere in
      the capture depends on the entry or on who is signed in. If any of these ever appears next to
      `entryContext` or an auth check, this test is the thing that notices.
    */
    const open = CAPTURE.slice(CAPTURE.indexOf('async start('), CAPTURE.indexOf('sendCameraState'));
    expect(open).toContain('width: 1920');
    expect(open).toContain('height: 1080');
    expect(open).toContain("facingMode: 'environment'");
    for (const forbidden of ['entryContext', 'accountId', 'signedIn', 'guest', 'isAuthed'])
      expect(open, `camera profile must not branch on ${forbidden}`).not.toContain(forbidden);
  });

  it('the video box and its transform are one declaration, shared by every mount', () => {
    // exactly one <video>, one class list, one transform rule — so no entry can style it differently
    expect(FLOW.match(/<video/g) ?? []).toHaveLength(1);
    expect(FLOW.match(/aspect-\[3\/4\] w-full object-cover sm:aspect-video/g) ?? []).toHaveLength(
      1,
    );
    // the only transform is the user-facing mirror, and it is decided by the CAMERA, not the entry
    const styles = FLOW.match(/transform: 'scaleX\(-1\)'/g) ?? [];
    expect(styles.length).toBeGreaterThan(0);
    expect(FLOW).toContain('onMirror: (m) => setMirrorPreview(m)');
    expect(FLOW).not.toMatch(/entryContext[^\n]*scaleX/);
  });

  it('and the guest gets the same capture object as everyone else', () => {
    // ScanCoreCapture is constructed once, with handlers only — no per-entry configuration
    const ctor = FLOW.slice(
      FLOW.indexOf('new ScanCoreCapture('),
      FLOW.indexOf('new ScanCoreCapture(') + 700,
    );
    expect(ctor).not.toContain('entry');
    expect(ctor).not.toContain('guest');
  });
});

describe('2 — the zoom does not creep', () => {
  const cand = (cx = 540, cy = 960, w = 120) => ({
    cx,
    cy,
    widthPx: w,
    heightPx: Math.round(w / 3),
    angleDeg: 0,
    score: 0.9,
  });

  it('emits no camera zoom at 5 s, 15 s or 30 s of continuous "move closer"', () => {
    const tr = new Tracker();
    const sm = new TargetStateMachine();
    const seen: string[] = [];
    for (let tMs = 0; tMs <= 30_000; tMs += 250) {
      tr.update(tMs, tMs, [cand() as never]);
      const out = sm.step({
        tMs,
        frameIndex: tMs,
        primary: tr.primary(1080, 1920),
        guidance: 'move_closer',
        meanLuma: 130,
        torchAvailable: false,
        torchOn: false,
        zoomAvailable: true,
        zoomApproved: true,
        zoomLevel: 1,
        refocusAvailable: false,
        readThisFrame: false,
        unstable: false,
        timedOut: false,
      } as never);
      if ([5_000, 15_000, 30_000].includes(tMs)) seen.push(`${tMs}:${out.action}`);
      expect(out.action, `action at ${tMs} ms`).not.toBe('zoom_step');
    }
    expect(seen).toEqual(['5000:none', '15000:none', '30000:none']);
  });

  it('and the capture has no code left that could raise the zoom', () => {
    expect(CAPTURE).not.toContain('ZOOM_STEP_FACTOR');
    // the action name survives only in the type union it shares with the engine; NOTHING acts on it
    expect(CAPTURE).not.toMatch(/action === 'zoom_step'/);
    expect(CAPTURE).not.toContain('setZoom(target)');
    // a session explicitly returns the camera to 1x rather than inheriting the last one
    expect(CAPTURE).toContain('this.zoomLevel = 1;');
    expect(CAPTURE).toContain('await this.camera.setZoom(1)');
  });
});

describe('8 / 9 / 10 — adding a found product to a recipe', () => {
  it('10 — the add button is disabled exactly when the product is not ready', () => {
    const block = FLOW.slice(
      FLOW.indexOf("mode === 'recipe' && onResolved"),
      FLOW.indexOf('const againButton'),
    );
    expect(block).toContain('disabled={!engineReady || busy}');
    // ...and the customer is told why, in their own language
    expect(block).toContain(
      'Ten produkt nie ma jeszcze wszystkich danych potrzebnych do receptury.',
    );
    // the sentence must not name a module, a status or an id
    expect(block).not.toMatch(/BASE_RECIPE|ProductBehavior|Mapper|roleReadiness/);
  });

  it('8 — a private product is offered on exactly the same terms as a shared one', () => {
    // there is ONE readiness input to the button; nothing about visibility or ownership gates it
    const block = FLOW.slice(
      FLOW.indexOf("mode === 'recipe' && onResolved"),
      FLOW.indexOf('const againButton'),
    );
    for (const forbidden of ['visibility', 'shared', 'private', 'PM-ING', 'PR-ING', 'owning'])
      expect(block, `the add button must not branch on ${forbidden}`).not.toContain(forbidden);
  });

  it('9 — the resolved product is handed to the recipe by identity, not by a rendered label', () => {
    // onResolved receives the resolved product object; a line built from a display string would not
    // survive a recalculation, which is what item 9 is about
    expect(FLOW).toContain('onClick={() => onResolved(resolved)}');
  });
});
