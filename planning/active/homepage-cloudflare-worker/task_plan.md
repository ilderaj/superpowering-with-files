# Task Plan: Homepage Cloudflare Worker

## Goal
为 `superpowering-with-files` 创建一个可部署到 `vibing.paymond.me/superpowering-with-files` 的 homepage，并设计从 `origin/main` 更新触发 Cloudflare Worker 自动更新的发布链路。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:
Companion plan: `docs/superpowers/plans/2026-05-11-homepage-cloudflare-worker.md`
Companion summary: 详细实施计划已覆盖 homepage 子项目、BMW M design.md 安装、Worker Static Assets、GitHub Actions 自动部署、文档和验证步骤。
Sync-back status: companion plan 已与执行结果同步摘要；active task 目录继续作为生命周期和进度 source of truth，当前等待用户决定分支集成方式。

## Current Phase
Phase 6

## Phases

### Phase 1: Requirements & Discovery
- [x] 捕获用户要求：先输出整体 implementation plan，用户审阅后再执行。
- [x] 检查仓库基础脚本、README、cloud-dev 文档和相关历史。
- [x] 记录当前本地存在的未提交 cloud-dev 相关改动，后续执行时不得覆盖。
- **Status:** complete

### Phase 2: Plan Review
- [x] 形成整体实施方案供用户审阅。
- [x] 创建详细 companion implementation plan。
- [x] 等待用户确认方案、调整范围或补充约束。
- **Status:** complete

### Phase 3: Homepage App Implementation
- [x] 在仓库内新增独立 homepage 包或 app 目录。
- [x] 使用 `npx getdesign@latest add bmw-m` 引入设计系统。
- [x] 实现符合 BMW M / design.md 风格的 homepage。
- [x] 添加本地构建、预览和必要测试脚本。
- **Status:** complete

### Phase 4: Cloudflare Worker Deployment
- [x] 新增 Worker 配置和路由，服务 `vibing.paymond.me/superpowering-with-files`。
- [x] 设计并实现静态产物发布策略。
- [x] 配置 secrets 和部署环境说明。
- **Status:** complete

### Phase 5: GitHub-to-Cloudflare Automation
- [x] 新增 GitHub Actions workflow，在 `origin/main` 更新时自动构建并部署。
- [x] 限制触发路径，避免无关改动触发 homepage 发布。
- [x] 记录失败处理和回滚方式。
- **Status:** complete

### Phase 6: Verification & Handoff
- [x] 运行 unit/build/lint 或本仓库等价验证。
- [x] 本地预览并做桌面与移动视口检查。
- [x] 验证 Worker 路由与 GitHub Actions 配置。
- [x] 更新文档并交付结果。
- **Status:** complete

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 覆盖现有未提交变更 | 执行时修改 cloud-dev 相关文件或重置工作区 | 用户现有工作丢失 | 只新增 homepage/Worker/CI 相关文件；执行前再次检查 `git status`；不使用 destructive git 命令 |
| Cloudflare 账户配置缺失 | 缺少 `CLOUDFLARE_API_TOKEN`、账户 ID、zone ID 或自定义域路由 | 自动部署不可用 | 将 secrets 作为实施前置条件写入文档；本地构建和 wrangler dry-run 先通过 |
| Worker 静态资源策略选错 | 产物过大、路由前缀处理不当或 assets 配置不兼容 | 页面 404、资源路径错误 | 使用 path-prefix aware 构建；用本地 preview 验证 `/superpowering-with-files/` 子路径 |
| 设计系统引入影响 monorepo 根依赖 | getdesign 安装修改根 package 或锁文件范围过大 | 现有 harness 依赖和测试受影响 | 优先隔离到 `homepage/` 子包；根 workspace 只添加必要脚本或不改根脚本 |
| 重写错误提交以移除 `homepage/node_modules` | `git add homepage` 误将依赖目录纳入未推送提交，需要执行 `git reset --mixed HEAD~1 && rm -rf homepage/node_modules` | 仅影响当前 worktree 分支 `202605111312-homepage-cloudflare-worker-001`，若误操作会重写本分支最近一次提交并删除工作区依赖目录 | 已创建 checkpoint：`/Users/jared/.agent-config/checkpoints/202605111312-homepage-cloudflare-worker-001/2026-05-11T13-40-26Z`；按精确路径重写提交后立刻重新 stage 白名单文件并重新提交，必要时可从 checkpoint 恢复 |

## Key Questions

1. homepage 是纯静态品牌页，还是需要动态展示 GitHub release、README、roadmap 等内容？当前计划按静态优先，后续可加 GitHub API。
2. Cloudflare 侧是否已有 zone `paymond.me` 和 Worker routes 权限？执行阶段需要确认 secrets。
3. 自动更新应直接部署到生产域名，还是需要 preview/staging 环境？当前计划包含 production 和可选 preview。

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 先只产出整体 implementation plan，不写 homepage/Worker 代码 | 用户明确要求审阅完成后再执行 |
| 为本任务创建独立规划目录 `planning/active/homepage-cloudflare-worker/` | 这是跨前端、Worker、CI 的 tracked task，需要 durable state |
| 后续执行时优先隔离 homepage 到子目录 | 现有仓库是 harness monorepo，根 package 当前只承载 Node test/runtime，隔离可降低依赖和构建风险 |
| companion plan 存放在 `docs/superpowers/plans/2026-05-11-homepage-cloudflare-worker.md` | 用户要求详细 impl plan/companion plan；active task 目录保留生命周期摘要 |

## Plan Record: 2026-05-11 15:39:09 UTC+8

- 建立任务记录并进入 plan review 阶段。
- 当前不实施代码，等待用户审阅整体 implementation plan。

## Plan Record: 2026-05-11 15:44:19 UTC+8

- 创建 companion implementation plan：`docs/superpowers/plans/2026-05-11-homepage-cloudflare-worker.md`。
- 计划细化为 11 个任务：工作区保护、homepage scaffold、Worker route TDD、Wrangler config、BMW M UI、浏览器预览、Worker dry-run、部署文档、GitHub Actions、workflow tests、完整验证。
- 当前状态改为 `waiting_review`，等待用户审阅后再执行。

## Plan Record: 2026-05-11 21:12:58 UTC+8

- 用户已明确要求开始执行 companion plan。
- 按 `using-git-worktrees` 流程创建隔离工作区：`.worktrees/202605111312-homepage-cloudflare-worker-001`。
- 采用显式 worktree base：`dev @ 0982f8500e61d6661b55caabbfee7a1f15eca649`，理由是当前工作在非 trunk 的 `dev` 分支上，且应保留该开发上下文。
- 生命周期状态切换为 `active`，当前进入 Phase 3 实施。

## Plan Record: 2026-05-11 21:33:27 UTC+8

- `homepage/` 子项目、Cloudflare Worker、Wrangler 配置、部署文档、GitHub Actions workflow 与仓库级 workflow 测试均已完成。
- 已完成 route-utils 与 workflow contract 两段 TDD 红绿循环。
- 完成 homepage typecheck、homepage tests、homepage build、Wrangler dry-run、`npm run verify` 与 `git diff --check`。
- 当前状态切换为 `waiting_review`，等待用户选择如何处理当前 worktree 分支。

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 无 | 1 | 无需处理 |

## Notes

- 执行阶段必须重新检查工作区状态，避免触碰现有 cloud-dev 未提交改动。
- 使用中文维护规划文件；代码、UI 文案、文档内容执行时保持英文。
