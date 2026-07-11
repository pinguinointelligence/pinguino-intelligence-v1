/**
 * In-memory Account Access adapter — the deterministic reference implementation of the
 * account-access port. It composes the PURE domain (effective-access resolver, session
 * policy, device registry, security events) + the Billing bridge over an in-memory store,
 * with injected clock + RNG so every flow is reproducible.
 *
 * This is what the browser acceptance drives while paid staging is a launch gate. The
 * production Supabase adapter mirrors this same surface against migration 0025.
 */
import type { EntitlementRow } from '@/billing/entitlements/entitlementResolver';
import { resolveAccountAccess } from './billingEntitlementBridge';
import {
  cancelOnConflict,
  confirmTakeover,
  evaluateLogin,
  revokeSession as revokeSessionPure,
} from '@/access/accountAccess/sessionPolicy';
import {
  registerOrRecognise,
  renameDevice as renameDevicePure,
  revokeDevice as revokeDevicePure,
  type DeviceObservation,
} from '@/access/accountAccess/deviceRegistry';
import { adminSecurityEvent, userSecurityEvent } from '@/access/accountAccess/securityEvents';
import type {
  AccountIdentity,
  AccountState,
  AdminRole,
  AppSession,
  DeviceRecord,
  EffectiveAccess,
  LoginEvaluation,
  PartnerStatus,
  SecurityEvent,
} from '@/access/accountAccess/contracts';

export interface AccountSeed {
  accountState?: AccountState;
  adminRole?: AdminRole;
  partnerStatus?: PartnerStatus;
  entitlementRows?: readonly EntitlementRow[];
  displayName?: string;
}

export interface BootstrapInput {
  identity: AccountIdentity;
  deviceId: string;
  deviceObs: DeviceObservation;
}

export interface BootstrapResult {
  access: EffectiveAccess;
  evaluation: LoginEvaluation;
  /** The active session when login activated/resumed; null while a conflict awaits a choice. */
  session: AppSession | null;
  device: DeviceRecord;
}

interface AccountRecord {
  accountState: AccountState;
  adminRole: AdminRole;
  partnerStatus: PartnerStatus;
  entitlementRows: EntitlementRow[];
  displayName: string;
}

let counter = 0;

export class InMemoryAccountAccess {
  private readonly accounts = new Map<string, AccountRecord>();
  private readonly devices = new Map<string, DeviceRecord[]>();
  private readonly sessions = new Map<string, AppSession[]>();
  private readonly events = new Map<string, SecurityEvent[]>();

  constructor(
    private readonly now: () => string,
    private readonly nextId: () => string = () => `id-${(counter += 1)}`,
  ) {}

  /** Seed an account (fixture/test setup). */
  seed(userId: string, seed: AccountSeed = {}): void {
    this.accounts.set(userId, {
      accountState: seed.accountState ?? 'active',
      adminRole: seed.adminRole ?? 'none',
      partnerStatus: seed.partnerStatus ?? 'none',
      entitlementRows: [...(seed.entitlementRows ?? [])],
      displayName: seed.displayName ?? 'Account',
    });
    if (!this.devices.has(userId)) this.devices.set(userId, []);
    if (!this.sessions.has(userId)) this.sessions.set(userId, []);
    if (!this.events.has(userId)) this.events.set(userId, []);
  }

  private require(userId: string): AccountRecord {
    const rec = this.accounts.get(userId);
    if (!rec) throw new Error(`unknown account ${userId}`);
    return rec;
  }

  private append(event: SecurityEvent): void {
    const list = this.events.get(event.affectedUserId) ?? [];
    if (!list.some((e) => e.correlationKey === event.correlationKey)) list.push(event);
    this.events.set(event.affectedUserId, list);
  }

  resolveAccess(userId: string, identity: AccountIdentity): EffectiveAccess {
    const rec = this.require(userId);
    return resolveAccountAccess({
      identity,
      accountState: rec.accountState,
      entitlementRows: rec.entitlementRows,
      partnerStatus: rec.partnerStatus,
      adminRole: rec.adminRole,
      now: this.now(),
    });
  }

  private activeSession(userId: string): AppSession | null {
    return (this.sessions.get(userId) ?? []).find((s) => s.state === 'active') ?? null;
  }

  /** First authenticated step: recognise the device, resolve access, evaluate the session. */
  bootstrap(input: BootstrapInput): BootstrapResult {
    const { identity, deviceId, deviceObs } = input;
    const userId = identity.userId;
    const rec = this.require(userId);
    const now = this.now();

    // device
    const devices = this.devices.get(userId) ?? [];
    const existing = devices.find((d) => d.deviceHash === deviceObs.deviceHash) ?? null;
    const device = registerOrRecognise(existing, userId, existing?.deviceId ?? deviceId, deviceObs, now);
    if (existing) Object.assign(existing, device);
    else {
      devices.push(device);
      this.append(userSecurityEvent(userId, 'device_registered', now, { deviceId: device.deviceId }));
    }
    this.devices.set(userId, devices);

    const access = this.resolveAccess(userId, identity);
    const evaluation = evaluateLogin(this.activeSession(userId), { attemptId: this.nextId(), userId, deviceId: device.deviceId, at: now }, rec.accountState);

    let session: AppSession | null = null;
    if (evaluation.outcome === 'activate' || evaluation.outcome === 'resume_same') {
      session =
        evaluation.outcome === 'resume_same'
          ? this.activeSession(userId)
          : this.startSession(userId, device.deviceId, now);
      this.append(userSecurityEvent(userId, 'login_succeeded', now, { sessionId: session?.sessionId ?? null }));
    } else if (evaluation.outcome === 'conflict') {
      this.append(userSecurityEvent(userId, 'login_conflict', now, { metadata: { conflictingSessionId: evaluation.conflictingSessionId } }));
    }
    return { access, evaluation, session, device };
  }

