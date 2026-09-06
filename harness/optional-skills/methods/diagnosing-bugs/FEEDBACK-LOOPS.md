# Feedback loops

Read the relevant section when the existing tests do not yet expose the reported failure. Inspect code and available artifacts to find a runnable path; do not mistake a plausible theory for reproduced behavior.

## Choose a loop

Prefer the cheapest loop that reaches the actual symptom through a meaningful public seam:

- A failing unit, integration, or end-to-end test using the real trigger.
- An HTTP request against an authorized dev environment, asserting response content/status.
- A CLI with fixture input and an independent expected output.
- A browser flow asserting the relevant UI, console, or network result.
- A sanitized captured request, trace, or event replay through the affected path.
- A small temporary harness for the relevant services and dependencies.
- A seeded property/fuzz test, differential comparison, or bisection when inputs or history make those useful.

A nonzero exit from setup is not the bug reproduction. Run the command and capture its exact invocation, inputs, failure, and environment assumptions. Minimize by removing one input or step and rerunning; stop when the repro is small enough to guide diagnosis and retain as a regression. Exhaustive minimization is not required for an obvious defect.

Tighten the loop by isolating state and pinning time, randomness, and dependencies where appropriate. Prefer fast, deterministic feedback; a necessary slower integration test still counts. Preserve original-scenario verification when a narrower test omits surrounding interactions.

## Intermittent failures

Record the number of trials, failure count, seed, load, timing, and environment. Raise reproduction probability with controlled concurrency or stress in an authorized environment; do not invent a universal pass-rate threshold. Compare before and after under comparable conditions. Zero failures in a limited run is evidence with a stated sample size, not proof the race is impossible.

## Performance regressions

Measure before changing code: representative workload, baseline and budget, warmup, sample distribution, and relevant counters or profiler/query-plan evidence. Change one variable and rerun under comparable conditions. Logging can perturb timing; prefer targeted profiling or bisection when appropriate. Keep a regression threshold tied to the actual requirement, with tolerances that account for measurement noise.

## Human or environment dependency

If a human action is essential, adapt [scripts/hitl-loop.template.sh](scripts/hitl-loop.template.sh) in an authorized scratch location. It captures observations rather than issuing an automatic pass/fail verdict; define the symptom and interpret the returned evidence explicitly. A structured manual repro is valid when automation is unavailable, and the template is optional. Never treat an unanswered prompt as a successful step.

When the environment cannot be reached, continue useful read-only source inspection and artifact analysis. State what was tried and what remains unverified. Request only the concrete missing artifact, access, or decision necessary to proceed. Production instrumentation or environment mutation requires applicable authorization; it is not implied by this reference. Do not label a speculative patch as a verified repair.
