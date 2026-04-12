# 发现记录：发布 GitHub Release 1.0.0

## 仓库与发布状态
- GitHub 仓库：`ilderaj/HarnessTemplate`。
- 默认分支：`main`。
- `origin/main` 当前提交：`dd2cf2a4357b14555baa9f390595f531efb4ee14`。
- `origin/main` 最新提交标题：`Merge pull request #4 from ilderaj/dev`。
- 本地工作区当前在 `dev...origin/dev`，存在本次任务新增的规划文件；release 必须继续以 `origin/main` 为准。
- `refs/tags/1.0.0` 不存在。
- `gh release view 1.0.0` 返回 `release not found`，`gh release list --limit 20` 无输出。
- 已发布 GitHub Release：`https://github.com/ilderaj/HarnessTemplate/releases/tag/1.0.0`。
- 发布后验证：`gh release view 1.0.0` 显示 `isDraft=false`、`isPrerelease=false`、`targetCommitish=dd2cf2a4357b14555baa9f390595f531efb4ee14`。
- 发布后验证：本地拉取 tag 后，`git rev-parse 1.0.0` 返回 `dd2cf2a4357b14555baa9f390595f531efb4ee14`。

## 实现范围
- 项目定位：`HarnessTemplate` 是面向人类和 agent 的本地治理模板，把一套共享策略渲染为 Codex、GitHub Copilot、Cursor 和 Claude Code 的原生入口文件。
- 核心工作流：`planning-with-files` 作为持久任务记忆，`superpowers` 作为复杂任务的临时推理工具，并要求把持久决策同步回 Planning with Files。
- 支持范围：workspace、user-global、both 三种安装范围；Codex、GitHub Copilot、Cursor、Claude Code 四个目标平台。
- CLI 命令：`install`、`sync`、`doctor`、`status`、`fetch`、`update`、`verify`、`worktree-preflight`。
- 渲染与安装：`sync` 会渲染治理入口文件为真实文件；支持读取平台 metadata、adapter manifest、Handlebars 模板和本地 `.harness/state.json`。
- 上游维护：`fetch` 会把 `superpowers` 与 `planning-with-files` 的上游候选 staging 到 `.harness/upstream-candidates/<source>`，`update` 只允许写入 `harness/upstream/<source>`。
- Worktree 保护：`worktree-preflight` 根据当前分支、上游分支、默认分支和脏工作区状态推荐显式 base，并输出可记录到规划文件的 base SHA。
- 文档范围：README、架构、维护、发布和各平台安装文档已覆盖当前用法。
- 明确限制：技能文件系统投影策略已经建模并测试，但还没有接入 `sync`；当前 `sync` 渲染的是入口文件，不投影 skill 文件。

## 风险与约束
- 必须基于 `origin/main`，不能误用当前工作区的未推送改动。
- `rtk git log -1 --format=fuller origin/main` 曾显示 merge 前提交 `9f7a3d...`，随后用直接 `git` 命令确认 `origin/main` 实际 SHA 为 `dd2cf2a...`。
- `git diff --stat origin/main..dev` 无输出，说明当前 `dev` 树与 `origin/main` merge commit 的内容一致；本地新增规划文件仍不属于 release 依据。
- Release 已完成，无剩余发布阻塞项。
