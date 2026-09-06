---
name: diagnosing-bugs
description: Diagnose reported failures or performance regressions when the root cause needs investigation before a fix.
---

# Diagnosing Bugs

Establish the actual failure, isolate its cause, and verify the smallest authorized fix. Scale the investigation to the uncertainty: a trivial failure with a known repro can go straight to one falsifiable hypothesis and a regression test.

## Diagnosis loop

1. Read the report, relevant source, tests, logs, configuration, and existing domain documents or ADRs. **Code inspection is allowed before a runnable repro** to locate the trigger, trace a bad value, and design the feedback loop. Treat early theories as provisional; inspection alone does not prove a fix.
2. Build and run the smallest practical loop that catches the user's exact symptom. Confirm an observed RED and narrow the inputs enough to distinguish causes. Reuse a known failing test rather than building another harness. Use [FEEDBACK-LOOPS.md](FEEDBACK-LOOPS.md) for loop construction, intermittent failures, performance measurements, or environment limitations.
3. State one falsifiable hypothesis, its supporting evidence, and the prediction that would disprove it. Compare a small ranked set only when several causes remain plausible; no fixed hypothesis count applies to trivial bugs. Change one variable at a time and record the result. After three disciplined failed attempts, reassess assumptions or architecture instead of stacking patches.
4. Turn the repro into a regression test at the highest feasible public seam **before the fix**. Exercise the real triggering pattern, including multiple callers or the full interaction where necessary. If no adequate seam exists, state the coverage gap and use a bounded backstop; do not claim a shallow test proves the real bug fixed.
5. Make the smallest root-cause fix, observe GREEN, and rerun the original scenario plus relevant existing and sibling-path tests. Refactor only while green and inside the authorized scope.

## Completion

Report the cause, exact repro and verification commands with observed results, and residual uncertainty. Remove only your temporary instrumentation and artifacts; preserve evidence needed for a regression and other people's changes. Tag temporary logs so they can be located reliably.

If an architectural issue prevented adequate coverage, describe the affected coupling or missing seam and a bounded follow-up proposal. Do not invoke a missing architecture skill, force an unrelated workflow, or expand the repair scope automatically. When reproduction remains unavailable, report the diagnosis as provisional and identify the specific missing evidence rather than declaring a verified fix.
