# PINGÜINO Intelligence — Mac migration handoff

Date: 2026-08-18

## Canonical continuation point

- Repository: `https://github.com/pinguinointelligence/pinguino-intelligence-v1.git`
- Branch: `codex/main-state-frontier-repair`
- Base: `origin/staging` at `e0a1c1e14612f4f881a4b69d3bdd34f6a4596985`
- Production deployment: **not performed**
- Staging deployment: **not part of this migration checkpoint**
- Protected Mapper Basement: **not modified by this branch**

This branch is the continuation point for the current Main-state/frontier repair. It includes:

- Main role and gram/percent lock independence;
- positive Standard ingredient preservation and explicit removal authorization;
- exhaustive whole-gram Main frontier search and proof validation;
- correct Multi-Main ratios, locked and required-line handling;
- truthful Preview diagnostics with per-metric residual movement;
- proposed-product ProductBehavior authority before Apply;
- guarded Apply/Undo state restoration and stale/forged-preview rejection;
- regression coverage for the reported Inulin, Watermelon, Kiwi, lock/Main and diagnostic Preview failures.

The detailed feature ledgers are in:

- `reports/MAIN_ROLE_LOCK_REPAIR.md`
- `reports/STANDARD_PRESENCE_REPAIR.md`
- `reports/EXTREME_MAIN_FRONTIER_REPAIR.md`
- `reports/PREVIEW_TRUTH_REPAIR.md`
- `reports/CORRECTION_PRODUCTBEHAVIOR_REPAIR.md`
- `reports/FINAL_SERVED_MAIN_RETEST.md`

## Verification completed on Windows

- Focused post-format regression gate: 8 files / 171 tests passed.
- Full Vitest gate: 511 files / 6453 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed (no new lint errors; existing Fast Refresh warnings remain non-fatal).
- `npm run build`: passed; Vite emitted the existing large-chunk advisory.
- `npm run recipes:validate`: passed, 2500/2500 source rows imported.
- `npm run process:validate`: passed, 2088/2088 Mapper IDs aligned.
- `npm run products:audit`: passed; Mapper SHA-256 remained `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`.
- `npm audit --audit-level=high`: passed, 0 vulnerabilities.
- `git diff --check`: passed before this report was added.

The full test run emitted the known non-fatal OCR resource message `failed to load ./ita.special-words`; the suite still exited successfully.

## Windows-only working-copy inventory

The Windows repository has 71 registered Git worktrees; 27 were dirty at migration time. Only the canonical branch above is being checkpointed automatically. The other worktrees are deliberately not committed or merged because they contain old experiments, parallel task slices, or protected Mapper changes.

