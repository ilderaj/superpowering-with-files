# ChiefOps Assignment Packet Reference

Use only to render or verify an Assignment Packet/manual handoff. Derive it
from `planning/active/<task-id>/` and existing receipts. It is derived and
ephemeral by default, never a worker database. Include the absolute
`planningRoot`, authority task id, exact trio paths and binding observation,
one current slice, non-goals, proof/evidence, capability/risk/permission,
allowed operations, delegation, deadline, stop condition, expected receipt,
and return instruction. Do not forward Chief chat history or copy the trio.

The worker verifies exact trio hashes before tracked edits and returns
`binding_mismatch` for missing, stale, or contradictory authority truth.
