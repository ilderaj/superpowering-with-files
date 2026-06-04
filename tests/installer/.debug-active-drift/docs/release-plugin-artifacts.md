# Harness Plugin Release Artifacts

Release `1.0.6` ships a runtime package and packed plugin packages for all supported IDE targets.

For end-user download and IDE-specific install steps, see [Harness Packed Plugin Installation](install/plugin-packages.md).

## Artifacts

- `harness-runtime-1.0.6.tgz`
- `harness-codex-plugin-1.0.6.tgz`
- `harness-claude-code-plugin-1.0.6.tgz`
- `harness-cursor-plugin-1.0.6.tgz`
- `harness-copilot-plugin-1.0.6.tgz`
- `manifest.json`
- `SHA256SUMS`
- `release-notes.md`

## Build

Run:

```sh
npm run release:pack
```

The build writes release assets to `dist/release/1.0.6/`.

## Verification Gates

Run these before publishing a GitHub release:

```sh
npm run plugin:verify
npm run release:pack
npm run plugin:smoke
npm run verify
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
```

`npm run plugin:smoke` builds the release, extracts every packed plugin, runs platform contract preflight, and verifies the runtime package contains CLI and MCP entrypoints.

## Install Evidence

Each target plugin must be installed or validated through the corresponding official plugin path before release promotion when the host CLI is available:

- Codex: install the Codex packed plugin and verify the generated skill, hook config, and MCP server policy entry.
- Claude Code: load the packed plugin directory or archive and verify `.claude-plugin/plugin.json`, `skills/harness/SKILL.md`, hooks, and `.mcp.json` or plugin MCP equivalent.
- Cursor: install through Cursor plugin flow and verify rules, skills, hooks, and MCP wrapper visibility.
- GitHub Copilot: validate the CLI/plugin path locally and separately confirm cloud-agent constraints only rely on MCP tools.

If a host CLI is unavailable on the release machine, record that as a release finding and do not claim host-level install verification for that target without an explicit owner waiver.
