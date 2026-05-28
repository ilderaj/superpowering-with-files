# Task Plan: Harness 跨平台兼容性审计

## Goal
确认当前 harness 是否仍可在 Linux 与 Windows 上正常工作，找出依赖 macOS 的实现假设，并明确需要补齐的兼容点。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: 已完成 Linux/Windows 兼容性审计并形成结论。

## Current Phase
Phase 5

## Phases

### Phase 1: 范围确认与代码盘点
- [x] 理解用户目标
- [x] 盘点与 harness 直接相关的代码、测试和文档入口
- [x] 记录初始发现到 findings.md
- **Status:** complete

### Phase 2: Linux 兼容性审计
- [x] 审核 shell、路径、进程与权限相关假设
- [x] 判断 Linux 上是否存在阻断项
- [x] 记录证据与结论
- **Status:** complete

### Phase 3: Windows 兼容性审计
- [x] 审核 PowerShell、路径分隔符、可执行策略与命令调用假设
- [x] 判断 Windows 上是否存在阻断项
- [x] 记录证据与结论
- **Status:** complete

### Phase 4: 测试与验证覆盖审计
- [x] 检查现有测试是否覆盖 Linux/Windows 关键路径
- [x] 记录缺失的验证面
- [x] 明确是否需要新增兼容性测试
- **Status:** complete

### Phase 5: 结论与兼容项归纳
- [x] 汇总平台结论
- [x] 列出必须兼容、建议兼容、可接受限制
- [x] 输出给用户
- **Status:** complete

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 搜索范围过大导致噪音过多 | 直接全仓库做宽泛关键词搜索 | 审计结论失焦 | 优先收敛到 scripts/harness、installer、tests/helpers、相关 docs |
| 把“未显式支持”误判成“不可用” | 仅看到文档缺失但未核对实现 | 平台结论偏保守 | 以实现、脚本、测试三类证据交叉确认 |
| 忽略用户现有活跃任务上下文 | planning/active 下已有多项任务 | 结论与仓库现状脱节 | 仅记录本任务，不移动现有任务目录 |

## Key Questions
1. harness 的核心执行链路里，哪些地方硬编码了 macOS/Unix 假设？
2. Linux 是否已有实现支撑但缺少验证，还是存在真实阻断？
3. Windows 是否已有 PowerShell/Node 兼容层，还是仍依赖 POSIX shell？
4. 测试与文档是否足以证明跨平台可用？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 将本任务按 tracked research 管理 | 这是多阶段审计任务，且需要持久化发现与结论 |
| 先做实现与脚本盘点，再判断平台状态 | 先确认真实执行链路，避免只看文档作结论 |
| 将 Linux 判定为“基本可用但缺少明确验证” | CLI 入口是 POSIX `sh`，核心 Node 路径/文件逻辑基本跨平台，但仍依赖 `bash`/`python3` 且没有 Linux 专项 CI 证明 |
| 将 Windows 判定为“当前不算有效” | 缺少 Windows 入口脚本，且多条命令链硬编码 `bash`/`python3`，Hooks 也有显式 Windows 限制 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 宽泛关键词搜索结果过大 | 1 | 收敛到 harness 相关目录与更具体的关键词 |
| `npm run verify` 基线失败，无法作为跨平台有效性的充分证据 | 1 | 单独运行 `./scripts/harness doctor --check-only`，并将验证失败视为现有基线噪音而非本次改动引入 |

## Notes
- 每完成一个平台审计阶段后，更新 findings.md 与 progress.md。
- 结论必须附到具体文件/脚本/测试证据上。
