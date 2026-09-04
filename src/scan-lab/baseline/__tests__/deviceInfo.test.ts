import { describe, expect, it } from 'vitest';
import { collectDeviceMeta, detectExecutionMode, parseUserAgent } from '../device/deviceInfo';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 12; SM-N975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 12; SAMSUNG SM-N975F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68',
};

describe('parseUserAgent', () => {
  it.each([
    [UA.iphoneSafari, 'iOS 26.6.1', 'Safari 26.6'],
    [UA.iphoneChrome, 'iOS 17.5', 'Chrome iOS 125.0'],
    [UA.androidChrome, 'Android 12', 'Chrome 148.0'],
    [UA.samsung, 'Android 12', 'Samsung Internet 25.0'],
    [UA.macSafari, 'macOS 10.15.7', 'Safari 17.5'],
    [UA.macChrome, 'macOS 10.15.7', 'Chrome 126.0'],
    [UA.firefox, 'Windows', 'Firefox 127.0'],
    [UA.edge, 'Windows', 'Edge 126.0'],
  ])('%s', (ua, os, browser) => {
    expect(parseUserAgent(ua)).toEqual({ os, browser });
  });
});

describe('detectExecutionMode', () => {
  const win = (standalone: boolean) =>
    ({ matchMedia: () => ({ matches: standalone }) }) as unknown as Window;
  it('detects the iOS standalone flag', () => {
    expect(
      detectExecutionMode(
        { userAgent: UA.iphoneSafari, standalone: true } as unknown as Navigator,
        win(false),
      ),
    ).toBe('standalone_pwa');
  });
  it('detects display-mode standalone', () => {
    expect(
      detectExecutionMode({ userAgent: UA.androidChrome } as unknown as Navigator, win(true)),
    ).toBe('standalone_pwa');
  });
  it('classifies Safari and Chrome tabs', () => {
    expect(
      detectExecutionMode({ userAgent: UA.iphoneSafari } as unknown as Navigator, win(false)),
    ).toBe('safari_tab');
    expect(
      detectExecutionMode({ userAgent: UA.androidChrome } as unknown as Navigator, win(false)),
    ).toBe('chrome_tab');
    expect(detectExecutionMode({ userAgent: UA.firefox } as unknown as Navigator, win(false))).toBe(
      'browser_tab',
    );
  });
});

describe('collectDeviceMeta', () => {
  it('records no identifiers and uses the injected clock', () => {
    const nav = { userAgent: UA.iphoneSafari, hardwareConcurrency: 6 } as unknown as Navigator;
    const w = {
      screen: { width: 430, height: 932 },
      devicePixelRatio: 3,
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;
    const meta = collectDeviceMeta('iPhone 15 Pro Max', nav, w, () => '2026-09-04T10:00:00.000Z');
    expect(meta).toMatchObject({
      modelLabel: 'iPhone 15 Pro Max',
      os: 'iOS 26.6.1',
      executionMode: 'safari_tab',
      deviceMemoryGb: null,
      hardwareConcurrency: 6,
      capturedAt: '2026-09-04T10:00:00.000Z',
    });
    expect(Object.keys(meta)).not.toEqual(
      expect.arrayContaining(['deviceId', 'serial', 'imei', 'macAddress', 'identifierForVendor']),
    );
    expect(JSON.stringify(meta)).not.toMatch(/deviceId|serialNumber|imei|macAddress/i);
  });
});
