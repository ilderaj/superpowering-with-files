# Codex Installation

Codex is the only managed native Trio target. Install the packaged `harness-codex-plugin-<version>.tgz` through a local Codex marketplace.

## Prepare a local marketplace

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
```

Create `"$MARKETPLACE_ROOT/.agents/plugins/marketplace.json"`, replacing `<version>` in `source.path` with the selected release version:

```json
{
  "name": "harness-local",
  "interface": { "displayName": "Harness Local" },
  "plugins": [
    {
      "name": "harness-codex-plugin",
      "source": { "source": "local", "path": "./plugins/harness-codex-plugin-<version>" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Developer Tools"
    }
  ]
}
```

Register the marketplace:

```sh
codex plugin marketplace add "$MARKETPLACE_ROOT"
```

Then use Codex's marketplace flow to enable the plugin when required by the installed Codex build.

## Verify the package boundary

The extracted package must contain `.codex-plugin/plugin.json`, exactly these four Trio skills, and the `skills/chiefops/SKILL.md` ChiefOps governance companion:

```text
skills/trio/SKILL.md
skills/trio/dev/SKILL.md
skills/trio/office/SKILL.md
skills/trio/safety/SKILL.md
```

This local package procedure does not migrate an existing user-global installation. Keep its state unchanged unless a separately authorized migration is performed.

See [plugin package installation](plugin-packages.md) for download and checksum steps.
