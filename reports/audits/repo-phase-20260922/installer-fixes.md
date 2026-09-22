# Installer and planning lifecycle audit — 2026-09-22

Scope: issues #191, #192, #193, #197, #198; bounded fixes in the independent worktree `codex/audit-installer-fixes-20260922`. No root worktree, remote, global adoption, Trio source, broad process, or hardlink mutation was used.

## Disposition and evidence

| Issue | Current bug | Disposition | Evidence |
|---|---|---|---|
| #191 | `reopen_task` moved an archive before a reader-compatible non-canonical `Current State` heading could be rewritten; success could leave `Status: closed`. | Fixed. Reopen accepts whitespace-separated `## Current State` headings, requires exactly one substitution and `Status: active`, and rolls back on failure. | `tests/installer/planning-linear-lifecycle-paths.test.mjs`: heading variant regression passes. |
| #192 | Legacy archive fallback validated a basename with thread-id grammar, allowing `:` and >80-char identities that stable task-id parsing cannot read. | Fixed. Fallback validates the actual `Task ID` grammar. | Added unsafe legacy basename regression; command fails before mutation. |
| #193 | Legacy `Task ID:` migration wrote before archive/companion validation, leaving rejected task authority changed. | Fixed. Migration write is deferred until all pre-move validations pass. | Added byte-identical failure regression. |
| #197 | Managed Trio projection treats stale recorded ownership as unknown even when destination bytes match projected source. | Deferred / not safely fixed in this bounded slice. A sanctioned repair needs source-byte evidence plus narrow state re-recording and backup semantics; changing the generic observation rule would risk adopting unmanaged content. | Existing fail-closed conflict behavior retained; no global or state mutation performed. |
| #198 | Destination-only generated artifacts (`__pycache__`, `.pyc`, etc.) made source/destination tree digests incomparable and caused permanent false conflicts. | Fixed. Source-mode digest now hashes the same source-owned file set on both sides and ignores excluded path components, while default digest behavior remains available for full-tree ownership checks. | Added generated-artifact regression; destination artifact remains present and adoption is unchanged/idempotent. |

## Verification

- RED observed for the new #198 regression before the digest fix: 1 failure, 14 passes in the targeted lifecycle/adoption run.
- GREEN: `node --test tests/installer/planning-linear-lifecycle-paths.test.mjs tests/installer/global-adoption.test.mjs` — 18/18 passed, including legacy receipts, unknown files, cache symlink/hardlink rejection, and framing collision checks.
- `git diff --check` passed.
- Full `node --test tests/installer/*.test.mjs` — 161/161 passed in 49.1 seconds.

## Candidate commit

Candidate commit: `61e1b5a2` (`fix: harden planning lifecycle and skill adoption`); parent should cherry-pick it after review. Issue #197 now has an explicit `sync --reconverge` entry requiring complete projection-manifest ownership, source-byte equivalence only for conflicted managed files, real singly-owned files, state precondition, capture-time proof, readback, and a complete backup bundle. Unknown siblings remain untouched.

## Second review corrections

The source-mode digest retains the original length/path/mode framing and directory framing for included paths; only generated path components are omitted from the source-equivalence view. Full digests remain in backup and pre/post race checks. Unsafe entries are validated before generated-path filtering. Existing full-tree receipts remain accepted when only generated cache differs. Planning legacy migration uses an explicit `needs_migration` flag and occurs inside the move transaction with rollback.

Issue #197 reconverge never infers ownership from content alone; missing or incomplete manifest ownership, unknown files, symlinks, hardlinks, or source/content drift are rejected.


#197 regression evidence: `tests/trio/install-upgrade.test.mjs` covers two stale global identities equal to new source, one owned older methods file updated by normal sync, preserved ownership entries, preserved unknown sibling, custom content rejection, and symlink rejection. Full install-upgrade: 64/64; full installer: 161/161.
