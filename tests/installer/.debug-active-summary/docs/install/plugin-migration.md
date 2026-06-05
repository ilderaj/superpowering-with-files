# Harness Plugin Migration

This guide moves an existing global Harness adoption to the packed plugin model without deleting current user files first.

## Baseline Capture

Run:

```sh
./scripts/harness plugin doctor
./scripts/harness plugin migrate --target=codex --dry-run
```

The doctor treats existing global adoption as a migration seed. It should be used to record current projected entry files, skills, hooks, MCP configuration, and `.harness/state.json` before any plugin-first cutover.

## Shadow Install

Install the packed plugin for one target while keeping the existing global Harness projection in place. Start with Codex or Claude Code because those targets have the strongest local plugin and hook evidence in this repository.

## Dual Run

During Dual Run, keep existing global entry files as fallback while the plugin provides the generated Harness skill, hooks, and MCP runtime wrapper. Compare:

- `./scripts/harness doctor --check-only`
- `./scripts/harness plugin doctor`
- platform-specific plugin load output
- MCP server startup evidence

## Cutover

Cut over one target at a time. Recommended order:

1. Codex
2. Claude Code
3. Cursor
4. GitHub Copilot

Do not remove global projections during the same step that introduces a plugin. A successful cutover requires doctor evidence, plugin load evidence, and a smoke test for the packed artifact.

## Rollback

Rollback means disabling or uninstalling the target plugin and returning to the pre-plugin global Harness projection. Do not delete old global files until the plugin path has passed repeated doctor checks and the user explicitly approves cleanup.

For now, `harness plugin migrate` is intentionally dry-run only. Destructive cleanup belongs in a later command after release users have validated the shadow-install path.
