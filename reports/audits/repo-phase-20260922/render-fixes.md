# Render-verify bounded implementation audit

Date: 2026-09-22
Worktree: `/Users/jared/.codex/worktrees/audit-render-fixes-20260922`
Branch: `codex/audit-render-fixes-20260922`
Base: `45f3fe81`

## Scope and issue disposition

- Issue #190: reproduced with a fixed-height `overflow: visible` fixture. The old predicate failed on dimensions even though text client rects were present. Fixed by accepting the recorded `overflowX`/`overflowY === visible` alternative while retaining text-rect capability and missing-node invariants. Hidden overflow remains covered by the existing failing fixture.
- Issue #194: reproduced with two checks sharing `#target` but using `#visible` and `#clipped` text selectors. Before the fix both checks used the first text selector and the expected `[true, false]` result was `[false, false]` after the initial fixture adjustment; the final RED probe showed the second check could not independently observe its declared node. Measurements now key by selector plus text and parent context. The existing combined-check assertion was updated to require two context entries when parent contexts differ.
- Issue #195: reproduced by navigating to a missing static-server path. Before the fix the CLI returned `passed` / exit 0 for the 404 document. CDP now records the main document response, and HTTP status >= 400 returns `failed` / exit 2 with a target-response message before invariant evaluation.
- Issue #196: the original implementation already had the desired behavior only when no spec file was present. A corrected RED probe with a spec that explicitly declares `file` reproduced the bug; the target resolution now gives explicit `--url` precedence. The test proves the URL target and does not add a duplicate feature beyond the fix.

## RED evidence

Command used after adding behavioral tests and before implementation:

```sh
node --test --test-concurrency=1 --test-name-pattern='no-clip accepts|shared element|HTTP error|explicit URL' tests/render-verify/render-verify.test.mjs
```

Observed failures: visible overflow returned exit 2; shared selector checks did not produce the independent expected result; HTTP 404 returned exit 0 and `status: "passed"`. The corrected explicit URL/spec-file case also reproduced the file-precedence bug. The initial URL test without `spec.file` was discarded as an invalid trigger.

## GREEN evidence

```sh
npm run verify:render
```

Result: 34 tests passed, 0 failed, test concurrency 1, exit 0.

Targeted post-fix command:

```sh
node --test --test-concurrency=1 --test-name-pattern='no-clip accepts|shared element|HTTP error|explicit URL' tests/render-verify/render-verify.test.mjs
```

Result: 4 passed, 0 failed, exit 0.

No screenshot visibility policy, measurement contract invariant, dependency, Trio file, or root worktree content was changed. The implementation is limited to `packages/render-verify`, `tests/render-verify`, and `tests/fixtures/render-verify`, plus this report.
