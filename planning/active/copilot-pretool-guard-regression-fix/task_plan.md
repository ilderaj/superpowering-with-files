# Copilot `PreToolUse` safety hook abort 回归修复方案

## Goal
为 Copilot workspace safety 下的 `pretool-guard.sh` 设计并准备一套可执行的修复方案，解决 `PreToolUse` 在只读/低风险工具上异常 abort 的问题，同时保留对危险 shell 命令的安全判定能力，并补齐完整回归测试与验证路径。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: merged into local dev on 2026-04-28 after focused merge verification and cleanup

## Current Phase
Completed

## Companion Plan
- Path: `docs/superpowers/plans/2026-04-28-copilot-pretool-guard-regression-fix-plan.md`
- Summary: 以 payload 解析硬化 + Copilot safety adapter 回归测试补齐为主线，修复 `pretool-guard.sh` 在 Copilot `PreToolUse` 上的异常退出。
- Sync-back status: synced on 2026-04-28

## Phases

### Phase 1: 根因确认与复现夹具落盘
- [x] 确认当前仓库曾被 workspace Copilot safety hook 阻断只读工具调用
- [x] 恢复仓库 authoritative install state 到 `user-global`
- [x] 读取 `pretool-guard.sh`、hook projection、现有 tests 与日志
- [x] 形成可证伪根因假设：Copilot payload 在 guard 解析阶段异常退出，而不是正常 `deny`
- **Status:** complete

### Phase 2: 修复策略设计
- [x] 明确最小修复面：仅改 `pretool-guard.sh` 的 payload 解析/归一化与相关测试
- [x] 明确不改 projection contract、不改 safety policy 文本、不扩大默认行为面
- [x] 决定新增 Copilot safety adapter 测试覆盖 projection/sync/runtime 三层
- **Status:** complete

### Phase 3: 回归测试与验证矩阵设计
- [x] 列出单元测试、adapter 测试、安装/健康验证、手工 smoke 验证
- [x] 为每类验证定义命令、预期输出和失败判据
- **Status:** complete

### Phase 4: implementation plan 交付
- [x] 输出 companion implementation plan
- [x] 回写 active task 的目标、结论与测试范围
- **Status:** complete

### Phase 5: 隔离执行与 TDD 落地
- [x] 解析 companion plan，确认按 runtime / projection / sync / smoke 四段执行
- [x] 运行 worktree preflight，记录 base 为 `dev @ 7326b4a703f05832d325ae016a06fddaa79a92e1`
- [x] 在 `.worktrees/202604280749-copilot-pretool-guard-regression-fix-001` 创建隔离工作树
- [x] 跑聚焦基线测试，确认当前相关测试集为绿色
- [x] 按 TDD 执行 Task 1 runtime regression tests
- [x] 执行 Task 2 runtime fix
- [x] 执行 Task 3 adapter regressions
- [x] 执行 Task 4 focused verification / smoke
- **Status:** complete

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 解析失败 fallback 过于宽松，危险命令被误放行 | 修复时把 malformed payload 一律当成空对象并默认 allow | Copilot safety profile 的执行边界 | 方案要求：解析失败时优先尝试提取嵌入 JSON；若仍失败，则把原始 stdin 作为 command 候选继续走危险模式判断；只有确认不含危险命令模式时才 allow |
| 只补脚本不补 adapter 测试，未来 projection 回归再次上线 | `sync` / `planHookProjections` 没有 Copilot safety 覆盖 | Copilot workspace safety 安装路径 | 方案要求新增 Copilot safety 的 projection/sync 回归测试 |
| 只修自动化，不做真实 smoke，仍可能与 VS Code preview hooks 的运行时 payload 脱节 | 测试 fixture 过度理想化 | 真实 Copilot runtime | 方案要求在临时 checkout 或 sacrificial worktree 上做手工 smoke：只读工具、`git status`、危险命令三类都验证 |
| 清理 install/sync 生成物时误删非目标文件 | 需要删除 verification 期间生成的 `.agent-config/`、`.agents/`、`.github/hooks/` 与 `.github/copilot-instructions.md`，避免污染最终 diff | 仅限隔离 worktree `/Users/jared/SuperpoweringWithFiles/.worktrees/202604280749-copilot-pretool-guard-regression-fix-001` | 已创建 checkpoint：`/Users/jared/.agent-config/checkpoints/202604280749-copilot-pretool-guard-regression-fix-001/2026-04-28T08-57-00Z`；仅执行带明确路径的删除命令，并在 `progress.md` 记录回滚步骤 |

## Key Questions
1. Copilot `PreToolUse` 传给 guard 的真实 stdin 是否为纯 JSON，还是包装/混合文本？
2. guard 在 payload 解析失败时，应该如何降级，才能兼顾安全性与可用性？
3. 哪些测试层必须新增，才能防止同类 regression 再次漏过？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 修复范围先锁定在 `harness/core/hooks/safety/scripts/pretool-guard.sh` 与测试，不先改 policy/profile/state 逻辑 | 当前证据指向 runtime payload 解析回归，而不是 install state 逻辑错误 |
| 把 Copilot safety 的回归分为 projection / sync / runtime 三层 | 这次故障不是单层问题；projection 已能安装，但 runtime 未被真实覆盖 |
| companion plan 采用可执行 implementation plan 形式，而不是只写结论摘要 | 用户明确要求 detailed implementation plan，且后续执行需要完整测试与验证步骤 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Workspace Copilot safety hook 把 agent 的只读工具调用全部中止 | 1 | 用户在终端手动执行 `install --scope=user-global` + `sync` + `doctor` 恢复 authoritative state；由此确认这是 workspace safety runtime 回归，不是仓库永久损坏 |

## Notes
- 功能分支 `202604280749-copilot-pretool-guard-regression-fix-001` 已合并回本地 `dev`，merge commit 为 `e57e198`。
- 对应隔离 worktree 与本地功能分支均已清理完成。
- 当前 active task 的权威状态保存在本目录；companion plan 只承载详细实现步骤与验证清单。
