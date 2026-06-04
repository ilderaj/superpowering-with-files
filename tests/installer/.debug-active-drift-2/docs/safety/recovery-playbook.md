# Recovery Playbook

如果 agent 做了危险操作，按这个顺序处理：

1. **立刻停下**：停止当前 agent、shell、自动化脚本，不再继续“顺手修一下”。
2. **保留现场**：记录当前 cwd、分支、HEAD、最后一条危险命令、相关 session log 路径。
3. **找 checkpoint**：优先检查 `.agent-config/checkpoints/` 或 user-global 对应目录，定位最新 `manifest.json`。
4. **恢复 Git 仓库**：
   - `git clone repo.bundle recovered-repo`
   - 在恢复副本里按需 `git apply staged.diff`、`git apply uncommitted.diff`
   - 解开 `untracked.tgz`
5. **恢复非 Git 工作区**：
   - 解开 `workspace.tgz`
   - 排除 `node_modules`、`dist`、`DerivedData` 等可重建目录后，再决定是否重建。
6. **补上下文**：把事故经过、恢复命令、仍缺失的内容写入 `planning/active/<task-id>/progress.md`。
7. **扩大取证**：必要时查看 Time Machine、APFS local snapshots、远端分支、Codex/Copilot/Claude session logs。
8. **承认最坏路径**：如果 checkpoint 和远端都不完整，明确说明哪些内容无法恢复，停止继续试错式覆盖。

恢复完成后，再补新的 Risk Assessment 和更安全的 worktree/branch 隔离，避免二次事故。
