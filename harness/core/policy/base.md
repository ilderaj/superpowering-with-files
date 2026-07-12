# Hybrid Workflow Policy

This project uses a hybrid workflow:

- `planning-with-files` is the persistent memory and planning system.
- `superpowers` is an optional, temporary reasoning tool.
- Persistent task state must live only under `planning/active/<task-id>/`:
  - required core planning trio: `task_plan.md`, `findings.md`, `progress.md`
  - optional lifecycle artifact: `reconciliation.md`
  - explicitly closed task state may move to `planning/archive/<timestamp>-<task-id>/`

## Default Behavior

By default:

- Do not invoke superpowers.
- Do not perform heavyweight workflow routing for simple tasks.
- Directly execute quick tasks.
- Once a task is classified as a tracked task, create and keep the required core planning trio updated, and add `reconciliation.md` only when lifecycle evidence needs its own artifact.
- Isolate concurrent work by task id instead of sharing one project-root planning file set.
- At the start of complex work, scan existing active tasks when stale context may matter, but do not move legacy or completed-looking tasks automatically.

### Chief And Worker Operating Model

- Tracked production work defaults to a visible session worker when the platform provides a visible worker surface.
- Chief owns intake, binding, business judgment, authorization, major-phase gates, acceptance, reconciliation, and lifecycle.
- Chief-direct is limited to quick work and narrow gate or reconcile verification.
- Use one primary visible worker session per tracked task across phases; session context is a cache, not authority.
- Every major phase boundary returns to Chief. Within an approved phase, the worker may proceed autonomously.
- Chief chat history is not task authority. Restore and update the exact bound trio before deriving an Assignment Packet.
- Default capacity is two Chief-managed visible executing lanes. Additional visible lanes require explicit human approval.
- Worker-local subagents are session-internal implementation details, not visible-worker substitutes or lifecycle owners.
- Their authority and runtime permission are strict subsets of the parent worker envelope.
- Every Chief or visible-worker subagent dispatch must declare an explicit model and thinking value. The child must be mechanically narrower than the parent envelope; no verified detailed-plan eligibility means Terra/high, Luna/high requires verified plan bytes and eligibility, and Sol requires its recorded admission. These are manual contracts, not native host enforcement.
- When a binding declares child dispatches, child return validation occurs before parent acceptance: every declared child needs exactly one matching, revalidated return; no declared child means no return is expected.
- Use `prohibited`, `worker_discretion`, or `encouraged`; tracked phases default to `worker_discretion`.
- Promote a delegated slice to a visible parallel worker when it becomes cross-phase, long-running, independently human-steered, independently outcome-bearing, or the owner of distinct mutable state.
- Wait for delegated work to return before the parent claims the phase outcome.

### Simplicity Ladder

Before expanding scope, complexity, or dependencies:

1. Question whether the work needs to exist at all.
2. Prefer the standard library before custom code.
3. Prefer native platform features before dependencies.
4. Prefer already-installed dependencies before adding new ones.
5. Prefer the smallest working diff and the fewest files.
6. Never simplify away trust-boundary validation, data-loss prevention, security, accessibility, or explicit user asks.

### Deliberate Simplifications

When a temporary simplification is intentional, record it with:

- marker prefix: `swf-simplify:`
- required fields: `ceiling` and `upgrade trigger`

Example:

```text
// swf-simplify: single-workspace scan only; upgrade when leaf workspaces need distinct ledger grouping
```

## Rule Precedence

When these rules overlap, apply them in this order:

1. Repository policy that defines durable task memory and planning ownership.
2. Explicit task classification in this file.
3. Heuristics from skills or prompts, such as tool-call count.

If a task is classified as tracked, Planning with Files is mandatory even when the implementation itself feels straightforward.
The default instruction to execute quick work directly never overrides a tracked-task classification.

## Task Classification

Classify the task before choosing the workflow:

