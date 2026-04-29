# 审核 Planning Recovery Brief/Hot/Summary 实现

## 任务目标
- 对照规格逐项核查 worktree 中的实现与测试，只报告真实的不符合项。

## Current State
Status: closed
Archive Eligible: no
Close Reason: 已完成规格符合性审核并形成结论。

### Phase 1: 收集规格与实现 [complete]
- **Status:** complete
- [x] 阅读请求中的行为契约、状态契约与范围约束。
- [x] 检查目标 worktree 中的脚本与测试文件。

### Phase 2: 验证行为与测试 [complete]
- **Status:** complete
- [x] 运行目标 hook 测试套件。
- [x] 额外验证跨目标 hook 行为是否满足通用契约。

### Phase 3: 形成结论 [complete]
- **Status:** complete
- [x] 输出最终合规性结论。
