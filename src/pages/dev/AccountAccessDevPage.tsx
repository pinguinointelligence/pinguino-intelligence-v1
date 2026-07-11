/**
 * DEV-ONLY Account Access acceptance harness (import.meta.env.DEV gated; never shipped).
 *
 * Drives the deterministic in-memory Account Access adapter so the whole flow — access
 * resolution, the Home/Pro/Partner mode switcher, single-active-session conflict + takeover,
 * device/session management, admin suspension and the append-only security log — can be
 * exercised in a real browser while paid staging is a launch gate. This is LOCAL / file-first
 * evidence, NOT a live-backend pass.
 */
import { useMemo, useReducer, useState } from 'react';
import type { EntitlementRow } from '@/billing/entitlements/entitlementResolver';
import { InMemoryAccountAccess, type BootstrapResult } from '@/services/accountAccess/inMemoryAccountAccess';
import type { DeviceObservation } from '@/access/accountAccess/deviceRegistry';
import type { AccountIdentity, AppMode } from '@/access/accountAccess/contracts';

interface DevDevice {
  deviceId: string;
  obs: DeviceObservation;
}

const grant = (scope: string, source: string): EntitlementRow => ({
  id: `${scope}-${source}`,
  scope,
  source_type: source,
  source_id: 's',
  starts_at: '2026-01-01T00:00:00.000Z',
  ends_at: null,
  status: 'active',
});

type PersonaKey = 'home' | 'pro' | 'partner' | 'admin' | 'suspended';
const PERSONAS: Record<PersonaKey, { label: string; userId: string }> = {
  home: { label: 'Home customer', userId: 'user-home' },
  pro: { label: 'Pro customer', userId: 'user-pro' },
  partner: { label: 'Approved partner', userId: 'user-partner' },
  admin: { label: 'Administrator', userId: 'user-admin' },
  suspended: { label: 'Suspended account', userId: 'user-susp' },
};

const identityOf = (userId: string): AccountIdentity => ({ userId, email: `${userId}@pinguino.dev`, emailVerified: true });

const DEVICE_A: DevDevice = { deviceId: 'dev-a', obs: { deviceHash: 'aaaa0000aaaa0000', friendlyName: 'Laptop', category: 'desktop', browserFamily: 'Chrome', osFamily: 'macOS' } };
const DEVICE_B: DevDevice = { deviceId: 'dev-b', obs: { deviceHash: 'bbbb1111bbbb1111', friendlyName: 'Phone', category: 'mobile', browserFamily: 'Safari', osFamily: 'iOS' } };

