# HarnessTemplate 初始化 Skill 投影审计与优化计划

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## 任务目标

- 按方案 B 实施长期稳定的 skill projection 收敛方案。
- 仅修复 HarnessTemplate fresh install / fresh sync 自身会带出的结构性问题。
- 不处理已有 workspace 和已有用户全局环境中的历史安装遗留。

## 完成标准

- Codex skill roots 对齐到 `.agents/skills` / `~/.agents/skills`。
- `superpowers` 不再以容易暴露 upstream realpath 的 per-skill symlink 形式投影给宿主 IDE。
- 对 Copilot、Codex、Cursor、Claude Code 的初始化布局都有明确且可测试的 canonical source。
- health / verify / tests 能覆盖新布局，并能发现明显的重复风险或过时 root。
- README 与平台说明同步更新。

## 实施 phases

### Phase 1: 基线审计与执行收敛

Status: complete

- 确认当前 `platform metadata`、`skills index`、`paths`、`skill projection`、`health`、测试的耦合点。
- 把方案 B 收敛成可执行改动列表。

### Phase 2: Root 与 projection 模型重构

Status: complete

- Codex:
  - roots 切换到 `.agents/skills`
- Superpowers:
  - 对所有宿主平台改为避免 realpath 暴露的稳定投影模型
  - 优先考虑 materialize

### Phase 3: 健康检查与测试重建

Status: complete

- 调整 projection tests、paths tests、skill index tests、sync tests、health tests。
- 补“初始化布局不应产生重复来源/过时 root”的校验。

### Phase 4: 文档与验证

Status: complete

- 更新 README、必要的平台覆盖说明。
- 运行目标测试集与必要的 repo 验证命令。

## 当前关键决策

- 采用方案 B，不做仅 Copilot/Codex 的局部收敛。
- 稳定性优先于最小改动；若某平台现有 `link` 模型存在 discovery 不确定性，优先统一改成更稳定的 materialize。
- 当前实现将 `superpowers` 与 `planning-with-files` 都收敛为 materialize，以避免仍残留单个 link baseline 带来的 discovery 不确定性。

## Worktree

- Worktree base: dev @ d85cc5c765b1f47a921b7140649aff874d971bfd
- Worktree path: `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-harness-skill-projection-stability`
