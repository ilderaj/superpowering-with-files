# Harness Policy For Claude Code

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

## When Superpowers Is Allowed


Use superpowers only when:

- architecture is unclear
- requirements are ambiguous
- debugging is complex
- root cause is not obvious
- deep structured reasoning is explicitly requested

## When Superpowers Is Not Allowed


Do not use superpowers for:

- trivial edits
- simple bug fixes
- straightforward feature implementation
- renames, moves, formatting, or low-risk refactors
- routine implementation even if a skill might loosely apply
- tasks where direct execution is clear and the reasoning value does not justify the token cost

## Communication Guidelines


- Use Chinese for all conversations, explanations, code review results, and plan file content.
- Use English for all code-related content: code, code comments, documentation, UI strings, commit messages, and PR titles or descriptions.

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

## Claude Code Platform Notes

# Claude Code Override

Claude Code can use `CLAUDE.md`, skills, plugins, and hooks.

Render a thin `CLAUDE.md` entry file and materialize per-skill projections under `.claude/skills`. Do not install or mutate hooks unless the user explicitly selects hook installation.

## Leaf Workspace Root Policy

- A narrow leaf workspace is allowed for context control, but durable Harness state remains rooted at one authority root.
- By default, when the current directory is inside a git worktree, treat that git top-level as the authority-root boundary.
- Do not keep walking above the git root looking for a different project root unless one of these explicit overrides is present:
  - `--root`
  - `HARNESS_PROJECT_ROOT`
  - `.harness/authority-root.json` inside the current git worktree
- `planning/active/<task-id>/` stays single-homed at the authority root.
- `install`, `sync`, `verify`, `record`, `summary`, `doctor`, and related commands should still act on the authority root even when launched from a linked leaf workspace.
