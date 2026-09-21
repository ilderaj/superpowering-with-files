# Project bootstrap CLI

`harness/core/skills/linear-work-control/scripts/project-routing.mjs` exposes the pure planner through the canonical command:

```bash
node harness/core/skills/linear-work-control/scripts/project-routing.mjs \
  bootstrap-project --input /absolute/path/input.json
```

The command reads one JSON object and prints one JSON result. It performs no Linear, Git, filesystem registration, Team creation, or Project mutation. Exit `0` means `ok: true`; exit `1` means invalid input or a fail-closed proposal.

## Input

```json
{
  "request": {
    "productKey": "loffi",
    "productName": "Löffi",
    "explicitEnrollment": true,
    "stream": { "requested": true, "key": "ops", "name": "Operations" }
  },
  "policy": {
    "workspaceId": "workspace-uuid",
    "teamId": "team-uuid",
    "defaultProjectId": "project-uuid"
  },
  "rootEvidence": {
    "canonicalRoot": "/repo",
    "gitCommonDir": "/repo/.git"
  },
  "catalog": {
    "complete": true,
    "paginationComplete": true,
    "projectOwnershipComplete": true,
    "workspaceId": "workspace-uuid",
    "teams": [{ "id": "team-uuid", "workspaceId": "workspace-uuid", "fullyRead": true }],
    "projects": [{
      "id": "project-uuid",
      "workspaceId": "workspace-uuid",
      "teamId": "team-uuid",
      "fullyRead": true,
      "description": "productKey: loffi; projectKey: main",
      "statusType": "started",
      "archived": false
    }]
  }
}
```

`rootEvidence` is caller-owned evidence. The planner only requires known absolute paths; it does not claim to verify Git. `catalog.projects` must be a complete workspace catalog, including archived Projects, and every record must be fully read. The approved Team must be present and fully read in the target workspace.

Without an explicit stream request, the planner uses `main`. A new product with zero matching ownership markers receives a create proposal named `<productName> — Work`, with the exact description marker `productKey: <productKey>; projectKey: main`. One unique active matching Project is reused. A configured `defaultProjectId` is reusable only when that same Project has the exact product and stream marker and is active; a mismatching, duplicate, foreign, partial, or closed Project fails closed. Creating or reactivating Projects remains the caller's separately authorized operation.
