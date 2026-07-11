/**
 * Privacy-conscious device registry (PURE). NOT invasive fingerprinting: a device is
 * identified by a RANDOM app-generated id stored locally and registered server-side. Only
 * coarse, necessary metadata is kept (browser/OS family + friendly name), never an
 * indefinite full user-agent string.
 */
import type { DeviceCategory, DeviceRecord } from './contracts';

/** Generate a random device hash (16–64 lowercase hex) from an injected RNG (pure/testable). */
export function generateDeviceHash(randomHex: () => string): string {
  const hex = randomHex().toLowerCase().replace(/[^0-9a-f]/g, '');
  if (hex.length < 16) throw new Error('device hash RNG must yield at least 16 hex chars');
  return hex.slice(0, 64);
}

export interface DeviceObservation {
  deviceHash: string;
  friendlyName: string;
  category: DeviceCategory;
  browserFamily: string | null;
  osFamily: string | null;
}

/**
 * Register a new device or recognise a returning one. A returning device (same hash) keeps
 * its identity + trust and only bumps lastSeen; a revoked device stays revoked until a new
 * authenticated login explicitly re-registers it (revokedAt cleared).
 */
export function registerOrRecognise(
  existing: DeviceRecord | null,
  userId: string,
  deviceId: string,
  obs: DeviceObservation,
  now: string,
): DeviceRecord {
  if (existing === null) {
    return {
      deviceId,
      userId,
      deviceHash: obs.deviceHash,
      friendlyName: obs.friendlyName,
      category: obs.category,
      browserFamily: obs.browserFamily,
      osFamily: obs.osFamily,
      firstSeen: now,
      lastSeen: now,
      trusted: false,
      revokedAt: null,
    };
  }
  return { ...existing, lastSeen: now };
}

export function renameDevice(device: DeviceRecord, friendlyName: string): DeviceRecord {
  const trimmed = friendlyName.trim();
  if (trimmed === '') throw new Error('device name cannot be empty');
  return { ...device, friendlyName: trimmed.slice(0, 80) };
}

export function setDeviceTrust(device: DeviceRecord, trusted: boolean): DeviceRecord {
  return { ...device, trusted };
}

/** Revoke a device: it must not silently regain access without a fresh authenticated login. */
export function revokeDevice(device: DeviceRecord, now: string): DeviceRecord {
  return { ...device, trusted: false, revokedAt: now };
}

export function isDeviceActive(device: DeviceRecord): boolean {
  return device.revokedAt === null;
}
