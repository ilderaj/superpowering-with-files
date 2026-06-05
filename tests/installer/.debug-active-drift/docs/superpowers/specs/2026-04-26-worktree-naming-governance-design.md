# Worktree Naming Governance Design

> **Companion to** `planning/active/worktree-naming-governance/` — the task-scoped planning files remain the authoritative record for lifecycle, findings, and review state.

## Summary

Harness should stop relying on agent-specific heuristics to name manual or skill-driven worktrees. Instead, it should derive a canonical run label from durable task identity in `planning/active/<task-id>/`, then project that rule into every supported target through Harness-owned policy, CLI helpers, and materialized skill patches. The recommended label is:

```text
YYYYMMDDHHMM-<task-slug>-NNN
```

Example:

```text
202604281159-codex-app-compatibility-design-001
```

This yields names that are unique, auditable, and still readable when multiple worktrees exist for the same task.

## Problem

Today, Harness provides a repo-owned worktree base recommendation, but it does not provide a repo-owned naming contract. `worktree-preflight` recommends the base ref and SHA, while `using-git-worktrees` consumes a pre-existing `BRANCH_NAME` without defining where that name should come from. In practice, this leaves room for host- or model-specific heuristics such as:

- using the first sentence of the prompt,
- using a generic skill-invocation phrase,
- or reusing a short branch slug with no instance identity.

That behavior is not stable across IDEs, it is not durable across sessions, and it performs poorly when prompt openings are repetitive.

## Goals

- Make worktree naming deterministic and task-aware.
- Use `planning/active/<task-id>/` as the durable identity source instead of prompt text.
- Keep the implementation upstream-safe by avoiding changes under `harness/upstream/**`.
- Make the rule effective across Codex, GitHub Copilot, Cursor, and Claude Code.
- Preserve compatibility with existing branch namespaces such as `codex/`, `copilot/`, and `fix/`.

## Non-Goals

- Renaming existing branches or worktrees.
- Creating a globally unique identifier across different clones or machines.
- Defining commit message, PR title, or archive naming policy.
- Replacing IDE-native worktree management where the host already owns the workspace model.

## Options Considered

### Option A: Stable task slug only

Use just the planning task id, for example:

```text
codex-app-compatibility-design
```

Pros:

- very readable,
- easy to type,
- easy to correlate with planning.

Cons:

- immediate collisions when a task needs more than one worktree,
- no instance identity,
- weak auditability.

### Option B: Policy-only guidance

Tell agents to summarize the task in 3 to 5 words and use that result for worktree or branch names.

Pros:

- minimal implementation work,
- no new CLI surface.

Cons:

- still heuristic and model-dependent,
- weak cross-IDE consistency,
- does not solve repeated-opening collisions,
- easy to drift on upstream skill updates.

### Option C: Canonical run label backed by a Harness helper

Define a canonical run label that combines timestamp, planning task slug, and a numeric sequence:

```text
YYYYMMDDHHMM-<task-slug>-NNN
```

Use a repo-owned helper as the source of truth, then project the rule into materialized skills and docs.

Pros:

- deterministic and readable,
- task-aware and not prompt-aware,
- can distinguish multiple worktrees for the same task,
- can be shared across all supported targets,
- can be implemented without mutating upstream sources.

Cons:

- requires a helper command and patch/test work,
- produces longer names than a plain task slug.

## Recommendation

Adopt Option C.

The canonical run label should be the common identity unit for manual or skill-driven worktree creation. The worktree directory basename should always use the canonical label directly. The branch name should use either the same label or an optional namespace wrapper:

```text
<canonical-label>
<namespace>/<canonical-label>
```

Examples:

```text
202604281159-codex-app-compatibility-design-001
copilot/202604281159-codex-app-compatibility-design-001
fix/202604281159-codex-app-compatibility-design-001
```

This preserves existing repository habits while keeping the meaningful, unique portion of the name identical.

## Detailed Design

### 1. Identity Sources

Harness should treat worktree naming as a composition of three fields:

- `taskSlug` — the durable task identity,
- `timestamp` — the creation-time instance marker,
- `sequence` — the collision-resistant ordinal for repeated worktrees on the same task.

`taskSlug` should come from the planning task id whenever possible. The preferred resolution order is:

