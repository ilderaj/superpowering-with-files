# Hybrid Workflow Policy

This project uses a hybrid workflow:

- `planning-with-files` is the persistent memory and planning system.
- `superpowers` is an optional, temporary reasoning tool.
- Persistent task state must live only in:
  - `planning/active/<task-id>/task_plan.md`
  - `planning/active/<task-id>/findings.md`
  - `planning/active/<task-id>/progress.md`
  - explicitly closed task state may move to `planning/archive/<timestamp>-<task-id>/`

## Default Behavior

By default:

- Do not invoke superpowers.
- Do not perform heavyweight workflow routing for simple tasks.
- Directly execute straightforward work.
- Keep the active task's three markdown files updated.
- Isolate concurrent work by task id instead of sharing one project-root planning file set.
- At the start of complex work, scan existing active tasks when stale context may matter, but do not move legacy or completed-looking tasks automatically.

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

## Mandatory Sync-Back Rule

Whenever superpowers is used:

1. Finish the reasoning pass.
2. Summarize durable decisions back into:
   - `planning/active/<task-id>/task_plan.md`
   - `planning/active/<task-id>/findings.md`
   - `planning/active/<task-id>/progress.md` if relevant
3. Return to normal low-cost execution mode.

If a superpowers skill suggests saving long-lived plans under `docs/superpowers/plans/`, treat that as overridden by this project policy unless the user explicitly asks for that file. Durable plans must be represented in the active task's planning files instead.

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
- Never use permission-seeking patterns. They are all ways of asking permission to continue. Just do the work.
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
- Spawn subagents automatically for parallelizable work such as install plus verify, test plus typecheck, or multiple independent tasks from a plan.
- Spawn subagents automatically for long-running or blocking tasks where a worker can run independently.
- Spawn subagents automatically when isolation is useful for risky changes or checks.

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
