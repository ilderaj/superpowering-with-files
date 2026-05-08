# Copilot 全局 adopt 与 safety profile 边界收敛

## Goal
根据当前 harness 变更更新 README，并把 adopt/safety 边界收敛到“global Harness baseline 默认包含 Copilot，但 global safety profile 默认关闭；只有在 workspace 对某个 IDE 显式启用时才开启 safety”。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: roadmap recorded, safety-default-off direction documented, and repo restored to global baseline without workspace safety on 2026-04-28.

## Current Phase
Completed

## Phases

### Phase 1: 现状核对
- [x] 读取 README、Copilot 安装文档、adopt-global 实现与 adoption 测试
- [x] 形成一个可证伪判断：当前是否存在“全局 Copilot safety 被推荐或被 adopt 扩散”的文档或实现面
- **Status:** complete

### Phase 2: 收敛方案
- [x] 明确 README 需要删减或改写的段落
- [x] 明确 adopt/global 需要约束的行为与验证点
- [x] 保持 safety profile 仅在显式 workspace 场景启用
- **Status:** complete

### Phase 3: 实施与验证
- [x] 修改文档与必要实现/测试
- [x] 运行聚焦测试或命令验证 README 所述路径与 adoption 行为一致
- [x] 记录最终 authoritative 状态
- **Status:** complete

### Phase 4: 实机校准与 live 状态收敛
- [x] 用 disposable HOME 执行 `adopt-global` 与 `adoption-status`
- [x] 检查真实 HOME 下是否仍有 Harness 管理的 Copilot user-global 安装
- [x] 如存在，则按新边界清理或收敛到 workspace-only
- [x] 记录最终 live 状态与验证结果
- **Status:** complete

### Phase 5: workspace-only safety 硬保护与最终 apply
- [x] 为 user-global/both safety 禁止规则补测试并落地实现
- [x] 运行聚焦测试确认 global safety 不可启用、workspace safety 仍可启用
- [x] 执行一次 global adopt 并验证全局 baseline 含 Copilot 但不是 safety
- [x] 开启当前 workspace 的 Copilot safety 并验证 workspace hooks 已投影
- [x] 将验证过程与结论写回 planning files
- **Status:** complete

### Phase 6: roadmap 记录与安全默认态回归
- [x] 将“safety 保留但默认关闭、待 overlay/tooling 修复后再评估”的决策写入项目 roadmap
- [x] 记录 overlay 模型与 tool false-positive 修复为后续迭代项
- [x] 验证当前仓库已回到 global adopt baseline + no safety
- [x] 将最终验证与结论写回 planning files
- **Status:** complete

## Key Questions
1. `adopt-global` 当前默认会沿用什么 profile / hooks / targets？
2. README 哪些示例会把 Copilot safety 误导为 user-global 常规路径？
3. 是否需要改实现，还是只需收敛文档与测试断言？

## Verification Target
“整体的harness adopt要包括copilot，但是sfatefy profile默认不global。只针对copilot下的当前workspace生效。

以后全局harness中的safety profiles默认是关闭的，只有在workspace中指定针对某个IDE开启的时候才开启。”

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 为本任务单独建立 active task 目录 | 请求同时涉及文档、installer 行为和安全边界，属于 tracked task |
| `adopt-global` 空 bootstrap 默认包含 Copilot | 用户最新目标是整体 Harness global baseline 覆盖 Copilot |
| `safety` / `cloud-safe` 对 non-workspace scope 直接报错 | 让“global safety 默认关闭，且不能误开到 user-global/both”从文档约定提升为实现级约束 |
| live user-global 收敛采用“改 state 后刷新 receipt” | 让 adoption-status 与 repo state 保持一致，避免留下新的 state/receipt 漂移 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Risk Assessment
| Command | Target Path | Blast Radius | Checkpoint | Rollback |
|---------|-------------|--------------|------------|----------|
| `./scripts/harness install --scope=user-global --targets=all --projection=link --profile=always-on-core --skills-profile=full --hooks=on && ./scripts/harness sync && ./scripts/harness adopt-global` | User-global Harness state plus managed roots under `/Users/jared/.codex`, `/Users/jared/.copilot`, `/Users/jared/.cursor`, `/Users/jared/.claude`, and receipt/state files under the repo | Live user-global Harness-managed files only; goal was to restore Copilot to the global baseline without enabling safety globally | Not taken; command is reversible by rerunning `install` with a narrowed `--targets=` list or a different profile | Re-run `./scripts/harness install --scope=user-global --targets=codex,cursor,claude-code --projection=link --profile=always-on-core --skills-profile=full --hooks=on && ./scripts/harness sync && ./scripts/harness adopt-global` |
