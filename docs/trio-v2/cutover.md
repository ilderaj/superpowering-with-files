# Trio V2 Cutover

Codex is the only managed Trio target. Generic targets remain manual.

The V2 public command surface advertises exactly seven commands: `install`, `sync`, `doctor`, `trio`, `verify`, `checkpoint`, and `token-audit`. The dispatcher still retains V1 compatibility handlers for existing callers, but they are not part of the advertised V2 command surface. This is a compatibility boundary, not a claim that legacy handlers were deleted.

The projection contract does not provide cross-authority-root serialization. It does not provide multi-file atomic visibility. It does not provide crash, SIGKILL, or power-loss atomicity. It does not provide automatic residue cleanup. Ownership and recovery records remain the evidence required for any separately authorized repair or cleanup.