- `Quick task`: single-stage work with a clear path, no subagents, no worktree isolation, no expected cross-session recovery, and no durable research trail worth persisting. Execute directly without heavyweight routing.
- `Tracked task`: any task with multiple phases, research or comparison work, subagents, worktree/branch isolation, expected session recovery, or durable decisions and verification worth keeping on disk. Create or reuse `planning/active/<task-id>/` before substantive work.
- `Deep-reasoning task`: a tracked task whose architecture is unclear, requirements are ambiguous, debugging is complex, root cause is not obvious, or deep structured reasoning is explicitly requested. Only this class may justify superpowers.

Tool-call count is only a supporting signal. Exceeding five meaningful tool calls may indicate tracked work, but it does not override the task classification above by itself.

## Goal Round Start Protocol

Before each substantive goal round, continuation tick, or phase boundary:

1. Restore context from `planning/active/<task-id>/` first. Read `task_plan.md`, `progress.md`, and `findings.md`. If `reconciliation.md` exists and the current round depends on lifecycle evidence, read that optional lifecycle artifact too. If those files reference a companion plan, read only the relevant compact section you need for the current round.
2. Reclassify the current round using the existing `quick`, `tracked`, and `deep-reasoning` model. A task can stay tracked overall while a specific round is quick or deep.
3. Route the round by its current classification:
   - `quick`: stay lightweight. Do not create a companion plan and do not add subagents just because a goal loop is running.
   - `tracked`: keep `planning/active/<task-id>/` authoritative and update the planning files after meaningful progress, phase changes, validation results, or durable decisions.
   - `deep-reasoning`: create or update `docs/superpowers/plans/<date>-<task-id>.md`. If that companion plan is new or materially revised, require 1 read-only reviewer subagent before execution. The reviewer may assess plan completeness, architecture fit, scope alignment, rollback, or validation commands, but must not edit code or planning files. Revise from the review, re-review when needed, and execute only from an approved companion plan. After approval, follow normal Superpowers execution discipline: choose inline execution or subagents as appropriate, honor worktree isolation guidance when needed, and preserve progress with commits, checkpoints, pushes, or PR handoff when useful.
4. When execution reveals a mismatch, distinguish a `plan issue` from an `execution issue`. This is execution-time plan-mismatch escalation, not a new runner:
   - `quick`: stay lightweight and resolve ordinary execution issues directly. Do not trigger a replan loop just because a goal loop is active.
   - `tracked` and `deep-reasoning`: if the plan itself is the issue, a bounded mini review/revise/verify loop may run inside normal Superpowers execution discipline. If the current plan is still sound and only execution failed, treat it as an execution issue and keep working from the approved plan.
   - Keep root-goal stability, avoid goal drift, and preserve `planning/active/<task-id>/` as the authoritative planning record while the companion plan or synced summaries are revised.
5. Bound plan-polishing and execution-time replan loops together. Attempt 1 revises from verifier feedback. Attempt 2 re-verifies the failed areas. Attempt 3 performs a broader rethink. If the 3rd review round is still a failed review, record blockers and unresolved assumptions in the authoritative planning files, then stop the current execution attempt instead of looping forever.
6. Sync back after each phase. Keep detailed reasoning in the companion plan, but write durable decisions, lifecycle and phase status, validation results, review verdicts, execution mode, companion-plan path, summary, and sync-back status into `planning/active/<task-id>/`.

For tracked or deep work, at a major phase boundary or after roughly 12-16 substantive turns, prefer handing off to a fresh session that restores the exact trio. Do not reset mid-phase merely to satisfy a turn count; when continuing is cheaper or safer, record the concrete reason in `progress.md`. This is repository guidance, not a runner; hooks do not replace restore, routing, or sync-back discipline.

### Mode-Aware Verification Contract

The `Mode-Aware Verification Contract` selects proof by failure risk. It does not create a runner, replace native `/goal`, or force heavyweight process onto quick tasks.

Harness uses six mode families:

