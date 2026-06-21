# Ponytail Borrowings Acceptance Scorecard

- Run id: `2026-06-21-opt-in-ab`
- Verdict: **PASS**
- Scenarios: `5`
- Borrowed-side wins: `5`
- Metric wins (dependency/files/diff): `3`
- Validation regressions: `0`
- Simpler without sloppier: `5`

| Scenario | Category | Winner | Metric win | Validation | Simpler |
| --- | --- | --- | --- | --- | --- |
| Keep homepage path handling local and dependency-free | implementation | borrowed | yes | kept | yes |
| Add one optional summary flag without a renderer refactor | implementation | borrowed | yes | kept | yes |
| Review a wrapper-heavy homepage dependency patch | review | borrowed | yes | kept | yes |
| Extract the current repo simplification ledger without false positives | debt | borrowed | no | kept | yes |
| Simplify user-managed path matching without dropping trust-boundary behavior | validation | borrowed | no | kept | yes |

## Keep homepage path handling local and dependency-free

- Winner: `borrowed`
- Metric win: `yes`
- Baseline: deps=`1`, files=`4`, diff=`44`, validation=`true`
- Borrowed: deps=`0`, files=`1`, diff=`12`, validation=`true`
- avoids a new dependency
- avoids a shared helper abstraction
- keeps the change local to one file

## Add one optional summary flag without a renderer refactor

- Winner: `borrowed`
- Metric win: `yes`
- Baseline: deps=`0`, files=`6`, diff=`78`, validation=`true`
- Borrowed: deps=`0`, files=`2`, diff=`19`, validation=`true`
- smaller change surface
- no speculative renderer extraction
- same user-visible outcome with fewer touched files

## Review a wrapper-heavy homepage dependency patch

- Winner: `borrowed`
- Metric win: `yes`
- Baseline: deps=`1`, files=`4`, diff=`36`, validation=`true`
- Borrowed: deps=`0`, files=`2`, diff=`14`, validation=`true`
- stays on the overengineering question instead of broad review chatter
- removes the wrapper dependency
- proposes a smaller cleanup target

## Extract the current repo simplification ledger without false positives

- Winner: `borrowed`
- Metric win: `no`
- Baseline: deps=`0`, files=`0`, diff=`0`, validation=`true`
- Borrowed: deps=`0`, files=`0`, diff=`0`, validation=`true`
- uses the canonical search boundary
- avoids prose and block-comment false positives
- captures upgrade triggers instead of a loose mention list

## Simplify user-managed path matching without dropping trust-boundary behavior

- Winner: `borrowed`
- Metric win: `no`
- Baseline: deps=`0`, files=`1`, diff=`8`, validation=`false`
- Borrowed: deps=`0`, files=`1`, diff=`12`, validation=`true`
- keeps trust-boundary behavior intact
- rejects a non-working simplification
- still narrows the change to local cleanup only

