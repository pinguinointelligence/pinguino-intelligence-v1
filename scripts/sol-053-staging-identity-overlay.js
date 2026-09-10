/**
 * SOL-053 served-staging identity proof.
 * Paste this whole file into DevTools Console on https://staging.pinguinoai.com.
 *
 * Read-only guarantees:
 * - never writes/removes Web Storage entries;
 * - never logs or renders an access/refresh token;
 * - performs only one GET for the signed-in user's own active PRO entitlement;
 * - adds one disposable Shadow DOM overlay outside the React root.
 */
void (async () => {
  'use strict';

  const OVERLAY_ID = 'sol-053-staging-identity-proof';
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const allowedHost =
    location.hostname === 'staging.pinguinoai.com' ||
    (location.hostname.endsWith('.vercel.app') && location.hostname.includes('pinguino-staging'));
  if (!allowedHost) throw new Error('SOL-053 overlay refuses to run outside served staging.');

  const authKey = Object.keys(localStorage).find((key) => /^sb-[a-z0-9]+-auth-token$/.test(key));
  if (!authKey) throw new Error('No Supabase browser session was found.');
  const projectRef = authKey.match(/^sb-([a-z0-9]+)-auth-token$/)?.[1] ?? 'unknown';
  const stored = JSON.parse(localStorage.getItem(authKey) ?? 'null');
  const session = stored?.currentSession ?? stored?.session ?? stored;
  const accessToken = typeof session?.access_token === 'string' ? session.access_token : null;
  if (!accessToken)
    throw new Error('No access token is available for the current browser session.');

  const decodePayload = (token) => {
    const encoded = token.split('.')[1];
    if (!encoded) return {};
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  };
  const claims = decodePayload(accessToken);
  const sub = typeof claims.sub === 'string' ? claims.sub : session?.user?.id;
  const sessionId = typeof claims.session_id === 'string' ? claims.session_id : null;
  const email =
    typeof claims.email === 'string'
      ? claims.email
      : typeof session?.user?.email === 'string'
        ? session.user.email
        : 'unknown';
  if (!sub || !sessionId) throw new Error('The current JWT has no sub/session_id proof claims.');

  const entitlementResponse = await fetch(
    `https://${projectRef}.supabase.co/rest/v1/entitlements?select=scope,status&user_id=eq.${encodeURIComponent(sub)}&scope=eq.pro&status=eq.active&limit=1`,
    {
      method: 'GET',
      headers: {
        apikey: accessToken,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      credentials: 'omit',
    },
  );
  if (!entitlementResponse.ok) {
    throw new Error(`PRO entitlement proof failed (${entitlementResponse.status}).`);
  }
  const entitlements = await entitlementResponse.json();
  const isPro =
    Array.isArray(entitlements) &&
    entitlements.some((row) => row?.scope === 'pro' && row?.status === 'active');
  if (!isPro) throw new Error('The current account has no active PRO entitlement.');

  const recipeRaw = localStorage.getItem('pinguino-recipe');
  const recipePersisted = recipeRaw ? JSON.parse(recipeRaw) : null;
  const recipeName = recipePersisted?.state?.savedRecipeName ?? '';
  const visibleText = `${recipeName} ${document.body.innerText}`;
  const prefix = visibleText.match(/\bC0[1-6]\b/)?.[0] ?? 'not detected';
  const short = (value) => `${value.slice(0, 8)}…${value.slice(-4)}`;

  const host = document.createElement('aside');
  host.id = OVERLAY_ID;
  host.setAttribute('aria-label', 'SOL-053 QA identity proof');
  Object.assign(host.style, {
    position: 'fixed',
    zIndex: '2147483647',
    right: '16px',
    bottom: '16px',
  });
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      section {
        width: 310px; box-sizing: border-box; padding: 14px 16px;
        border: 1px solid rgba(255,255,255,.18); border-radius: 10px;
        background: #171717; color: #f7f4ee; box-shadow: 0 12px 40px rgba(0,0,0,.28);
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      header { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
      strong { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      button { border: 0; background: transparent; color: #f7f4ee; cursor: pointer; font-size: 18px; }
      dl { display: grid; grid-template-columns: 108px 1fr; gap: 6px 10px; margin: 12px 0 0; }
      dt { color: #b8b2a8; }
      dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
      .ok { color: #c9e6c2; font-weight: 700; }
    </style>
    <section>
      <header><strong>SOL-053 · STAGING QA</strong><button type="button" aria-label="Close">×</button></header>
      <dl>
        <dt>sub</dt><dd data-field="sub"></dd>
        <dt>session_id</dt><dd data-field="session"></dd>
        <dt>e-mail</dt><dd data-field="email"></dd>
        <dt>rola</dt><dd class="ok">PRO</dd>
        <dt>Supabase ref</dt><dd data-field="project"></dd>
        <dt>aktywny prefix</dt><dd data-field="prefix"></dd>
      </dl>
    </section>`;
  shadow.querySelector('[data-field="sub"]').textContent = short(sub);
  shadow.querySelector('[data-field="session"]').textContent = short(sessionId);
  shadow.querySelector('[data-field="email"]').textContent = email;
  shadow.querySelector('[data-field="project"]').textContent = projectRef;
  shadow.querySelector('[data-field="prefix"]').textContent = prefix;
  shadow.querySelector('button')?.addEventListener('click', () => host.remove(), { once: true });
  document.body.append(host);
})();