| Mode Family | Main risk |
| --- | --- | --- |
| design/planning | wrong scope or unverifiable criteria |
| execution | broken invariants or partial rollout |
| review | scope, architecture, rollback, or approval drift |
| acceptance/verify | unmet user-visible outcomes |
| reconcile/lifecycle | source-of-truth or archive drift |
| operations/release/adoption | rollout, recovery, or migration failure |

Proof types are `unit/invariant`, `BDD/acceptance`, `review`, `lifecycle/governance`, and `operational`; choose the type that covers the mode's main risk.

The proof-stack core vocabulary is:

- `Primary Proof`: the evidence most likely to catch the highest-risk failure for the current mode family.
- `Backstop Proof`: secondary evidence that covers residual or adjacent risk without pretending to replace the primary proof.
- `Unacceptable Substitute`: evidence that may look green or busy but does not actually close the relevant risk.
- `Evidence Sink`: where the proof result is recorded so future review, reconciliation, or operations work can find it.

When a tracked task needs an explicit proof design, declare:

- `Proof Target`, `Primary Proof`, and `Backstop Proof`;
- `Escalation Trigger`, `Evidence Sink`, and `Reconcile Rule`;
- `Unacceptable Substitute`.

Use unit proof for invariants, BDD for user-visible behavior, review proof for scope/architecture/approval, lifecycle proof for task state, and operational proof for install/release/recovery.

Quick tasks stay lightweight with direct in-session proof; tracked/deep tasks declare the contract only when needed.

## ChiefOps Governance Mode

`ChiefOps` is optional tracked-task governance: use planning state plus receipts to frame one bounded next slice, not a new lane or memory system.

## When Superpowers Is Allowed

Use superpowers only when:

- architecture is unclear
- requirements are ambiguous
- debugging is complex
- root cause is not obvious
- deep structured reasoning is explicitly requested

## Soft Model Tiering

- Use the most capable model for intake shaping, reviewed planning, architecture or protocol analysis, rollback judgment, and high-risk review.
- Use a standard model for multi-file integration, uncertain debugging, and medium-risk review.
- Use a cheap model only for approved-plan mechanical work, narrow diff checks, clerical worktree or release steps, and bounded checklist review.
- Upgrade from cheap -> standard -> capable when the task becomes blocked by missing context, conflicting interpretations, or design judgment.

## When Superpowers Is Not Allowed

Do not use superpowers for:

- trivial edits
- simple bug fixes
- straightforward feature implementation
- renames, moves, formatting, or low-risk refactors
- routine implementation even if a skill might loosely apply
- tasks where direct execution is clear and the reasoning value does not justify the token cost

## Mandatory Sync-Back Rule

Whenever superpowers is used:

1. Preserve the detailed Superpowers implementation plan in `docs/superpowers/plans/<date>-<task-id>.md`.
2. Summarize durable decisions back into:
   - `planning/active/<task-id>/task_plan.md`
   - `planning/active/<task-id>/findings.md`
   - `planning/active/<task-id>/progress.md` if relevant
3. Keep the references synchronized in both directions:
   - the task-scoped planning files must point to the companion plan
   - the companion plan must point back to `planning/active/<task-id>/`
4. Return to normal low-cost execution mode.

Sync-back is summary-only for the authoritative planning files. Do not paste the full Superpowers implementation plan into `planning/active/<task-id>/task_plan.md`; keep the detail in the companion plan and record only durable decisions, phase changes, companion-plan references, and current status there.

## Plan Location Boundaries

Harness uses one durable agent task-memory location:

| Location | Role |
| --- | --- |
| `planning/active/<task-id>/task_plan.md` | Current task plan, phases, lifecycle, and durable execution decisions. |
| `planning/active/<task-id>/findings.md` | Research findings, discovered constraints, and durable design decisions. |
| `planning/active/<task-id>/progress.md` | Session log, verification results, failures, and changed files. |
| `planning/active/<task-id>/reconciliation.md` | Optional lifecycle artifact for standalone reconcile evidence, drift decisions, and finish/archive readiness. |
| `planning/archive/<timestamp>-<task-id>/` | Closed historical tasks that passed the archive lifecycle guard. |