| Worktree / branch                                                               | Tracked | Untracked | Migration note                                         |
| ------------------------------------------------------------------------------- | ------: | --------: | ------------------------------------------------------ |
| root — `codex/protein-gelato-final`                                             |       5 |        30 | Contains protected Mapper changes; do not auto-commit. |
| `vegan-engine-worktree` — `codex/vegan-gelato-final`                            |       0 |         1 | Local artifact.                                        |
| `assistant-local-apply` — `slice/assistant-local-apply`                         |      14 |         0 | Historical slice.                                      |
| `billing-domain-logic` — `slice/billing-domain-logic`                           |      14 |         0 | Historical slice.                                      |
| `billing-schema-entitlements` — `slice/billing-schema-entitlements`             |      14 |         0 | Historical slice.                                      |
| `billing-stripe-surface` — `slice/billing-stripe-surface`                       |      14 |         0 | Historical slice.                                      |
| `contextual-learning-process-guide` — `codex/contextual-learning-process-guide` |       0 |         1 | Local artifact.                                        |
| `final-integration-deploy-2026-08` — `codex/final-integration-deploy-2026-08`   |       1 |         1 | Review separately.                                     |
| `final-pro-owner-reconstruction` — `codex/final-pro-owner-reconstruction`       |       0 |         2 | Local artifacts.                                       |
| `ingredient-table-ux` — `codex/ingredient-table-ux`                             |       0 |         1 | Local artifact.                                        |
| `lost-legendary-inspiration` — `codex/lost-legendary-inspiration`               |       7 |         4 | Separate Recipe Library work.                          |
| `ocr-label-intake-completion` — `slice/ocr-label-intake-completion`             |      14 |         0 | Historical slice.                                      |
| `ocr-migrations-ui` — `slice/ocr-migrations-ui`                                 |      21 |         0 | Historical slice.                                      |
| `ocr-provider-extraction` — `slice/ocr-provider-extraction`                     |      21 |         0 | Historical slice.                                      |
| `ocr-session-dedup-batch` — `slice/ocr-session-dedup-batch`                     |      21 |         0 | Historical slice.                                      |
| `p0-base-audit` — detached                                                      |       1 |         0 | Read-only/audit residue; inspect before recovery.      |
| `p0-process-guide-entry` — `codex/p0-process-guide-entry`                       |       0 |         4 | Local artifacts.                                       |
| `pro-monitor-ux` — `codex/pro-monitor-ux`                                       |       0 |         1 | Local artifact.                                        |
| `pro-profile-preflight` — `codex/pro-profile-preflight`                         |       0 |         1 | Local artifact.                                        |
| `agent-a1e802426801972bb`                                                       |      31 |         0 | Claude agent worktree; do not merge automatically.     |
| `agent-a876faa573c47cc52`                                                       |    1107 |        21 | Large Claude agent worktree; forensic review only.     |
| `agent-ad02e8b78af7a2711`                                                       |     106 |         0 | Claude agent worktree; forensic review only.           |
| `codex-main-state-frontier-repair`                                              |      18 |         7 | Canonical checkpoint described by this report.         |
| `codex-multi-main` — `codex/multi-main-recipe-identity`                         |       0 |         1 | Local artifact.                                        |
| `codex-p0-search-ocr-pi-recovery`                                               |       6 |         3 | Separate recovery work.                                |
| `codex-recipe-direction-targets`                                                |      21 |         3 | Separate recipe-direction work.                        |
| `codex-staging-main-responsive`                                                 |       0 |         6 | Responsive evidence/artifacts.                         |

Do not copy the Windows working directory as the active Mac repository. Its `.git/worktrees/*` administration contains Windows absolute paths. Use a fresh clone and the pushed branch instead.

## Mac bootstrap

Run on the Mac after installing the current Codex desktop app and signing into the same OpenAI account/workspace:

```bash
xcode-select --install
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/pinguinointelligence/pinguino-intelligence-v1.git
cd pinguino-intelligence-v1
git fetch origin
git switch --track origin/codex/main-state-frontier-repair
npm ci
npm run typecheck
npm test -- --maxWorkers=2 --reporter=dot
npm run build
```

Attach `~/Developer/pinguino-intelligence-v1` as the Codex project folder.

## Codex task/chat transfer

The supported transfer path is Codex Remote/Handoff, not replacing Mac `~/.codex` with the Windows directory:

1. Keep Windows and the Mac signed into the same OpenAI account and workspace.
2. Configure the Mac as a connected host (or enable macOS Remote Login/SSH and add it under Codex Settings → Connections).
3. In this task, use the location control in the footer and choose the Mac, then select **Handoff**.
4. Continue the task from the attached Mac project.

Official references:

- <https://learn.chatgpt.com/docs/remote-connections>
- <https://learn.chatgpt.com/docs/environments/git-worktrees>
- <https://learn.chatgpt.com/docs/projects>
- <https://learn.chatgpt.com/docs/import>

Do not restore Windows `auth.json`, SQLite databases, cache directories, `node_modules`, `dist`, or `.claude/worktrees` into the Mac Codex home. Re-authenticate GitHub, Supabase and Vercel on the Mac, and restore secrets only from the authorized password manager.

## Manual actions still required

1. Install/sign in to Codex on the physical Mac.
2. Clone and attach the project using the commands above.
3. Complete the task Handoff from Windows to the connected Mac.
4. Re-authenticate GitHub, Supabase and Vercel; do not copy raw Windows credentials.
5. Decide separately whether any of the 26 non-canonical dirty worktrees contain work worth recovering. The root worktree must receive special review because it contains protected Mapper changes.
6. Only after the Mac clone, tests and Handoff are verified should the Windows machine be retired or wiped.

## Resume prompt if Handoff is unavailable

Open this report on the Mac and ask Codex:

> Continue the PINGÜINO Main-state/frontier repair from branch `codex/main-state-frontier-repair`. Read `AGENTS.md` and `reports/MAC_MIGRATION_HANDOFF_2026-08-18.md` completely before acting. Preserve Mapper Basement, Home/Demo/Production rules and all green regression gates. Inspect the actual Git state before claiming completion.
