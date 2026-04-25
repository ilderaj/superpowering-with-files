# Vibe Coding Safety Manual

开始高风险 agent 会话前，只做这几件事：

1. 不要在 `HOME`、`/Users`、`Desktop`、`Downloads` 这类大目录里跑 agent，只在明确项目根目录或 sacrificial worktree 中运行。
2. 先执行 `./scripts/harness worktree-preflight --safety`，把 base ref 和 SHA 记到 `planning/active/<task-id>/progress.md`。
3. 用 `git worktree add <path> -b <branch> <base>` 建隔离环境。长跑、bypass、autopilot 都只在这个 worktree 里进行。
4. 任何 `rm -rf`、`git reset --hard`、广泛权限修改、清理脚本执行前，先运行 `./scripts/harness checkpoint . --quiet`。
5. 把命令、目标路径、影响范围、checkpoint 路径、回退步骤写进 `task_plan.md` 的 `## Risk Assessment` 非空表格行。
6. 不要对 secrets、证书、支付、生产配置、发布产物使用 bypass。
7. 阶段性完成后先 `git push -u origin <branch>`，确认远端恢复点存在，再做 merge、清理 worktree、删除临时目录。
8. 会话结束前看 diff，并把做过的命令、验证结果、checkpoint 路径写回 `progress.md`。

红旗信号：

- “只是删一下生成目录”
- “等会儿再 push”
- “主 checkout 跟 worktree 也差不多”

一旦出现这些想法，就先停下来，补 checkpoint、Risk Assessment、远端分支，再继续。
