# Roadmap

This roadmap captures the current mainline for Harness and the work that is intentionally deferred behind stronger proof.

## Current V1.3 Implementation Line

The current implementation line is V1.3 reliable completion: align public descriptions with actual CLI behavior, provide read-only Trio recovery navigation, clarify completion and delivery evidence, and establish a bounded real-task baseline. The detailed implementation and verification packets live in [V1.3 plan](plans/v1.3/README.md). The older 1.0.11–1.0.13 entries below are historical planning inputs; they are not independent execution instructions until their disposition is recorded.

Detailed candidate work lives in [Backlog](backlog.md). Use [State Convergence](state-convergence.md) when roadmap intent must be reconciled against active planning or archive evidence.

## Current Direction

- Keep local support broad across Codex, GitHub Copilot, Cursor, and Claude Code, but stop widening behavior surfaces until the local kernel is more stable.
- Keep `safety` and `cloud-safe` off by default for global installs; safety remains a workspace-scoped overlay until the operator-cost tradeoff is calmer.
- Treat cloud-dev, MCP expansion, and adoption packaging as proof-gated expansion lanes rather than the mainline.
- Prioritize four near-term outcomes:
  - execution-kernel maturity on real tracked tasks
  - structural hardening of `sync` and adjacent projection/update surfaces
  - lightweight-default hygiene across install baselines and hook payloads
  - lifecycle, release, and acceptance governance as everyday operator surfaces

## Foundation Through 1.0.10

Harness has already shipped its foundation line:

- planning hygiene and active-task cleanup
- cross-IDE projection and hook closure
- context budget and discovery governance
- safety overlay and cloud baseline separation
- workflow productization and operator lane docs
- release readiness and adoption stabilization

The project is no longer trying to prove the basic idea. The next question is how to finish the local kernel before reopening broader expansion.

## Next Three Releases

### 1.0.11: Kernel Closure

- Status: planned
- Goal: turn the current execution kernel from "real but still settling" into a stable default for tracked work.
- Scope:
  - harden `sync` as the next structural hotspot, with clearer planning/apply/report/cleanup boundaries
  - validate execution contracts, receipts, follow-up closure, and route truth on more real tracked tasks
  - close the remaining tracked-lean/lightweight-default wording and payload drift
  - keep projection and hidden-hook sync behavior proof-backed rather than assumption-backed
- Success criteria:
  - `sync` changes are reviewable as distinct concern boundaries rather than one growing hotspot
  - multiple real tracked tasks produce stable execution evidence and route truth without ad hoc exceptions
  - lightweight-default surfaces stop promising heavier context than they actually inject
  - kernel fixes reduce recurring governance defects instead of only moving them between surfaces
- Out of scope:
  - no new cloud-agent execution claims
  - no new native adapter expansion

### 1.0.12: Governance Productization

- Status: planned
- Goal: make lifecycle, release, acceptance, and disposition discipline feel like a stable product surface instead of a set of scattered repair tasks.
- Scope:
  - productize reconciliation, archive readiness, and lane-disposition expectations
  - promote acceptance replay and repo-workflow proof into a clearer repo-level evidence surface
  - tighten release-closure, review-closure, and weekly-governance loops
  - add concise operator-facing summaries where docs currently require too much synthesis
- Success criteria:
  - active planning shows less status drift, fewer stale `waiting_execution` tasks, and fewer analysis tasks lingering as `active`
  - acceptance/release proof has an obvious "where do I look?" answer
  - weekly review output trends from large cleanup waves toward smaller, steady discipline corrections
  - operator docs explain the main lanes without requiring deep policy archaeology
- Out of scope:
  - no new adapter families
  - no broad adoption packaging push

### 1.0.13: Selective Breadth Reopen

- Status: proposed
- Goal: reopen exactly one outward-facing expansion lane only after `1.0.11` and `1.0.12` have reduced kernel and governance drift.
- Candidate lanes:
  - MCP read-only compatibility
  - cloud-dev operator polish
  - adoption starter kit and fixture-backed install guidance
- Entry gate:
  - `1.0.11` kernel hardening is complete
  - `1.0.12` governance surfaces are stable enough that weekly review is mostly incremental
  - the chosen expansion lane has a narrow proof target and does not require reopening multiple unsettled semantics at once
- Success criteria:
  - one expansion lane is proven in real use without destabilizing the local core
  - unsupported lanes remain explicitly backlogged rather than implied
  - outward growth is driven by clear operator value, not by breadth for its own sake
- Out of scope:
  - do not expand cloud support for multiple agents in the same release
  - do not mix adoption packaging, MCP, and cloud parity into one umbrella

## Deferred Expansion Themes

These remain valuable, but they are not the current mainline:

- cloud-dev parity and multi-agent cloud support
- MCP read-only as a compatibility layer for non-native agents
- adoption starter kits and disposable-home validation
- lightweight office/research templates for non-coding work

They should move forward only when they clearly benefit from, rather than compete with, the kernel-first sequence above.
