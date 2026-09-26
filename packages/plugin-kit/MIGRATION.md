# Local replacement and recovery

Install the native Codex plugin through Codex's plugin manager, then verify discovery in a fresh session before retiring any legacy entry. A complete installation and project enablement are separate steps. Enable only the intended project with `node <plugin-root>/scripts/project.mjs enable <project-directory>`; use `status` or `disable` with the same arguments. Modified managed policy blocks are refused, not overwritten.

The installed `scripts/managed-skill-migration.mjs` exports `plan`, `apply`, and `rollback`. These are Node.js APIs, not automatic install hooks. They do not install or uninstall Codex plugins, modify credentials, commit changes, or infer ownership from matching skill names.

## Retire explicitly managed legacy directories

Before using the API, review the source-to-delivery capability mapping and validate replacement behavior. Create a manifest from the intended managed baseline, including every regular file's relative path and SHA-256. Do not bless unknown current contents by hashing them and calling them managed. Resolve user changes first. Keep tasks, private corpora, credentials and other products outside targets.

Pass `plan` an object with:

- `allowedRoots`: absolute permitted legacy skill roots.
- `backupRoot`: a new, empty directory outside those roots; its parent must exist.
- `targets`: objects with absolute `path` and `files: [{path, sha256}]`.

`plan` checks the real-directory boundaries and exact file inventory. `apply` repeats those checks, writes a durable `receipt.json` under the backup root, and moves directories to numbered backup locations. Same-filesystem moves use rename; cross-filesystem copies are verified before removal. Unknown, changed, extra, missing, symbolic-link or overlapping entries are refused. Stop concurrent writers during migration; this utility is not a cross-process lock.

If apply is interrupted, read the durable receipt from disk. Do not generate a new plan over the partially migrated state. Pass the parsed receipt to `rollback`. It verifies backups and restores missing sources, accepts already-restored exact contents, and refuses to overwrite changed user files. Keep backups until fresh-session discovery and representative tasks pass. The operation has no automatic backup deletion.

## Recovery limitations

Restore copies into a unique sibling staging directory, verifies its contents, then renames it into place. A copy failure leaves the live source absent and can be retried from the receipt. An abrupt process termination may leave an orphan `.swf-restore-*` directory; it is not task authority and does not block a later retry. Retain unexpected partial source directories from older tool versions for review rather than overwriting them. A concurrent writer can invalidate preflight checks, including the final absence check before rename; migration must run while affected skill directories are idle. Receipt persistence uses unique temporary files and atomic replacement, but does not claim power-loss durability or filesystem snapshot isolation.

## Upgrade and uninstall

Use Codex's installed-plugin upgrade and removal interface for the plugin itself. Disable the managed project policy before uninstalling if it would otherwise point to unavailable skills. Plugin removal does not restore retired globals: run receipt-based rollback separately when returning to the legacy configuration. Preserve external output/cache, planning state and user data. Do not install the legacy Matt companion alongside this package as an assumed requirement: its retained methods are internalized, and duplicate routing must be reviewed.

Public redistribution remains subject to the package's `LICENSES.json`; local build and runtime checks do not settle unknown upstream licenses.

The former independent `artifact-template-product-leadership-portfolio` local skill is intentionally retired and is not a plugin dependency or default template. Its original PPTX and preview contained personal/bank content marked for internal use; the managed migration backup retains the exact prior files. Use the Host's presentations capability with a user-supplied reference that the user is authorized to use. Do not copy the retired deck or preview into a new installation merely to recreate the old entry.

`hatch-pet` is also retired from SWF Codex plugin delivery by the user's 2026-09-25 scope decision. It was a locally authored skill, not an official Host system skill. Its captured source and provenance remain in private retention outside this public repository for history, but new plugin builds omit the skill and its dedicated resources. Upgrading this plugin removes the plugin-owned `skills/hatch-pet` tree. It does **not** delete or disable the independent original at `~/.codex/skills/hatch-pet`, nor affect Host-owned `imagegen`; do not retire that original without a separate user instruction and managed-inventory review.

Project policy editing requires a regular, non-hardlinked UTF-8 AGENTS.md. Invalid encoding and shared hardlinks are refused without rewriting the file. Existing UTF-8 BOM and original text are preserved. Resolve such source-file conditions explicitly before enabling the project.
