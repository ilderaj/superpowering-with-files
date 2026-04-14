# 任务计划：Installer Platform Hardening

## Goal

在不触碰 Jared 全局目录的前提下，收紧 HarnessTemplate 自身的 installer、status/doctor、CLI help/preview、Claude shared skill root 语义和 Gemini 支持表述，并补齐最小必要测试与文档。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase

Phase 5

## Phases

### Phase 1: 范围恢复与任务建档
- [x] 读取用户要求、AGENTS 约束和相关技能
- [x] 扫描现有 `planning/active`，避免覆盖旧任务
- [x] 创建新的 task-scoped planning 目录
- [x] 记录已知背景、边界和完成标准
- **Status:** complete

### Phase 2: 现状审计与实现决策
- [x] 读取 CLI、projection、health、metadata、adapter 和现有测试
- [x] 确认 stale projection、help、dry-run/check、verify output、Claude 语义、Gemini 语义的当前行为
- [x] 决定每项需求的实现方式，并同步到 findings
- **Status:** complete

### Phase 3: 代码实现
- [x] 实现 stale projection 治理
- [x] 修复 `--help` 行为，并为 `sync` / `verify` 增加安全模式
- [x] 明确 Claude shared skill root 支持策略
- [x] 明确 Gemini 支持矩阵并收敛实现/元数据
- **Status:** complete

### Phase 4: 测试与文档
- [x] 为 A-E 每项需求补最小必要测试
- [x] 更新 README、install docs、architecture、maintenance
- [x] 确认测试全部使用 fixture/test root，不依赖真实 home
- **Status:** complete

### Phase 5: 验证与交付
- [x] 运行针对性测试和全量验证
- [x] 回写 planning 文件中的结果、行为变更和迁移说明
- [x] 形成最终交付摘要
- **Status:** complete

## Key Questions

1. stale projection 应该由 `sync` 自动回收，还是由 `status`/`doctor` 显式报告，哪种和当前架构更一致？
2. 当前 CLI 是否把 `--help` 误当成普通参数透传给命令实现？
3. `sync --dry-run/--check` 和 `verify --output/stdout-only` 应该怎样最小化接入现有命令结构？
4. `.claude/skills -> ~/.codex/skills` 目录级共享到底是 Harness 显式支持，还是当前 health 误判放行？
5. Gemini 在平台 metadata、adapter、文档和安装说明里目前处于什么状态，应该支持还是明确不支持？

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 新建 `planning/active/installer-platform-hardening/` 而不是复用旧任务 | 这次是对 installer/CLI/platform 语义的实现任务，不覆盖前一轮审计任务 |
| 只改 HarnessTemplate 项目代码、文档和测试 | 用户明确禁止触碰 Jared 全局环境 |
| 优先复用现有 projection/state/health 结构 | 避免再造第二套 installer 机制 |
| `sync` 负责 stale projection 垃圾回收 | Harness 已经把 projection manifest 当成 installer source of truth，继续保留 stale entry 会让 state 与磁盘偏离 |
| `verify` 默认 stdout-only，只有显式 `--output` 才写文件 | 避免默认在仓库里制造 untracked 报告 |
| Claude Code 不支持目录级 shared skill root | 现有 per-skill projection/health 模型更简单且可验证 |
| Gemini 维持 unsupported，而不是补半套 adapter | 当前没有 installer/metadata/test/doc 的完整闭环，明确 unsupported 更安全 |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` command not found | 1 | 改用 `rg` 和 `ls` |

## Task Metadata
- Task ID: installer-platform-hardening
- Planning Directory: /Users/jared/HarnessTemplate/planning/active/installer-platform-hardening
