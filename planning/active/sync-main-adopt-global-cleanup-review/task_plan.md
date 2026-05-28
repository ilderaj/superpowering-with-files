# Task Plan: Sync Main Adopt Global Cleanup Review

## Goal
将本地 `main` 同步到最新可确认 head，随后在本机真实 user-global 环境重新执行一次 `./scripts/harness adopt-global`，再审计当前本地 branches 与 worktrees 是否已完成合并/收敛，并输出一份只读的本地清理建议报告供 review。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 7

## Phases

### Phase 1: 上下文恢复与执行前校验
- [x] 恢复相关历史 task 与 repo memory
- [x] 记录当前主工作区 path / branch / HEAD / worktree 列表
- [x] 识别本轮 `main` 同步与 `adopt-global` 的直接控制面
- **Status:** complete

### Phase 2: 同步本地 `main`
- [x] 刷新远端引用并确认 `origin/main` 的最新 head
- [x] 检查 `main` worktree 是否干净且可快进
- [x] 将本地 `main` 同步到最新 head
- **Status:** complete

### Phase 3: 执行本地 global adopt
- [x] 读取 adoption preflight 与失败原因
- [x] 执行 `./scripts/harness adopt-global`
- [x] 验证 adoption status / receipt / health
- **Status:** complete

### Phase 4: 审计 branches 与 worktrees
- [x] 盘点当前本地 branches、tracking、ahead/behind、merge 状态
- [x] 盘点当前 linked worktrees 及其脏状态
- [x] 判定哪些对象已完成合并且属于清理候选
- **Status:** complete

### Phase 5: 输出清理审阅报告
- [x] 汇总 keep / review / cleanup candidates
- [x] 记录每个候选的理由、风险与回退方式
- [x] 向用户交付只读报告，不执行删除
- **Status:** complete

### Phase 6: Claude Code adopt 生效审阅
- [x] 复核 `adoption-status`、`doctor --check-only` 与 Claude Code user-global settings/hooks materialization
- [x] 区分 config/local payload evidence 与 runtime invocation evidence
- [x] 记录剩余优化点：runtime trace、payload summary 语义、settings resolution、companion-plan warnings
- **Status:** complete

### Phase 7: 起草 Claude Code runtime evidence companion plan
- [x] 读取已执行的旧 companion plan 与当前相关实现/测试文件
- [x] 起草新的 runtime evidence follow-up companion plan
- [x] 将 companion plan path/summary/sync-back status 同步回 active planning files
- **Status:** complete

### Phase 8: 继续做 cleanup readiness 只读分析
- [x] 追查 `homepage-redesign-prototype` 的 branch head 与 `main`/`dev` 的关系，确认是否为 cherry-pick/等效集成而非直接 merge。
- [x] 复核 `harness-reconcile-execution` 是否只剩 task lifecycle 未推进，还是仍存在其他不应清理的约束。
- [x] 如有必要，抽查 merged-but-dirty codex worktrees 中未提交修改是否属于可放弃垃圾、待回收产物，还是仍有未吸收工作。
- [x] 输出更新后的 keep / review / ready-later 结论，不执行删除。
- **Status:** complete

## Key Questions
1. 当前 `local main` 落后 `origin/main` 的 9 个提交是否只是本地缓存差异，还是 fetch 后仍需真正快进？
2. `adoption-status` 当前的 `apply_failed` 是否能被一次正常 `adopt-global` 自愈，还是会再次命中 hook/ownership 阻断？
3. 现有 worktree / branch 集合中，哪些仍绑定 active task、未提交修改或恢复语义，不能进入清理建议？
4. `homepage-redesign-prototype` 为什么在 task 侧已 complete/archivable，但 branch head 仍不在 `main`/`dev` 中？这是 cherry-pick 集成、等效内容替换，还是 task/git 状态漂移？
5. `harness-reconcile-execution` 除了 `waiting_review` 之外，是否还有其他技术或语义因素阻止清理？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本轮作为独立 tracked task 执行 | 这是多阶段 git + user-global + 审计报告任务，需要 durable trail |
| 先同步 `main` 再执行 `adopt-global` | 用户明确给了执行顺序，且 receipt 需要绑定当前 repo HEAD |
| 本轮只输出清理报告，不直接删除 | 用户要求先 review 报告 |

## Blockers
- None.

## Notes
- 当前主工作区在 `/Users/jared/SuperpoweringWithFiles`，task 启动时为 `dev @ 40b3a3d`；经 live re-audit，当前已前进到 `dev @ 23804de`，因此 cleanup readiness 结论需以实时 git 状态为准。
- 当前 `main` worktree 位于 `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260504-upstream-refresh-layout-compat-main`，已快进到 `41bb6dd`，与 `origin/main` 对齐。
- `./scripts/harness sync --conflict=backup` 后重新执行 `./scripts/harness adopt-global` 已成功；当前 `adoption-status = in_sync`，receipt HEAD 已更新到 `40b3a3d44e0879b7c6cd61908631a00e9478f145`。
- 当前本地共 10 个分支、7 个 linked worktrees。多数 feature branches 已被 `main` / `dev` 吸收，但当前“可立即清理”的对象仍很少，因为合并后的两个 codex worktrees 仍有未提交修改，`harness-reconcile-execution` 虽 clean 且已合并，但 task 仍处于 `waiting_review`。
- Claude Code user-global adopt 已生效到配置与本地 payload 验证层：`adoption-status = in_sync`，`doctor --check-only` 通过，`~/.claude/settings.json` 已有 5 类 hook event entries，`~/.claude/hooks` 已 materialize scripts。当前仍未证明真实 Claude Code runtime invocation，receipt 明确记录 `runtimeInvocationVerified = false` / `runtime = not-measured`。
- Companion plan: `docs/superpowers/plans/2026-05-28-claude-code-runtime-evidence.md`。
- Companion summary: 针对 Claude Code runtime invocation trace/evidence、multi-target hook payload reporting、settings resolution、adoption semantics、companion-plan warning hygiene 起草 follow-up implementation plan。
- Sync-back status: companion plan 已起草供 review；implementation 未开始，未修改实现代码、hooks 或配置。

## Risk Assessment
| Time | Command | Target Path(s) | Workspace Boundary | Checkpoint | Rollback | Status |
|---|---|---|---|---|---|---|
| 2026-05-28 09:31:51 UTC+8 | `./scripts/harness sync --conflict=backup && ./scripts/harness adopt-global` | `/Users/jared/.codex/AGENTS.md` plus any configured user-global Harness target paths | Touches user-global files outside the workspace | `/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-28T01-31-49Z` | Restore repo state from the checkpoint bundle if needed, inspect `~/.harness/backups/` and `~/.harness/backup-index.json` for the pre-takeover Codex entry, then rerun `./scripts/harness adoption-status` to verify recovery | pending user confirmation |