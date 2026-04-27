# Finishing Branch Base Alignment Design

> **Companion to** `planning/active/finishing-branch-base-alignment-analysis/` — the task-scoped planning files remain the authoritative record for lifecycle, findings, and verification status.

## Summary

Harness should treat finishing-time merge target resolution as part of the same worktree base contract used during worktree creation. The create phase already records `Worktree base: <ref> @ <sha>` through `worktree-preflight`; the finishing phase should consume that recorded value instead of guessing `main` or `master` from late Git state. Harness should implement the rule as a projected child patch for `finishing-a-development-branch`, not by modifying upstream Superpowers sources.

## Problem

Today, Harness owns worktree base selection during creation, but the upstream `finishing-a-development-branch` skill still assumes a generic repository model:

- determine the base with `git merge-base HEAD main || git merge-base HEAD master`,
- ask whether the branch split from `main`,
- then present merge-back options using that inferred base.

That assumption conflicts with Harness governance in repositories where `dev` or another non-trunk branch is the actual implementation entry point. In this repository, `dev` is the ongoing implementation branch and `main` is only the verified baseline. A worktree created from local `dev` should usually merge back into local `dev`, not local `main`.

## Goals

- Keep worktree creation and finishing under one consistent base-resolution contract.
- Prefer durable task-scoped metadata over prompt text or late Git guesses.
- Preserve upstream safety by keeping the change in Harness-owned projection layers.
- Support repositories where implementation flows through `dev`, feature branches, or other non-trunk branches.

## Non-Goals

- Changing `worktree-preflight` base recommendation logic.
- Automatically executing merges or PR creation.
- Rewriting upstream Superpowers skill sources.
- Replacing explicit user instructions about which branch to use.

## Options Considered

### Option A: Keep the upstream `main/master` guess

Pros:

- no new Harness code,
- stays close to upstream wording.

Cons:

- conflicts with existing Harness worktree-base policy,
- breaks down in `dev`-first repositories,
- encourages finishing behavior that disagrees with the recorded worktree origin.

### Option B: Recompute the merge target from current Git state only

Pros:

- avoids reading planning metadata,
- could work when planning is missing.

Cons:

- still heuristic,
- vulnerable to branch drift after worktree creation,
- can disagree with the explicitly recorded base that the task already used.

### Option C: Use recorded worktree base first, with conservative fallback

Pros:

- aligns finishing with creation,
- uses durable task-scoped state,
- works for `dev`-first and feature-branch-first repositories,
- fits existing Harness child patch architecture.

Cons:

- depends on planning metadata being present for the best experience,
- requires maintaining one additional projected skill patch.

## Recommendation

Adopt Option C.

Finishing-time base resolution should follow this order:

1. If the user or task explicitly names a base branch, use it and record why.
2. Otherwise, read the active planning files and look for `Worktree base: <ref> @ <sha>`.
3. If recorded metadata exists, use `<ref>` as the finishing merge target.
4. Only when recorded metadata is unavailable should the skill fall back to explicit confirmation or conservative Git inspection.

The important rule is not “merge to `dev`.” The rule is “merge back to the recorded source branch unless explicitly overridden.” In many Harness repositories, that recorded source will be `dev`; in others, it may be a feature branch or another development line.

## Detailed Design

### 1. Source of Truth

The finishing phase should reuse the same durable source of truth already required by the worktree-creation flow:

```text
Worktree base: <base-ref> @ <base-sha>
```

This metadata lives in `planning/active/<task-id>/progress.md` or `findings.md`. It exists specifically so later stages do not have to reconstruct intent from branch topology after the fact.

### 2. Distribution Surface

The contract should be enforced in Harness-owned layers:

- `harness/core/policy/base.md` for cross-platform policy,
- `harness/installer/lib/superpowers-finishing-a-development-branch-patch.mjs` for projected skill behavior,
- `harness/installer/commands/sync.mjs` and `harness/core/skills/index.json` for materialization.

This mirrors existing Harness child patch patterns such as `using-git-worktrees` naming and `writing-plans` location governance.

### 3. Projected Skill Behavior

The projected `finishing-a-development-branch` guidance should:

- remove the default “split from main” question,
- instruct the agent to inspect active planning files first,
- use recorded `Worktree base` when available,
- keep explicit user or task overrides highest priority,
- fall back to conservative Git inspection only when planning metadata is missing.

Conservative fallback should inspect current branch, upstream branch, and remote default branch, but it should not silently collapse that information into a `main/master` default when durable task metadata already exists.

### 4. Upstream Safety

No file under `harness/upstream/**` should change. The child patch must operate on the materialized skill output so upstream updates remain easy to fetch and re-sync.

### 5. Verification

Regression coverage should prove two things:

1. projection planning marks `finishing-a-development-branch` with the new patch type for every supported target,
2. synced materialized skill content includes the Harness patch guidance and no longer contains the old `split from main` prompt.

## Acceptance Criteria

- Harness projects a finishing skill patch across all supported targets.
- The projected skill tells agents to prefer recorded `Worktree base` metadata.
- Materialized skill output no longer defaults to asking whether the branch split from `main`.
- The implementation remains outside `harness/upstream/**`.
- Adapter tests cover both patch registration and synced output.

## Review Notes

- This design intentionally keeps `worktree-preflight` as the owner of base recommendation at creation time.
- It intentionally treats planning metadata as the bridge between creation-time intent and finishing-time integration.
- If a repository wants even stronger enforcement later, the next step would be a repo-owned helper that parses recorded `Worktree base` directly instead of teaching the projected skill to do so procedurally.