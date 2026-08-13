# Harness Plugin Release Artifacts

Each release produces two packaged artifacts built from the same Trio skill sources:

- `harness-codex-plugin-<version>.tgz`
- `harness-agent-plugins-<version>.tgz`
- `manifest.json`
- `SHA256SUMS`
- `release-notes.md`

The Codex package contains `.codex-plugin/plugin.json`, exactly four Trio skills (the entry policy plus `dev`, `office`, and `safety`) under `skills/trio/`, and one ChiefOps governance companion under `skills/chiefops/`.

The Agent Plugins package is the portable, vendor-neutral artifact. It contains a root `plugin.json` with the closed Agent Plugins v1 schema (`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) and five immediate skill children, because Agent Plugins discovery is non-recursive:

```text
plugin.json
skills/trio/SKILL.md
skills/dev/SKILL.md
skills/office/SKILL.md
skills/safety/SKILL.md
skills/chiefops/SKILL.md
```

It contains no Codex interface metadata, no MCP, no hooks, and no runtime executables.

For download and local Codex installation, see [Harness Packed Plugin Installation](install/plugin-packages.md). For the portable package, see [Agent Plugins Installation](install/agent-plugins.md).

## Build

```sh
npm run release:pack
```

The build writes local artifacts to `dist/release/<version>/`.

## Verification gates

Before a human makes any release or publication decision, run:

```sh
npm run plugin:verify
npm run release:pack
npm run plugin:smoke
npm run verify:trio
```

`npm run plugin:smoke` verifies both packages — the native Codex package (four Trio skills plus the ChiefOps governance companion) and the portable Agent Plugins package (root `plugin.json` plus five flat skills) — including manifest schema, discovery layout, and root-containment validation. It is local artifact evidence, not a publication action.

## Install evidence

Validate the downloaded `harness-codex-plugin-<version>.tgz` through the Codex marketplace path. Confirm that `.codex-plugin/plugin.json`, the four `skills/trio/**/SKILL.md` files, and the `skills/chiefops/SKILL.md` governance companion are present. For the portable package, validate `harness-agent-plugins-<version>.tgz` by confirming the root `plugin.json` `$schema` and the five flat `skills/<name>/SKILL.md` files, then follow the target client's own installation procedure. If a client CLI is unavailable, record that limitation and do not claim host-level installation verification.
