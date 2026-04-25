# Safety Harness Architecture

## Three Layers

1. **Policy layer**: rendered entry files add the safety policy text for supported agents.
2. **Execution layer**: projected safety hooks gate destructive commands and trigger checkpoints.
3. **Recovery layer**: `.agent-config/` stores safety catalogs, checkpoint tooling, templates, and projected docs.

## Hook Decision Matrix

| Situation | Decision | Reason |
| --- | --- | --- |
| Protected cwd or protected absolute path | deny | The agent is operating in a non-rebuildable boundary. |
| Safe allow-listed command inside repo | allow | Read-only or routine verification work should stay fast. |
| Dangerous command without filled Risk Assessment | ask | The rollback path is not written down yet. |
| Dangerous command without upstream | ask | Recovery is weaker without a tracked remote branch. |
| `git reset --hard` on main repo `dev` branch | deny | The primary integration branch should never be hard-reset in place. |
| Dangerous command with upstream and written Risk Assessment | allow | The operator has a recorded rollback path and a remote anchor. |

## Checkpoint Artifacts

Git checkpoints contain:

- `repo.bundle`
- `uncommitted.diff`
- `staged.diff`
- `status.txt`
- `untracked.tgz`
- `manifest.json`

Non-git checkpoints contain:

- `workspace.tgz`
- `manifest.json`

## Profile Relationships

| Profile | Adds |
| --- | --- |
| `always-on-core` | Base policy only |
| `safety` | Base policy + safety policy + safety hooks + `.agent-config` safety assets |
| `cloud-safe` | `safety` plus cloud-only path protections and cloud bootstrap defaults |
