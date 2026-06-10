# Core Docs Refresh Design

## Summary

Refresh the core documentation around the current Harness implementation so the project reads as one coherent system instead of a collection of accurate but partially overlapping documents.

Use a two-layer documentation model:

- `README.md` becomes the concise entry layer for both humans and agents
- core topic docs become the stable operating layer for workflows, architecture, maintenance, install, compatibility, and safety

The goal is not to add more documentation.
The goal is to make the existing documentation easier to enter, easier to trust, and easier to navigate.

## Problem

The current documentation is strong on substance but uneven in role separation.

The main issues are:

1. `README.md` is doing too many jobs at once
   - project intro
   - core model
   - quick start
   - architecture summary
   - workflow summary
   - command catalog
   - document index

2. The core docs already have useful boundaries, but the reading path is not yet explicit enough
   - `docs/workflows.md` is the operator map
   - `docs/architecture.md` is the implementation map
   - `docs/maintenance.md` is the lifecycle and upkeep map
   - `docs/install/*` is the adoption and platform map
   - but the user still has to infer how these fit together

3. Some concepts are intentionally repeated today because they are important, but not all repetition is high-value repetition
   - some repetition helps orientation
   - some repetition makes the project feel denser than it is

4. The current docs are accurate, but the top-level expression can still be more restrained
   - more “what this is / how to use it / where to go next”
   - less “full conceptual dump at the entry layer”

## Goals

- Make `README.md` the best first 3-minute explanation of Harness.
- Keep the docs friendly to both new humans and new agents.
- Reduce role overlap between README and the core topic docs.
- Preserve implementation truth and workflow truth without flattening them into one page.
- Keep the writing concise, literal, and non-marketing.
- Add missing bridge text where needed, but avoid creating unnecessary new documents.

## Non-Goals

- Do not rewrite the whole docs tree.
- Do not create a second documentation system.
- Do not turn README into a full operator manual.
- Do not hide important constraints just to make the docs feel shorter.
- Do not describe platform support or workflow capability beyond what the repo already implements.

## Audience Model

This refresh should support two reading modes at the same time:

### 1. Entry readers

People or agents who need to answer:

- what is this project?
- what problem does it solve?
- how does it basically work?
- how do I start safely?
- where do I go for details?

### 2. In-system readers

People or agents who are already using Harness and need to answer:

- which workflow lane applies now?
- which doc is authoritative for this question?
- where does this behavior live in the implementation?
- what is the boundary between local policy, platform projection, runtime access, and adoption?

The documentation should serve entry readers first at the README layer and in-system readers first at the topic-doc layer.

## Recommended Documentation Model

### Layer 1: README as entry layer

`README.md` should answer only five questions:

1. What is Harness?
2. What is the core working model?
3. What is the shortest safe way to start?
4. What are the main workflow lanes?
5. Which document should I read next?

README should remain useful on its own, but it should stop trying to be the best place for implementation detail or full policy explanation.

### Layer 2: Topic docs as operating layer

Each core topic doc should have one clear job:

- `docs/workflows.md`
  - operator-facing workflow map
  - when to use each lane
  - reconcile gate
  - supporting guides

- `docs/architecture.md`
  - implementation layers
  - source-of-truth boundaries
  - projection/runtime/MCP separation
  - platform and hook model details

- `docs/maintenance.md`
  - lifecycle audit
  - upkeep flows
  - update/sync/doctor/archive discipline
  - operator heuristics

- `docs/install/*`
  - adoption and platform-specific setup
  - authority-root and scope boundaries
  - target-specific caveats

- `docs/mcp-read-only-compatibility.md`
  - compatibility-tier rules
  - read-only boundary
  - write-promotion gate

- `docs/reconciliation.md`
  - source-of-truth conflict handling
  - reconcile artifact contract
  - finish/archive readiness logic

## Content Redistribution Rules

Use these rules while editing:

1. Keep orientation content in README.
2. Keep operational how-to in workflow, install, and maintenance docs.
3. Keep implementation and system-boundary detail in architecture.
4. Keep compatibility-tier and MCP boundary rules in MCP docs, not in README.
5. Keep lifecycle and audit heuristics in maintenance, not duplicated across all docs.
6. Allow short reminders in README only when they help readers choose the next document.

## Writing Rules

All refreshed docs should follow the same style:

- lead with the core point
- explain boundaries early
- keep examples small
- prefer short sections over long conceptual buildup
- describe current implementation, not aspiration
- avoid slogans and hype
- avoid repeating full explanations when a pointer is enough

Recommended structure for most docs:

1. what this page is for
2. the core model or rule
3. the main boundary or caution
4. the smallest useful commands or examples
5. where to go next

## Recommended Scope Of Change

### Must update

- `README.md`
- `docs/workflows.md`
- `docs/architecture.md`
- `docs/maintenance.md`
- `docs/install/adoption-starter-kit.md`
- `docs/install/codex.md`
- `docs/install/platform-support.md`

### Update if needed after review

- `docs/install/copilot.md`
- `docs/install/cursor.md`
- `docs/install/claude-code.md`
- `docs/mcp-read-only-compatibility.md`
- `docs/reconciliation.md`

### Only add new documentation if a real bridge is missing

Preferred additions are:

- a short “start here / choose your next doc” section in README
- a short “this page is for…” opening in topic docs

Do not add a new top-level guide unless a genuine navigation gap remains after cleanup.

## Proposed README Shape

Recommended top-level README structure:

1. one-paragraph definition
2. core model
3. quick start
4. workflow lanes summary
5. implementation shape summary
6. common commands
7. docs map
8. support/status notes

This should be shorter and calmer than the current README.

## Proposed Topic-Doc Cleanup

### `docs/workflows.md`

- keep lane definitions
- make the page read more as a practical lane map
- trim any detail that belongs more naturally in architecture or maintenance

### `docs/architecture.md`

- keep the six-layer explanation
- tighten wording around core/adapters/installer/runtime/mcp/upstream
- preserve the important hook/projection/SOT details
- reduce repeated orientation text that README can now carry

### `docs/maintenance.md`

- keep lifecycle audit, update, archive, and upkeep rules
- preserve heuristics already promoted from the recent audit work
- make the top of the page clearer for day-to-day operator use

### `docs/install/*`

- keep platform and scope differences
- reduce repeated global explanations when README already covers them
- keep authority-root, scope, and adoption safety boundaries explicit

## Validation

The refresh is successful only if all of these are true:

1. A new reader can understand Harness from README without opening five docs first.
2. An in-system reader can still find the authoritative topic doc quickly.
3. README is clearly shorter and less role-overloaded than before.
4. The core topic docs no longer repeat the same explanation unless the repetition is intentionally serving navigation.
5. No edited doc overclaims support, behavior, or platform coverage.

## Implementation Plan Gate

After this spec is approved:

1. create a focused implementation plan
2. update README first
3. then update the core topic docs in dependency order
4. run targeted documentation verification and consistency checks
5. reconcile what changed, what stayed put, and what was intentionally deferred