Treat `docs/**` and `docs/plans/**` as human-facing project documentation, not agent task memory. Treat `docs/superpowers/plans/**` as the required companion-artifact path whenever Superpowers is used on a Deep-reasoning task, not active task memory. Treat `harness/upstream/**` as vendored upstream source, not this project's active planning state.

If a tool, skill, or model instruction suggests creating root-level `task_plan.md`, `findings.md`, `progress.md`, or `docs/plans/*` for agent task state, do not follow it by default. Create or update the task-scoped files under `planning/active/<task-id>/` and only write those docs plans when the user explicitly asks for a human-facing documentation artifact.

## Companion Plan Model

The task-memory model has three layers:

1. `planning/active/<task-id>/` is the only authoritative task-memory root, with a required core planning trio and optional lifecycle artifacts such as `reconciliation.md`.
2. `docs/superpowers/plans/**` is the required companion artifact path whenever Superpowers is used on a Deep-reasoning task.
3. All other plan paths are non-canonical.

Companion plans are required whenever Superpowers is actually used for a Deep-reasoning task. They keep the detailed implementation plan, execution checklist, and reasoning notes that would be too verbose for the authoritative planning files, but they never replace or duplicate active task memory. The matching `planning/active/<task-id>/` files must record the companion plan path, a short summary, and the current sync-back status so the authoritative record stays complete.

Companion plans are secondary artifacts only and must remain tied back to the active task record. The companion plan must also point back to `planning/active/<task-id>/` so execution can move from summary to detail and back without guesswork.
Detailed implementation checklists belong in the companion plan. Keep `task_plan.md` focused on lifecycle, phases, finishing criteria, and durable decisions.

If a Superpowers skill suggests saving a long-lived plan under `docs/superpowers/plans/`, use that path for the companion plan, keep `planning/active/<task-id>/` authoritative, and never treat the companion plan as a replacement for active task memory.

## Planning-With-Files Lifecycle Rule

Each active `task_plan.md` should include:

```md
## Current State
Status: active
Archive Eligible: no
Close Reason:
```

Archive constraints:

- all phases complete does not mean a task may be archived
- archive only when `Status: closed` and `Archive Eligible: yes`
- completed-looking legacy tasks without the lifecycle block are stale candidates, not archive targets
- never auto-archive historical active directories from another project or thread unless they are explicitly closed and archive eligible
- use `planning-with-files` helper scripts for status checks; do not rely on hooks being available in every environment

## Complex Task Orchestration

For broad or mixed requests, use this order:

1. Create or reuse one task-scoped `planning/active/<task-id>/` directory.
2. Group the request into phases with explicit dependencies and finishing criteria.
3. Decide whether worktree or branch isolation is needed before implementation.
4. Use Superpowers only for the phase that needs deeper reasoning, then sync durable decisions back to Planning with Files.
5. Assign subagents only to independent scopes with clear file ownership, constraints, verification commands, and return format.
6. Let the main agent review, integrate, verify, and update Planning with Files.

Planning with Files is the source of truth. Superpowers can generate temporary construction plans, but it must not own durable task memory.
Git worktrees and branches provide isolation. Superpowers may describe how to use them, but it does not replace version control.

### Worktree Base Preflight

Before creating a Git worktree for Superpowers, subagents, or manual isolation, determine the intended base explicitly. Do not rely on `git worktree add <path> -b <branch>` without a start point, because that silently uses the agent's current `HEAD`.

Use Harness-owned preflight when available:

```bash
./scripts/harness worktree-preflight [--task <task-id>]
```

Resolve the repo-owned name for any manual or skill-driven worktree with:

```bash
./scripts/harness worktree-name [--task <task-id>] [--namespace <prefix>]
```

The canonical label format is `YYYYMMDDHHMM-<task-slug>-NNN`. `task-slug` must come from planning task identity rather than a prompt summary. Use the suggested worktree basename and branch name instead of deriving names from the prompt. If the host already manages the workspace or worktree (for example, Codex App), treat the helper as a supplementary naming tool for manual branches or extra worktrees rather than a host override.

Then create the worktree with the reported start point:

```bash
git worktree add <path>/<canonical-label> -b <suggested-branch> <base-ref>
```

Base selection rules:

1. If the task plan or user explicitly names a base branch, use that base and record why.
2. If the current workspace is on a non-trunk development branch such as `dev` or a feature branch, preserve that active development context by using the current branch unless the task says otherwise.
3. If the current workspace is clean and intentionally on `main` or `master`, using that trunk branch is acceptable.
4. If the base is inferred rather than explicit, record the inference and any warnings in Planning with Files before implementation starts.

Every isolated task must record `Worktree base: <base-ref> @ <base-sha>` in `planning/active/<task-id>/progress.md` or `findings.md`. Finishing and merge decisions must prefer this recorded base over late guesses such as `git merge-base HEAD main`.

## Cross-IDE Portability

Codex, GitHub Copilot, Cursor, and Claude Code do not consume instructions, skills, hooks, or global configuration in the same way. Do not rely on hooks, implicit skill discovery, or Codex-only configuration for core workflow behavior.

Keep durable rules in the rendered Harness entry files. Platform overrides should describe only platform-specific caveats, not fork the workflow.

## Hard Constraints

- Do not create duplicate planning systems.
- Do not let superpowers own long-lived task memory.
- `planning-with-files` remains the source of truth.
- Do not let multiple threads overwrite the same planning files; use task-scoped active directories.
- Do not let hooks or stop events archive active tasks unless the lifecycle guard passes.

## Core Behavioral Guidelines

- Do not introduce new entities unless necessary.
- Verify your own work before reporting back. Run the code, check the output, click through visual flows, and simulate edge cases. Do not hand back a first draft.
- Define finishing criteria before starting. If something fails, fix and re-test. Only return when the work is confirmed working, or when there is a hard blocker: missing credentials or secrets, access that is unavailable, or a requirement that is genuinely ambiguous about the end-user goal. "Two valid approaches exist" is not a blocker; choose the better one.
- Think independently. Do not blindly agree with a flawed approach; push back when needed. Make implementation path decisions yourself.
- When asked "why", explain root cause first, then separate diagnosis from treatment.
- Challenge user direction when it seems off. If the end-user goal itself is ambiguous, ask upfront before starting. Implementation path decisions are the agent's job. If the path is suboptimal, say so directly.

### Task Completion

- Fix root causes, not symptoms. Do not use workarounds, band-aids, or "minimal fixes." If the architecture is wrong, restructure it. Prefer deleting bad code and replacing it cleanly over patching on top of a broken foundation.
- Finish what you start. Complete the full task. Do not implement half a feature. Implementation decisions are the agent's job, not questions to ask.
- Inside an already-authorized scope, do not seek extra confirmation; execute the approved work.
- Explicit human gates remain mandatory for more than two visible lanes and for release, merge, publish, send, deploy, destructive, external, security, or data-loss actions.
- Do not say: "如果你要，我下一步可以..."
- Do not say: "你要我直接...吗？"
- Do not say: "要不要我帮你..."
- Do not say: "是否需要我..."
- Do not say: "我可以帮你...，要我做吗？"
- Do not say: "下一步可以..." as an offer rather than a description of what you are doing.
- Do not end implementation-proceeding questions with "...吗？"
- Instead say: "接下来我会 xxx" and then execute.

## Communication Guidelines

- Use Chinese for all conversations, explanations, code review results, and plan file content.
- Use English for all code-related content: code, code comments, documentation, UI strings, commit messages, and PR titles or descriptions.

