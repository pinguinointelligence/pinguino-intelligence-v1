/// <reference types="node" />
/**
 * Owner decision 2026-09-17 — HOME and PRO publish to Community through the ONE
 * existing dialog, which is where the own-photo block and „Opublikuję później"
 * live. A second dialog or a second publish/upload call site would be a path
 * around that block, so this reads the real source for one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIALOG = 'src/features/community/ui/PublishToCommunityDialog.tsx';
const SERVICE = 'src/services/community.ts';

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const ALL = sources('src').map((file) => ({ file, text: readFileSync(file, 'utf8') }));

describe('Community publishing has one dialog and one photo path', () => {
  it('COMM-MOUNT-01 HOME, PRO and Production mount the same PublishToCommunityDialog', () => {
    for (const mount of [
      'src/pages/home/HomeCreatorPage.tsx',
      'src/features/community/ui/RecipeCommunityActions.tsx',
      'src/features/production-workspace/ProductionCockpit.tsx',
    ]) {
      const text = readFileSync(mount, 'utf8');
      expect(text, mount).toMatch(
        /import \{ PublishToCommunityDialog \} from '[^']*PublishToCommunityDialog'/,
      );
      expect(text, mount).toContain('<PublishToCommunityDialog');
    }
  });

  it('COMM-MOUNT-02 only that dialog publishes or uploads a Community photo', () => {
    const publishers = ALL.filter(({ text }) => /\bpublishRecipe\(/.test(text)).map(
      ({ file }) => file,
    );
    const uploaders = ALL.filter(({ text }) => /\buploadCommunityPhoto\(/.test(text)).map(
      ({ file }) => file,
    );
    expect(publishers.sort()).toEqual([DIALOG, SERVICE].sort());
    expect(uploaders.sort()).toEqual([DIALOG, SERVICE].sort());
  });
});
