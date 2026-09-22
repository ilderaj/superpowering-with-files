# Supplemental dsh/homepage module ablation

Date: 2026-09-22
Source worktree: `/Users/jared/.codex/worktrees/audit-render-fixes-20260922`
Root repository was read-only throughout. Ablations ran in real-copy temporary directories:

- `/tmp/swf-dsh-ablation-u5fJ1U`
- `/tmp/swf-homepage-ablation-fC5xiV`

The copies were made with recursive file copies. No hardlinks were used and no non-owned process was killed. The initial dependency symlink was replaced by an offline pnpm install in the dsh copy because the existing root `node_modules` did not contain Vitest; no external provider or model execution occurred.

## Baselines

- dsh retained core suite: `pnpm exec vitest run test/routing.test.ts test/binding.test.ts test/evidence.test.ts test/budget.test.ts test/dispatch-core.test.ts test/dispatch.test.ts test/packet.test.ts test/storeRead.test.ts test/detect.test.ts test/commands.test.ts` — **10 files, 148 tests passed, exit 0**.
- homepage application tests: `npm test` — **20 tests passed, exit 0**.
- dsh full `pnpm run test` was attempted. It produced **18 passing files / 274 passing tests but failed 9 asset parity tests and the parity suite** because a plugin-only temporary copy cannot resolve repo-root `.agents`, `harness`, and `../../harness/trio/core/routing.mjs` paths. This is a real environment/coverage gap, not counted as full-suite success.

## Module inventory and ablation evidence

| Area | Real source files covered | Existing behavior tests | Mutant and outcome |
|---|---|---|---|
| Routing | `plugins/dsh/src/core/routing.ts` | `test/routing.test.ts`, plus packet/dispatch callers | Changed explicit tracked/deep-reasoning classification to quick. **RED: exit 1; 4 failed.** |
| Binding | `plugins/dsh/src/core/binding.ts` | `test/binding.test.ts`, `test/packet.test.ts` | Reversed SHA equality in `bindingsMatch`. **RED: exit 1; packet construction and binding tests failed.** An initial authority-root-only mutant was invalid for the exercised boundary and was discarded. |
| Evidence | `plugins/dsh/src/core/evidence.ts` | `test/evidence.test.ts`, `test/packet.test.ts` | Reversed host-dispatch record classification. **RED: exit 1; 2 failed.** |
| Budget | `plugins/dsh/src/budget.ts` | `test/budget.test.ts`, `test/dispatch.test.ts` | Changed worker cap `>=` to `>`. **RED: exit 1; cap assertion failed.** |
| Dispatch decision core | `plugins/dsh/src/core/dispatch.ts` | `test/dispatch-core.test.ts`, `test/dispatch.test.ts` | Reversed deep-tier confirmation. **RED: exit 1; 2 failed.** A token-boundary mutant was not killed by the current tests and is recorded below as a gap. |
| Dispatch/context seam | `plugins/dsh/src/dispatch.ts`, `plugins/dsh/src/context.ts` | `test/dispatch.test.ts` | Reversed `getProvider` capability check in `subagentsServiceOf`. **RED: exit 1; valid model-selection dispatch became manual_pending.** |
| Packet/evidence persistence | `plugins/dsh/src/packet.ts` | `test/packet.test.ts`, `test/dispatch.test.ts`, `test/budget.test.ts` | Reversed packet budget binding status guard. **RED: exit 1; packet persistence and restarted-budget dispatch failed.** |
| Homepage routing | `homepage/src/route-utils.mjs`, `homepage/src/worker.ts` | `src/route-utils.test.mjs` | Removed effective homepage-prefix asset match. **RED: exit 1; 1 of 20 failed.** Worker delegates directly to this tested boundary; no separate behavior was duplicated. |
| Homepage content/app boundary | `homepage/src/homepage-content.mjs`, `homepage/src/App.tsx`, `homepage/src/main.tsx` | `src/homepage-content.test.mjs`, `src/homepage-structure.test.mjs`, `src/homepage-seo.test.mjs`, `src/homepage-styles.test.mjs` | Mutated hero headline. **RED: exit 1; content contract failed.** Structure tests cover section ordering and renderer mapping; SEO/style tests cover metadata and layout contracts. |

All mutation commands waited for process completion and every listed mutant exited nonzero. Mutated files were restored in the temporary copies after each run.

## Honest coverage gaps

- The dsh test suite's asset/parity tests require the repository root and therefore were not valid inside a plugin-only copy. They were not reported as passing.
- The selected dsh behavior suite did not kill a `spentTokens + requestedTokens > budget` to `>=` mutant. Exact-boundary budget behavior is therefore a genuine gap; the current tests cover over-cap rejection and worker cap, but not whether a request exactly equal to the remaining budget is allowed.
- `plugins/dsh/src/core/constants.ts`, `core/index.ts`, `core/passthrough.ts`, `core/storeRead.ts`, `detect.ts`, `commands.ts`, `evidenceAudit.ts`, and `index.ts` were exercised only through the selected callers or existing suite execution; no separate mutant was added where no distinct behavioral seam was justified.
- Homepage `worker.ts` was not mutated separately because its meaningful routing decision delegates to `normalizeHomepageRequestUrl`; duplicating an equivalent test would not add boundary evidence. Build/typecheck was not claimed because the root `node_modules` symlink lacked homepage's Vite toolchain.
- No real model/provider dispatch, external write, deployment, or browser execution was performed.
