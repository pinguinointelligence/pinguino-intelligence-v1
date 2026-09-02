export const FRIENDLY_LAB_MESSAGE_MOTION = Object.freeze({
  entryMs: 220,
  exitMs: 220,
  informationalVisibleMs: 3_600,
  importantVisibleMs: 4_600,
});

export type FriendlyLabMessageTiming = 'progress' | 'persistent' | 'informational' | 'important';
