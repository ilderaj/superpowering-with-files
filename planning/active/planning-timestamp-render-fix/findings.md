# Findings

## Findings Record: 2026-05-06 17:00:00 UTC+8

- 用户反馈“时间有了，但是时间戳不准确”，截图显示 heading 被展示为 `2026-05-06 00:00:00 UTC+8` / `2026-05-06 00:20:00 UTC+8`。
- 已确认上一轮写入的原始 markdown 不是这个值；例如 `planning/archive/20260506-155446-planning-timestamp-heading-audit/progress.md` 原文是 `15:00:00 UTC+8` / `15:20:00 UTC+8`。
- 初步判断根因不是 timestamp 计算错误，而是“裸时间戳 heading”被展示层错误重解释。

## Findings Record: 2026-05-06 17:15:00 UTC+8

- `new Date("2026-05-06 15:20:00 UTC+8")` 在本地 Node 运行时解析正常，因此问题不在共享 helper 的 UTC+8 计算。
- 更稳定的修复不是继续争论 `UTC+8` 字面量，而是避免 `findings.md` / `task_plan.md` / 旧式 `progress.md` 使用“纯时间串”作为 heading。
- 新 contract：
  - `progress` -> `## Session: <timestamp>`
  - `findings` -> `## Findings Record: <timestamp>`
  - `task_plan` -> `## Plan Record: <timestamp>`
- 仓库内裸时间戳 heading 已做 targeted migration，避免你现在查看已有 planning 文件时继续看到错误显示。
- 全量 `npm run verify` 唯一失败项与本任务无关：`docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md` 含 `/Users/jared/`，触发了既有 `no-personal-paths` 检查。
