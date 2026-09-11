# Design contract

Write a design contract when the design will be built, reviewed, or reproduced more than once: a product screen set, a brand page family, a recurring deck or report template. A one-off artifact can carry its intent in the task record instead. Follow the project's existing documentation surface; do not create a second source of truth beside an established one.

## Minimum structure

1. **Scope** - the artifacts this covers, and what it deliberately does not cover.
2. **Reader and task** - who reads it, what they know, what they must do or conclude, and in which context (device, time, expertise).
3. **Observable decisions** - layout, hierarchy, content, and interaction decisions stated so a reviewer can confirm them from the rendered result.
4. **Named anti-patterns** - the specific failure modes this artifact must avoid, taken from real corrections and reviews rather than a generic taste list.
5. **Available primitives** - the stylesheet, tokens, components, and assets that already exist and must be reused; what may be added, and where.
6. **Evidence and gates** - what "rendered and inspected" means here (viewport, pages, states) and who accepts the design.

Keep the contract about judgment. Repeatable mechanics - class vocabulary, spacing values, component variants - belong in the stylesheet, tokens, or components that render them, not in prose every generation must re-read. When a repeating artifact has no such primitives yet, create the bounded set first and let the contract point at it.

## Where a correction belongs

| Correction | Encode it in |
| --- | --- |
| Judgment: what the artifact is for, what to avoid, how to compose it | Contract prose, as an observable statement |
| Repeatable mechanics: spacing, type, color, component shape | The shared stylesheet, tokens, or component |
| Mechanical failure: contrast, overflow, a missing state, a broken link | A deterministic check or test |
| Tooling or pipeline defect | The tooling that owns it, not the design guidance |
| A one-off output quirk | Nothing yet; wait until it repeats |

## From corrections to rules

Collect the recent real corrections - user feedback, review findings, support complaints - and rewrite each as an observable rule before adding it: "evidence tables use the full available width" survives regeneration; "make the table feel less cramped" does not. Then place each rule with the table above. A rule that cannot be placed anywhere enforceable stays an open question, not prose nobody checks.

The contract earns its keep by naming decisions and traps the rendered result can be checked against. Raising the adjective count does not raise the quality bar.
