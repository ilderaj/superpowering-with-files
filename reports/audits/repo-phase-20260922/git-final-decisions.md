# Git dispositions and primary acceptance

Base: `origin/main`. Actual hunks were reviewed from the 16 unique commits, 13 stash patches, and 5 complete dirty-worktree patches. The helper review was read-only; the primary subsequently performed the verified cleanup described below.

- Root worktree is permanently `preserve_always`; it is never a remove candidate.
- The primary backups are explicit: `stash-history.bundle`, `stash-N.patch`, and 17 full historical worktree archives; `all-refs.bundle` alone is not treated as dirty/stash protection.

## 16 unique SHAs

| SHA | decision | exact behavior and current evidence |
|---|---|---|
| `8bad840fdcbc` | **superseded** | V1.4 acceptance evidence; current 2.0.1 release line supersedes the V1.4 evidence pack. |
| `d9776924011b` | **superseded** | V1.4 path portability only; no current behavior missing after 2.0.1 line. |
| `f0352d6b56aa` | **superseded** | V1.4 cross-domain release/package/test changes; current 2.0.1/main is the later release state. |
| `b8ac9092054a` | **current_equivalent** | UX frontmatter quoting plus installer regression test; current UX skill/tests carry the behavior. |
| `c581444d5072` | **current_equivalent** | UX method, provenance/rendering contracts, references, adoption and installer test; current methods/provenance/frontend tests carry it. |
| `a126481b7ebb` | **superseded** | 2.0.1 version/package preparation; current main already contains the release state. |
| `93dd8de0f910` | **current_equivalent** | UX verification loop and provenance/test refinements; current method/provenance/frontend tests carry it. |
| `2e61e82f3d8b` | **superseded** | Large upstream baseline refresh; current upstream projection is newer and this ref is historical generated refresh output. |
| `15071714230d` | **superseded** | Upstream-refresh failure repair and allowlist; current CI/refresh implementation has moved beyond this repair. |
| `b5089d92bdcd` | **superseded** | Planning/python cache and failure-repair scaffolding; historical residue, no runtime behavior to restore. |
| `01226a17d4ba` | **reject_stale_test_only** | Only git identity setup for annotated-tag fixtures; current tests do not need this stale fixture seeding. |
| `b309f7033a7a` | **reject_stale_test_only** | Only upstream config lock fixture alignment; current config/CI contract supersedes the fixture wording. |
| `669fc8cf7e13` | **current_equivalent** | Release-dependencies wiring in scripts/ci/lib/upstream-heads.mjs plus its test; current main contains the release-dependency probe behavior. This is not UX. |
| `31992f795b40` | **reject_stale_test_only** | Seeds a stale source lock for PR validation; deliberately rejected because current CI should validate current source truth. |
| `d61a4958b8ba` | **current_equivalent** | Same release-dependencies wiring as 669fc8cf on the real-validation branch; current main contains it. |
| `ca32bd10e7e8` | **reject_stale_test_only** | Seeds stale source lock for real validation; deliberately rejected. |

## 13 stash patches

| stash | decision | actual patch finding |
|---|---|---|
| `stash@{0}` | **archive_only** | Trio takeover backup/bundle and policy text; historical backup material, no current missing runtime behavior. |
| `stash@{1}` | **current_equivalent** | Primary compared current homepage/UX-TOKENS.md: archived-design wording is present verbatim; no change needed. |
| `stash@{2}` | **current_equivalent_or_archive** | Native-goal/ChiefOps contract prose and runtime overlay candidate; current architecture/proof gates govern, preserved as historical; primary found no missing current contract. |
| `stash@{3}` | **retired_no_restore** | Safety-overlay/cloud-safe profile changes; current safety architecture has retired this path; do not revive. |
| `stash@{4}` | **archive_only** | Closed roadmap/task progress and historical merge evidence. |
| `stash@{5}` | **archive_only** | Large upstream/generated refresh and planning artifacts; no targeted current behavior to restore. |
| `stash@{6}` | **archive_only** | Old takeover backup/policy projection material. |
| `stash@{7}` | **retired_no_restore** | Cloud-bootstrap removal test and safety projection deletion; current tests explicitly reject retired cloud-bootstrap. Do not restore. |
| `stash@{8}` | **archive_only** | Unaccepted hook-plane/architecture candidate with deletions; current hook architecture supersedes it. |
| `stash@{9}` | **current_equivalent_or_archive** | Execution receipt/summary runtime and tests; the legacy execution receipt/summary runtime was retired and current Trio supplies its replacement evidence contracts, so preserve for provenance only accepted by primary for historical preservation only. |
| `stash@{10}` | **archive_only** | Historical 2026-05-31 runtime-plugin proposal and complete codex-cc feasibility planning Trio; archived as planning evidence, not empty. |
| `stash@{11}` | **archive_only** | Historical planning backup. |
| `stash@{12}` | **archive_only** | Old generated summary artifacts and duplicate-analysis planning; no current code restore. |

## Five dirty worktrees

| worktree | decision | actual patch finding |
|---|---|---|
| `worktree-1-1184` | **current_equivalent_or_archive** | Office/projection/docs/tests plus UX-TOKENS and planning residue; no proven current missing runtime behavior. |
| `worktree-2-73aa` | **superseded** | Primary read actual hunks: DSH changes add Corleone persona/role enforcement and frozen identity derivation, explicitly retired by current architecture. Current upstream i18n allowlist/promotion already implements the retained behavior. |
| `worktree-3-81ff` | **current_equivalent_or_superseded** | Primary read actual hunks: current Trio already supports direct tracked execution with bounded helpers; DSH persona/Corleone additions are retired; nested-language curation remains implemented. |
| `worktree-4-202606211405-upstream-refresh-repair-20260621-001` | **archive_only** | Historical skill/hook upstream refresh repair; current active planning/skill architecture supersedes it. |
| `worktree-5-upstream-refresh-pwf-mattpocock-20260901` | **current_equivalent_or_archive** | Actual upstream nested-language handling; current main already has the known-language guard/promotion behavior. |

Cleanup planning: parent may archive/remove only after verifying the named backups, active Trio ownership, PR state, and the `review_required` items. This report does not authorize or perform cleanup.

## Primary acceptance
The 13 stash objects, including untracked-file parents, are preserved in the separately verified stash-history.bundle and byte patches. All 17 historical worktrees, including the five dirty worktrees, have full tar archives including ignored/untracked files with SHA256/member readback in worktree-preservation.json. Their Corleone additions are intentionally not restored. Source-code integration and catalog preservation are independently handled by this audit; supersession never means old commits are ancestors. Root is retained permanently.

## Retained remote staging branch
`cloud-dev` is an active product surface: both CLOUD_DEV_SYNC_ENABLED and CLOUD_DEV_ISSUE_TRIAGE_ENABLED are true, and the checked-in workflows target it. Retain it and fast-forward through the existing guarded synchronization command after dev advances. It is not an obsolete feature branch.
