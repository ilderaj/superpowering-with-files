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
| `planning-with-files` task-scoped hook | Supported with Codex event limits | Supported | Provisional | Supported |
| `superpowers` session-start hook | Supported via Harness wrapper | Unsupported | Provisional | Supported |

Unsupported means Harness has no verified adapter for that target's hook schema. Provisional means Harness can project the hook, but this repository does not currently cite an official hooks documentation page for that target's path/schema contract. Unsupported and provisional hooks are reported by `./scripts/harness status` and `./scripts/harness doctor --check-only`, but they do not fail health checks when projection itself is healthy.

## Projected Files

| Target | Workspace hook files | User-global hook files |
| --- | --- | --- |
| Codex | `.codex/hooks.json`, `.codex/hooks/*` | `~/.codex/hooks.json`, `~/.codex/hooks/*` |
| GitHub Copilot | `.github/hooks/planning-with-files.json`, `.github/hooks/task-scoped-hook.sh` | `~/.copilot/hooks/planning-with-files.json`, `~/.copilot/hooks/task-scoped-hook.sh` |
| Cursor | `.cursor/hooks.json`, `.cursor/hooks/*` | `~/.cursor/hooks.json`, `~/.cursor/hooks/*` |
| Claude Code | `.claude/settings.json`, `.claude/hooks/*` | `~/.claude/settings.json`, `~/.claude/hooks/*` |

## Merge Rules

Harness merges hook config files conservatively. Claude Code hook entries are merged into the `hooks` field of its settings JSON files.

- Harness-managed entries include a `Harness-managed ... hook` description.
- `sync` replaces the previous Harness-managed entry for the same skill.
- User-managed hook entries are preserved.
- Malformed hook config or settings JSON files are not modified unless `sync --conflict=backup` is used.

## Planning-With-Files Hook Behavior

The planning-with-files hook is task-scoped. It reads active task plans from `planning/active/<task-id>/task_plan.md`, recent progress from `planning/active/<task-id>/progress.md`, and emits context for supported hook events.

It does not create a second planning system. It does not read root-level `task_plan.md`, `findings.md`, or `progress.md` files. It does not archive tasks. Stop-style events only remind the agent to update the active task files and confirm the lifecycle block.

Plan-location diagnostics are separate from hook behavior. `./scripts/harness doctor` warns when it sees root-level task files, `docs/superpowers/plans/*.md`, or `docs/plans/*.md`, but these warnings do not fail health checks because those files may be historical or explicitly requested project documentation.

Smoke test after `sync`:

```bash
bash .codex/hooks/task-scoped-hook.sh codex session-start
bash .cursor/hooks/task-scoped-hook.sh cursor session-start
bash .github/hooks/task-scoped-hook.sh copilot session-start
bash .claude/hooks/task-scoped-hook.sh claude-code user-prompt-submit
```

Run only the command for the target that was installed. A repository with no active tasks should return an empty JSON object.
