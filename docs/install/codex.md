# Codex Installation

Codex is the only managed native Trio target. Install the packaged `harness-codex-plugin-<version>.tgz` through a local Codex marketplace.

Releases also include a separate portable Agent Plugins package (`harness-agent-plugins-<version>.tgz`) for non-Codex clients that implement the standard; it is not installed through this Codex marketplace flow. See [Agent Plugins installation](agent-plugins.md).

Two independent, opt-in Matt companion archives are also available: `harness-matt-skills-codex-plugin-<version>.tgz` and `harness-matt-skills-agent-plugins-<version>.tgz`. They make no change to Trio or its projection. `grill-me` and `grilling` are explicit opt-in; `to-questionnaire` creates a local Markdown draft; external delivery remains human-gated. Verify every archive with `SHA256SUMS` and its digest record in `manifest.json` before extraction.

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

The extracted package must contain `.codex-plugin/plugin.json`, these five Trio surfaces, the `skills/chiefops/SKILL.md` ChiefOps governance companion, and the three additional SWF skills (`planning-with-files`, `overengineering-review`, and `simplification-ledger`):

```text
skills/trio/SKILL.md
skills/trio/dev/SKILL.md
skills/trio/office/SKILL.md
skills/trio/safety/SKILL.md
skills/chiefops/SKILL.md
skills/planning-with-files/SKILL.md
skills/overengineering-review/SKILL.md
skills/simplification-ledger/SKILL.md
```

This local package procedure does not migrate an existing user-global installation. Keep its state unchanged unless a separately authorized migration is performed.

## Existing user-global ChiefOps takeover

When a durable authority root already holds a schema-v2 `user-global` Trio state that owns the five core surfaces (entry plus `trio`, `dev`, `office`, `safety`) but leaves the global ChiefOps destination unowned, the exact migration command is:

```sh
./scripts/harness install --takeover-chiefops
```

Run it from the durable authority root — the checkout that owns `.harness/state.json` — not from a transient worktree, and only after a separate human gate approves the global write. Ordinary `install` stays workspace-only, and normal `sync` keeps only `--dry-run` and `--check`; neither is a bypass for this migration.

### Eligibility (all must hold, otherwise the command fails before any write)

- Persisted state is schema-v2 with `scope.kind: user-global`.
- Exactly one enabled managed Codex target with exactly one placement at `<home>/.codex/AGENTS.md`.
- Ownership contains exactly the five existing Trio surfaces, and each file's content matches its ownership identity (`sha256:<hex>`).
- Exactly one unowned ChiefOps destination exists at `<home>/.agents/skills/chiefops/SKILL.md`; it is not in `ownership.entries`.
- No other managed destination conflict and no unsafe physical path (symlink, hard link, or scope escape).
- Extra generic/manual targets are allowed but are preserved and never written.

Absent state, V1 state, workspace or both scope, a wrong placement, an already-owned ChiefOps, a second managed conflict, or an unsafe physical path all fail closed with `ERR_TRIO_TAKEOVER` or `ERR_TRIO_PHYSICAL_GATE` before any target or state write.

### What the command does

