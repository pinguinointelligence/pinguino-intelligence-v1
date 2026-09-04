import type { DeviceMeta, ExecutionMode } from '../types';

/** Parses OS and browser from the user agent. Never touches serials, MAC addresses or any unique identifier. */
export function parseUserAgent(ua: string): { os: string; browser: string } {
  let os = 'unknown';
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)[._](\d+)(?:[._](\d+))?/.exec(ua);
  const android = /Android (\d+(?:\.\d+)*)/.exec(ua);
  const mac = /Mac OS X (\d+)[._](\d+)(?:[._](\d+))?/.exec(ua);
  if (ios) os = `iOS ${ios[1]}.${ios[2]}${ios[3] ? `.${ios[3]}` : ''}`;
  else if (android) os = `Android ${android[1]}`;
  else if (mac) os = `macOS ${mac[1]}.${mac[2]}${mac[3] ? `.${mac[3]}` : ''}`;
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';

  let browser = 'unknown';
  const crios = /CriOS\/(\d+(?:\.\d+)?)/.exec(ua);
  const chrome = /Chrome\/(\d+(?:\.\d+)?)/.exec(ua);
  const edge = /EdgA?\/(\d+(?:\.\d+)?)/.exec(ua);
  const samsung = /SamsungBrowser\/(\d+(?:\.\d+)?)/.exec(ua);
  const firefox = /(?:FxiOS|Firefox)\/(\d+(?:\.\d+)?)/.exec(ua);
  const safariVersion = /Version\/(\d+(?:\.\d+)*)/.exec(ua);
  if (crios) browser = `Chrome iOS ${crios[1]}`;
  else if (samsung) browser = `Samsung Internet ${samsung[1]}`;
  else if (edge) browser = `Edge ${edge[1]}`;
  else if (
    chrome &&
    !/Safari\/[\d.]+$/.test(ua) === false &&
    /Chrome/.test(ua) &&
    !/Version\//.test(ua)
  )
    browser = `Chrome ${chrome[1]}`;
  else if (firefox) browser = `Firefox ${firefox[1]}`;
  else if (safariVersion && /Safari/.test(ua)) browser = `Safari ${safariVersion[1]}`;
  else if (chrome) browser = `Chrome ${chrome[1]}`;
  else if (/Safari/.test(ua) && ios) browser = 'Safari (standalone web app)';
  return { os, browser };
}

export function detectExecutionMode(nav: Navigator, win: Window): ExecutionMode {
  const standaloneNav = (nav as Navigator & { standalone?: boolean }).standalone === true;
  const standaloneMedia =
    typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
  if (standaloneNav || standaloneMedia) return 'standalone_pwa';
  const ua = nav.userAgent;
  if (/(?:iPhone|iPad|iPod)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua))
    return 'safari_tab';
  if (/Chrome\//.test(ua) && !/Version\//.test(ua)) return 'chrome_tab';
  return 'browser_tab';
}

export function collectDeviceMeta(
  modelLabel: string,
  nav: Navigator,
  win: Window,
  now: () => string,
): DeviceMeta {
  const { os, browser } = parseUserAgent(nav.userAgent);
  const extended = nav as Navigator & { deviceMemory?: number };
  return {
    modelLabel,
    os,
    browser,
    executionMode: detectExecutionMode(nav, win),
    userAgent: nav.userAgent,
    screen: {
      width: win.screen?.width ?? 0,
      height: win.screen?.height ?? 0,
      dpr: win.devicePixelRatio ?? 1,
    },
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    deviceMemoryGb: typeof extended.deviceMemory === 'number' ? extended.deviceMemory : null,
    capturedAt: now(),
  };
}
