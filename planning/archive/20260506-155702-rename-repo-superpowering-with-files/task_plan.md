# Task Plan: Rename GitHub Repository to superpowering-with-files

## Goal
把 GitHub 上当前仓库从 `HarnessTemplate` 更名为 `superpowering-with-files`，并同步本地 remote、用户可见文档、安装/发布说明与验证检查，确保本地开发和 GitHub 同步不受混乱影响。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Repository rename completed, verified, merged to dev, and transferred into project-roadmap-audit cleanup record.
Closed At: 2026-05-06T15:56:53

## Current Phase
Phase 8

## Phases

### Phase 1: 现状确认与影响范围
- [x] 确认当前 GitHub remote：`origin` 指向 `https://github.com/ilderaj/HarnessTemplate.git`
- [x] 搜索旧名称和目标名称的引用范围
- [x] 查阅 GitHub 官方 rename 行为，确认重定向、Pages 和 GitHub Actions 例外
- [x] 记录风险点和需要更新的文件类别
- **Status:** complete

### Phase 2: 改名前检查
- [x] 确认 GitHub 上目标名称 `superpowering-with-files` 未被同一 owner 占用
- [x] 确认当前账号对 `ilderaj/HarnessTemplate` 有 admin 权限
- [x] 检查工作区状态，避免把无关改动混进文档更新
- [x] 记录当前 remote、默认分支、重要保护规则、Pages 设置和模板仓库设置
- [x] 确认是否有外部消费者通过旧 repo 名引用本仓库，例如 Actions、template repo 链接、文档链接、CI/CD、webhook
- **Status:** complete

### Phase 3: GitHub 仓库设置更名
- [x] 在 GitHub repository settings 中把 Repository Name 改为 `superpowering-with-files`
- [x] 确认新 URL 可访问：`https://github.com/ilderaj/superpowering-with-files`
- [x] 确认旧 URL 会跳转：`https://github.com/ilderaj/HarnessTemplate`
- [x] 不复用旧仓库名 `HarnessTemplate` 创建新 repo，避免破坏 GitHub 的旧 URL redirect
- **Status:** complete

### Phase 4: 本地 Git remote 与同步检查
- [x] 更新本地 remote：

```bash
git remote set-url origin https://github.com/ilderaj/superpowering-with-files.git
```

- [x] 确认 remote 已更新：

```bash
git remote -v
```

- [x] 验证 fetch 正常：

```bash
git fetch origin
```

- [x] 验证当前分支仍跟踪预期远端分支，例如 `dev` 仍对应 `origin/dev`
- **Status:** complete

### Phase 5: 仓库内引用更新
- [x] 更新 README 标题和简介，把项目名称从 `HarnessTemplate` 改为更直观的 `superpowering-with-files`
- [x] 更新安装、架构、兼容性、维护和 release 文档里的用户可见 repo 名或 GitHub URL
- [x] 更新 `docs/release.md` 中 `gh repo create HarnessTemplate` 一类命令示例
- [x] 检查 `harness/core/metadata/platforms.json` 中是否只是描述历史项目名，若是当前项目名则更新
- [x] 谨慎处理历史 specs/plans：只更新会误导当前用户或被当作当前发布说明使用的引用；保留明确属于历史设计记录的旧名称，并在必要处补一句说明历史名称
- [x] 保留 `planning-with-files`、`superpowers` 等技能名，不把它们误改成 repo 名
- **Status:** complete

### Phase 6: GitHub 生态配置检查
- [x] 检查 GitHub Pages；如果启用且没有 custom domain，记录 URL 是否从 `/HarnessTemplate/` 变为 `/superpowering-with-files/`
- [x] 检查 repository topics、description、social preview 是否需要更名
- [x] 检查 template repository 设置是否仍启用
- [x] 检查 branch protection、rulesets、secrets、Actions permissions 是否仍保持
- [x] 检查 webhooks、Deploy keys、GitHub Apps、外部 CI/CD 是否引用旧 repo URL
- [x] 检查 README badges 或外部 badge URL 是否引用旧 repo path
- **Status:** complete