1. Under the authority publication lock, captures and revalidates seven stable preimages: the six global Trio surfaces and the prior V2 state file. Each capture is `lstat → read → lstat` and requires the exact file and parent dev/ino/nlink identities (plus a size matching the read) before and after the read; a replacement between the stat and the read fails closed with `ERR_TRIO_PREIMAGE_DRIFT` before any backup or apply write.
2. Publishes a unique immutable backup at `<authorityRoot>/.harness-backup/trio-takeover/<id>/` containing `manifest.json` and `bundle.bin`, then re-reads and verifies both. Before any backup write, every existing backup-root ancestor from the authority root through `.harness-backup/trio-takeover` must be a real, non-symlink directory whose physical path is contained under the authority root; a symlinked or escaping ancestor fails closed with `ERR_TRIO_PHYSICAL_GATE` and no state or target change. The manifest records every object's path, sha256, dev/ino/nlink, parent identity, offset, and length, plus the prior `ownership.source`/`manifestRef`/entries and the prior recovery `checkpointRef` **and** `rollbackRef` exactly as they were before the takeover.
3. Writes the six managed surfaces (the five owned surfaces plus the adopted ChiefOps) and the settled state. Ownership keeps its existing `source` and `manifestRef`, appends only the ChiefOps ownership entry, keeps `recovery.checkpointRef`, and sets `recovery.rollbackRef` to a parseable `trio-backup-v1:<absolute manifest path>:<sha256>` file reference (see below).
4. Binds every write to the backup preimages (expected sha256, inode, parent), so a same-content inode replacement fails closed, and compensates all prior writes back to the preimages if any later write fails.

### Recovery evidence

`<authorityRoot>/.harness-backup/trio-takeover/<id>/manifest.json` names each object and its sha256/dev/ino/nlink/parent, and `bundle.bin` contains the exact original bytes in manifest order. The manifest's `recovery` section preserves the pre-takeover `checkpointRef` and `rollbackRef` unchanged; the newly created reference is not written into the manifest. The settled `recovery.rollbackRef` is a parseable `trio-backup-v1:<absolute manifest path>:<sha256>` file reference whose digest is derived from the manifest file bytes as written and re-read: verification parses the reference, recomputes sha256 over the manifest file, and compares it to the digest in the reference. Restoring means parsing the reference, recomputing and matching the manifest digest, verifying each bundle slice against the manifest, and copying each object's slice back to its path while the publication lock is held; the manifest is the evidence that the restore set is complete and unmodified.

### Limits

- The backup is durable recovery evidence, not a journal: this command makes no crash, SIGKILL, or power-loss atomicity claim for the overall migration.
- The command never merges, pushes, publishes, or auto-adopts anything. After the run, verify with `./scripts/harness sync --check` and `./scripts/harness doctor --check-only`.
- The actual global run requires a separately authorized human gate at a durable authority root. This repository's tests exercise the command only against temporary fixtures.

See [plugin package installation](plugin-packages.md) for download and checksum steps.

## Optional Matt companion in Codex

The native companion uses a separate Codex marketplace root and manifest. It is not a replacement for, or extension of, the core Trio package.

```sh
set -eu

VERSION=<version>
MATT_MARKETPLACE_ROOT="$HOME/.local/share/harness-matt-skills-codex-marketplace"
PLUGIN_ROOT="$MATT_MARKETPLACE_ROOT/plugins/harness-matt-skills-codex-plugin-${VERSION}"
ARCHIVE="$HOME/Downloads/harness-matt-skills-codex-plugin-${VERSION}.tgz"

if test -e "$PLUGIN_ROOT"; then
  printf '%s\n' "Refusing existing destination: $PLUGIN_ROOT" >&2
  exit 1
fi

mkdir -p "$MATT_MARKETPLACE_ROOT/plugins" "$MATT_MARKETPLACE_ROOT/.agents/plugins"
mkdir "$PLUGIN_ROOT"
tar -xzf "$ARCHIVE" -C "$PLUGIN_ROOT"
```

Create a local marketplace manifest that lists `harness-matt-skills-codex-plugin` at `./plugins/harness-matt-skills-codex-plugin-<version>`, then register that marketplace with `codex plugin marketplace add "$MATT_MARKETPLACE_ROOT"`. Confirm the companion `.codex-plugin/plugin.json`, `LICENSE`, `UPSTREAM.json`, and exactly the three skill files before enabling it. The separate package is opt-in: `grill-me` and `grilling` are explicit opt-in, `to-questionnaire` creates a local Markdown draft, and external delivery remains human-gated.

See [plugin package installation](plugin-packages.md) for download, `SHA256SUMS`, and `manifest.json` verification steps.
