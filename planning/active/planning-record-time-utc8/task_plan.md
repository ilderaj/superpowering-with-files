# Planning Records UTC+8 Time Plan

## Current State
Status: closed
Archive Eligible: no
Close Reason: UTC+8 timestamp record change merged into local dev and pushed to origin/dev.

## Goal
评估 planning files 的 records 是否需要在日期之外记录具体时间（UTC+8），并给出可执行实现计划。

## Scope
- 修改 planning-with-files 模板与初始化脚本，让新 records 默认包含 UTC+8 具体时间。
- 添加测试覆盖初始化脚本和 materialized skill 模板。
- 不迁移历史 planning records。
- 不修改 hook summary/hot-context 解析，除非验证暴露兼容问题。

## Phases
1. 上下文恢复与现有格式检查。状态：complete
2. 必要性与兼容性评估。状态：complete
3. 输出实现计划。状态：complete
4. 测试先行：新增 UTC+8 timestamp 行为测试。状态：complete
5. 实现：更新模板、shell 初始化脚本、PowerShell 初始化脚本。状态：complete
6. 验证：运行目标测试和项目 verify。状态：complete
7. 收尾：更新 planning 记录并汇报结果。状态：complete

## Decisions
- 任务 id：`planning-record-time-utc8`。
- 时间记录统一以 UTC+8 表示，避免同一天多条 records 难以排序。
- 实现计划优先改 upstream planning-with-files 模板和 init-session 脚本，再用 projection/sync 测试覆盖 materialized skill 输出；hook summary/hot-context 解析暂不需要改动。

## Implementation Plan
1. 在测试中先断言 `init-session.sh` 生成的 `progress.md` 使用 `## Session: YYYY-MM-DD HH:mm:ss UTC+8`，且不再保留 `[TIMESTAMP]` 或 `[DATE]` 占位符。
2. 在测试中断言 `init-session.ps1` 明确使用 UTC+8 offset，而不是只格式化本地日期。
3. 在 sync/materialized skill 测试中断言 projected `progress.md` 模板包含 `[TIMESTAMP]` 和 UTC+8 guidance。
4. 更新 `harness/upstream/planning-with-files/templates/progress.md`、`findings.md`、`task_plan.md` 的 record guidance 和示例。
5. 更新 `harness/upstream/planning-with-files/scripts/init-session.sh` 与 `init-session.ps1`，生成 `YYYY-MM-DD HH:mm:ss UTC+8` 并替换 `[TIMESTAMP]`，保留 `[DATE]` 兼容替换。
6. 运行目标测试与 `npm run verify`。

## Verification Results
| Command | Result |
|---|---|
| `node --test tests/adapters/planning-record-time.test.mjs` | pass: 3/3 |
| `npm run verify` | pass: 268/268 |
| `git --no-pager diff --check` | pass |
| `npm run verify` on merged `dev` | pass: 268/268 |
| `git push origin dev` | pass |

