# Findings

- `harness/installer/lib/fs-ops.mjs` 明确实现了冲突备份：当 `conflictMode === 'backup'` 时，会把现有目标改名为 `<target>.harness-backup-<timestamp>`。
- 该时间戳来自 `new Date().toISOString()`，因此 `20260426T044458` 表示 `2026-04-26T04:44:58Z`，不是本地时区字符串。
- `harness/installer/commands/sync.mjs` 支持 `--conflict=backup`，并会把技能投影交给 `materializeDirectoryProjection` / `materializeFileProjection` 处理，因此技能目录确实可能生成备份副本。
- `harness/core/metadata/platforms.json` 显示 Codex 和 Copilot 的 `skillRoots.workspace` 与 `skillRoots.global` 都是 `.agents/skills`，也就是说同一根目录既承载 workspace 投影，也承载 global 投影。
- 本机实际清单显示，`~/.agents/skills`、`~/.claude/skills` 和 `~/.cursor/skills` 下都存在大量 `*.harness-backup-20260426T044458` 目录；`~/.codex/skills` 目前没有同类备份目录。
- 除 skills 外，还发现 `~/.claude/CLAUDE.md.harness-backup-20260426T044458` 与 `~/.copilot/instructions/harness.instructions.md.harness-backup-20260426T044458`；未发现 hooks 配置或脚本的同类备份残留。
- 这些备份目录的时间戳一致，说明它们更像是同一次 Harness 同步/接管动作里批量产生的冲突备份，而不是 Google Drive 逐层复制出来的历史版本。
- `.harness/adoption/global.json` 记录最近一次成功 adoption 的 `appliedAt` 为 `2026-04-26T05:14:45.776Z`；而 `planning/active/git-execution-authorization-analysis/progress.md` 已记录命令顺序是先 `./scripts/harness sync --conflict=backup`，后 `./scripts/harness adopt-global`。因此，这批备份是在显式 `sync --conflict=backup` 时触发的，不是 `adopt-global` 自动产生的。
- 目前初判：重复更像是 Harness 的同步/接管行为产生的备份残留，而不是 Google Drive 备份把目录复制出了重复层级。

## Proposed Resolution

- 把 `--conflict=backup` 限定为一次性的接管/迁移手段，不作为常规同步参数。
- 常规同步改回 `--conflict=reject`，避免每次遇到现存技能根时再生成新的 `.harness-backup-*` 目录。
- 如果确实要保留历史副本，先确认哪些目录是真正的用户自定义内容，再把备份集中移动到单独归档目录，而不是继续留在技能根下。
- 新 companion plan 已落在 `docs/superpowers/plans/2026-04-26-backup-conflict-governance-plan.md`，方案核心是把冲突备份迁移到 home-scoped archive store，并在后续 sync 中自动归并 legacy sibling backups。

## Execution Findings

- 用户已确认进入执行阶段，并要求：新开 worktree 执行 companion plan，最终验证成功后合并回本地 `dev`。
- `./scripts/harness worktree-preflight --task backup-skills-duplicate-analysis --safety` 明确给出 base：`copilot/worktree-superpowers-execution @ 9cc50a00a6fd2c6c437571aaafbe9f793f212e6b`。
- 同一 preflight 给出的 canonical label 为 `202604261227-backup-skills-duplicate-analysis-001`，建议分支名为 `copilot/202604261227-backup-skills-duplicate-analysis-001`。
- preflight safety 唯一问题是 active task 尚未填写风险评估；该信息现已补入 `task_plan.md`。
- 新 worktree 已创建在 `/Users/jared/SuperpoweringWithFiles.worktrees/202604261227-backup-skills-duplicate-analysis-001`。
- 基线 `npm run verify` 首次失败的原因不是本任务逻辑，而是 companion plan 示例 JSON 中存在 `/Users/jared/...` 绝对路径；改为 `$HOME/...` 后基线恢复全绿。
- Task 1 的红灯已被钉住：focused test slice 现在稳定表现为 `55 pass / 4 fail`，4 个失败分别对应 fs-ops archive routing、sync legacy normalization、adoption sibling cleanup、health legacy-backup reporting。
- 为了让测试夹具贴近真实现场，legacy skill backup fixture 在 `sync-skills.test.mjs` 与 `health.test.mjs` 中都补成了 materialized skill 目录，并包含最小 `SKILL.md`。
- Task 2 已落地 home-scoped archive scaffolding：`harness/installer/lib/backup-archive.mjs` 现提供 archive root/index path、target digest、index read/write/record 与 `createBackupArchiveService()`。
- `harness/installer/lib/fs-ops.mjs` 已支持在 `conflictMode='backup'` 时优先委托 `backupHandler`，未传 handler 时仍保留原有 sibling backup 路径，确保 Task 2 只把 fs-ops contract 打绿，不提前吞掉 Task 3/4 的红灯。
- Task 3 把 `sync` 真正接到 archive manager：legacy sibling backups 会在 projection 写入前被归并进 `~/.harness/backups/`，重复内容按 digest 去重；sync/adoption focused tests 已转绿。
- Task 4 把 backup governance 暴露进 `health` 管线：现在会报告 legacy sibling backups 和 backup-index 指向缺失 archive 的 drift；`adoption-status` 沿用现有 health 聚合逻辑，不需要新增第二套审计路径。
- Task 5 已把 operator-facing 文档更新为 archive 语义，并在 `docs/maintenance.md` 中补了 disposable-home takeover 验证步骤。
