# Private SWF Harness Codex plugin: operator guide

The privately shared `v2.0.1+codex.20260925230000` package is a local-evaluation build. Access to the [private release](https://github.com/ilderaj/swf-harness-codex-plugin/releases/tag/v2.0.1%2Bcodex.20260925230000) requires authorization. The release archive's SHA-256 is:

```text
bc7cbe92742ea02777323956f9c84a52f038bc0a8021a7c6368d0a9cb08e581a
```

It contains 42 ordinary skill entries, an explicit optional Pen entry, their bundled references/resources and local helper programs. It does **not** bundle MCP connections, credentials, Codex login, Host-owned skills, external runtimes, or project task data. Read `DEPENDENCIES.md`, `MIGRATION.md`, and `LICENSES.json` in the installed package before relying on an optional capability or sharing the archive. Public redistribution has not been verified.

## Fresh installation

Use a current Codex CLI, Node.js and Python 3. Sign in to GitHub with access to the private repository. Run both blocks below in the same shell so their variables remain set. Download and verify the exact archive:

```bash
set -euo pipefail
SWF_VERSION='v2.0.1+codex.20260925230000'
SWF_DOWNLOAD="$(mktemp -d)"
gh release download "$SWF_VERSION" \
  --repo ilderaj/swf-harness-codex-plugin \
  --pattern 'harness-codex-plugin-2.0.1+codex.20260925230000.tgz' \
  --dir "$SWF_DOWNLOAD"
SWF_ARCHIVE="$SWF_DOWNLOAD/harness-codex-plugin-2.0.1+codex.20260925230000.tgz"
shasum -a 256 "$SWF_ARCHIVE"
```

Compare the output with the pinned SHA-256 above. Choose a **new absolute** local marketplace path and the project to enable. The preflight below checks both installed plugins and uninstalled plugins in configured marketplaces. If it finds this plugin or the reserved marketplace name, inspect that existing marketplace and use the upgrade process below or remove the unused marketplace before a fresh install.

```bash
SWF_MARKET='/absolute/path/to/new-swf-marketplace'
SWF_PROJECT='/absolute/path/to/existing-project'
codex plugin marketplace list --json > "$SWF_DOWNLOAD/marketplaces.json"
codex plugin list --available --json > "$SWF_DOWNLOAD/plugins.json"
python3 - "$SWF_DOWNLOAD/marketplaces.json" "$SWF_DOWNLOAD/plugins.json" <<'PY'
import json, sys
from pathlib import Path

marketplaces, plugins = (json.loads(Path(p).read_text()) for p in sys.argv[1:])
if any(m['name'] == 'swf-harness-private' for m in marketplaces['marketplaces']):
    raise SystemExit('Marketplace swf-harness-private already exists; inspect or remove it before a fresh install')
if any(p['name'] == 'harness-codex-plugin' for state in ('installed', 'available') for p in plugins[state]):
    raise SystemExit('SWF plugin already installed or available; use its existing marketplace or upgrade it')
PY
python3 - "$SWF_ARCHIVE" "$SWF_MARKET" <<'PY'
import hashlib, json, sys, tarfile
from pathlib import Path

archive, market = map(Path, sys.argv[1:])
expected = 'bc7cbe92742ea02777323956f9c84a52f038bc0a8021a7c6368d0a9cb08e581a'
if not archive.is_absolute() or not market.is_absolute():
    raise SystemExit('Archive and marketplace paths must be absolute')
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise SystemExit('Archive digest mismatch')
if market.exists():
    raise SystemExit('Choose a new marketplace path')
source = market / 'plugins/harness-codex-plugin'
with tarfile.open(archive) as bundle:
    for member in bundle.getmembers():
        target = (source / member.name).resolve()
        if not member.isfile() and not member.isdir():
            raise SystemExit('Unexpected archive entry')
        if target != source.resolve() and source.resolve() not in target.parents:
            raise SystemExit('Unsafe archive path')
    source.mkdir(parents=True)
    bundle.extractall(source)
manifest = market / '.agents/plugins/marketplace.json'
manifest.parent.mkdir(parents=True)
manifest.write_text(json.dumps({'name': 'swf-harness-private', 'plugins': [{
    'name': 'harness-codex-plugin',
    'source': {'source': 'local', 'path': './plugins/harness-codex-plugin'},
    'policy': {'installation': 'AVAILABLE', 'authentication': 'ON_INSTALL'},
    'category': 'Productivity'
}]}))
PY
codex plugin marketplace add "$SWF_MARKET" --json
codex plugin add harness-codex-plugin@swf-harness-private --json
node "$SWF_MARKET/plugins/harness-codex-plugin/scripts/project.mjs" enable "$SWF_PROJECT"
node "$SWF_MARKET/plugins/harness-codex-plugin/scripts/project.mjs" status "$SWF_PROJECT"
```

The marketplace path must remain available for later upgrades. Open a **new Codex task** in the enabled project, then check `codex plugin list --json` and `codex debug prompt-input` there. The plugin should be enabled, with 42 ordinary namespaced skill entries; Pen is explicit-only. The clean-install test also verified uninstall and reinstall without login. Authenticate Codex separately before running a model task; installation alone does not supply model access.

## Everyday use

In an enabled project, describe the work normally. Codex can select a relevant installed skill from its description and the project's managed `AGENTS.md` block; automatic selection is contextual, not a deterministic promise. For important work, request an exact skill such as `$harness-codex-plugin:trio`, `$harness-codex-plugin:simple-english`, or `$harness-codex-plugin:code-review`. There is no runtime command to “call the whole plugin.” Quick work remains direct; tracked work uses the three project planning files.

The project opt-in command appends a managed policy block to `AGENTS.md` while preserving existing content. It refuses a changed managed block rather than overwriting it. The plugin's own root README or an `agents/openai.yaml` resource is not automatically a project policy or an installed Host agent. Connectors, MCP servers and their authorization stay in the Host; scripts bundled with individual skills run only when a task and its dependencies call for them.

## Upgrade, rollback and removal

For an existing installation, use `codex plugin list --json` to identify its plugin ID, version and local source path. That command does not record project policy or file hashes. Set these paths to the actual source and project, and choose a new backup directory:

```bash
SWF_SOURCE='/absolute/path/to/existing-marketplace/plugins/harness-codex-plugin'
SWF_PROJECT='/absolute/path/to/existing-project'
SWF_BACKUP='/absolute/path/to/new-upgrade-backup'
mkdir "$SWF_BACKUP"
codex plugin list --json > "$SWF_BACKUP/plugin-list.json"
node "$SWF_SOURCE/scripts/project.mjs" status "$SWF_PROJECT" > "$SWF_BACKUP/project-status.json"
cp -p "$SWF_PROJECT/AGENTS.md" "$SWF_BACKUP/AGENTS.md.before"
cp -a "$SWF_SOURCE" "$SWF_BACKUP/source"
find "$SWF_SOURCE" -type f -exec shasum -a 256 {} + > "$SWF_BACKUP/source-sha256.txt"
```

If the project has no `AGENTS.md`, record that fact instead of running `cp`. Also retain any managed legacy-skill migration receipts. Stage and verify the new archive in an isolated directory, compare it with the managed source and resolve user modifications before replacement. Keep the **same plugin identity** and refresh it with `codex plugin add <existing-plugin-id> --json`; verify the installed version and discovery from a new task. Do not edit the Codex plugin cache in place. On failure, restore the exact source backup, refresh the same identity and recheck discovery. `MIGRATION.md` describes receipt-based rollback of retired global skills; plugin rollback does not perform that restoration automatically.

To stop using the plugin in a project, run `node <plugin-root>/scripts/project.mjs disable <project-directory>`. Then remove the actual plugin identity with `codex plugin remove <plugin-id> --json`. Remove its marketplace only if nothing else uses it. Uninstalling does not delete project plans, output, credentials or preserved backups.

The local acceptance audit covered 115 plugin-kit tests, a clean no-login Container install, reversible Host replacement, an authenticated Container upgrade and successful installed-skill reads for all 43 retained entrypoints. It did not establish broad behavior equivalence or overall efficiency gains. Sandbox C02 can read an extra stable rule before preview while reaching the correct API judgment; G07 and C03 positive online paths and actual served model/effort remain unverified.
