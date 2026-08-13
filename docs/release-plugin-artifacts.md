# Harness Plugin Release Artifacts

Each release produces four packaged artifacts:

- `harness-codex-plugin-<version>.tgz`
- `harness-agent-plugins-<version>.tgz`
- `harness-matt-skills-codex-plugin-<version>.tgz`
- `harness-matt-skills-agent-plugins-<version>.tgz`
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

## Optional Matt companion packages

`harness-matt-skills-codex-plugin-<version>.tgz` and `harness-matt-skills-agent-plugins-<version>.tgz` are independent, opt-in companion packages. They make no change to Trio or its projection: the core artifacts remain the only packages that contain the Trio skills and ChiefOps governance companion.

Each companion contains only `grill-me`, `grilling`, and `to-questionnaire`, plus its host manifest, `LICENSE`, and `UPSTREAM.json`. `grill-me` and `grilling` are explicit opt-in skills. `to-questionnaire` creates a local Markdown draft; external delivery remains human-gated.

The native companion uses its own `.codex-plugin/plugin.json` marketplace package. The portable companion has a root `plugin.json` and three flat skill directories for non-recursive Agent Plugins discovery. It remains client-owned: follow the compatible client's own procedure and do not claim a remote install.

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

`npm run plugin:smoke` verifies all four packages — the native Codex package (four Trio skills plus the ChiefOps governance companion), the portable Agent Plugins package (root `plugin.json` plus five flat skills), and the two opt-in Matt companion packages — including manifest schema, discovery layout, and root-containment validation. It is local artifact evidence, not a publication action.

## Install evidence

Validate every downloaded archive against `SHA256SUMS` and its entry in `manifest.json`. Validate `harness-codex-plugin-<version>.tgz` through the Codex marketplace path: `.codex-plugin/plugin.json`, the four `skills/trio/**/SKILL.md` files, and `skills/chiefops/SKILL.md` must be present. Validate `harness-agent-plugins-<version>.tgz` by confirming the root `plugin.json` `$schema` and five flat `skills/<name>/SKILL.md` files.

For the opt-in companions, confirm the native `.codex-plugin/plugin.json` or portable root `plugin.json`, `LICENSE`, `UPSTREAM.json`, and exactly `skills/{grill-me,grilling,to-questionnaire}/SKILL.md`. The companion remains separate from Trio: `grill-me` and `grilling` are explicit opt-in, `to-questionnaire` creates a local Markdown draft, and external delivery remains human-gated. The portable package follows the client's own procedure; if a client CLI is unavailable, record that limitation and do not claim host-level installation verification.
