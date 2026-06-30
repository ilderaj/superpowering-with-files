# Selective Breadth Entry Gate

The executor may select exactly one lane when all of the following are true:

1. `1.0.11` focused kernel proof is green.
2. `1.0.12` acceptance/reconcile/release proof is green.
3. Weekly governance output is mostly incremental rather than cleanup-heavy.
4. The chosen lane has one narrow proof target and does not reopen multiple unsettled semantics.

## Deterministic Scoring Rubric

| Lane | Narrow proof target (0-3) | New semantics risk (0-3, lower is better) | Operator value now (0-3) | Weekly-review burden (0-3, lower is better) | Total score |
| --- | --- | --- | --- | --- | --- |
| ADOPT-001 | 3 | 1 | 3 | 1 | 8 |
| MCP-001 | 2 | 1 | 2 | 1 | 6 |
| CDX family | 1 | 3 | 2 | 3 | 3 |

Choose the highest total score. If a tie somehow appears after future edits, break ties in this fixed order: `ADOPT-001` -> `MCP-001` -> `CDX family`.

## Default Selection

Unless explicit owner approval says otherwise, `ADOPT-001` is the default recommendation for `1.0.13` because it has the highest fixed score and the narrowest operator-value path.

## Unchosen-Lane Disposition

### MCP-001

Not selected for `1.0.13`; remains explicitly backlogged pending a future narrow proof target.

### CDX family

Not selected for `1.0.13`; remains explicitly backlogged pending a future narrow proof target.

### OFFICE-001

`OFFICE-001` remains deferred. It should not displace coding-first kernel or governance work unless an explicit owner decision promotes it.

## Owner-Approval Gate

Roadmap/backlog edits remain report-only until explicit owner approval is recorded in reconciliation evidence. Until that approval exists, this document and the active task reconciliation artifact are the only places where the proposed breadth decision should be recorded.
