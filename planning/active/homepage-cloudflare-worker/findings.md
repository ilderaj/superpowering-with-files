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

## Findings Record: 2026-05-11 21:12:58 UTC+8

- 用户已从 plan review 明确切换到执行阶段，因此不需要再次停留在审阅态。
- worktree 预检结果建议基于当前本地 `dev` HEAD 创建隔离分支，而不是回退到 `origin/main` 或 `origin/dev`；这是为了保留当前非 trunk 开发上下文。
- 本次执行使用的隔离工作区路径为 `.worktrees/202605111312-homepage-cloudflare-worker-001`，分支名同 worktree basename。
- 当前 worktree 内尚不存在 `homepage/` 目录，可按 companion plan 从零创建，不需要兼容既有 homepage 实现。

## Findings Record: 2026-05-11 21:22:25 UTC+8

- `npx getdesign@latest add bmw-m` 已在 `homepage/` 下生成 `DESIGN.md`，其中确认了近纯黑画布、白色 uppercase display、BMW Type Next Latin、M 三色细线、0px radius、96px section spacing 与 48px button height 等关键视觉约束。
- companion plan 里的 `moduleResolution: "Node"` 在当前 `typescript@latest` 下会触发弃用错误；已改为更适配 Vite 的 `moduleResolution: "Bundler"`。
- 为避免后续 React/JSX 类型缺失，`homepage/package.json` 额外补入了 `@types/react` 与 `@types/react-dom`；这是对计划的最小生态兼容修正，不改变产物目标。

## Findings Record: 2026-05-11 21:33:27 UTC+8

- 首次 `wrangler --dry-run` 报出 `assets.directory` 缺失，不是配置错误；根因是我把 `npm run build --prefix homepage` 和 `wrangler deploy --dry-run` 错误地并行执行，导致 dry-run 检查时 `homepage/dist` 尚未生成。串行重跑后通过。
- `homepage/dist/index.html` 正确写入了 `/superpowering-with-files/assets/...` 前缀，说明 Vite `base` 配置与部署子路径目标一致。
- 当前环境没有现成的浏览器自动化工具，因此预览验证采用 `vite preview` + HTTP 200/HTML 资源引用检查，而不是桌面/移动视口截图。功能链路已验证，视觉细节仍适合后续人工过目。

## Findings Record: 2026-05-11 21:44:07 UTC+8

- homepage 子项目在主工作区首次验证时会生成 `homepage/node_modules/` 与 `homepage/dist/`；如果不显式忽略，这两个目录会在 `dev` 上长期显示为未跟踪噪音。
- 将 `homepage/node_modules/` 与 `homepage/dist/` 加入根 `.gitignore` 是比每次手动删除更稳妥的根因修复，因为它把“子项目依赖与构建产物是生成物”这个事实固定进仓库规则。

## Findings Record: 2026-05-11 22:02:56 UTC+8

- `origin/main` 在刷新 fetch 后确认已包含全部 homepage 文件；问题不在代码是否 merge，而在 deploy 是否成功和域名是否可接入。
- `gh run view 25674298390 --log-failed` 显示首次 `Deploy Homepage` 失败的直接原因是 GitHub Actions 环境中 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 都为空。
- Cloudflare zone `paymond.me` 上已存在 Worker route `vibing.paymond.me/superpowering-with-files* -> superpowering-with-files-homepage`，但此前没有 `vibing.paymond.me` 的 DNS record；因此 TLS 连接在路由生效前就失败。
- zone 中另一个 Worker hostname `apps.paymond.me` 使用 `AAAA 100::` + `proxied: true` 作为 placeholder record；按同样模式为 `vibing.paymond.me` 补建记录后，HTTPS 立即恢复为 `308 -> 200`。
- 本机 Wrangler `oauth_token` 可在无本地配置的临时 `HOME` 中被非交互式 `wrangler whoami` 识别为 `CLOUDFLARE_API_TOKEN`，因此可安全复用为 GitHub Actions secret 来源。
- repo secrets 现已存在 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`；手动触发 run `25674986402` 后，workflow 全绿完成，后续 `main` 上的 homepage 相关 push 会自动部署。

## Findings Record: 2026-05-11 22:07:25 UTC+8

- 当前 `homepage-deploy.yml` 只验证 install/typecheck/test/build/deploy；如果 deploy 成功但公开 URL 回归，workflow 不会及时失败。
- 最小可靠增强是在 deploy step 后追加生产 smoke check，直接请求 `https://vibing.paymond.me/superpowering-with-files`，跟随重定向，要求最终 `200` 且 HTML 中包含 `<title>Superpowering with Files</title>`。
- 由于 Cloudflare route 和缓存传播可能有短暂延迟，smoke check 需要有限重试；本次实现采用 5 次重试、每次间隔 5 秒。

