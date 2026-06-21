# Ponytail Borrowings Acceptance Scenarios

## Purpose
These scenarios are the opt-in Layer C proof for the immediately absorbed ponytail slice.

They are intentionally not wired into always-on CI. The goal is to capture real task replay evidence with a fixed scorecard, not to pretend a small manual sample is a deterministic gate.

## Method
- Same repo snapshot and same Codex environment for both sides.
- `A` run: the task is phrased normally, without explicit ponytail borrowings.
- `B` run: the task explicitly requires `Simplicity Ladder` and, when relevant, `overengineering-review` or `simplification-ledger`.
- Outputs are captured as concise run artifacts in `acceptance-run-2026-06-21.json`.
- The scorecard is evaluated by `scripts/evaluate-acceptance-runs.mjs`.

## Scenario Mix
- `2` implementation tasks
- `2` review or debt-reduction tasks
- `1` validation-sensitive task

## Scenarios

### 1. No New Dependency For Homepage Path Handling
- Category: implementation
- Repo context:
  - `scripts/ensure-homepage-deps.mjs`
  - The file already imports `node:path`.
- Question:
  - How should we normalize homepage-related paths without widening the repo surface?

### 2. Smallest Diff For Summary Output
- Category: implementation
- Repo context:
  - `harness/installer/commands/summary.mjs`
  - `tests/installer/summary-command.test.mjs`
- Question:
  - How should we add one optional summary output flag without turning it into a renderer refactor?

### 3. Overengineering Review On A Homepage Wrapper Patch
- Category: review
- Repo context:
  - `scripts/ensure-homepage-deps.mjs`
- Question:
  - If a patch adds a tiny wrapper dependency plus an adapter layer around the current `spawnSync` path, does the review stay narrow and useful?

### 4. Simplification Ledger On The Current Repo
- Category: debt
- Repo context:
  - `harness/core/policy/base.md`
  - `harness/core/skills/simplification-ledger/SKILL.md`
- Question:
  - Can the repo scan pull only deliberate simplifications instead of every prose mention of `swf-simplify:`?

### 5. Validation-Sensitive Simplification For User-Managed Paths
- Category: validation
- Repo context:
  - `harness/installer/lib/user-managed.mjs`
- Question:
  - Can a simplification shrink the code without dropping the exact-match and child-path trust-boundary behavior?

## Pass Rule
- `B` should beat `A` on at least `3/5` scenarios for dependency count, files changed, or diff size.
- `B` must not regress validation or trust-boundary protection in any scenario.
- `B` should be judged "simpler without getting sloppier" in at least `4/5` scenarios.
