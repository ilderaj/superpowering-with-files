# Findings

## Initial Findings

- `harness/installer/commands/fetch.mjs` currently only prints: `Fetch command contract ready. Upstream mutation is not enabled in this milestone.`
- `harness/installer/commands/update.mjs` currently only prints: `Update command contract ready. Applying fetched upstream changes is not enabled in this milestone.`
- `harness/upstream/sources.json` already separates upstream sources from Harness core:
  - `superpowers` is a git source at `https://github.com/obra/superpowers`.
  - `planning-with-files` is currently `local-initial-import`.
- `harness/core/skills/index.json` already separates baseline paths and projection strategy from core policy.
- A hard smooth-update capability should update only vendored upstream baselines and leave `harness/core/**` untouched.

## Durable Decisions

- Stage candidates under `.harness/upstream-candidates/<source-name>/`.
- Apply candidates only into allowlisted `harness/upstream/<source-name>` destinations.
- Treat `planning-with-files` as local-source fetch for now, requiring `--from=...`.
- Keep Harness flow and policy owned by `harness/core/policy/base.md`, not upstream skills.
- `fetch` and `update` are now separate operations: `fetch` stages a candidate, `update` applies only staged candidates through the upstream path guard.
- The path guard rejects source metadata that points outside `harness/upstream`, including attempts to target `harness/core/policy`.

## Verification

- Baseline in isolated worktree: `npm run verify` passed with 25 tests.
- Task 1: `node --test tests/installer/upstream.test.mjs` passed with 3 tests.
- Task 2: `node --test tests/installer/upstream.test.mjs tests/installer/upstream-commands.test.mjs` passed with 4 tests.
- Task 3: `node --test tests/installer/upstream-commands.test.mjs` passed with 3 tests.
- Task 3: `npm run verify` passed with 31 tests.
