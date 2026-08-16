# Harness Packed Plugin Installation

Harness publishes two core Trio artifacts and two independent, opt-in Matt companion artifacts per release:

| Host | Package |
| --- | --- |
| Codex (native) | `harness-codex-plugin-<version>.tgz` |
| Agent Plugins clients (portable) | `harness-agent-plugins-<version>.tgz` |
| Codex Matt companion (native) | `harness-matt-skills-codex-plugin-<version>.tgz` |
| Agent Plugins Matt companion (portable) | `harness-matt-skills-agent-plugins-<version>.tgz` |

Download the package from the [latest GitHub release](https://github.com/ilderaj/superpowering-with-files/releases/latest). The release also includes `SHA256SUMS`, `manifest.json`, and `release-notes.md`.

## Verify the download

```sh
shasum -a 256 -c SHA256SUMS
```

Confirm that each checked archive also has the expected name, target, and digest in `manifest.json`.

For a single downloaded package, compare its checksum manually:

```sh
VERSION=<version>
shasum -a 256 "$HOME/Downloads/harness-codex-plugin-${VERSION}.tgz"
```

## Install in Codex

Use a local marketplace root and register it with Codex:

```sh
set -eu

VERSION=<version>
MARKETPLACE_ROOT="$HOME/.local/share/harness-codex-marketplace"
PLUGIN_ROOT="$MARKETPLACE_ROOT/plugins/harness-codex-plugin-${VERSION}"
ARCHIVE="$HOME/Downloads/harness-codex-plugin-${VERSION}.tgz"

if test -e "$PLUGIN_ROOT"; then
  printf '%s\n' "Refusing existing destination: $PLUGIN_ROOT" >&2
  exit 1
fi

mkdir -p "$MARKETPLACE_ROOT/plugins" "$MARKETPLACE_ROOT/.agents/plugins"
mkdir "$PLUGIN_ROOT"
tar -xzf "$ARCHIVE" -C "$PLUGIN_ROOT"
codex plugin marketplace add "$MARKETPLACE_ROOT"
```

Create the marketplace manifest described in [Codex installation](codex.md), then enable the plugin through the Codex marketplace flow when needed.

The extracted package contains `.codex-plugin/plugin.json`, the Trio entry policy plus `dev`, `office`, and `safety` under `skills/trio/`, the ChiefOps governance companion under `skills/chiefops/`, and the three additional SWF skills (`planning-with-files`, `overengineering-review`, and `simplification-ledger`) as full directory copies under `skills/<name>/`. Generic/manual fallback hosts have no packaged artifact.

## Optional Matt companion packages

The companion archives are independent and opt-in; they make no change to Trio or its projection. Both carry only `grill-me`, `grilling`, and `to-questionnaire`, plus `LICENSE` and `UPSTREAM.json`. `grill-me` and `grilling` are explicit opt-in. `to-questionnaire` creates a local Markdown draft; external delivery remains human-gated.

Verify `harness-matt-skills-codex-plugin-<version>.tgz` and `harness-matt-skills-agent-plugins-<version>.tgz` with `SHA256SUMS` and `manifest.json` before extracting either archive. The native companion is a distinct Codex marketplace package with its own `.codex-plugin/plugin.json`; see [Codex installation](codex.md). The portable companion has a root `plugin.json` and three flat skills. It is client-owned: follow the client's own procedure and do not claim a remote install.

## Portable Agent Plugins clients

For clients that implement Agent Plugins v1, download either `harness-agent-plugins-<version>.tgz` for the core package or `harness-matt-skills-agent-plugins-<version>.tgz` for the opt-in companion, then follow the client's own installation procedure. The core portable package has eight immediate skills (`skills/{trio,dev,office,safety,chiefops,planning-with-files,overengineering-review,simplification-ledger}/SKILL.md`); the companion has only `skills/{grill-me,grilling,to-questionnaire}/SKILL.md`. The companion makes no change to Trio: `grill-me` and `grilling` are explicit opt-in, `to-questionnaire` creates a local Markdown draft, and external delivery remains human-gated. Installation is manual and client-owned; this repository does not manage or install anything in third-party clients.

See [Agent Plugins installation](agent-plugins.md) for details.

## Related docs

- [Codex installation](codex.md)
- [Agent Plugins installation](agent-plugins.md)
- [Platform support](platform-support.md)
- [Harness Plugin Release Artifacts](../release-plugin-artifacts.md)
