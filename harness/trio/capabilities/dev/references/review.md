# Review and integration

Review a fixed work product on separate Standards and Spec axes: repository conventions and architecture versus required behavior and non-goals. Verify each finding technically. Material correctness, security, or contract gaps block completion until repaired or explicitly resolved. Review output is evidence, not an automatic mutation command.

Select `change-quality-gate` at a non-empty development diff's commit, push, PR, delegated acceptance, or risk-relevant closure boundary. Bind base, spec, and head; check a risk-relevant test matrix, real RED to GREEN or regression evidence for changed behavior, `git diff --check`, and Standards/Spec findings. Record evidence in the bound Trio for tracked work. A hook or green adjacent test alone does not prove the change.

Verification must cover the current work product before claiming completion. Reuse unchanged applicable evidence from this work when content, dependencies, and environment remain valid; do not rerun merely because a phase label changed. New changes or failures invalidate the affected evidence and require targeted verification. Ordinary text corrections need inspection, not artificial RED/GREEN or ceremonial tests.

Direct closure uses the executor's verification. Delegated primary results remain candidates until Chief acceptance and Trio writeback. Any selected independent review or human gate remains binding. Return exact commands, exits/counts and evidence with scope and limitations.

Commit, push, PR writes, merge, release, deployment, publishing, sending, and workspace cleanup need the applicable authorization and Host capability. Honor existing authorization within scope rather than asking again; do not infer it from a passing gate. Preserve user work and Host-owned workspace lifecycle. PR observation itself stays read-only under [PR feedback](pr-feedback.md).
