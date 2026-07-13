# ChiefOps Check-In and Watchdog Reference

Use only for deadline, probe, grace, watchdog, or recovery decisions. Returns
are event-driven: started, blocked, authority change, safety/respawn issue, or
major-phase-ready. Use milestone deadlines rather than busy polling. The first
miss gets one probe and a minute-scale grace; after bounded recovery evidence,
return to Chief or recommend respawn. This reference never creates a daemon,
scheduler, or durable queue.
