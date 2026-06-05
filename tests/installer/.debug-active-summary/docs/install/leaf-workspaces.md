# Leaf Workspaces

Harness supports opening a narrow leaf workspace inside a larger repository while keeping planning and Harness state authoritative at the repository root.

Two roots matter:

- `workspace cwd`: the directory your host app opens for a smaller context window
- `authority root`: the single repo-owned root for `planning/active/<task-id>/`, `.harness/state.json`, verification artifacts, and other Harness state

`planning/active/<task-id>/` stays single-homed under the authority root. Harness does not duplicate planning files into leaf directories.

## Default resolution order

When a command or hook starts from a leaf workspace, Harness resolves the authority root in this order:

1. explicit `--root`
2. `HARNESS_PROJECT_ROOT`
3. `.harness/authority-root.json` found inside the current git worktree
4. current git top-level
5. non-git fallback markers such as `.harness/state.json`, `planning/active`, or `scripts/harness`
6. current working directory

Important boundary: if the current directory is already inside a git worktree, default discovery stops at that git root. Harness does not continue walking upward into parent folders looking for a different project root unless you opt in with an explicit override.

## Default behavior from a leaf workspace

When started from `packages/demo/` or another leaf directory inside the repo:

- `summary`, `record`, `active-summary`, `status`, and `doctor` still use root planning and Harness state
- `install`, `sync`, `verify`, `checkpoint`, `checkpoint-push`, `fetch`, and `update` still target the authority root by default
- hooks still read active planning from the authority root

This prevents duplicate projection trees and duplicate planning state under the leaf directory.

## When to use `HARNESS_PROJECT_ROOT`

Use `HARNESS_PROJECT_ROOT` when:

- the host app launches from a location that is not inside the intended repository
- you need a temporary explicit override without writing local metadata
- automation already knows the correct root and should pass it directly

Example:

```bash
HARNESS_PROJECT_ROOT=/path/to/repo ./scripts/harness summary
```

## Explicit leaf override

For ambiguous or out-of-tree setups, create a local override file:

```bash
./scripts/harness workspace-link --root /path/to/repo
```

This writes:

```text
.harness/authority-root.json
```

Example content:

```json
{
  "schemaVersion": 1,
  "authorityRoot": "../.."
}
```

`authorityRoot` is stored as a relative path from the override file directory.

Use this only as an explicit escape hatch. Normal in-repo leaf workspaces should resolve through git top-level without extra setup.

## Operator notes

- keep planning only under the authority root
- treat `workspace-link` as advanced configuration, not the default install path
- if directories move, rerun `workspace-link` instead of hand-editing the JSON
