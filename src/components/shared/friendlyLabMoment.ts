import { FRIENDLY_LAB_APPLY_SUCCESS } from '@/features/pro-workbench/friendlyLabRecipeCopy';
import type { FriendlyLabMessageTiming } from './friendlyLabMotionTiming';

export type FriendlyLabMomentKind =
  | 'apply-complete'
  | 'save-complete'
  | 'production-complete'
  | 'label-ready';

export interface FriendlyLabMomentDefinition {
  title: string;
  description?: string;
  timing: Extract<FriendlyLabMessageTiming, 'informational' | 'important'>;
}

export const FRIENDLY_LAB_MOMENTS: Readonly<Record<FriendlyLabMomentKind, FriendlyLabMomentDefinition>> =
  Object.freeze({
    'apply-complete': {
      title: FRIENDLY_LAB_APPLY_SUCCESS.title,
      timing: 'informational',
    },
    'save-complete': {
      title: 'Gotowe. Receptura zapisana.',
      timing: 'informational',
    },
    'production-complete': {
      title: 'Gellattissimo! Partia gotowa.',
      timing: 'important',
    },
    'label-ready': {
      title: 'Gotowe. Etykieta czeka na druk.',
      timing: 'informational',
    },
  });

export const FRIENDLY_LAB_MOMENT_EVENT = 'gellatti:friendly-lab-moment';

export interface FriendlyLabMomentEventDetail {
  kind: FriendlyLabMomentKind;
  dedupeKey: string;
}

export function announceFriendlyLabMoment(
  kind: FriendlyLabMomentKind,
  dedupeKey: string,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<FriendlyLabMomentEventDetail>(FRIENDLY_LAB_MOMENT_EVENT, {
      detail: { kind, dedupeKey },
    }),
  );
}