## Development Guidelines

### Core Coding Principles

- Always search documentation and existing solutions first.
- Read template files, adjacent files, and surrounding code to understand existing patterns.
- Learn code logic from related tests.
- Review implementation after multiple modifications to the same code block.
- Keep project docs, PRDs, todo files, and changelogs consistent with actual changes when they exist.
- After three or more failed attempts, add debug logging and try different approaches. Only ask the user for runtime logs when the issue requires information the agent literally cannot access, such as production environment details or device-specific behavior.
- For frontend projects, never run dev, build, start, or serve commands. Verify through code review, type checking, and linting instead.
- Never add time estimates to plans, such as "Phase 1 (3 days)" or "Phase 2 (1 week)." Just write the code.
- Never read secret files, print secret values, or hardcode secrets in code.

### Code Comments

- Comment why, not what.
- Prefer JSDoc over line comments.
- Comments are required for complex business logic, module limitations, and design trade-offs.

## Tool Preferences

### Package Management

- Development tools are managed via `proto`, including Bun, Node.js, and pnpm.
- Python commands should always use `uv`.
- JavaScript and TypeScript work should check the lock file for the package manager.

### Search And Documentation

- Use `fd` for file search when available.
- Use `rg` for content search.
- Use the `gh` CLI for all GitHub operations.
- Check official package documentation for latest usage.

## Subagents

- Always wait for all subagents to complete before yielding.
- Worker-local subagents are session-internal implementation details, not visible-worker substitutes or lifecycle owners.
- Their authority and runtime permission are strict subsets of the parent worker envelope.
- Use `prohibited`, `worker_discretion`, or `encouraged`; tracked phases default to `worker_discretion`.
- Promote work to a visible parallel worker when it becomes cross-phase, long-running, independently human-steered, independently outcome-bearing, or the owner of distinct mutable state.

## Output Style

- Use plain, clear language. Avoid jargon and code-speak. Write as if explaining to a smart person who is not looking at the code. Keep technical rigor in the work itself, not in how it is described.
- State the core conclusion or summary first, then provide further explanation.
- For code reviews, debugging explanations, and code walkthroughs, quote the smallest relevant code snippet directly in the response before giving file paths or line references.
- Do not rely on file paths and line numbers alone when an inline snippet would explain the point faster. Treat file paths as supporting evidence, not the main payload.
- When referencing specific code, always provide the corresponding file path.

### References

Always provide complete reference links or file paths at the end of responses:

- External resources: full clickable links for GitHub issues, discussions, PRs, documentation, and API references.
- Source code references: complete file paths for functions, classes, or code snippets mentioned.

## Compact Instructions

When compressing context, preserve in priority order:

1. Architecture decisions and design trade-offs. Never summarize these away.
2. Modified files and their key changes.
3. Current task goal and verification status.
4. Open TODOs and known dead ends.
5. Tool outputs. Keep pass or fail verdicts; discard verbose output when safe.

## Shell And Token-Saving Preferences

Use output-compressing command wrappers for shell commands likely to produce medium or large output, especially Git operations, broad searches, large file or tree reads, diffs, tests, builds, linters, logs, GitHub CLI, Docker, Kubernetes, curl, and JSON or log formatting.

Skip command wrappers for trivial commands or tiny targeted reads where compression adds overhead without saving context.

## Leaf Workspace Root Policy

- A narrow leaf workspace is allowed for context control, but durable Harness state stays rooted at one authority root.
- Inside a git worktree, treat that git top-level as the authority-root boundary by default; do not walk above it for a different project root unless an explicit override is present: `--root`, `HARNESS_PROJECT_ROOT`, or `.harness/authority-root.json` inside the worktree.
- `planning/active/<task-id>/` stays single-homed at the authority root; `install`, `sync`, `verify`, `record`, `summary`, and `doctor` still act on that root even from a linked leaf workspace.
