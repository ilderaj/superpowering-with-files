# Findings & Decisions

## Requirements
- 用户希望把 GitHub 上当前项目 repo 名称改成 `superpowering-with-files`。
- 计划必须覆盖相关检查和 update。
- 对话、解释和计划内容使用中文；命令、路径、代码相关内容保持英文。

## Research Findings
- 当前本地仓库 remote：

```bash
origin  https://github.com/ilderaj/HarnessTemplate.git (fetch)
origin  https://github.com/ilderaj/HarnessTemplate.git (push)
```

- 当前分支状态：`dev...origin/dev`。
- Worktree base preflight 推荐：`dev @ a3db87c4819a13dc1bee78ddbed4b650151919d7`，原因是当前分支 `dev` 是非 trunk 开发分支，应保留当前开发上下文。
- `planning/active` 在本次任务开始时没有列出已有 active 任务目录。
- 初步引用扫描发现 `HarnessTemplate` 主要出现在：
  - `README.md`
  - `docs/install/platform-support.md`
  - `docs/install/*`
  - `docs/architecture.md`
  - `docs/compatibility/hooks.md`
  - `docs/release.md`
  - `docs/superpowers/specs/*`
  - `docs/superpowers/plans/*`
  - `harness/core/metadata/platforms.json`
- `planning-with-files` 是技能名和工作流名，不是 repo 名，不能作为旧 repo 名机械替换。
- GitHub 官方文档说明：仓库改名后，issues、wikis、stars、followers 等信息会自动重定向；`git clone`、`git fetch`、`git push` 指向旧位置也会继续工作，但官方建议用 `git remote set-url origin NEW_URL` 更新本地 clone。
- GitHub 官方文档同时说明两个关键例外：project site URLs 不在普通重定向兜底内；如果别人通过旧仓库名调用该仓库承载的 GitHub Action，rename 不会重定向 action 调用。
- GitHub 官方文档警告：未来不要在同一账号下重新创建旧 repo 名，否则旧 URL redirect 会失效。
- GitHub repo 已更名为 `ilderaj/superpowering-with-files`：`https://github.com/ilderaj/superpowering-with-files`。
- 旧路径 `ilderaj/HarnessTemplate` 通过 GitHub 查询解析到新仓库；旧 Git URL `https://github.com/ilderaj/HarnessTemplate.git` 仍能 `ls-remote` 到 `dev` 和 `main`。
- 本地 `origin` 已更新为 `https://github.com/ilderaj/superpowering-with-files.git`，主工作区和 worktree 都显示新 remote。
- GitHub Pages API 返回 404，表示 Pages 未启用或不可访问；当前没有需要迁移的 Pages URL。
- Webhooks 查询返回空数组。
- 仓库仍是 template repo，默认分支仍是 `main`。
- PR 已创建：`https://github.com/ilderaj/superpowering-with-files/pull/12`。PR base 是 `dev`，head 是 `codex/rename-repo-superpowering-with-files`，状态 `OPEN`，merge state `CLEAN`，当前 status checks 为空。
- 当前 docs/package 改动提交：`05746b1 Rename project to superpowering-with-files`。
- PR #12 已合并到 `dev`，merge commit 为 `e6bed2182b91f4340d8c88e01ef71c8c28d314ad`。
- 后续 `git push --porcelain origin` 被拒的根因：本地 `dev` 有一个 planning 文件提交，而远端 `origin/dev` 已经新增 PR #12 的 merge commit 和原 feature commit，形成 `ahead 1, behind 2` 的非快进状态。
- 处理方式：先 `git fetch origin --prune`，确认本地唯一领先提交只添加 planning files，再 `git rebase origin/dev`，最后 `git push --porcelain origin dev` 成功。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 目标 GitHub repo 名固定为 `superpowering-with-files` | 用户指定，且符合 GitHub repo 无空格命名习惯 |
| 改名流程分成 GitHub 设置、local remote、仓库内引用、外部生态验证四块 | 这能把 Git 数据层、文档层和 GitHub 产品配置风险分开处理 |
| 文档更新采用选择性替换 | `docs/superpowers/specs` 和历史 plans 中的 `HarnessTemplate` 有些属于历史事实，不能无脑替换 |
| 本地目录 `/Users/jared/HarnessTemplate` 不纳入必须变更 | repo 名和本地路径独立；本地目录变更会影响当前工具上下文，收益低于风险 |
| 使用全局 git worktree 进行执行阶段文件改动 | `$executing-plans` 要求执行计划前隔离；本仓库没有已存在 project-local worktree 目录，且 `.worktrees` 未被 ignore，使用全局位置可避免额外 `.gitignore` 变更 |
| 保留 `docs/superpowers/**` 里的 `HarnessTemplate` | 这些是历史 specs/plans，记录的是 2026-04-11 当时的设计和执行上下文；机械改名会破坏历史准确性 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `fd` 不可用 | 退回 `rg --files`，符合项目偏好中的 fallback 规则 |
| `npm test` 触发 vendored upstream superpowers test 缺少 `ws` | 记录为既有基线问题；本次更名使用 `npm run verify`，覆盖 Harness core/installer/adapters 测试并通过 113 项 |
| 初次创建 PR 时 Markdown 反引号被 shell 解释 | PR 创建成功后，用 heredoc 安全重写 PR body |
| `git push --porcelain origin` 被拒，提示 remote has new commits | 远端 `dev` 已包含 PR #12 merge commit；fetch 后 rebase 本地 planning 提交到 `origin/dev`，再 push 成功 |

## Resources
- GitHub Docs: Renaming a repository: https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository
- 本地规划目录：`/Users/jared/HarnessTemplate/planning/active/rename-repo-superpowering-with-files`
- 新 GitHub repo：`https://github.com/ilderaj/superpowering-with-files`
- PR：`https://github.com/ilderaj/superpowering-with-files/pull/12`

## Visual/Browser Findings
- 已查看 GitHub 官方 rename repository 文档，关键信息已转写到 Research Findings。
