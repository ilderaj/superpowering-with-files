# Agent Plugins Installation

`harness-agent-plugins-<version>.tgz` is the portable Agent Plugins v1 package. It targets clients that implement the Agent Plugins standard (the standard is currently a Working Draft; this package pins schema `1.0.0`).

This package is separate from the native Codex package (`harness-codex-plugin-<version>.tgz`), which installs through the Codex marketplace flow described in [Codex installation](codex.md).

## Package contents

The portable package contains a root `plugin.json` with the closed Agent Plugins v1 schema (`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) and five immediate skill children (`skills/{trio,dev,office,safety,chiefops}/SKILL.md`). Agent Plugins discovery is non-recursive, so the skills are flat:

```text
plugin.json
skills/trio/SKILL.md
skills/dev/SKILL.md
skills/office/SKILL.md
skills/safety/SKILL.md
skills/chiefops/SKILL.md
```

The manifest declares the exact schema URL, a lowercase package name, the release version, source/repository metadata, an MIT license, and keywords. It contains no Codex interface, capabilities, or skills metadata, and the package contains no MCP, hooks, runtime executables, or credentials.

## Verify the download

```sh
shasum -a 256 -c SHA256SUMS
```

For a single downloaded package, compare its checksum manually:

```sh
VERSION=<version>
shasum -a 256 "$HOME/Downloads/harness-agent-plugins-${VERSION}.tgz"
```

## Manual, client-owned installation

Extract the archive and point an Agent Plugins-compatible client at the plugin directory using that client's own procedure:

```sh
VERSION=<version>
mkdir -p "$HOME/.local/share/harness-agent-plugins-${VERSION}"
tar -xzf "$HOME/Downloads/harness-agent-plugins-${VERSION}.tgz" -C "$HOME/.local/share/harness-agent-plugins-${VERSION}"
```

Each client defines its own plugin location and enablement flow. Follow the client's documentation; there is no single portable install command because the standard leaves installation, enablement, updates, and lifecycle to the client.

This repository does not manage, install, or sync anything into third-party clients. The local `install`/`sync` projection is a Codex-specific migration path only and is not a portable-client installer. A client reports a loading or discovery mismatch if it does not see all five skills; in that case keep the extracted directory regular (no symlinks), verify the root `plugin.json`, and consult the client's Agent Plugins support.

## Related docs

- [Plugin packages](plugin-packages.md)
- [Platform support](platform-support.md)
- [Harness Plugin Release Artifacts](../release-plugin-artifacts.md)
