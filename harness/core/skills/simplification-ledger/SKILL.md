---
name: simplification-ledger
description: Use when you want a read-only ledger of deliberate simplifications recorded with the canonical `swf-simplify:` marker
---

# Simplification Ledger

## Overview
Simplification Ledger scans the repo for deliberate simplification markers and turns them into a compact report. It is read-only in V1 and exists to keep temporary ceilings visible without creating a new runtime or command surface.

## Outcome Contract

- **Outcome:** the user gets a grouped ledger of recorded simplifications and their upgrade conditions.
- **Done when:** the scan uses the canonical marker, reports file and line locations, includes each simplification ceiling, and flags missing upgrade triggers as `no-trigger`.
- **Evidence:** the canonical search output plus the grouped ledger rows.
- **Output:** a read-only ledger report.

## When to Use
- You want to audit deliberate simplifications before widening scope
- You want to check whether temporary ceilings are still acceptable
- You want to identify markers that are missing upgrade triggers

## Canonical Search

Use this search as a discovery filter:

```bash
rg -n '(#|//) ?swf-simplify:' .
```

Inspect matches in source context before reporting; the regex alone cannot distinguish prose or block-comment content. Do not infer missing ceilings or upgrade conditions, and do not turn the ledger into a line-saving quota.

V1 supports hash-style and slash-style line comments only. Do not treat block comments, prose docs, or other marker shapes as in scope for this version.

## Ledger Fields
Each ledger row should include:

- `file`
- `line`
- `simplification`
- `ceiling`
- `upgrade trigger`

If a row is missing the trigger, mark it as `no-trigger`.

## Output Shape
Group the ledger by file and emit compact rows:

```text
file: <path>
- line: <n> | simplification: <summary> | ceiling: <boundary> | upgrade trigger: <condition|no-trigger>
```

## Guardrails
- Stay read-only.
- Do not rewrite markers automatically.
- Do not add a runtime, CLI, or installer command in V1.
- Do not infer support for comment syntaxes beyond `#` and `//`.

## Common Mistakes
- treating prose docs or block comments as valid V1 markers
- rewriting markers instead of reporting them
- omitting the upgrade trigger and failing to flag `no-trigger`
- inventing support for more comment syntaxes than `#` and `//`
