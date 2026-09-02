import { describe, expect, it } from 'vitest';
import { RollingBestFrameWindow } from './rollingBestFrame';

describe('rolling best-readable frame window', () => {
  it('uses the best readable frame after a bounded window without a perfect frame', () => {
    const window = new RollingBestFrameWindow<string>(700);
    window.offer({ value: 'soft', score: 38, readable: true, capturedAt: 0 });
    window.offer({ value: 'best-medium', score: 57, readable: true, capturedAt: 220 });
    window.offer({ value: 'later-worse', score: 44, readable: true, capturedAt: 520 });

    expect(window.takeReady(699)).toBeNull();
    expect(window.takeReady(700)?.value).toBe('best-medium');
  });

  it('does not let an unreadable high score displace readable evidence', () => {
    const window = new RollingBestFrameWindow<string>(500);
    window.offer({ value: 'readable', score: 42, readable: true, capturedAt: 0 });
    window.offer({ value: 'glare', score: 90, readable: false, capturedAt: 200 });
    expect(window.takeReady(500)?.value).toBe('readable');
  });

  it('resets cleanly when the requested package surface changes', () => {
    const window = new RollingBestFrameWindow<string>(500);
    window.offer({ value: 'front', score: 60, readable: true, capturedAt: 0 });
    window.reset();
    expect(window.takeReady(900)).toBeNull();
    window.offer({ value: 'nutrition', score: 48, readable: true, capturedAt: 900 });
    expect(window.takeReady(1400)?.value).toBe('nutrition');
  });
});