1. explicit `--task <task-id>` passed to the helper,
2. the single active task under `planning/active/`,
3. the current planning task if the user is already in a task-scoped worktree,
4. a caller-provided fallback slug,
5. current branch only as a last-resort fallback.

This intentionally avoids prompt-derived text.

### 2. Canonical Label Format

The canonical label should be:

```text
YYYYMMDDHHMM-<task-slug>-NNN
```

Where:

- `YYYYMMDDHHMM` is a UTC timestamp rounded to the minute,
- `<task-slug>` is an ASCII-safe slug derived from the planning task id,
- `NNN` is a zero-padded three-digit sequence.

The sequence should be monotonic per task, not just per minute. That means the first worktree for a task is `001`, the second is `002`, and so on, even if the timestamps differ. This makes repeated worktrees for a task easy to read and audit.

### 3. Sequence Allocation

Sequence allocation should use Harness-owned signals only. The helper should compute the next sequence by taking the maximum observed sequence for the same `taskSlug` across:

1. existing linked worktree directory basenames,
2. local branch names that end with the canonical label pattern,
3. prior allocations recorded in `planning/active/<task-id>/progress.md`.

The next sequence is `max + 1`; when no prior allocation exists, it is `001`.

Recording allocations back into `progress.md` turns planning into the durable audit trail the user asked for, while still allowing the helper to recover from local filesystem or branch state.

### 4. CLI Surface

Add a new repo-owned helper command:

```bash
./scripts/harness worktree-name --task <task-id>
./scripts/harness worktree-name --task <task-id> --namespace copilot --json
./scripts/harness worktree-name --json
```

Proposed JSON output:

```json
{
  "taskId": "codex-app-compatibility-design",
  "taskSlug": "codex-app-compatibility-design",
  "timestamp": "202604281159",
  "sequence": "001",
  "canonicalLabel": "202604281159-codex-app-compatibility-design-001",
  "branchName": "copilot/202604281159-codex-app-compatibility-design-001",
  "worktreeBasename": "202604281159-codex-app-compatibility-design-001",
  "sources": {
    "task": "planning-active",
    "sequence": "planning-and-local-git"
  }
}
```

`worktree-preflight` should remain the owning abstraction for base selection, but it should reuse the helper to show a suggested label and branch name in text and JSON output.

### 5. Cross-IDE Distribution

The rule should be distributed through three Harness-owned surfaces:

1. `harness/core/policy/base.md` and rendered entry files — the always-on policy statement.
2. A projected child patch for `using-git-worktrees` — the operational instruction shown to agents after sync.
3. The new CLI helper and `worktree-preflight` output — the mechanical source of truth.

This combination makes the rule effective even when an IDE has no native worktree naming model, while still being safe when an IDE already manages the workspace itself.

### 6. Upstream Safety

No file under `harness/upstream/**` should be modified. Instead:

- add a new patch helper under `harness/installer/lib/`,
- register the new child patch in `harness/core/skills/index.json`,
- invoke that patch from `harness/installer/commands/sync.mjs`.

That keeps upstream updates safe because local governance remains in Harness-owned layers.

### 7. Codex As A Supplementary Case

Codex App often already runs inside a managed worktree. In that environment, the naming helper should be treated as supplementary:

- useful for manual branch creation,
- useful for local fallback flows,
- useful for consistency in docs and planning,
- but not a requirement that overrides the host's own workspace identity model.

The projected `using-git-worktrees` patch should explain that distinction explicitly.

## Acceptance Criteria

- Harness has a repo-owned helper that generates deterministic canonical labels from planning task identity.
- The helper never needs prompt text to produce a name.
- `worktree-preflight` can surface a suggested canonical label and branch name without changing base-selection semantics.
- Materialized `using-git-worktrees` instructions across supported targets reference the helper instead of leaving naming implicit.
- No upstream baseline file is modified.
- Tests cover helper behavior, projection patches, and sync output for all supported targets.

## Review Notes

- This design intentionally treats planning as the durable source of task identity.
- It intentionally avoids forcing branch and worktree names to be byte-for-byte identical when a repository wants namespace prefixes.
- If the reviewer wants stricter symmetry, the simplest adjustment is to drop the optional branch namespace and use the canonical label as both the directory basename and the full branch name.