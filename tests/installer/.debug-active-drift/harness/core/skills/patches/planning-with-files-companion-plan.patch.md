# Planning-With-Files Companion Plan Patch

Harness applies this patch to every materialized `planning-with-files` projection.

Patch behavior:

- replace the upstream "do not create a parallel long-lived superpowers plan" wording,
- require the companion plan for Deep-reasoning tasks that actually use Superpowers,
- keep `planning/active/<task-id>/` authoritative for durable task state,
- require the companion plan path, sync-back status, and back-reference to be recorded.
