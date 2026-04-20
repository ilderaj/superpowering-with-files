# Context Governance Regression Report

Date: 2026-04-20
Branch: `dev`
Merge result: `dev` fast-forwarded to `codex/global-context-remediation`
Head: `c67964c Complete context governance rollout gates`

## Scope

This regression covers the context-governance remediation across Codex, GitHub Copilot, Cursor, and Claude Code.

Validated areas:

- context budget loading, malformed-budget handling, and health reporting
- thin entry rendering through policy profiles
- compact planning hot-context generation and projected hook execution
- slim superpowers hook payloads and hook budget measurement
- `full` and `minimal-global` skill profiles
- workspace and user-global path resolution for supported IDE targets
- release and maintenance rollout gates

No real user-global files were modified during compatibility calibration. User-global checks used a disposable repository copy and a disposable `HOME`.

## Pre-Merge Verification

Executed on isolated branch `codex/global-context-remediation`.

| Check | Result |
| --- | --- |
| Targeted remediation suite | Pass: 65 passed, 0 failed |
| Full repository verification | Pass: 154 passed, 0 failed |
| Harness CLI smoke | Pass: `verify --output=stdout`, `sync --dry-run`, `doctor --check-only` |
| Git whitespace check | Pass: `git diff --check` |
| Personal path scan | Pass outside `planning/`: no `/Users/jared` in README/docs/harness/tests/scripts/package metadata |
| Independent review | Findings fixed before merge |

## Post-Merge Verification

Executed after fast-forwarding local `dev`.

| Check | Result |
| --- | --- |
| Targeted remediation suite | Pass: 65 passed, 0 failed |
| Full repository verification | Pass: 154 passed, 0 failed |
| Harness CLI smoke | Pass: `verify --output=stdout`, `sync --dry-run`, `doctor --check-only` |
| Git whitespace check | Pass: `git diff --check` |
| Git status | Clean, `dev` ahead of `origin/dev` by 18 commits |

`doctor --check-only` reports five existing historical companion-plan back-reference warnings. They are not introduced by this remediation and do not fail the check.

## IDE Compatibility Calibration

The compatibility calibration ran twice in a disposable clone with a disposable `HOME`:

- default state: `scope=both`, `targets=all`, `projection=portable`, `full`, hooks off
- adoption state: `scope=both`, `targets=all`, `projection=portable`, `minimal-global`, hooks on

Results for both pre-merge and post-merge calibration:

| Area | Result |
| --- | --- |
| Targets | Codex, GitHub Copilot, Cursor, Claude Code |
| Health problems | 0 |
| Context warnings | 0 |
| Rendered entries | 7 generated and verified |
| Hook configs | workspace and user-global hook configs generated for supported paths |
| Planning skill roots | workspace and user-global `planning-with-files` projections generated |
| Worst target entry verdict | `ok` |
| Worst target entry tokens | 2550 approx tokens |
| Hook payload measurements | Codex measured hook payloads present when hooks are on |

Generated entry paths:

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/harness.mdc`
- `CLAUDE.md`
- `~/.codex/AGENTS.md`
- `~/.copilot/instructions/harness.instructions.md`
- `~/.claude/CLAUDE.md`

Generated hook paths:

- `.codex/hooks.json`
- `.github/hooks/planning-with-files.json`
- `.cursor/hooks.json`
- `.claude/settings.json`
- `~/.codex/hooks.json`
- `~/.copilot/hooks/planning-with-files.json`
- `~/.cursor/hooks.json`
- `~/.claude/settings.json`

Generated planning skill roots:

- `.agents/skills/planning-with-files/SKILL.md`
- `.github/skills/planning-with-files/SKILL.md`
- `.cursor/skills/planning-with-files/SKILL.md`
- `.claude/skills/planning-with-files/SKILL.md`
- `~/.agents/skills/planning-with-files/SKILL.md`
- `~/.copilot/skills/planning-with-files/SKILL.md`
- `~/.cursor/skills/planning-with-files/SKILL.md`
- `~/.claude/skills/planning-with-files/SKILL.md`

## Regression-Specific Findings

During compatibility calibration, the entry budget summary initially treated all IDE entry files as a single cumulative session. That produced a false `context entry summary problem` for `scope=both --targets=all`, even though a real session loads only one IDE target's entry set.

The fix changes the summary model:

- entries are still measured individually
- workspace plus user-global entries are aggregated per target
- `health.context.summary.entries` now reports the worst target session
- a worst-target `problem` verdict now enters `health.problems`
- tests cover both the cross-IDE false-positive case and the real single-target aggregate problem case

## Verdict

Regression passed.

The remediation is merged into local `dev`, all supported IDE paths and constraints were verified in isolated compatibility calibration, and post-merge regression passed with no blocking health problems.
