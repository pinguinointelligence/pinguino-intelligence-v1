import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(process.cwd(), 'src');
const RPC_NAME = 'gellatti_accept_my_partner_invitation_v1';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

describe('SOL-010 — one canonical invitation call-site', () => {
  it('keeps the Partner invitation RPC exclusively in the coordinator', () => {
    const callSites = sourceFiles(SOURCE_ROOT)
      .filter((path) => readFileSync(path, 'utf8').includes(RPC_NAME))
      .map((path) => relative(SOURCE_ROOT, path));

    expect(callSites).toEqual(['services/accountAccess/partnerInvitationCoordinator.ts']);
  });
});
