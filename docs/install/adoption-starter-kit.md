# Adoption Starter Kit

This page is the shortest safe path for choosing an adoption profile, rehearsing rollout, and verifying the result.

Use this guide to choose a safe Harness adoption profile, verify the result, and roll back if needed.

## Choose A Profile

| Profile | Use when | Typical command |
| --- | --- | --- |
| `minimal-global` | You want a lean user-global baseline for supported agents across repositories. | `./scripts/harness adopt-global` |
| `full-local` | This repository intentionally needs the complete local skill surface. | `./scripts/harness install --scope=workspace --targets=all --skills-profile=full` |
| `cloud-dev` | GitHub-origin Copilot work should stage remotely on `cloud-dev`. | Follow [Cloud Dev Harness](../cloud-dev-harness.md), then verify branch readiness. |

Default to `minimal-global` for personal bootstrap and `full-local` only for repos that need the complete projected skill set. Cloud-dev is a separate remote staging lane, not a replacement for local verification.

Use this starter kit when you need one compact operator answer surface for minimal-global, full-local, and cloud-dev profiles.

For Codex user-global or `both` scope installs, `minimal-global` is the expected default. Use `full` only when you intentionally want the wider skill surface and accept the extra context cost.

`minimal-global` is the recommended default. Move to a heavier profile only when the task explicitly needs broader projected context and the operator accepts the extra payload/runtime cost.

## Safe Adoption Flow

```bash
./scripts/harness install --scope=workspace --targets=all --projection=link
./scripts/harness sync --dry-run
./scripts/harness sync
./scripts/harness doctor --check-only
./scripts/harness verify --output=.harness/verification
```

For user-global or team rollout, rehearse with a disposable home first:

```bash
export HOME=/path/to/disposable-home
./scripts/harness install --scope=both --targets=all --projection=portable --skills-profile=minimal-global
./scripts/harness sync --dry-run
./scripts/harness sync --conflict=backup
./scripts/harness doctor --check-only
./scripts/harness adoption-status
```

## Repo-Local Vs User-Global Boundary

Keep repo-local refresh work and user-global adoption as separate decisions:

- Repo-local docs, policy, or projection refresh work should prefer repo-local rebuild or workspace-scoped sync when that is enough to prove the change.
- User-global adoption should be treated as rollout work with its own rehearsal and receipt, not as a side effect of ordinary repo maintenance.
- If live user-global ownership blocks `sync`, stop and decide explicitly whether the work needs:
  - a repo-local rebuild only;
  - a disposable-home rehearsal;
  - or a real user-global takeover using `sync --conflict=backup`.

Do not use a repo-scoped documentation or policy update as implicit permission to mutate the operator's real user-global state.

## Adoption Verification Receipt

For rollout-oriented adoption work, keep a short receipt that records:

- chosen profile: `minimal-global`, `full-local`, or `cloud-dev`
- scope used: `workspace`, `user-global`, or `both`
- whether the run used a disposable home
- result of `./scripts/harness sync --dry-run`
- result of `./scripts/harness doctor --check-only`
- result of `./scripts/harness adoption-status`
- whether `sync --conflict=backup` was needed
- any expected remaining gaps or follow-up actions

## Smoke Check

After sync, confirm:

- expected entry files exist for Codex, Copilot, Cursor, and Claude Code;
- `minimal-global` did not project broad skill bodies globally;
- `./scripts/harness doctor --check-only` reports supported targets as healthy or clearly explains gaps;
- `./scripts/harness sync --dry-run` is clean or shows only expected projection changes;
- `npm run verify` passes before release or team handoff.

Treat this as the minimum reusable package: rollback, doctor, sync dry-run, verify, and smoke-check must all be explicit before the guide is reused as team-facing adoption guidance.

## Rollback

- If adoption used `--conflict=backup`, inspect `~/.harness/backups/` and `~/.harness/backup-index.json`.
- Remove Harness-managed projected files only after confirming they are not user-authored files.
- Restore backed-up files from the backup archive when needed.
- Re-run `./scripts/harness doctor --check-only` and `./scripts/harness adoption-status` after rollback.

## Update Safety

Upstream update and local projection sync are separate operations. `./scripts/harness update` may update vendored upstream baselines; it must not be treated as permission to overwrite local projections without review. Run `sync --dry-run`, check [Upstream Update Compatibility](../upstream-update-compatibility.md), then sync only when the report is acceptable.

The starter kit must explain what upstream update can overwrite, what it cannot overwrite, and how to recover safely.
