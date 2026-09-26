# PM-01 dirty-path ownership decision

This records migration handling, not ownership of other ongoing work. The primary `dev` checkout is mixed and remains untouched; only the isolated migration branch is committed. Path names below are repository-relative.

| Path group in primary checkout | Observed state | Migration handling |
| --- | --- | --- |
| `AGENTS.md` and `.agents/skills/{trio,chiefops}` | Current project entry is still active. The 12 tracked projected skill files match the installed plugin trees; two projected files also have uncommitted source-aligned edits. | Keep until projection callers are refactored, candidate passes container/behavior checks and the protected PR is integrated. Remove tracked files through Git, with prior hash receipt. |
| `harness/trio/skill`, `harness/trio/governance/chiefops`, `harness/core/upstream-overlays/planning-with-files` | Uncommitted governance and lifecycle edits coexist with other current work. | Do not bulk-copy into this branch. Review each source-owned diff and reconcile with its active task before selecting public source commits. |
| `packages/plugin-kit/src/{build-plugin,pack-plugin,platform-contracts,project-opt-in,managed-skill-migration}` and package docs/tests | Mixed tracked changes and new files implement parts of the earlier package candidate; the build references untracked internalized sources. | Treat as a candidate, not a clean public source. Split public builder logic from private internalized skill inputs; run clean-checkout build before PM-02 acceptance. |
| `harness/internalized-skills/` | Untracked absorbed third-party and specialist sources, assets, provenance and notices. | Private source review and commit only; do not stage in public SWF repository while public redistribution is unverified. |
| `README.md`, `docs/install/codex-plugin-private.md` | Documentation belongs to open PR #203. | Preserve PR ownership and its non-author review gate; reconcile only after protected integration. |
| JEV plans, other Linear bindings, night recovery reports and unrelated tests | Concurrent task changes in the same dirty checkout. | Exclude from migration commits, resets, cleanup and worktree deletion. |

The inventory does not prove every untracked descendant's author or license. An unknown path stays in place. The temporary private repository clone is clean and at the previously published tag commit; no private source change was promoted from the mixed checkout in this slice.
