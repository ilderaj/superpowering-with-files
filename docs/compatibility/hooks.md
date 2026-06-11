# Hooks Compatibility

superpowering-with-files does not force hooks during installation.

Hooks can be powerful but invasive. They may mutate global IDE or agent behavior and differ across platforms. The default install renders policy and skill projections only.

Hook installation must be explicit:

```bash
./scripts/harness install --scope=workspace --targets=all --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
```

## Support Matrix

| Hook source | Codex | GitHub Copilot | Cursor | Claude Code |
| --- | --- | --- | --- | --- |
| `planning-with-files` task-scoped hook | Supported via verified-event allowlist when hooks are enabled in the installed Codex build; Harness retains `SessionStart` and `UserPromptSubmit` and omits planning `Stop` | Supported | Supported | Supported |
| `superpowers` session-start hook | Supported via Harness wrapper | Supported | Supported | Supported |

Supported means Harness has an adapter whose path/schema contract is backed by official platform documentation. That platform-level support is separate from event-level verification: Codex needs hooks enabled in the installed build, but Harness only projects the Codex events it has verified for each adapter. VS Code hooks are preview functionality and may be disabled by org policy; Cursor's Claude-compatible path requires the Third-party skills feature.

Planning hooks are not the only hooks in this repository. When the `safety` profile is installed with hooks enabled, Harness can also project safety-hook behavior for supported targets.

Hook evidence is tracked in layers:

- config: the projected hook config or settings entry exists and uses the expected adapter shape
- payload: the projected hook script can be executed locally and returns the expected schema
- runtime: the projected hook actually ran in a live agent session and wrote trace evidence

## Projected Files

| Target | Workspace hook files | User-global hook files |
| --- | --- | --- |
| Codex | `.codex/hooks.json`, `.codex/hooks/*` | `~/.codex/hooks.json`, `~/.codex/hooks/*` |
| GitHub Copilot | `.github/hooks/planning-with-files.json`, `.github/hooks/superpowers.json`, `.github/hooks/task-scoped-hook.sh`, `.github/hooks/session-start` | `~/.copilot/hooks/planning-with-files.json`, `~/.copilot/hooks/superpowers.json`, `~/.copilot/hooks/task-scoped-hook.sh`, `~/.copilot/hooks/session-start` |
| Cursor | `.cursor/hooks.json`, `.cursor/hooks/*` | `~/.cursor/hooks.json`, `~/.cursor/hooks/*` |
| Claude Code | `.claude/settings.json`, `.claude/hooks/*` | `~/.claude/settings.json`, `~/.claude/hooks/*` |

## Merge Rules

Harness merges hook config files conservatively. Claude Code hook entries are merged into the `hooks` field of its settings JSON files.

- Harness-managed entries include a `Harness-managed ... hook` description.
- `sync` replaces the previous Harness-managed entry for the same skill.
- User-managed hook entries are preserved.
- Malformed hook config or settings JSON files are not modified unless `sync --conflict=backup` is used.

## Planning-With-Files Hook Behavior

The planning-with-files hook is task-scoped. It reads active task plans from `planning/active/<task-id>/task_plan.md`, recent progress from `planning/active/<task-id>/progress.md`, and emits context for the verified hook events projected for each target. On Codex, the retained planning events are `SessionStart` and `UserPromptSubmit`.

It does not create a second planning system. It does not read root-level `task_plan.md`, `findings.md`, or `progress.md` files. It does not archive tasks. `session-start` writes a task-local `.session-start` sidecar. `stop`, `agent-stop`, and `session-end` emit a structured session summary rendered from `planning/active/<task-id>/{task_plan.md,progress.md,findings.md}` and that sidecar, bounded by `harness/core/context-budgets.json::hookPayload.warn`. When more than one active task exists, Harness records a warning that planning hot context measurement was skipped instead of pretending the measurement is meaningful. Run `./scripts/harness summary` to reproduce the same output without relying on hooks.

Goal-loop discipline does not depend on hooks. The Goal Round Start Protocol for `/goal`, `/plan-goal`, `/plan-loop`, and similar continuation flows lives in rendered policy and skill guidance. Hooks only inject compact reminders to reopen the authoritative planning files, reclassify the current round, and resume from the current task state.

Hooks also do not auto-launch `goal2plan`. When intake is too sparse for a credible implementation plan, operators invoke the projected `goal2plan` skill explicitly; hooks may remind the round to restore planning context, but they do not create a separate plan-generation runner.

Plan-location diagnostics are separate from hook behavior. `./scripts/harness doctor` warns when it sees root-level task files, `docs/superpowers/plans/*.md`, or `docs/plans/*.md`, but these warnings do not fail health checks because those files may be historical or explicitly requested project documentation.

## Safety Hook Behavior

When safety hooks are installed, they can classify commands as `allow`, `ask`, or `deny` based on workspace boundaries, target paths, and dangerous command patterns.

Those hook decisions are repository-owned guidance only. Host-platform approval prompts for terminal, network, or credential-sensitive operations remain outside repo-owned logic, so a host may still block or prompt even after a safety hook returns `allow` or `ask`.

Smoke test after `sync`:

```bash
bash .codex/hooks/task-scoped-hook.sh codex session-start
bash .cursor/hooks/session-start
bash .github/hooks/task-scoped-hook.sh copilot session-start
bash .claude/hooks/task-scoped-hook.sh claude-code user-prompt-submit
./scripts/harness summary --task <task-id>
```

Run only the command for the target that was installed. A repository with no active tasks should return an empty JSON object.
