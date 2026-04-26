# Task Plan: Companion Plan Warning Governance

## Goal
清理当前 `./scripts/harness doctor --check-only` 与 `./scripts/harness adoption-status` 中的 companion-plan 治理告警，确保 active task 引用和 companion plan 反向链接满足当前 health contract。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Companion-plan governance warnings were eliminated by normalizing canonical references, adding plain active-task back-links, and moving archived companion artifacts into their owning archive task directories.

## Current Phase
Phase 3

## Phases

### Phase 1: Warning Source Triage
- [x] 确认每条 warning 对应的 active task / companion plan 关系
- [x] 验证是“缺少引用”还是“引用格式不被 health 接受”
- [x] 确认 2026-04-26 companion plan 缺失的是哪条反向链接
- **Status:** complete

### Phase 2: Planning Link Repair
- [x] 补齐 active task 对 companion plan 的 canonical 引用
- [x] 补齐 companion plan 对 active task 的反向链接
- [x] 避免改动无关实现代码
- **Status:** complete

### Phase 3: Verification And Closeout
- [x] 运行 `./scripts/harness doctor --check-only`
- [x] 运行 `./scripts/harness adoption-status`
- [x] 更新 planning 文件并判断是否可关闭
- **Status:** complete

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 回退 |
|---|---|---|---|
| 误改历史 planning 语义 | 为了消告警改坏旧 task 的事实记录 | 历史 planning 可读性与治理语义 | 仅补最小 canonical 引用 / 回指，不改任务结论与实现记录 |
| 迁移已归档 companion plan 文件 | 执行 `git mv` 把两份已归档 task 的 companion artifact 从 `docs/superpowers/plans/` 迁到各自 `planning/archive/<task>/companion_plan.md` | 仅影响当前 workspace 内两份历史 artifact 与其归档引用 | 先执行 `./scripts/harness checkpoint . --quiet` 记录回退点；只移动已确认归档完成的两个 task；若结果异常，用 checkpoint 或 `git restore --staged --worktree` 恢复相关路径 |

## Notes
- 本任务只处理 companion-plan 治理 warning，不扩展到新的功能实现或 broader planning refactor。