### Phase 7: 验证
- [x] 运行引用扫描，确认当前用户可见引用已更新：

```bash
rg -n "HarnessTemplate|github.com/ilderaj/HarnessTemplate|superpowering-with-files" README.md docs harness tests package.json .github 2>/dev/null
```

- [x] 运行项目现有静态检查或测试，优先使用 lockfile 对应包管理器
- [x] 运行 Harness 自检命令，确认安装器/投影元数据仍一致：

```bash
./scripts/harness doctor
```

- [x] 检查 Git 状态，确认只包含更名相关改动
- [x] 推送到新 remote 后，确认 GitHub 上分支、PR、Actions 状态正常
- **Status:** complete

### Phase 8: 交付与记录
- [x] 在 `findings.md` 记录最终 GitHub URL、remote URL、保留旧名称的例外文件
- [x] 在 `progress.md` 记录执行过的命令和验证结果
- [x] 给用户返回改名结果、已更新文件、仍需人工关注的外部系统
- [ ] 若用户确认任务完成，再把任务状态改为 `closed` 且 `Archive Eligible: yes`
- **Status:** complete

## Key Questions
1. GitHub Pages 是否启用，是否有 custom domain？
2. 这个仓库是否被别人作为 GitHub Action 调用？如果是，GitHub rename redirect 不能保护 action 调用方。
3. 哪些历史设计文档需要保留旧名称以维持历史准确性？
4. 是否要同步重命名本地目录 `/Users/jared/HarnessTemplate`？这不是必须项，且可单独处理。

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用 `superpowering-with-files` 作为 GitHub repository name | 用户明确指定目标名称；GitHub repo 名应使用无空格 kebab-case |
| 本地目录暂不作为必须更名项 | 本地目录名不影响 Git remote；改目录会影响编辑器、脚本路径和当前线程上下文，适合单独执行 |
| 改名后仍更新本地 `origin` | GitHub 会重定向旧 Git 操作，但官方建议更新本地 clone 以减少混淆 |
| 只选择性更新历史 specs/plans | 历史文档里的旧名称可能是当时事实，机械替换会破坏记录可信度 |
| 执行阶段使用全局 git worktree | 用户显式调用 `$executing-plans`，该技能要求执行实现计划前隔离工作区；本仓库没有已存在的 project-local worktree 目录，且 `.worktrees` 未被 ignore，因此使用全局位置避免引入额外 `.gitignore` 变更 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` unavailable | 1 | 使用 `rg --files` 替代文件搜索 |
| `npm test` failed because vendored upstream superpowers test requires missing `ws` | 1 | 记录为既有基线问题；使用项目定义的 `npm run verify` 验证 Harness 代码面，结果通过 113 项 |
| PR body command used Markdown backticks inside shell double quotes | 1 | PR 已创建；随后用 `gh pr edit --body-file -` 和 heredoc 重写 body |
| `git push --porcelain origin` rejected with `(fetch first)` | 1 | 远端 `dev` 已包含 PR #12 merge commit；fetch 后 rebase 本地 planning 提交到 `origin/dev`，再 push 成功 |

## Notes
- 当前分支：`dev`
- 执行前 remote：`https://github.com/ilderaj/HarnessTemplate.git`
- 当前 remote：`https://github.com/ilderaj/superpowering-with-files.git`
- Worktree base: `dev @ a3db87c4819a13dc1bee78ddbed4b650151919d7`
- 当前 GitHub repo：`https://github.com/ilderaj/superpowering-with-files`
- PR：`https://github.com/ilderaj/superpowering-with-files/pull/12`，已合并到 `dev`
- 当前 `dev`：`b499941`
- 计划执行时不要读取或输出 secret。
- 前端相关命令如 dev/start/serve 不适用；本任务以文档、Git remote、GitHub 设置和静态检查为主。
