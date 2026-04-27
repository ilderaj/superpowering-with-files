# 任务计划

## 任务
排查 Codex 中出现的 "hook returned invalid stop hook JSON output" 是否由 Harness 注入的 hook 导致，并判断是否应对 Codex 禁用或跳过 Harness hook。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason: Codex planning hooks now follow the verified-event allowlist; awaiting review.

## Companion Plan
Path: `docs/superpowers/plans/2026-04-27-codex-hook-allowlist-implementation-plan.md`
Companion Summary: Event-level Codex hook allowlist rollout plan covering projection, regression tests, docs, and task-memory sync.
Sync-back Status: implementation completed; active task files synced with rollout results.

## 阶段
- [x] 收集 Codex 适配与 hook 投影证据
- [x] 核对 stop hook 输出契约与仓库实现
- [x] 形成归因结论与建议
- [x] 固化 Codex hook allowlist 设计 spec
- [x] 编写 implementation plan
- [x] 落地 Codex verified-event allowlist 实现与文档同步

## 完成标准
- 能说明报错是否来自 Harness 注入的 hook
- 能指出具体证据文件与触发链路
- 能给出是否应对 Codex 增加/跳过 hook 的结论
- 能产出一份明确 Codex 保留/禁用/条件保留 hook 事件的设计文档
- Codex planning projection 只保留 `SessionStart` 与 `UserPromptSubmit`
- 回归测试、兼容性文档与 dry-run 投影结果均与 allowlist 一致
