# dsh parity path and contract repair

Date: 2026-09-22

## Path correction

`plugins/dsh/test/parity.test.ts` previously imported:

```text
../../harness/trio/core/routing.mjs
```

From the test directory that resolves to the nonexistent `plugins/harness` path. It now imports the real repository-root shared classifier:

```text
../../../harness/trio/core/routing.mjs
```

No `plugins/harness` directory was created or used. The earlier temporary-copy parity result is superseded because it did not establish a valid import against the repository-root source.

## Contract boundary

Parity remains limited to shared classifier behavior that is intentionally common between the harness and dsh port: task/route classification, packet shape and digest, model/effort validation where the shared policy applies, permission adjudication, and immutable packet handling.

The dsh Host adapter is tested independently where its contract differs: dsh service capabilities, current visible-worker evidence, `visible_observation_unknown`, `visible_model_controls_unbound`, native-subagent availability, and strict outer model-policy conflicts. The tests do not restore the retired Corleone `legacy_visible_worker_required_retired` route or treat an optional experimental adapter as the current Trio Host.

## Real worktree verification

Executed from the independent git worktree containing the real repository root structure:

```sh
CI=true pnpm --dir plugins/dsh verify
```

The command waited for completion and returned exit 0:

```text
version-lock ok: @deepseek-ai/dsh == 0.1.0-rc.6
$ tsc -p tsconfig.json
Test Files  20 passed (20)
Tests  299 passed (299)
```

The run used the existing pinned dependency version through a local dependency symlink; no lockfile was changed. No external provider, model execution, or external write occurred.
