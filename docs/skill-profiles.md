# Skill Profiles And Projection Map

This page is the canonical operator reference for the relationship between a Harness skill profile, its entry-policy profile, and the projected skills. Personal-global adoption uses the legacy stateful installer; this repository uses the committed workspace skill control plane.

## Projection Rules

- Every listed skill is projected with the `materialize` strategy.
- Codex, GitHub Copilot, and Cursor use `.agents/skills/<skill-name>` for workspace scope and `~/.agents/skills/<skill-name>` for user-global scope.
- Claude Code uses `.claude/skills/<skill-name>` for workspace scope and `~/.claude/skills/<skill-name>` for user-global scope.
- A profile selects an allow-list; it does not change the durable task authority. For tracked work, `planning/active/<task-id>/` remains the only task-memory root.
- Personal/global: `sync --dry-run` shows paths from `.harness/state.json`; select with `install --skills-profile=<name>` or `adopt-global --skills-profile=<name>`.
- This repository: `workspace-skills plan|sync|check|set` reads `harness/workspace-skill-profile.json` and owns only `.agents/skills`, `.claude/skills`, and `.harness/workspace-skill-projections.json`. It never rewrites personal-global state, entries, hooks, safety settings, or backups.

## Profile Map

| Skill profile | Default selection | Entry-policy profile | Intended use | Superpowers projected? |
| --- | --- | --- | --- | --- |
| `minimal-global` | default for user-global and `both` scope | `always-on-core` | lean cross-repository baseline | no |
| `standard` | default for workspace installs | `always-on-core` | normal coding work with Matt disciplines | no |
| `copilot-default` | default for workspace installs targeting only Copilot | `always-on-core` | same lightweight coding baseline for Copilot-only installs | no |
| `office` | explicit | `always-on-core` | document, spreadsheet, presentation, and PDF work | no |
| `second-opinion-advisory` | explicit opt-in | `always-on-core` | prepare and record a human-approved external second opinion; explicit one-shot InBrowser submission is available without a bundled provider runtime | no |
| `matt-pilot` | experimental | `always-on-core` | matched-task Matt-only coding/workflow arm | no |
| `superpowers-pilot` | experimental | `always-on-core` | matched-task Superpowers-only coding/workflow arm | yes; no `using-superpowers` |
| `hybrid-candidate` | experimental | `high-assurance` | production composition candidate with human-gated second opinions, including explicit one-shot InBrowser submission | lifecycle toolbox only |
| `high-assurance` | explicit | `high-assurance` | hybrid plus release-closure governance | lifecycle toolbox only |
| `full` | explicit compatibility alias | `high-assurance` | compatibility name for `high-assurance` | selected toolbox only |

An explicit `--profile=<entry-policy-profile>` overrides this mapping. An explicit `--skills-profile=<skill-profile>` still controls the projected skill allow-list.

## Skill Allow-Lists

### Common foundations

| Skill | Source | Included by |
| --- | --- | --- |
| `planning-with-files` | Planning with Files upstream | every profile |
| `office-work-quality` | Harness-owned | every profile; routes to host-native Office artifact skills without replacing them |
| `risk-assessment-before-destructive-changes` | Harness-owned | Standard family, all pilots, hybrid/high/full |
| `safe-bypass-flow` | Harness-owned | Standard family, all pilots, hybrid/high/full |
| `second-opinion-advisory` | Harness-owned | dedicated advisory profile and hybrid/high/full |

### Human-gated second-opinion advisory

`second-opinion-advisory` is a dedicated, non-default profile. It projects only
`planning-with-files` and the local `second-opinion-advisory` skill for a minimal
consultation workspace. The same skill is also included in `hybrid-candidate`,
`high-assurance`, and `full`, where it remains dormant until the user explicitly
requests a human-approved external second opinion.

The skill has two modes. `manual` is the default: it prepares a reviewable
preflight record, requires explicit human confirmation before disclosure, and
leaves submission to the human. `browser-assisted` is available only when the
user explicitly requests the in-app Browser and gives a second, one-shot
agent-operated confirmation bound to the exact package SHA-256, destination,
and displayed model label. It submits the exact package once, then stops on
any mismatch, authentication challenge, unavailable model, timeout, or
ambiguous submit state; it never falls back or retries.

Neither mode bundles or installs an Oracle CLI, provider SDK, MCP server,
browser controller, session store, or external API. Browser-assisted mode uses
only a host-native in-app Browser interaction surface and must not inspect
credentials, cookies, local storage, passwords, or session data. Returned
content remains untrusted advisory evidence and cannot trigger automatic
implementation or other state changes.

Select this profile explicitly when its narrow workflow is needed:

```bash
./scripts/harness install --scope=workspace --targets=codex --skills-profile=second-opinion-advisory
```

The explicit dedicated selection changes only the selected installation's skill
allow-list. Adding the skill to the hybrid family does not alter `standard`,
`minimal-global`, `office`, the workspace default, or the Harness MCP surface.

### Matt Skills: lightweight coding disciplines

The Matt upstream is nested by category. Harness selects the source-relative leaf and projects the final leaf name; for example, `engineering/tdd` becomes `<skill-root>/tdd`.

