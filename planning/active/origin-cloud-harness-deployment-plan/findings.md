# Findings & Decisions

## Requirements

- 用户要把本 harness 部署到 GitHub origin repo，让 Copilot cloud agent 可以直接在 GitHub repo 上工作。
- 本地仍保留现有 workspace 与 user-global harness。
- 本地 global harness 与 cloud 上的 workspace-oriented harness 不应互相覆盖、感知、push/merge 到一起。
- 先给可执行方案，当前不直接执行。

## Research Findings

### 2026-05-06 关键外部事实

- GitHub 官方当前把 Copilot coding agent 统一称为 Copilot cloud agent。
- Copilot cloud agent 支持的 repo 内定制面包括：
  - `.github/copilot-instructions.md`
  - `.github/instructions/*.instructions.md`
  - `AGENTS.md`
  - `.github/hooks/*.json`
  - custom agents：`.github/agents/*.agent.md`
  - project skills：`.github/skills`、`.claude/skills`、`.agents/skills`
- GitHub 官方明确说明：
  - cloud agent 只能修改你启动任务时指定的那个 repository
  - 默认只访问该 repository 的上下文
  - 只能向单一分支推送；通常是新建 `copilot/` 分支，不能直推 default branch
  - runtime 不会拿到普通 Actions repo/org secrets；只有显式放进 `copilot` environment 的 secrets / vars 才会传给 agent
  - `.github/hooks/*.json` 必须已存在于 repository 的 default branch，cloud agent 才会使用

### 2026-05-06 关键本仓库事实

- 当前 Harness 已有 clear 的 global / workspace 分层：
  - global baseline 用 `adopt-global`
  - workspace enablement 用 `install --scope=workspace ...`
- 当前仓库 README 和 tests 已明确：
  - Copilot workspace entry 是 `.github/copilot-instructions.md`
  - Copilot user-global entry 是 `~/.copilot/instructions/harness.instructions.md`
  - `safety` 与 `cloud-safe` 是 workspace-only，不允许 user-global / both
- 当前仓库 roadmap 已明确一个已知缺口：
  - “global baseline + workspace safety overlay” 还没有真正做成 additive overlay
  - 也就是说，如果直接拿现有“共享 state”思路混用 global 与 workspace safety，会互相干扰
- 当前仓库对 Copilot 的 project skill root 默认仍走共享 `.agents/skills`，这对“同 repo 下避免本地 Codex / Copilot 共同感知”并不理想。

### 2026-05-06 由上述事实推出的硬边界

- 如果你在同一个本地 clone 里继续使用本地 Copilot，那么它天然会同时读取：
  - 本地 `~/.copilot/...` 的 user-global 指令
  - repo 内 `.github/...` 的 project 指令
- 所以“同 repo + 本地 Copilot + cloud Copilot + 绝对零互相感知”是不可同时满足的。
- 但如果把 cloud 方案限制为 Copilot 的 repo 原生落点，并避免使用共享 `.agents/skills`、避免提交根 `AGENTS.md`，就可以把串扰范围缩到最小：
  - cloud agent 可见
  - 本地 Codex / Claude / Cursor 基本不可见
  - 本地 Copilot 只会看到一层很薄的 repo 指令叠加

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 推荐把 origin repo 内的 cloud harness 设计成 Copilot-only overlay | GitHub cloud agent 的原生入口都在 `.github/**`，最容易和本地 global baseline 切开 |
| 不推荐在第一版提交根 `AGENTS.md` | 根 `AGENTS.md` 会扩大到更多 agent/host，不符合“只给 Copilot cloud 用”的边界 |
| 不推荐在第一版提交共享 `.agents/skills` | `.agents/skills` 会被本地 Codex 与 Copilot 一起感知，隔离性不足 |
| 推荐优先使用 `.github/copilot-instructions.md` + `.github/instructions/**` + `.github/hooks/**` + 可选 `.github/agents/**` | 这些都属于 GitHub 官方文档确认的 cloud agent repo-native 面 |
| cloud profile 应默认走 `cloud-safe` 语义，但只在 repo-local 生效 | 本地 global 不能被 cloud-only policy 污染，且 cloud 工作区更需要 host-secret / host-path 防护 |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 当前 Harness 默认把 Copilot project skills 放到共享 `.agents/skills` | 方案层将其列为需新增的“GitHub-origin deployment profile”能力，而不是直接沿用现状 |

## Destructive Operations Log

| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
| 无 | 无 | 无 | 无 |

## Resources

- GitHub Docs, About GitHub Copilot cloud agent: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- GitHub Docs, Adding repository custom instructions for GitHub Copilot: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions?tool=vscode
- GitHub Docs, Customize agent workflows with hooks: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks
- GitHub Docs, Responsible use of GitHub Copilot cloud agent: https://docs.github.com/en/copilot/responsible-use/copilot-cloud-agent
- GitHub Docs, Creating custom agents for Copilot cloud agent: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents
- GitHub Docs, About agent skills: https://docs.github.com/copilot/concepts/agents/about-agent-skills
- [README.md](/Users/jared/SuperpoweringWithFiles/README.md:1)
- [docs/install/copilot.md](/Users/jared/SuperpoweringWithFiles/docs/install/copilot.md:1)
- [docs/roadmap.md](/Users/jared/SuperpoweringWithFiles/docs/roadmap.md:1)
- [harness/core/policy/cloud-safe.md](/Users/jared/SuperpoweringWithFiles/harness/core/policy/cloud-safe.md:1)
- [harness/installer/commands/cloud-bootstrap.mjs](/Users/jared/SuperpoweringWithFiles/harness/installer/commands/cloud-bootstrap.mjs:1)

## Visual/Browser Findings

- GitHub Docs 已明确 cloud agent 的 repo-native 落点集中在 `.github/**` 体系。
- hooks 文档明确要求 hook config 文件存在于 default branch，说明“先在 feature branch 试，合并后生效”是必需流程。
- responsible-use 文档明确说明 Copilot 只能推送到单一 `copilot/` 分支，不能直推 default branch；这降低了 cloud 侧误覆盖主线的风险。

