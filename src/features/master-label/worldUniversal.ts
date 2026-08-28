import { escapeHtml } from './renderers/shared';

export const WORLD_INFORMATIONAL_WARNING_LINES = [
  'INTERNAL / INFORMATIONAL LABEL',
  'NOT VALIDATED FOR RETAIL SALE',
] as const;

export function worldInformationalWarningHtml(): string {
  return `<p class="contains world-information-warning"><strong>${escapeHtml(WORLD_INFORMATIONAL_WARNING_LINES[0])}</strong><br>${escapeHtml(WORLD_INFORMATIONAL_WARNING_LINES[1])}</p>`;
}