  private startSession(userId: string, deviceId: string, now: string): AppSession {
    const session: AppSession = {
      sessionId: this.nextId(),
      userId,
      deviceId,
      state: 'active',
      createdAt: now,
      lastActivityAt: now,
      expiresAt: null,
      revokedAt: null,
      replacedBy: null,
    };
    const list = this.sessions.get(userId) ?? [];
    list.push(session);
    this.sessions.set(userId, list);
    return session;
  }

  /** Resolve a conflict by taking over: revoke the old active session, activate a new one. */
  takeOver(userId: string, deviceId: string): AppSession {
    const now = this.now();
    const old = this.activeSession(userId);
    if (!old) return this.startSession(userId, deviceId, now);
    const result = confirmTakeover(old, { attemptId: this.nextId(), userId, deviceId, at: now }, this.nextId(), now);
    Object.assign(old, result.oldSession);
    const list = this.sessions.get(userId) ?? [];
    list.push(result.newSession);
    this.sessions.set(userId, list);
    this.append(userSecurityEvent(userId, 'session_takeover', now, { sessionId: result.newSession.sessionId, metadata: { replaced: result.oldSession.sessionId, activated: result.newSession.sessionId } }));
    return result.newSession;
  }

  /** Cancel a conflicting login — the existing session is untouched. */
  cancelLogin(userId: string, deviceId: string): AppSession {
    return cancelOnConflict({ attemptId: this.nextId(), userId, deviceId, at: this.now() }, this.now());
  }

  listDevices(userId: string): DeviceRecord[] {
    return [...(this.devices.get(userId) ?? [])];
  }
  renameDevice(userId: string, deviceId: string, name: string): DeviceRecord {
    const list = this.devices.get(userId) ?? [];
    const d = list.find((x) => x.deviceId === deviceId);
    if (!d) throw new Error('device not found');
    Object.assign(d, renameDevicePure(d, name));
    this.append(userSecurityEvent(userId, 'device_renamed', this.now(), { deviceId }));
    return d;
  }
  revokeDevice(userId: string, deviceId: string): void {
    const list = this.devices.get(userId) ?? [];
    const d = list.find((x) => x.deviceId === deviceId);
    if (!d) throw new Error('device not found');
    Object.assign(d, revokeDevicePure(d, this.now()));
    // revoke any active session bound to that device
    for (const s of this.sessions.get(userId) ?? []) {
      if (s.deviceId === deviceId) Object.assign(s, revokeSessionPure(s, this.now()));
    }
    this.append(userSecurityEvent(userId, 'device_revoked', this.now(), { deviceId }));
  }
  revokeOtherDevices(userId: string, keepDeviceId: string): number {
    let n = 0;
    for (const d of this.devices.get(userId) ?? []) {
      if (d.deviceId !== keepDeviceId && d.revokedAt === null) {
        this.revokeDevice(userId, d.deviceId);
        n += 1;
      }
    }
    return n;
  }

  listSessions(userId: string): AppSession[] {
    return [...(this.sessions.get(userId) ?? [])];
  }
  revokeSession(userId: string, sessionId: string): void {
    const s = (this.sessions.get(userId) ?? []).find((x) => x.sessionId === sessionId);
    if (!s) throw new Error('session not found');
    Object.assign(s, revokeSessionPure(s, this.now()));
    this.append(userSecurityEvent(userId, 'session_revoked', this.now(), { sessionId }));
  }
  revokeOtherSessions(userId: string, keepSessionId: string): number {
    let n = 0;
    for (const s of this.sessions.get(userId) ?? []) {
      if (s.sessionId !== keepSessionId && s.state === 'active') {
        Object.assign(s, revokeSessionPure(s, this.now()));
        n += 1;
      }
    }
    if (n > 0) this.append(userSecurityEvent(userId, 'all_sessions_revoked', this.now(), { metadata: { kept: keepSessionId } }));
    return n;
  }
  globalSignOut(userId: string): number {
    let n = 0;
    for (const s of this.sessions.get(userId) ?? []) {
      if (s.state === 'active') {
        Object.assign(s, revokeSessionPure(s, this.now()));
        n += 1;
      }
    }
    this.append(userSecurityEvent(userId, 'all_sessions_revoked', this.now(), { metadata: { global: true } }));
    return n;
  }

  listSecurityEvents(userId: string): SecurityEvent[] {
    return [...(this.events.get(userId) ?? [])];
  }

  /* ── admin controls (a privileged server path in production; local acceptance here) ── */

  adminSuspend(adminId: string, userId: string, reason: string): void {
    this.require(userId).accountState = 'suspended';
    this.globalSignOut(userId);
    this.append(adminSecurityEvent(adminId, userId, 'account_suspended', this.now(), reason));
  }
  adminRestore(adminId: string, userId: string, reason: string): void {
    this.require(userId).accountState = 'active';
    this.append(adminSecurityEvent(adminId, userId, 'account_restored', this.now(), reason));
  }
  adminRevokeSession(adminId: string, userId: string, sessionId: string, reason: string): void {
    const s = (this.sessions.get(userId) ?? []).find((x) => x.sessionId === sessionId);
    if (!s) throw new Error('session not found');
    Object.assign(s, revokeSessionPure(s, this.now()));
    this.append(adminSecurityEvent(adminId, userId, 'session_revoked', this.now(), reason, { sessionId }));
  }
}