| Projected skill | Matt source leaf | Included by |
| --- | --- | --- |
| `tdd` | `engineering/tdd` | `minimal-global`, Standard family, `matt-pilot`, hybrid/high/full |
| `diagnosing-bugs` | `engineering/diagnosing-bugs` | `minimal-global`, Standard family, `matt-pilot`, hybrid/high/full |
| `code-review` | `engineering/code-review` | `minimal-global`, Standard family, `matt-pilot`, hybrid/high/full |
| `codebase-design` | `engineering/codebase-design` | Standard family, `matt-pilot`, hybrid/high/full |
| `domain-modeling` | `engineering/domain-modeling` | Standard family, `matt-pilot`, hybrid/high/full |

All five production leaves have fail-closed Harness projection patches. TDD, debugging, and review remain Matt-owned in every production profile; a production profile never also exposes the Superpowers version of the same concern.

### Matt admission ledger

| Category | Leaves | Decision |
| --- | --- | --- |
| Production default | `tdd`, `diagnosing-bugs`, `code-review`, `codebase-design`, `domain-modeling` | adapted and projected by Standard |
| Explicit pilot tools | `implement`, `research`, `prototype`, `improve-codebase-architecture`, `grill-with-docs`, `grilling`, `writing-great-skills` | adapted; projected only by `matt-pilot` |
| Tracker/workflow authority | `setup-matt-pocock-skills`, `to-spec`, `to-tickets`, `triage`, `wayfinder` | rejected: would compete with the task trio or Harness routing |
| In-progress/deprecated/personal/host-specific | corresponding upstream folders plus `ask-matt`, merge/setup miscellany | rejected from managed profiles: unstable, personal, deprecated, or host-specific |
| Other productivity references | `grill-me`, `handoff`, `teach` | vendored but not admitted; no demonstrated recurring gap in the Harness workflow |

Projection patches preserve upstream refreshability: vendored bytes stay unchanged, anchors fail closed on drift, and sibling markers cover `codebase-design/DESIGN-IT-TWICE.md`.

### Daily Harness governance

Frequent Harness-owned governance belongs in Standard, not behind a Superpowers profile.

| Projected skill | Purpose |
| --- | --- |
| `goal-writer` | shape a bounded native `/goal` request |
| `goal2plan` | turn sparse complex intake into a reviewed plan |
| `overengineering-review` | identify unnecessary complexity |
| `simplification-ledger` | preserve deliberate simplification decisions |
| `chiefops` | read-only tracked-task governance lens |

`autonomous-release-closure` is the exception: it remains only in `high-assurance`/`full` because it governs operations and release closure.

### High-assurance Superpowers toolbox

Production hybrid/high profiles project only non-overlapping lifecycle skills:

| Projected skill | Harness role |
| --- | --- |
| `writing-plans` | detailed plan support; task authority remains Planning with Files |
| `executing-plans` | execute an approved plan with bounded replan guidance |
| `verification-before-completion` | completion-proof discipline |
| `using-git-worktrees` | isolated worktree guidance |
| `finishing-a-development-branch` | conservative branch closure guidance |

The isolated `superpowers-pilot` adds Superpowers TDD, debugging, review, and SDD for matched replay, while excluding every Matt skill. This is an experiment surface, not a production union.

`using-superpowers` is intentionally projected by no profile. Harness does not install a Superpowers session-start hook and does not make brainstorming, grilling, subagents, or code-level plans mandatory for ordinary work.

## Office Boundary

`office-work-quality` is a routing and acceptance skill, not an Office runtime replacement. It invokes the host-native `documents`, `spreadsheets`, `presentations`, and `pdf` skills when they match the artifact, then requires source/data validation and rendered/opened artifact inspection. See [Office Templates](office-templates.md) for lightweight task shapes.

## Inspect Or Change A Profile

```bash
# Workspace default: standard + always-on-core.
./scripts/harness install --scope=workspace --targets=all

# Explicit high-assurance profile and its paired entry policy.
./scripts/harness install --scope=workspace --targets=codex --skills-profile=high-assurance

# Inspect persisted-state projections without writing target files.
./scripts/harness sync --dry-run

# Govern this repository without changing personal-global state.
./scripts/harness workspace-skills set --skill-profile=standard
./scripts/harness workspace-skills plan
./scripts/harness workspace-skills sync --takeover
./scripts/harness workspace-skills check
```

Do not pass a skill profile directly to `sync`: it uses the persisted Harness state. Re-run `install` or `adopt-global` with the desired profile first, preferably in a disposable fixture/home when validating user-global adoption.

`workspace-skills set` is intentionally different: it updates the committed repository desired profile only. Review that diff before sync. `--takeover` is required for a first managed adoption and refuses modified, ambiguous, untracked, partial, or symlinked known skill directories. Unknown skill directories are preserved. To roll back a profile change, restore the desired profile and runtime workspace manifest from the prior revision and sync; to remove the control plane itself, restore the captured tracked skill-root receipt and delete only the runtime workspace manifest.

See [Skill Profile Evaluation](skill-profile-evaluation.md) for the matched-task trial contract. No production winner is inferred from static analysis alone.
