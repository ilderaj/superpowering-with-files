# 任务计划

## 任务
排查并修复 Codex 中 Harness 启动阶段 hooks 触发 `invalid session start JSON output` / `invalid user prompt submit JSON output` 的根因。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Root cause fixed in repo and synced to user-level Codex hooks; direct verification passed.

## 阶段
- [x] 复现当前用户级 Codex hook 输出并确认触发条件
- [x] 修复 `task-scoped-hook.sh` 的 Codex 事件名输出
- [x] 补齐多 active task 分支的回归测试
- [x] 运行 focused verification 并记录落地建议

## 完成标准
- 能稳定复现并解释 SessionStart / UserPromptSubmit 报错原因
- 代码层修复后，本机直接运行相关 hook 输出合法事件名
- focused tests 覆盖多 active task 分支并通过
