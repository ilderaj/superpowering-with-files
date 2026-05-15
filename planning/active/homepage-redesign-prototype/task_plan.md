# Task Plan: Homepage Redesign Prototype

## Goal
结合仓库现有 `DESIGN.md` 持续重构 `homepage/`，先完成本地可预览 prototype，再在用户确认后将最新 homepage 变更集成并发布到 `origin/main`。

## Current State
Status: active
Archive Eligible: no
Close Reason: 当前进入新一轮 homepage manifesto redesign 的 implementation planning。
Companion plan: `docs/superpowers/plans/2026-05-15-homepage-redesign-prototype.md`
Companion summary: 四步实现计划，覆盖内容契约、`App.tsx` 五段结构重建、dark manifesto 样式系统替换和最终验证。
Sync-back status: companion plan 已写入；execution 尚未开始；active task 目录继续作为本次 redesign 的 source of truth。

## Current Phase
Implementation planning complete

## Phases

### Phase 1: Context & Design Setup
- [x] 读取 impeccable、brainstorming、planning-with-files 相关技能与引用规则。
- [x] 加载当前项目 design context，确认 homepage 现有实现边界。
- [x] 确认默认 register 为 repo `product` + homepage override `brand`。
- [x] 输出待确认的 `PRODUCT.md` 战略摘要并写入文件。
- **Status:** complete

### Phase 2: Shape Brief
- [x] 完成本次 homepage redesign 的 task-scoped shape 访谈。
- [x] 输出 design brief 并等待用户确认。
- [x] 明确 prototype 范围、内容优先级和视觉方向。
- **Status:** complete

### Phase 3: Local Prototype Build
- [x] 基于确认后的 brief 更新 `homepage/` 实现。
- [x] 保持仅本地 prototype 范围，不修改 deploy/workflow 逻辑。
- [x] 让 prototype 可通过本地 dev/preview 打开。
- **Status:** complete

### Phase 4: Validation & Handoff
- [x] 运行针对 homepage 的最小验证：typecheck/test/build/preview。
- [x] 本地打开并给用户说明预览入口。
- [x] 回写 planning 结论与剩余风险。
- **Status:** complete

### Phase 5: Final Polish & Main Integration
- [x] 根据最新用户反馈继续压缩信息结构并调整首屏密度。
- [x] 运行发布前验证与独立 code review。
- [x] 将最新 homepage 变更提交并集成到 `origin/main`。
- **Status:** complete

## Risks

| 风险 | 触发条件 | 影响范围 | 缓解 |
|---|---|---|---|
| 直接沿用当前 BMW M 结构 | 只换配色或 copy，不重做信息结构 | 结果仍像旧版模板而不是新 homepage | 先做 shape brief，明确布局和 narrative 重写 |
| 跳过 impeccable 前置门槛 | 缺少 `PRODUCT.md` 仍直接设计 | 后续设计上下文不稳定，违反任务流程 | 先补 `PRODUCT.md`，再继续 shape |
| 误触部署相关文件 | 编辑 workflow 或 wrangler | 混入无关改动 | 本任务限定只改 `homepage/` 和必要上下文文件 |

## Decisions Made

| Decision | Rationale |
|---|---|
| 本任务独立于 `homepage-cloudflare-worker` | 这次目标是 redesign prototype，不是部署链路 |
| 现有 homepage 入口以 `homepage/src/App.tsx` + `homepage/src/styles.css` 为主 | 当前渲染路径局部且清晰，适合做最小改造 |
| 当前 surface 默认按 brand register 处理 | 用户要 redesign 项目的 homepage，本质是 marketing/landing surface |

## Plan Record: 2026-05-11 22:21:10 UTC+8

- 创建独立 tracked task：`planning/active/homepage-redesign-prototype/`。
- 已完成上下文加载：impeccable loader 返回 `hasProduct: false`、`hasDesign: true`，因此后续需先补 `PRODUCT.md`。
- 当前停留在设计 setup 阶段，待补齐 PRODUCT 前置条件并进行 shape 访谈。

## Plan Record: 2026-05-11 22:21:10 UTC+8

- 用户确认 repo 默认 register 采用 `product`，本次 homepage surface 单独按 `brand` 处理。
- homepage prototype 的首要目标是快速解释“这是什么，为什么要用”，首屏主 CTA 优先指向 GitHub repository。
- 用户允许对现有 homepage 信息架构做彻底重写，只保留核心内容。

## Plan Record: 2026-05-11 22:38:53 UTC+8

- 已根据用户确认内容新增根 `PRODUCT.md`，补齐 impeccable setup blocker。
- Phase 1 完成，任务进入 Phase 2 shape brief 编写与确认。
- 重新运行 impeccable loader 后确认 `hasProduct: true`、`productPath: PRODUCT.md`，当前上下文门槛已全部满足。

## Plan Record: 2026-05-11 22:47:09 UTC+8

