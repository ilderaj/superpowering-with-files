# Findings

## 已确认现状

- `update` 只把 staged upstream candidate 写回 `harness/upstream/<source>`，不会自动刷新当前机器的 user-global projection。
- `sync` 会根据 `.harness/state.json` 把 entry files、skills、hooks 投影到已安装 targets。
- `doctor` 和 `status` 能检查 projection / hook / patch / context 健康状态，但它们当前是独立命令，不会自动绑定在 `update` 之后形成 adoption 闭环。
- `verify` 能产出可持久化报告，但目前更偏“仓库验证报告”，不是专门的 adoption receipt。

## 与本题直接相关的历史任务

- `planning/active/harness-adoption-governance-plan/`
  - 已证明 user-global adoption 可以手动完成并验证。
  - 但该任务是一次性执行，不是持续自动收敛机制。
- `planning/active/github-actions-upstream-automation-analysis/`
  - 已分析 GitHub Actions 如何自动 refresh 仓库自身 upstream baseline。
  - 但 GitHub Actions 不能直接代表“当前这台机器的真实 user-global 环境”。
- `planning/archive/20260412-200811-harness-upstream-smooth-update/`
  - 已实现 `fetch/update` 的 upstream smooth update 能力。
  - 说明仓库内 baseline 更新链已具备，缺的是“从 repo HEAD 到 operator machine global state”的后半段。

## 初步判断

- 技术上可行。
- 最稳妥的目标形态不是“单纯在 `update` 后隐式顺手 sync 一下”，而是新增一个显式的 global adoption orchestration：
  - 读取 repo 当前安装意图
  - 针对 user-global 执行 install-or-confirm
  - 执行 sync
  - 执行 doctor/status/verify
  - 写出 adoption receipt 或 state stamp
- 真正困难点不在“写文件到 `~/.codex` / `~/.agents`”，而在：
  - 何时触发
  - 如何证明本机已 adopt 到当前 repo 版本
  - 如何避免在 repo 更新失败或 context drift 时产生假成功

## 可行性结论

### 结论

- 可行，而且不需要改动现有存量 workspace。
- 但不建议直接把方案定义成“每次 `update` 完就自动顺手 `sync` 到全局”。

### 为什么可行

- 当前 installer 已经具备 user-global scope、target path resolution、projection manifest、health inspection、verification report 这些基础能力。
- 当前 `.harness/state.json` 已经是 `scope: "user-global"`，说明 repo 本身能表达“要管这台机器的全局安装面”。
- `status` / `doctor` / `verify` 已经能分别承担结构化状态、健康门禁和可持久化验证报告。

### 为什么还不够

- 当前没有把“global adoption”建模成一个独立动作。
- 当前没有“本机已 adopt 到哪个 repo HEAD”的 receipt / stamp。
- 当前没有本地自动触发器把 repo 更新与 global adoption 绑定起来。

## 方案比较摘要

### 方案 A：继续手动 `sync`

- 可行，但仍依赖人工记忆。
- 适合临时过渡，不适合作为长期收敛机制。

### 方案 B：把副作用塞进 `update`

- 不推荐。
- 原因是 `update` 的职责是 repo baseline mutation，不应该隐式修改 operator machine global state。
- 这会污染 CI、隔离验证、一次性 calibration 等场景的边界。

### 方案 C：新增 `adopt-global` + 本机自动化触发

- 推荐。
- 这是唯一同时满足“语义清晰、可验证、可回滚、可自动化”的路径。

## 推荐方案摘要

推荐引入两层：

1. `adopt-global`
   - 作为 user-global adoption 的一等命令。
   - 负责 install-or-confirm、sync、doctor、status、verify、receipt write。
2. local trigger
   - 作为触发器。
   - 可以是 launchd、Codex automation、或本地 repo update wrapper。
   - 不建议把 git hook 作为唯一触发源。

## 验证与收敛标准

只有在以下条件都满足时，才算 adoption 成功：

1. `sync` 成功完成。
2. `doctor --check-only` 通过。
3. `status` 没有 target problems。
4. `verify --output=...` 生成报告成功。
5. adoption receipt 记录的 `repoHead` 等于当前 repo HEAD。

## 风险与边界

### 风险

- 如果没有 receipt，自动化会把“命令跑过了”误判成“已经对齐”。
- 如果把真实全局副作用耦合进 `update`，CI / disposable env / local trials 的语义会混乱。
- 如果自动化直接覆盖 workspace，会破坏项目 delta 与自治规则边界。

### 边界

- 本轮只建议收敛 user-global。
- workspace adoption 仍应维持 case-by-case。
- 默认 fail-fast，不做静默 partial success。

## 建议执行顺序

1. 先新增 `adopt-global` orchestration。
2. 再新增 adoption receipt / drift detection。
3. 再接本地自动触发器。
4. 最后才讨论是否把它做成“每次 repo 更新后自动执行”的默认行为。

## 已完成实现

### 新增命令

- `./scripts/harness adopt-global`
  - 负责 user-global adoption orchestration。
  - 流程：ensure state → `sync` → `verify` → health gate → success receipt。
- `./scripts/harness adoption-status`
  - 输出结构化 JSON。
  - 用于判断 `in_sync / needs_apply / apply_failed / state_mismatch`。

### 新增持久化产物

- `.harness/adoption/global.json`
  - 最近一次成功 adoption receipt。
- `.harness/adoption/global.failure.json`
  - 最近一次失败 adoption 记录。
- `.harness/adoption/verification/latest.{json,md}`
  - adoption 使用的验证报告。

### 首版边界

- 仅支持 `user-global` 安装态。
- 如果当前 `.harness/state.json` 已经是 `workspace` 或 `both` 且非空，`adopt-global` 会拒绝执行。
- 这是有意设计，不是缺陷；目标是避免在共享 manifest 语义下误清理 workspace projection。

## 已完成验证

- `node --test tests/installer/*.test.mjs`
  - 160 passed, 0 failed
- `npm run verify`
  - 160 passed, 0 failed

## 变更文件

- `harness/installer/lib/adoption.mjs`
- `harness/installer/commands/adopt-global.mjs`
- `harness/installer/commands/adoption-status.mjs`
- `harness/installer/commands/harness.mjs`
- `tests/installer/adoption.test.mjs`
- `README.md`

## Companion Plan Boundary

- 详细方案比较和执行清单保存在 `docs/superpowers/plans/2026-04-20-global-auto-apply-adoption.md`。
- 此文件只保留 durable findings、决策与结论摘要。