export function AccountAccessDevPage() {
  const svc = useMemo(() => {
    const ctr = { n: 0 };
    const s = new InMemoryAccountAccess(
      () => new Date(2026, 6, 12, 12, 0, ctr.n).toISOString(),
      () => `id-${(ctr.n += 1)}`,
    );
    s.seed('user-home', { displayName: 'Home', entitlementRows: [grant('home', 'paid_subscription')] });
    s.seed('user-pro', { displayName: 'Pro', entitlementRows: [grant('home', 'paid_subscription'), grant('pro', 'paid_subscription')] });
    s.seed('user-partner', { displayName: 'Partner', partnerStatus: 'approved', entitlementRows: [grant('home', 'approved_partner'), grant('pro', 'approved_partner'), grant('partner', 'approved_partner')] });
    s.seed('user-admin', { displayName: 'Admin', adminRole: 'super_admin', entitlementRows: [grant('pro', 'paid_subscription'), grant('home', 'paid_subscription')] });
    s.seed('user-susp', { displayName: 'Suspended', accountState: 'suspended', entitlementRows: [grant('home', 'paid_subscription'), grant('pro', 'paid_subscription')] });
    return s;
  }, []);

  const [persona, setPersona] = useState<PersonaKey>('partner');
  const [last, setLast] = useState<BootstrapResult | null>(null);
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const userId = PERSONAS[persona].userId;
  const identity = identityOf(userId);

  const login = (device: DevDevice) => {
    setLast(svc.bootstrap({ identity, deviceId: device.deviceId, deviceObs: device.obs }));
    refresh();
  };
  const act = (fn: () => void) => { fn(); refresh(); };

  const access = svc.hasAccount(userId) ? svc.resolveAccess(userId, identity) : null;
  const devices = svc.hasAccount(userId) ? svc.listDevices(userId) : [];
  const sessions = svc.hasAccount(userId) ? svc.listSessions(userId) : [];
  const events = svc.hasAccount(userId) ? svc.listSecurityEvents(userId) : [];
  const activeSession = sessions.find((s) => s.state === 'active') ?? null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-sm">
      <p className="text-xs uppercase tracking-widest opacity-60">DEV · Account Access acceptance (in-memory)</p>
      <h1 className="mt-1 text-lg font-semibold">Account · Access · Sessions · Devices</h1>
      <p className="mt-1 max-w-2xl opacity-70">Deterministic local harness over the in-memory adapter — no backend, no live data. Choose a persona, sign in from two devices to trigger the single-active-session conflict, then take over or cancel.</p>

      <section className="mt-6" aria-label="Persona">
        <label className="mr-2 font-medium" htmlFor="persona">Persona</label>
        <select id="persona" className="rounded border px-2 py-1" value={persona} onChange={(e) => { setPersona(e.target.value as PersonaKey); setLast(null); }}>
          {Object.entries(PERSONAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </section>

      <section className="mt-4 flex flex-wrap gap-2" aria-label="Actions">
        <button type="button" className="rounded border px-3 py-1" onClick={() => login(DEVICE_A)}>Sign in · Laptop</button>
        <button type="button" className="rounded border px-3 py-1" onClick={() => login(DEVICE_B)}>Sign in · Phone</button>
        <button type="button" className="rounded border px-3 py-1" disabled={last?.evaluation.outcome !== 'conflict'} onClick={() => { svc.takeOver(userId, last?.device.deviceId ?? 'dev-b'); setLast(null); refresh(); }}>Take over</button>
        <button type="button" className="rounded border px-3 py-1" disabled={!activeSession} onClick={() => act(() => svc.globalSignOut(userId))}>Global sign out</button>
        <button type="button" className="rounded border px-3 py-1" onClick={() => act(() => svc.adminSuspend('admin-op', userId, 'dev acceptance suspend'))}>Admin suspend</button>
        <button type="button" className="rounded border px-3 py-1" onClick={() => act(() => svc.adminRestore('admin-op', userId, 'dev acceptance restore'))}>Admin restore</button>
      </section>

      {last?.evaluation.outcome === 'conflict' && (
        <div role="alert" className="mt-4 rounded border border-amber-500 bg-amber-50 px-3 py-2 text-amber-900">
          Another device already has an active session. Take over to continue here, or cancel.
        </div>
      )}

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div aria-label="Effective access">
          <h2 className="font-semibold">Effective access</h2>
          {access ? (
            <ul className="mt-2 space-y-1">
              <li>Allowed modes: <strong data-testid="allowed-modes">{access.allowedModes.length ? access.allowedModes.map((m: AppMode) => m).join(' · ') : '— none —'}</strong></li>
              <li>Home {access.canHome ? '✓' : '✗'} · Pro {access.canPro ? '✓' : '✗'} · Partner {access.canPartner ? '✓' : '✗'} · Admin {access.canAdmin ? '✓' : '✗'}</li>
              <li>Exact grams {access.exactGrams ? '✓' : '✗'} · Save recipes {access.saveRecipes ? '✓' : '✗'} · Partner analytics {access.partnerAnalytics ? '✓' : '✗'}</li>
              {access.denialReasons.length > 0 && <li className="opacity-70">Reasons: {access.denialReasons.join('; ')}</li>}
            </ul>
          ) : <p className="opacity-60">no account</p>}
        </div>

        <div aria-label="Mode switcher">
          <h2 className="font-semibold">Mode switcher</h2>
          <div className="mt-2 flex gap-2">
            {(access?.allowedModes ?? []).map((m) => <span key={m} className="rounded bg-gray-200 px-2 py-1 capitalize">{m}</span>)}
            {(!access || access.allowedModes.length === 0) && <span className="opacity-60">no modes</span>}
          </div>
        </div>

        <div aria-label="Devices">
          <h2 className="font-semibold">Devices ({devices.length})</h2>
          <ul className="mt-2 space-y-1">
            {devices.map((d) => (
              <li key={d.deviceId} className="flex items-center justify-between gap-3">
                <span>{d.friendlyName} · {d.category} {d.revokedAt ? '· revoked' : ''}</span>
                <button type="button" className="rounded border px-2 text-xs" onClick={() => act(() => svc.revokeDevice(userId, d.deviceId))} disabled={!!d.revokedAt}>revoke</button>
              </li>
            ))}
            {devices.length === 0 && <li className="opacity-60">none</li>}
          </ul>
        </div>

        <div aria-label="Sessions">
          <h2 className="font-semibold">Sessions ({sessions.length})</h2>
          <ul className="mt-2 space-y-1">
            {sessions.map((s) => (
              <li key={s.sessionId} className="flex items-center justify-between gap-3">
                <span data-testid="session-row">{s.sessionId} · <strong>{s.state}</strong></span>
                <button type="button" className="rounded border px-2 text-xs" onClick={() => act(() => svc.revokeSession(userId, s.sessionId))} disabled={s.state !== 'active'}>revoke</button>
              </li>
            ))}
            {sessions.length === 0 && <li className="opacity-60">none</li>}
          </ul>
        </div>
      </section>

      <section className="mt-6" aria-label="Security history">
        <h2 className="font-semibold">Security history ({events.length}) — append-only</h2>
        <ul className="mt-2 space-y-1">
          {events.map((e, i) => (
            <li key={i} className="opacity-80">{e.occurredAt.slice(11, 19)} · {e.actorType} · <strong>{e.eventType}</strong>{e.reason ? ` · ${e.reason}` : ''}</li>
          ))}
          {events.length === 0 && <li className="opacity-60">none</li>}
        </ul>
      </section>
    </main>
  );
}