- 用户已确认 shape brief，Phase 2 完成。
- 已在 `homepage/src/App.tsx` 与 `homepage/src/styles.css` 中完成本地 prototype redesign，将页面从 BMW M 风格黑底展示板改为暖色 editorial brand surface。
- 本地验证已通过：`npm run typecheck --prefix homepage`、`npm run build --prefix homepage`，并确认 `http://127.0.0.1:4173/superpowering-with-files/` 返回 `200` 且 title 正确。
- 任务当前可交付为本地 preview prototype；未触碰 deploy/workflow 文件。

## Plan Record: 2026-05-11 22:54:11 UTC+8

- 用户基于截图反馈上一版视觉问题，并要求切换为 Airbnb 风格：简约、精炼、克制、友好。
- 已执行 `npx getdesign@latest add airbnb`，生成 `airbnb/DESIGN.md` 并作为本轮 visual source of truth。
- 已全面重构 `homepage/src/App.tsx` 与 `homepage/src/styles.css`，从 editorial manifesto 改为白底、Rausch 单强调色、pill search-card、柔和圆角、低调字号的轻量产品介绍页。
- 验证通过：homepage typecheck、build、本地 preview 200 与 title check 均通过；仍未触碰 deploy/workflow 文件。

## Plan Record: 2026-05-11 23:12:13 UTC+8

- 在用户继续指出“共享页面一点也不 Airbnb”后，确认必须先解决文件被重复补丁污染的问题，不能继续在拼接文件上做局部修补。
- 已删除并从空状态重建 `homepage/src/App.tsx` 与 `homepage/src/styles.css`，保证当前首页只有一套实现。
- 最终页面采用更贴近 Airbnb 浏览首页的结构，但内容仍然严格服务于仓库本身：topbar、hero、pill search、category strip、path cards、proof links。
- 最终验证通过：typecheck、build、preview HTTP 200、HTML title、禁忌样式扫描、旧版残留扫描均通过。

## Plan Record: 2026-05-12 00:xx UTC+8

- 基于共享浏览器页的真实截图继续重构，而不是只依据源码主观判断。
- 已将首页从泛化中心对齐 hero 进一步改为产品化首屏：hero copy + task file preview + full-width search pill，并把中宽断点调整到更合理的范围。
- 当前认可的本地 prototype 以 `http://127.0.0.1:4174/superpowering-with-files/` 为准；该页面已经过 855px 宽视觉复核。

## Plan Record: 2026-05-12 00:xx UTC+8

- 用户指出页面没有体现 Superpowers 在深度任务中的优势，也没有说明 Superpowers 与 Planning with Files 组合后相比单一服务的优势。
- 已将首页叙事从“task files 可恢复”升级为 hybrid workflow：Superpowers 提供临时深度推理，Planning with Files 提供持久任务状态，Harness projection 让该状态跨本地 agent surfaces 可用。
- 已在首屏新增 comparison strip，直接比较 single agent service、Superpowers alone、Together，明确组合优势是把深度推理转成可见、可恢复、可迁移的 repo-native state。

## Plan Record: 2026-05-12 10:36:40 UTC+8

- 按用户要求沿当前方向继续 polish，重点为精炼、简洁、克制、清晰，并兼顾 human 与 agent 的扫读。
- 已将首屏表达压缩为 `Think -> Record -> Resume`，并把对比文案改为更短的判断句，避免同一价值主张在多个区块反复解释。
- 已降低 hero、proof card、search pill、comparison cards 的视觉密度，并通过 855px 浏览器截图复核当前页面更轻、更清楚。
- 验证通过：homepage typecheck、build、禁忌样式扫描、copy 双连字符扫描均通过。

## Plan Record: 2026-05-12 13:15:18 UTC+8

- 用户选择将当前 homepage 正式推进到 `main`，目标是让后续 homepage 变更直接走 GitHub Actions 自动部署链路。

## Plan Record: 2026-05-13 07:50:42 UTC+8

- 用户继续基于最新设计做收尾，要求将首屏改成更明确的 `Planning with Files × Superpowers` 叙事，并修正“留白过多、没有撑起一屏”的问题。
- 当前 task 重新打开为 Phase 5：先完成这轮 density / copy / layout polish，再把最新 homepage 变更发布到 `origin/main`。
- 发布前验证范围明确为 homepage 子项目：`typecheck`、`test`、`build`、`git diff --check`，外加浏览器视口 spot-check 和独立 code review。
- 由于本地 `main` 被另一个 superpowers worktree 占用，最终采用该 `main` worktree 进行精确 cherry-pick，而不是在当前 `dev` 工作区直接切分支。
- 本轮最新 homepage polish 在 `origin/dev` 上的提交为 `18580da`（`feat: tighten homepage hybrid landing page`），在 `origin/main` 上对应的 cherry-pick 提交为 `c1ff5a5`。
- 已直接读取 `origin/main:homepage/src/App.tsx` 与 `origin/main:homepage/src/styles.css` 验证 marker，确认最新设计已真实进入远端 `main`。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| 无 | 1 | 无需处理 |
| `main` 分支被独立 worktree 占用，无法在当前工作区直接 `git switch main` | 1 | 改到 `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260504-upstream-refresh-layout-compat-main` 执行 cherry-pick 与 push |
