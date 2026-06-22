---
name: overengineering-review
description: Use when you want a focused pass that looks only for removable complexity, not a general correctness or security review
---

# Overengineering Review

## Overview
Overengineering Review is a narrow review lens for places where the implementation may be bigger than the need. It looks for cuts, substitutions, and smaller shapes without turning into a full bug, security, or performance review.

## Outcome Contract

- **Outcome:** the user gets a compact list of complexity cuts grouped by what kind of reduction is possible.
- **Done when:** each finding is tagged with one of `delete`, `stdlib`, `native`, `yagni`, or `shrink`, and the response ends with `net: -<N> lines possible.`
- **Evidence:** cited files or code locations plus a short rationale for each cut.
- **Output:** a focused over-engineering review, not a broad correctness report.

## When to Use
- A feature feels larger than its current need
- A patch may have introduced unnecessary helpers, wrappers, or dependencies
- The user wants simplification ideas before committing to a refactor

Do not use this skill when:
- the main job is correctness review
- the main job is security review
- the main job is performance analysis

Correctness, security, and performance findings belong to normal review, not this skill.

## Quick Reference
| Tag | Meaning |
| --- | --- |
| `delete` | remove code or a layer entirely |
| `stdlib` | replace custom logic with the standard library |
| `native` | replace a dependency or wrapper with a native platform feature |
| `yagni` | cut speculative capability that is not needed yet |
| `shrink` | keep the behavior, but make the diff or file surface smaller |

## Output Format
Use one short item per finding:

```text
tag: <delete|stdlib|native|yagni|shrink>
surface: <file or component>
change: <what to remove or simplify>
why: <why the current shape is over-built>
```

Finish with:

```text
net: -<N> lines possible.
```

## Common Mistakes
- reporting correctness bugs instead of over-building
- turning every style preference into a finding
- proposing larger rewrites than the simplification saves
- omitting the final `net: -<N> lines possible.` line
