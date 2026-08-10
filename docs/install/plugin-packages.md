# Harness Packed Plugin Installation

Harness publishes one packaged Codex Trio artifact per release:

| Host | Package |
| --- | --- |
| Codex | `harness-codex-plugin-<version>.tgz` |

Download the package from the [latest GitHub release](https://github.com/ilderaj/superpowering-with-files/releases/latest). The release also includes `SHA256SUMS`, `manifest.json`, and `release-notes.md`.

## Verify the download

```sh
shasum -a 256 -c SHA256SUMS
```

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

The extracted package contains `.codex-plugin/plugin.json`, exactly four Trio skills under `skills/trio/`, and one ChiefOps governance companion under `skills/chiefops/`. Generic/manual fallback hosts have no packaged artifact.

## Related docs

- [Codex installation](codex.md)
- [Platform support](platform-support.md)
- [Harness Plugin Release Artifacts](../release-plugin-artifacts.md)
