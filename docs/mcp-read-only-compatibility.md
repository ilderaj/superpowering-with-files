# MCP Read-Only Compatibility

MCP read-only is the conservative compatibility tier for agents or IDEs that need Harness state but do not yet justify a native adapter. MCP is a runtime facade; it does not own IDE projection and does not replace Codex, Copilot, Cursor, or Claude Code entry-file rendering.

This tier exists to keep compatibility expansion evidence-gated:

- new agent surfaces can inspect Harness state without immediately earning write semantics;
- read-only adoption can prove whether the platform needs a native adapter, MCP-only support, or docs-only/manual guidance;
- write promotion stays blocked until approval, rollback, and reconciliation rules are explicit.

## Compatibility Tiers

| Tier | Use when | Boundary |
| --- | --- | --- |
| Native adapter | The platform has stable entry files, skill roots, hook behavior, and projection tests. | Adapter owns projection into that platform's native shape. |
| MCP read-only | The agent can call MCP tools/resources and only needs to inspect Harness state. | MCP exposes state and safe reports without writing project files. |
| Docs-only/manual | The platform lacks a verified adapter or MCP path. | Human follows docs; no automated Harness integration is claimed. |

## Read-Only Surfaces

MCP read-only may expose:

- Harness status and health summaries;
- active task summary and task details;
- standalone task reconciliation artifacts when present;
- verification summaries and report paths;
- safe dry-run outputs such as projection previews.

It must not mutate planning files, projections, hooks, approvals, or upstream baselines unless a separate write-capability design is reviewed, permissioned, tested, and reconciled.

## Promotion Criteria For Write Capability

Do not add MCP write behavior until the work defines:

- exact writable resource or tool;
- required approval token or human action;
- rollback/receipt behavior;
- tests for allowed and rejected writes;
- reconciliation requirements for any state-changing operation.

## Pilot Guidance

A pilot agent should first prove it can inspect state without modifying files. Record the client, commands/resources used, observed output, and gaps in the owning task's `progress.md` or `reconciliation.md` before proposing a native adapter or write capability.

## Adoption Evidence For Promotion

Before treating an MCP path as durable support rather than exploration, record:

- the client or platform tested;
- which read-only resources or tools were used;
- whether the agent stayed fully read-only;
- what state was successfully inspected;
- what gaps still blocked native-adapter or write-capability claims;
- whether the result supports `native adapter`, `MCP read-only`, or `docs-only/manual` as the correct long-term tier.
