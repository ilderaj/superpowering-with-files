# Task Plan: Branch Head Sync Latest

## Goal
检查 `local dev`、`origin/dev`、`origin/main`、`local main` 四个 head 的真实差异，并把它们同步到当前可确认的最远最新状态，同时保留验证与风险记录。

## Current State
Status: closed
Archive Eligible: no
Close Reason: 四个目标 head 已按安全语义完成同步：dev/origin-dev 对齐，main/origin-main 对齐，且 main 已吸收 dev；验证通过并已记录回退点。

## Current Phase
Phase 4

## Phases

### Phase 1: 现状发现与任务落盘
- [x] 扫描现有 active tasks，确认不复用旧 task
- [x] 记录当前工作区分支与脏状态
- [x] 为本次同步任务创建三件套
- **Status:** complete

### Phase 2: 刷新远端与判定最远 head
- [x] 刷新远端引用，避免基于过期 `origin/*` 判断
- [x] 比较四个 head 的提交关系与 ahead/behind
- [x] 明确“最远最新状态”对应的提交及其理由
- **Status:** complete

### Phase 3: 执行同步
- [x] 将需要同步的本地/远端分支推进到目标提交
- [x] 避免破坏当前未提交工作区内容
- [x] 记录任何潜在风险或限制
- **Status:** complete

### Phase 4: 验证与收口
- [x] 复查四个 head 是否已按预期对齐
- [x] 记录最终差异结论与执行结果
- [x] 更新 progress 与 findings
- **Status:** complete

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 基于过期 `origin/*` 做判断 | 本地远端引用未刷新 | 同步方向错误 | 先 fetch 再比较 |
| 当前 `dev` 工作区存在未提交修改 | 分支切换或 hard reset | 本地工作区 | 尽量避免切换当前 worktree，优先使用 fast-forward/ref 更新 |
| `main` 由其他 worktree 占用 | 直接强改本地 `main``ref` | 其他 worktree | 先确认是否只需 fetch 更新，必要时在其 worktree 内快进 |

## Key Questions
1. `main` worktree 当前是否干净，适合直接执行同步？
2. `main` 吸收 `dev` 时是否会出现需要人工介入的冲突？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本任务单独建 `branch-head-sync-latest` | 本次工作涉及多阶段判断、git 同步与验证，属于 tracked task |
| 先刷新远端再决定同步方向 | 用户要求“同步到最远的最新状态”，不能基于过期远端引用推断 |
| 当前“最远最新状态”按安全集成语义落在 `dev/origin-dev` 所代表的内容集 | `dev` 含 32 个 `main` 之后新增提交；`main` 仅多 1 个 PR merge commit，但两边内容已真实分叉，正确做法是让 `main` 吸收 `dev`，而不是重写 `dev` |
| 先修复 `dev` 中暴露出的测试缺口，再让 `main` 重新吸收最新 `dev` | 初次 merge 后 `npm run verify` 失败，失败点来自 `dev` 带入的测试夹具缺口；若只修 `main`，四个 head 的“最新状态”会再次分叉 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不可用 | 1 | 按仓库规则退回 `find` / `rg` / targeted reads |
