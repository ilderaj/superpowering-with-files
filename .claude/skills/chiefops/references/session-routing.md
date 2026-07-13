# ChiefOps Session Routing Reference

Use only when a historical `threadId` or `sessionId`, a visible-worker request,
or a handoff/respawn choice is in scope. Treat the ID as a routing cue, not
durable session state. Choose `continue_worker`, `respawn_worker`,
`handoff_worker`, or the explicitly justified `chief_direct` route. A visible
Codex session-worker request must not be silently substituted with a subagent
or hidden worker; report the attempted tool path, downgrade reason, bounded
slice, proof target, evidence sink, and return-to-Chief gate.

ChiefOps never creates a worker registry, runner, or session manager. Record
durable assignment intent only in the task trio and write a receipt only after
an attempted outcome.
