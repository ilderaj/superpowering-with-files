# Superpowering With Files

A lean, model-flexible harness for completing work accurately and efficiently. Human intent sets the outcome and boundaries; the agent chooses the smallest useful process, model, reasoning effort, and execution topology. The Host supplies tools, permissions, worker lifecycle, and authenticated runtime evidence.

## What changed for Astra

- **Short entries, details on demand.** `AGENTS.md` and skill descriptions carry routing and completion rules. Detailed methods and governance live in referenced files, installed and checked with their owning skill.
- **Astra, Sol, Terra, and Luna can execute.** Model identity is independent from a Chief, worker, or Corleone role name. Explicit model and effort selections survive dispatch. Existing DeepSeek packets retain compatibility.
- **Process follows the task.** Bounded questions, comparisons, reviews, and small changes can finish directly. Durable, resumable work uses the Trio. Delegation is chosen when it reduces uncertainty or elapsed time enough to justify coordination.
- **Clear completion and authorization.** Direct execution can establish completion through relevant verification. Delegated results need integration and acceptance. Existing user authorization continues to apply within its scope; new effects or scope expansions require a fresh decision.
- **Risk-based verification.** Test changed behavior and material failure modes. Text edits do not automatically require TDD, screenshots, multiple reviewers, or a worktree.
- **Reproducible cleanup.** Optional methods have repository-owned sources; redundant local wrappers can be backed up and retired. Raw upstream corpora stay pinned; adaptations live in overlays.

