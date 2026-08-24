// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductScannerV1Page } from '@/pages/products/ProductScannerV1Page';

describe('Product Scanner camera fallback', () => {
  let host: HTMLDivElement;
  let root: Root;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProductScannerV1Page />
        </MemoryRouter>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const cameraButton = () =>
    [...host.querySelectorAll('button')].find((button) => button.textContent === 'Skanuj kamerą')!;

  /**
   * Live capture sends frames without a further tap, so the privacy consent is taken
   * before the camera starts. Every camera case therefore begins with it.
   */
  const acceptPrivacy = async () => {
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => {
      checkbox.click();
    });
  };

  it('will not open the camera before the owner has accepted the privacy notice', async () => {
    expect(cameraButton().disabled).toBe(true);
  });

  it('offers upload fallback when getUserMedia is unavailable', async () => {
    await acceptPrivacy();
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    await act(async () => cameraButton().click());
    expect(host.textContent).toContain(
      'Kamera nie jest dostępna w tej przeglądarce. Dodaj zdjęcia z urządzenia.',
    );
  });

  it('reports denied camera permission without losing the upload path', async () => {
    await acceptPrivacy();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    await act(async () => {
      cameraButton().click();
      await Promise.resolve();
    });
    expect(host.textContent).toContain(
      'Nie udało się uruchomić kamery. Sprawdź uprawnienia lub dodaj zdjęcia.',
    );
    expect(host.textContent).toContain('Dodaj zdjęcia');
  });

  it('requests the rear camera without audio and keeps manual capture in troubleshooting only', async () => {
    await acceptPrivacy();
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    await act(async () => {
      cameraButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: 4 / 3 },
      },
      audio: false,
    });
    const troubleshooting = [...host.querySelectorAll('details')].find((item) =>
      item.textContent?.includes('Problem ze skanowaniem?'),
    );
    expect(troubleshooting?.textContent).toContain('Zatrzymaj jedną klatkę');
  });

  it('switches from rear to front camera in the same capture session', async () => {
    await acceptPrivacy();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    await act(async () => {
      cameraButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const rotate = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Zmień kamerę',
    )!;
    await act(async () => {
      rotate.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: 4 / 3 },
      },
      audio: false,
    });
  });

  it('stops every camera track and frame callback when the live session closes', async () => {
    await acceptPrivacy();
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
      configurable: true,
    });
    await act(async () => {
      cameraButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const close = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Zamknij',
    )!;
    await act(async () => close.click());
    expect(stop).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
