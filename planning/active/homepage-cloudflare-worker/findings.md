# Findings & Decisions

## Requirements

- 给本项目创建一个 homepage。
- homepage 的设计风格采用 `https://getdesign.md/bmw-m/design-md`。
- 执行时使用 `npx getdesign@latest add bmw-m` 安装设计系统。
- 域名路径使用 `vibing.paymond.me/superpowering-with-files`。
- 本地仓库是当前 workspace 中的 monorepo。
- 远端 GitHub 与 `superpowering-with-files` 路径一致。
- 每次 homepage repo 更新到 `origin/main` 时触发 Cloudflare Worker 自动更新。
- 先输出整体 implementation plan，用户审阅完成后再执行。

## Research Findings

- 根 `package.json` 当前是私有 ESM Node 项目，脚本集中在 `node --test` 和 harness MCP/verify，尚无前端构建脚本。
- `README.md` 描述该仓库为 coding-agent workflow governance harness，核心目录包括 `harness/`、`scripts/`、`docs/`、`planning/`。
- `docs/cloud-dev-harness.md` 说明现有 cloud-dev lane 面向 GitHub issue 到 Copilot PR，不等同于 homepage 自动发布链路。
- 相关历史中曾确认 GitHub Pages 未启用或不可访问；本任务计划使用 Cloudflare Worker，不依赖 GitHub Pages。
- 当前本地 `dev` 工作区已有未提交改动：`planning/active/cloud-dev-harness-feasibility/*`、`scripts/ci/run-cloud-dev-issue-triage.mjs`、`tests/automation/cloud-dev-issue.test.mjs`。后续执行需避开或先征得用户处理意见。

## Findings Record: 2026-05-11 15:39:09 UTC+8

- 任务应作为独立 tracked task 处理，避免与现有 cloud-dev-harness-feasibility 任务混写。
- 技术方向优先考虑：`homepage/` 子项目生成静态产物，Cloudflare Worker 负责子路径服务与部署入口，GitHub Actions 负责 main 分支自动部署。
- getdesign BMW M 页面说明：运行 `npx getdesign@latest add bmw-m` 后使用生成的 `DESIGN.md` 指导 UI；风格是近纯黑画布、白色大写 display headline、M light blue/dark blue/red 三色细线、0px radius、全幅摄影和工程化数据网格。
- Cloudflare Workers Static Assets 支持在一次 Wrangler 部署中同时上传 Worker code 与静态 assets；`assets.directory` 指向构建产物，Worker 可通过 assets binding 服务文件。
- Cloudflare Workers Static Assets 可配置 `not_found_handling = "single-page-application"`，适合 homepage 前端路由或子路径刷新。
- Cloudflare 文档建议外部 CI/CD 可使用 GitHub Actions 部署 Workers；本任务的 `origin/main` 触发可由 Actions 监听 push 后调用 Wrangler 完成。

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 规划阶段不运行 `npx getdesign@latest add bmw-m` | 该命令会写文件和依赖，用户要求先审阅 plan |
| 优先静态 homepage + Worker assets | homepage 内容可缓存、部署简单、路径稳定，适合 main 分支触发发布 |
| GitHub Actions 作为 origin main 触发器 | Cloudflare Worker 本身不能直接感知 GitHub push；Actions 是可审计、可重跑的自动化层 |
| 使用 path-prefix aware 前端构建 | 目标 URL 在 `/superpowering-with-files` 子路径下，资源引用和客户端路由必须稳定 |
| companion plan 使用 Vite + React + Worker Static Assets | 与当前 monorepo 隔离，能用 GitHub Actions 在 `main` 更新后构建并部署 Worker |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 本地已有其他任务未提交改动 | 本任务只新增自身规划文件；执行阶段重新确认状态 |

## Destructive Operations Log

| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
| 无 | 无 | 不适用 | 不适用 |

## Resources

- `package.json`
- `README.md`
- `docs/cloud-dev-harness.md`
- `https://getdesign.md/bmw-m/design-md`
- `https://developers.cloudflare.com/`
- `docs/superpowers/plans/2026-05-11-homepage-cloudflare-worker.md`

## Visual/Browser Findings

- 尚未打开视觉参考页面；规划阶段仅记录用户指定 URL。执行设计前应读取/安装 design.md BMW M 包并依据实际组件和 tokens 设计。
