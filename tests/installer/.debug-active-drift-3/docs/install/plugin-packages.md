# Harness Packed Plugin Installation

Harness publishes one packed plugin package per supported IDE target on each GitHub release.

This page explains:

1. where to download the packages
2. which package matches each IDE
3. how to unpack and load the plugin in Codex, Claude Code, Cursor, and GitHub Copilot

## Download

Download from the latest GitHub release:

- Release page: [github.com/ilderaj/superpowering-with-files/releases/latest](https://github.com/ilderaj/superpowering-with-files/releases/latest)
- Current verified release: [1.0.6](https://github.com/ilderaj/superpowering-with-files/releases/tag/1.0.6)

Artifacts:

| IDE | Package |
| --- | --- |
| Codex | `harness-codex-plugin-<version>.tgz` |
| Claude Code | `harness-claude-code-plugin-<version>.tgz` |
| Cursor | `harness-cursor-plugin-<version>.tgz` |
| GitHub Copilot | `harness-copilot-plugin-<version>.tgz` |
| Shared runtime | `harness-runtime-<version>.tgz` |

Every release also includes:

- `SHA256SUMS`
- `manifest.json`
- `release-notes.md`

If you prefer to build locally instead of downloading from GitHub Releases:

```sh
npm run release:pack
```

The local artifacts are written under `dist/release/<version>/`.

## Unpack A Plugin Package

Most IDEs use an unpacked plugin directory for local loading, even when the release asset itself is a `.tgz`.

Example:

```sh
VERSION=1.0.6
PLUGIN=harness-claude-code-plugin
ARCHIVE="$HOME/Downloads/${PLUGIN}-${VERSION}.tgz"
DEST="$HOME/.cache/harness-plugins/${PLUGIN}-${VERSION}"

rm -rf "$DEST"
mkdir -p "$DEST"
tar -xzf "$ARCHIVE" -C "$DEST"
```

After extraction, `DEST` is the plugin root directory.

## Codex

Codex currently uses a marketplace workflow rather than a direct `--plugin-dir` flag. For a local release artifact, unpack the plugin into a local marketplace root and register that marketplace with Codex.

```sh
VERSION=1.0.6
MARKETPLACE_ROOT="$HOME/.local/share/harness-codex-marketplace"
PLUGIN_ROOT="$MARKETPLACE_ROOT/plugins/harness-codex-plugin"
ARCHIVE="$HOME/Downloads/harness-codex-plugin-${VERSION}.tgz"

rm -rf "$PLUGIN_ROOT"
mkdir -p "$PLUGIN_ROOT" "$MARKETPLACE_ROOT/.agents/plugins"
tar -xzf "$ARCHIVE" -C "$PLUGIN_ROOT"
```

Create `"$MARKETPLACE_ROOT/.agents/plugins/marketplace.json"` with:

```json
{
  "name": "harness-local",
  "interface": {
    "displayName": "Harness Local"
  },
  "plugins": [
    {
      "name": "harness-codex-plugin",
      "source": {
        "source": "local",
        "path": "./plugins/harness-codex-plugin"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}
```

Then register the marketplace:

```sh
codex plugin marketplace add "$MARKETPLACE_ROOT"
```

Notes:

- This is the local install path validated during release verification.
- Codex CLI currently exposes marketplace management, not a dedicated `plugin install <path>` command.
- After adding the marketplace, use Codex's plugin UI or marketplace flow to enable the plugin if it is not already active in your environment.

## Claude Code

Claude Code supports loading a local plugin directory or zip for development and validation. With the release asset, unpack the `.tgz` and point Claude Code at the extracted directory.

```sh
VERSION=1.0.6
PLUGIN_ROOT="$HOME/.cache/harness-plugins/harness-claude-code-plugin-${VERSION}"

npx @anthropic-ai/claude-code plugin validate "$PLUGIN_ROOT"
npx @anthropic-ai/claude-code --plugin-dir "$PLUGIN_ROOT"
```

Useful variants:

- `npx @anthropic-ai/claude-code --plugin-dir "$PLUGIN_ROOT" -p "..."` for a one-off prompt
- `npx @anthropic-ai/claude-code --plugin-url <zip-url>` when you want a session-only remote plugin load instead of a local directory

## Cursor

Cursor Agent supports loading a local plugin directory with `--plugin-dir`. Unpack the release asset, then launch Cursor Agent with that directory.

```sh
VERSION=1.0.6
PLUGIN_ROOT="$HOME/.cache/harness-plugins/harness-cursor-plugin-${VERSION}"

'/Applications/Cursor.app/Contents/Resources/app/bin/cursor' agent \
  --plugin-dir "$PLUGIN_ROOT" \
  --print \
  --force \
  about
```

Notes:

- This matches the local validation path used during the plugin release work.
- Cursor's interactive UI also supports plugin discovery and install flows, but the unpacked-directory path is the most direct way to verify a downloaded release asset locally.

## GitHub Copilot

GitHub Copilot CLI supports loading a local plugin directory with `--plugin-dir`. Unpack the release asset, then point `copilot` at the extracted directory.

```sh
VERSION=1.0.6
PLUGIN_ROOT="$HOME/.cache/harness-plugins/harness-copilot-plugin-${VERSION}"

copilot --plugin-dir "$PLUGIN_ROOT" version
```

For an interactive session:

```sh
copilot --plugin-dir "$PLUGIN_ROOT"
```

Notes:

- Copilot CLI also has managed plugin installation commands for marketplace and repository sources.
- For the packed Harness release artifacts, the unpacked-directory load path is the verified local consumption flow.

## Verify What You Downloaded

If you downloaded `SHA256SUMS` along with the plugin package:

```sh
shasum -a 256 -c SHA256SUMS
```

If you downloaded only one package, compare its checksum manually:

```sh
shasum -a 256 "$HOME/Downloads/harness-cursor-plugin-1.0.6.tgz"
```

## Related Docs

- [Harness Plugin Migration](plugin-migration.md)
- [Harness Plugin Release Artifacts](../release-plugin-artifacts.md)
- [Codex installation](codex.md)
- [Claude Code installation](claude-code.md)
- [Cursor installation](cursor.md)
- [GitHub Copilot installation](copilot.md)
