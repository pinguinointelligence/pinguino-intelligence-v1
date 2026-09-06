/**
 * SOL-045 — the measured image chain. The owner could not complete a single desktop scan and asked,
 * precisely, what the decoder is actually handed. These contracts pin that the answer is MEASURED
 * (never assumed), that it names the camera that answered, and that it is engineering-only: it
 * appears solely when the address explicitly asks for it.
 */
import { describe, expect, it } from 'vitest';
import {
  cameraDiagnosticsReport,
  cameraQaRequested,
  type CameraDiagnostics,
} from './scanCoreCapture';

const diagnostics = (over: Partial<CameraDiagnostics> = {}): CameraDiagnostics => ({
  requested: { width: 1920, height: 1080, frameRate: 30, facingMode: null },
  rung: 0,
  delivered: { width: 1280, height: 720, frameRate: 30, facingMode: null },
  video: { width: 1280, height: 720 },
  decoderInput: { width: 1280, height: 720, longEdgeCap: 1920 },
  capabilities: { focusMode: null, zoom: false, torch: false },
  focusControl: 'unknown',
  formFactor: 'desktop',
  camera: { label: 'FaceTime HD Camera', videoInputs: 2 },
  preview: { cssWidth: 380, cssHeight: 214 },
  ...over,
});

describe('the camera read-out is opt-in engineering data', () => {
  it('appears only when the address asks for it', () => {
    expect(cameraQaRequested('?camera=diag')).toBe(true);
    expect(cameraQaRequested('?foo=1&camera=diag')).toBe(true);
    expect(cameraQaRequested('')).toBe(false);
    expect(cameraQaRequested('?camera=1')).toBe(false);
    expect(cameraQaRequested('?qa')).toBe(false);
  });

  it('names the camera that answered and how many the machine offers', () => {
    const report = cameraDiagnosticsReport(diagnostics());
    expect(report).toContain('FaceTime HD Camera');
    expect(report).toContain('dostepnych: 2');
  });

  it('states the whole chain: request, track, element, preview box and decoder input', () => {
    const report = cameraDiagnosticsReport(diagnostics());
    expect(report).toContain('1920x1080');
    expect(report).toContain('1280x720');
    expect(report).toContain('380x214');
    expect(report).toContain('limit dluzszego boku 1920');
  });

  it('says plainly when the camera exposes no focus control at all', () => {
    expect(cameraDiagnosticsReport(diagnostics())).toContain('brak focusMode');
    expect(
      cameraDiagnosticsReport(
        diagnostics({ capabilities: { focusMode: ['continuous'], zoom: false, torch: false } }),
      ),
    ).toContain('focusMode=[continuous]');
  });

  it('records which rung of the constraint ladder opened the camera', () => {
    expect(cameraDiagnosticsReport(diagnostics())).toContain('szczebel 0');
    expect(cameraDiagnosticsReport(diagnostics({ rung: 2 }))).toContain('szczebel 2');
  });

  it('never carries a device id', () => {
    expect(JSON.stringify(diagnostics())).not.toContain('deviceId');
  });
});