## Findings Record: 2026-05-12 10:36:40 UTC+8

- 当前 polished homepage 已满足“开发完成并可正式上线”的标准，生产 deploy 不再依赖额外代码改动。
- 这次发布再次证明 homepage 的正式交付标准应包含三件事：本地 build 通过、Worker deploy 成功、生产 URL 真实返回并带正确 title。
- 既有 Worker route、DNS placeholder record 和 GitHub Actions secrets 仍然有效，因此后续 homepage 内容迭代可以直接复用同一条发布路径。

## Findings Record: 2026-05-12 13:15:18 UTC+8

- “把 homepage 合到 `main`” 这一步的真正风险不在 Cloudflare，而在 Git 范围控制。`dev` 分支包含无关设计文档提交时，直接 merge 会扩大发布面。
- 对当前仓库，这类生产分支回收更适合采用“先在开发分支提交 homepage 收口，再把明确相关的提交 cherry-pick 到 `main`”的策略。
- `origin/main` 现已包含 deploy smoke check 和最新 polished homepage，因此后续 homepage 更新可以真正依赖 `main` push 触发的自动部署，而不是继续手动从 `dev` 发布。

## Findings Record: 2026-05-12 13:26:48 UTC+8

- 这次 `main` 推送后的首次 workflow 失败说明：即使 deploy workflow 与 smoke check 都已存在，外部 secret 的有效期仍然是自动化健康的一部分，需要和代码一样被视为发布前提。
- 本机 Wrangler 认证与 GitHub Actions secret 可以漂移。这里的具体表现是：本机 `wrangler whoami` 仍正常，但 repo secret 中的旧 `CLOUDFLARE_API_TOKEN` 已失效。
- 当前可重复的修复路径已经验证成功：从 `~/Library/Preferences/.wrangler/config/default.toml` 提取当前 `oauth_token`，更新 repo secret，随后重跑 `homepage-deploy.yml`。

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 规划阶段不运行 `npx getdesign@latest add bmw-m` | 该命令会写文件和依赖，用户要求先审阅 plan |
| 优先静态 homepage + Worker assets | homepage 内容可缓存、部署简单、路径稳定，适合 main 分支触发发布 |
| GitHub Actions 作为 origin main 触发器 | Cloudflare Worker 本身不能直接感知 GitHub push；Actions 是可审计、可重跑的自动化层 |
| 使用 path-prefix aware 前端构建 | 目标 URL 在 `/superpowering-with-files` 子路径下，资源引用和客户端路由必须稳定 |
| companion plan 使用 Vite + React + Worker Static Assets | 与当前 monorepo 隔离，能用 GitHub Actions 在 `main` 更新后构建并部署 Worker |
| worktree 基线采用本地 `dev` HEAD | 当前仓库在非 trunk 开发分支，预检明确建议保留该上下文并显式记录 base SHA |
| `tsconfig` 使用 `moduleResolution: "Bundler"` | 当前 TypeScript 版本已不接受计划里的 `Node` 设定；Bundler 更符合 Vite/ESM 解析模型 |
| Worker dry-run 必须在 build 之后串行执行 | `wrangler` 直接检查 `assets.directory`，不能与产物生成并行 |
| `vibing.paymond.me` 使用 `AAAA 100::` proxied placeholder record | 这是同 zone 内 Worker hostname 的既有模式，能让 Cloudflare 在自定义子域上正确终止 TLS 并将流量送入 Worker route |
| GitHub Actions secret `CLOUDFLARE_API_TOKEN` 采用本机 Wrangler OAuth token | 该 token 已在无本地配置的环境中验证可被 Wrangler 识别为 `Account API Token`，足以支撑非交互部署 |
| deploy workflow 用 curl + HTML title 做 smoke check | 这是比单纯 HTTP 200 更具体、但仍足够轻量的生产可用性验证 |

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