This direction follows [OpenAI's latest model guide](https://developers.openai.com/api/docs/guides/latest-model) and [Eric Provencher's Astra skills discussion](https://x.com/pvncher/status/2095991462416490862), reviewed on 2026-09-06. These sources guide prompt design; they do not prove a local Host capability or performance improvement. See the [migration and acceptance notes](docs/astra-harness-upgrade.md).

## Architecture

```mermaid
flowchart TD
    Human[Human: outcome, constraints, authorization] --> Entry[Thin entry: route and completion contract]
    Entry --> Direct[Bounded direct work]
    Entry --> Tracked[Durable work: Trio]
    Tracked --> Plan[task_plan.md]
    Tracked --> Facts[findings.md]
    Tracked --> Progress[progress.md]
    Direct --> Quality[Select dev, office, or safety quality contract]
    Tracked --> Quality
    Quality --> Methods[Load relevant references and optional methods]
    Methods --> Choice[Choose model, effort, and useful topology]
    Choice --> Inline[Direct executor]
    Choice --> Native[Bounded native subagents]
    Choice --> Visible[Visible worker when useful or required]
    Inline --> Host[Host: tools, permissions, lifecycle, actual evidence]
    Native --> Host
    Visible --> Host
    Host --> Verify[Verify outcome and integrate candidates]
    Verify --> Done[Accept, deliver, and update bound Trio if present]
    Source[Repository sources and overlays] --> Projection[Owned projection and plugin packaging]
    Projection --> Entry
    Projection --> Methods
```

The three Trio files are the sole durable authority **for tracked tasks**. Host runtime events, installation receipts, optional-method assets, and verification reports are evidence or configuration, not additional task-state authorities.

| Layer | Source | Responsibility |
|---|---|---|
| Entry and routing skill | [`harness/trio/templates/entry-policy.md`](harness/trio/templates/entry-policy.md), [`trio`](harness/trio/skill/SKILL.md) | Scope, route, completion, capability selection |
| Quality contracts | [`dev`](harness/trio/capabilities/dev/SKILL.md), [`office`](harness/trio/capabilities/office/SKILL.md), [`safety`](harness/trio/capabilities/safety/SKILL.md) | Relevant quality checks and methods |
| Governance companion | [`chiefops`](harness/trio/governance/chiefops/SKILL.md) | Bound-task recovery, delegation, acceptance |
| Decision core | [`routing.mjs`](harness/trio/core/routing.mjs) | Packet binding, scope and permission adjudication |
| Host adapters | [`hosts/`](harness/trio/hosts/), [`plugins/dsh/`](plugins/dsh/) | Translate supported requests; preserve requested versus actual evidence |
| Distribution | [`projection.mjs`](harness/trio/projection.mjs), [`plugin-kit`](packages/plugin-kit/) | Owned writes, readback, reference files, portable packages |
| Optional methods | [`methods/`](harness/optional-skills/methods/) and upstream overlays | Focused review, debugging, TDD, modeling, planning |

## How decisions flow

```mermaid
flowchart TD
    Start[Understand intended result and existing authorization] --> Bound{Bounded and no durable coordination needed?}
    Bound -->|Yes| Quick[Work directly; no mandatory Trio or worker]
    Bound -->|No| Restore[Create or restore one bound Trio]
    Quick --> Assess[Assess uncertainty, risk, latency, and context]
    Restore --> Assess
    Assess --> Select[Use current model or select a supported model and effort]
    Select --> Parallel{Independent work with a useful payoff?}
    Parallel -->|No| Execute[Execute directly]
    Parallel -->|Yes| Delegate[Delegate bounded scopes; honor explicit visible requirement]
    Delegate --> Integrate[Review and integrate candidate results]
    Execute --> Check[Run relevant verification]
    Integrate --> Check
    Check --> Complete{Outcome and acceptance criteria satisfied?}
    Complete -->|No| Refine[Resolve remaining gaps; escalate reasoning only when useful]
    Refine --> Assess
    Complete -->|Yes| Deliver[Deliver and record completion]
```

A strict `visible_worker_required` request remains visible-only. If the Host cannot provide it, return an actionable `manual_pending` or blocker; do not pretend a native subagent satisfied that requirement. Ordinary delegation can use native subagents. A descriptor or role preset is not evidence that execution occurred.

## Model and reasoning choices

These are starting recommendations, not a benchmark or a forced role roster. Prefer the current model for small work; changing models has a coordination cost. Respect an explicit human choice and the Host's current catalog.

| Work | Useful starting point | Escalate when |
|---|---|---|
| Extraction, local text edits, bounded implementation | Luna, low or medium | Ambiguous requirements or repeated verification failures |
| Ordinary implementation and integration | Terra, medium or high | Cross-module effects or a difficult design decision |
| Broad engineering work or demanding coding | Sol, medium or high | Material uncertainty remains after focused investigation |
| Difficult architecture, reasoning, or cross-domain integration | Astra, medium or high | A specific unresolved issue justifies xhigh or max |
| Independent review | A supported model appropriate to the failure mode | Another perspective can change the decision |

For new assignments, record model and effort explicitly; omitted values retain legacy compatibility defaults. Corleone role files may use `renderInheritedCorleoneRoleFile` to inherit the caller's selection without locking a persona to Flash. Existing fixed-profile renderers remain available for intentional legacy use.

Choose effort independently from model and persona. `xhigh` and `max` are selective tools, not defaults. Astra API requests use `low`, `medium`, `high`, `xhigh`, or `max`; a Host-only `ultra` label must have an explicit supported contract. Do not infer an API mapping. Models accept bare IDs or supported `main/` and `p646e20/` Host prefixes; prefixes are not proof of the underlying model. Authenticated Host evidence is required for `actual` model and effort.

## Working and finishing

Quick tasks need no Trio. Tracked tasks use:

```text
planning/active/<task-id>/task_plan.md
planning/active/<task-id>/findings.md
planning/active/<task-id>/progress.md
```

Load durable context at task entry, after compaction, or when scope, evidence, ownership, or the next step changes. Avoid mechanical rereads after a fixed number of actions. Direct work is complete when the requested outcome and applicable verification are satisfied. A delegated worker returns a candidate; the integrating session accepts it and writes the bound Trio before claiming durable completion.

Scope, sandbox permissions, and approval are separate checks. User authorization persists within the authorized action and scope; routing or a skill cannot manufacture authorization. Repository protections and Host permissions remain effective. “Stop at a draft PR” and “implement, merge, and adopt” are different completion contracts.

## Install, update, and verify

Public commands: `install`, `sync`, `doctor`, `trio`, `verify`, `checkpoint`, and `token-audit`. See [Codex installation](docs/install/codex.md), [plugin packages](docs/install/plugin-packages.md), and [release artifacts](docs/release-plugin-artifacts.md).

For an existing managed installation, review `./scripts/harness sync --dry-run`, apply `./scripts/harness sync`, then run `./scripts/harness sync --check` and `./scripts/harness doctor --check-only`. Source changes and user-global adoption are separately verified. Legacy `install --takeover-chiefops` remains a narrowly scoped, backed-up migration for the previously unowned ChiefOps companion.

Optional methods and redundant legacy wrappers have a separate, explicit adoption command:

```sh
node scripts/adopt-global-skills.mjs --home /absolute/home
node scripts/adopt-global-skills.mjs --home /absolute/home --apply
```

A first takeover of existing, unowned copies requires `--takeover` after reviewing the dry run. The command verifies backups and destination hashes, writes an installation receipt, and preserves unrelated skills. It does not install the Matt companion or modify plugin caches. Install the rebuilt Matt companion through its Host plugin manager and remove duplicate standalone copies only after validating that installation.

Packaged artifacts include the native `harness-codex-plugin-<version>.tgz`, portable `harness-agent-plugins-<version>.tgz`, and two opt-in Matt companion packages. Core packages include five skills (`trio`, `dev`, `office`, `safety`, `chiefops`), their references, and three additional SWF skills (`planning-with-files`, `overengineering-review`, `simplification-ledger`). Optional methods are independently adopted. Codex is the only managed native target; other clients own their generic/manual setup.

```sh
npm run verify:all
pnpm --dir plugins/dsh verify
npm run plugin:build
npm run plugin:smoke
```

The [detailed architecture](docs/architecture.md) and [human usage guide](docs/trio-v2/human-usage.md) describe the remaining contracts. Historical audit reports and diagrams are dated evidence; this README describes the current decision path.
