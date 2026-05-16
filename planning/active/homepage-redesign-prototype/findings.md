# Findings & Decisions

## Requirements

- 用户要求结合项目现有 `DESIGN.md` 重新设计项目 homepage。
- 当前阶段不要直接开发部署，先输出一个本地打开的 prototype。
- 任务需遵循 impeccable 的 setup gates 和 shape 流程。
- 用户已同意启用 visual companion，可在需要视觉比较时使用本地 URL。

## Research Findings

- impeccable loader 明确返回当前仓库 `hasProduct: false`、`hasDesign: true`；按 skill 规则，必须先补 `PRODUCT.md` 才能继续后续设计/实现。
- 当前 `homepage/` 是独立 Vite + React 子项目，有本地 `dev` / `preview` / `build` / `typecheck` / `test` 脚本。
- 当前 homepage 由 `homepage/src/App.tsx` 和 `homepage/src/styles.css` 直接控制，结构集中，适合做一次完整但局部的 redesign。
- 现有 homepage 采用 BMW M 风格的近黑底、白色大写标题和工程感网格；如果只换 token 而不改 narrative 和 layout，会继续停留在旧方向。
- 根 `README.md` 和 `docs/architecture.md` 已足够支撑对产品 purpose、users、workflow lanes 和品牌气质做首轮假设。

## Findings Record: 2026-05-11 22:21:10 UTC+8

- surface in focus 是项目 homepage，因此默认 register 应按 brand 处理，而不是 product UI。
- `DESIGN.md` 当前内容更接近 Claude 式暖米色 editorial system，这与现有 BMW M homepage 呈明显冲突；本次 redesign 应优先向项目级 design context 靠拢，而不是继续延展 BMW M 风格。
- 由于缺少 `PRODUCT.md`，还不能进入 mutation；需要先通过 teach 流程完成最小战略上下文，并向用户确认关键判断。
- visual companion 已获得授权，但当前阻塞点是战略问题，不是视觉选择，因此应先在终端中完成 teach / shape 问答。
- 用户已确认 repo 默认 register 保持 `product`，但本次 homepage surface 使用 `brand` override。
- homepage prototype 的首要任务是尽快解释“这是什么，为什么要用”，并把主 CTA 指向 GitHub repository。
- 允许对当前 homepage 信息架构彻底重写，只保留核心内容，不要求沿用现有 BMW M 结构。
- 无障碍约束按默认策略处理：WCAG AA、支持 reduced motion、避免仅靠颜色编码关键信息。

## Findings Record: 2026-05-11 22:38:53 UTC+8

- 根 `PRODUCT.md` 已补齐，默认 register 为 `product`，后续本次 task 在 shape / craft 中按 homepage surface override 到 `brand`。
- 现在 project-level `DESIGN.md` 与 `PRODUCT.md` 已同时存在，后续 redesign 可以合法进入 mutation。
- impeccable loader 已接受新的 `PRODUCT.md`，说明 setup blocker 已解除，不需要再回到 teach 流程。

## Findings Record: 2026-05-11 22:47:09 UTC+8

- 新 homepage 的核心变化不是简单换色，而是把信息结构从“黑底 feature showcase”改成“先解释 operating model，再引向源码”的 editorial narrative。
- 在 dev-tool / documentation 品类里，不使用图片仍然成立，但必须用 dark system panels 和更强的 typographic hierarchy 来承担视觉重心，否则页面会重新退回模板感。
- 当前 prototype 不依赖动态 GitHub 数据，已经足以验证 narrative、tone 和 layout；后续若继续迭代，更自然的下一步是加入更具体的 repo proof，而不是回退到泛 feature cards。

## Findings Record: 2026-05-11 22:49:40 UTC+8

- 当前页面最需要的不是更多 section，而是更短、更有推进感的 copy；收紧 hero 和 manifesto 后，整页的叙事重心更清楚。
- `proof` 段把“证据在仓库里”直接说出来，比之前“point you toward the real system”更少绕弯，也更符合项目气质。

## Findings Record: 2026-05-11 22:54:11 UTC+8

- 用户截图反馈的根因是上一版中段采用大 serif 标题和左右错位 layout，导致视觉重心不友好，且不像克制工具站。
- Airbnb design context 更适合本次修正：白底、Rausch 单强调色、Cereal/Circular sans、小而清晰的导航、pill search-card、柔和圆角和更友好的信息密度。
- 全面重构后，页面更像轻量产品介绍入口，而不是 manifesto 或 fake dashboard；这更符合用户要求的“简约、精炼、克制、友好”。

## Findings Record: 2026-05-11 23:12:13 UTC+8

- 本轮最关键的根因不是单个 spacing 或配色错误，而是文件层面出现了新旧版本拼接，导致页面同时携带 editorial 与 Airbnb 两套结构信号；这会让任何局部修补都继续显得“不对劲”。
- 更像 Airbnb 的首页，不只是白底和红色按钮，而是浏览型结构：轻顶栏、单一主命题、pill search card、低密度分类条、圆角卡片和友好的收尾区块。
- 对这个仓库来说，最合适的落点不是模仿 Airbnb 的旅行内容，而是借用它的浏览节奏，把项目能力映射成可扫读的 paths、categories 和 source links。
- 重新从空文件状态构建单一实现后，页面气质明显更统一，也更接近用户要求的“简约、精炼、克制、友好”。

## Findings Record: 2026-05-12 00:xx UTC+8

- 真正影响观感的不是单个按钮或颜色，而是中等宽度下的版式断点。如果在 855px 左右过早塌成单列，首页会立即变成长表单，Airbnb 那种轻、准、友好的浏览节奏就会消失。
- 对这个项目来说，比抽象彩色卡片更有效的“Airbnb 化”方式，是把真实产物直接带进首屏：task files、status、agent surfaces。这比空泛 hero 文案更像一个可用产品。
- 4173 共享页一度显示旧截图，但新端口 4174 与 cache-busting URL 证明当前代码渲染已更新；问题来自预览/共享缓存，而不是本次代码没有生效。

## Findings Record: 2026-05-12 00:xx UTC+8

- 首页必须同时解释两个层次：Superpowers 的价值是临时深度推理，Planning with Files 的价值是持久任务状态；只讲 durable files 会弱化深度任务优势。
- 组合优势应被明确命名为 `reason → record → resume`：先用 Superpowers 在复杂阶段提高判断质量，再把结论同步回 planning files，最后由任意本地 agent surface 继续执行。
- 与单一 agent service 相比，组合模型的差异不在“更会聊天”，而在 repo-native、visible、portable、recoverable。这个点需要出现在首屏，不应藏在后续卡片里。

## Findings Record: 2026-05-12 10:36:40 UTC+8

- 当前方向已经成立，后续打磨重点不是增加内容，而是减少重复解释。`Think -> Record -> Resume` 比 `reasoning + memory + portability` 的抽象表述更适合 agent/human 共同扫读。
- 首屏里最有效的对比不是长论证，而是短判断：`State is hidden`、`Depth is temporary`、`Depth becomes state`。这能更快解释组合为什么优于单一服务或单独 Superpowers。
- 视觉上，标题、search pill、comparison cards 和 proof card 的尺寸都需要克制，否则即使文案变短，页面仍会显得重。压缩 padding 与字号后，855px 宽度下的节奏更接近用户要求。

## Findings Record: 2026-05-12 13:15:18 UTC+8

- 这次 redesign 的最后一公里不是视觉问题，而是分支范围控制问题。直接 merge `dev` 会把无关的 `DESIGN.md` 提交一起带进 `main`，因此不符合“只推进 homepage”这个目标。
- 对这类已在非 trunk 分支上叠加了其他工作的发布型任务，精确 cherry-pick homepage 相关提交比整分支 merge 更可靠，因为它能把生产入口和 unrelated design work 分离。
- 现在首页不再只是“本地 prototype 完成”，而是已经进入 `origin/main`，后续 homepage 改动可以直接复用现有 GitHub Actions 自动部署路径。

## Findings Record: 2026-05-13 07:50:42 UTC+8

- 最新这轮用户反馈的核心不是“再加内容”，而是让组合关系一眼可见，并让首屏在大视口下真正撑住一屏。于是 proof card 需要从纵向列举改成 `Breadth + Depth = Hybrid`，hero 也要从轻量介绍提升到能承担整屏视觉重心的尺寸。
- 在当前信息量已经很克制的前提下，解决“空”不该靠新增 section，而该靠重新分配垂直空间：让 hero 区承担主要高度，让 topbar 和 closing 收紧。
- 发布前的独立 code review 没有发现阻塞问题；留下的只是一项非功能性确认：最后一个 comparison card 的克制强调样式是否符合当前设计意图。由于这是用户明确选择的“更克制”方案，因此可视为已决设计，而不是待修 bug。
- 这次真正的发布阻塞不在代码，而在 Git 结构：`main` 已经被单独 worktree 占用，因此任何“在当前目录切到 main 再 cherry-pick”的做法都会失败。对这种仓库，正确路径是直接在拥有 `main` 的 worktree 中完成精确 cherry-pick 和 push。
- 最终以远端源码 marker 作为发布完成证据，比只看本地分支或 subagent 摘要更可靠；这次就避免了“命令摘要说已推送，但 `origin/main` 实际还是旧版”的误判。

## Findings Record: 2026-05-15 22:37:32 UTC+8

- 最稳的实现路径不是继续把所有 copy 硬编码在 `App.tsx` 里，而是抽出一个 plain `.mjs` 内容模块，让 Node 内置测试可以直接校验 hero claim、CTA、section order 和 proof copy。
- 由于当前测试栈是 `node --test src/*.test.mjs`，直接测试 `.tsx` 渲染不如做文本结构契约测试更省事，也更符合这个子项目现有习惯。
- 本轮 implementation 应先重建信息结构与样式系统，再考虑更细的视觉 polish；不然很容易又回到边修边漂的状态。

## Findings Record: 2026-05-16 12:08:51 UTC+8

- Task 1 的 code quality 问题集中在内容契约一致性，而不是视觉或行为层：`homepageSectionOrder` 用了 `repo-proof`，但导出内容对象用的是 `repoProof`，这迫使未来消费者做手动映射。
- 更稳的修复方式是把 section-order 标识直接统一成 `repoProof`，保留 `headingId: 'repo-proof-title'` 作为 DOM id，不把 kebab-case 混入内容 contract。
- GitHub/docs 出口当前在 `topbar.links`、`hero.actions`、`closing.links` 三处重复定义；把 canonical URL 收敛到单一常量后，测试应直接验证所有 user-facing exit paths 仍然对齐，而不只检查 hero。

## Findings Record: 2026-05-16 12:43:49 UTC+8

- 用户明确要求执行 implementation plan 时不要中途停下来汇报，除非真的被阻塞；本轮执行已按这个偏好直接连续完成。
- 对这个 homepage 子项目来说，最稳的测试策略是：内容契约用 plain `.mjs`，结构和样式用文本契约测试，路由行为继续沿用现有 `route-utils` 测试。
- `homepageSectionOrder` 必须成为页面 section 流的单一真相来源，否则内容契约和渲染顺序会慢慢漂掉。
- style contract 测试不能只看 token 和 class 名；还要锁住 reduced motion、单列 collapse 和移动端 topbar 行为，不然这类首页很容易在后续 polish 时悄悄回退。

## Technical Decisions

| Decision | Rationale |
|---|---|
| 新建 task `homepage-redesign-prototype` | 与既有部署任务分离，避免 planning 混写 |
| 当前 register 假设为 `brand` | homepage 是面向访客的 landing surface，设计本身就是交付物 |
| 先做 `PRODUCT.md`，再做 shape brief | 这是 impeccable 明确要求的 gating 顺序 |
| prototype 阶段只改 homepage 局部实现 | 用户明确要求先给本地 prototype，不触碰部署 |

## Open Questions

1. 用户是否接受把项目默认 register 记为 `brand`，还是希望 repo 整体仍按 `product` 记录、只对 homepage 单独 override？
2. 这个 homepage 更侧重“项目介绍/理念展示”，还是“快速引导安装与工作流理解”？
3. 是否保留现有 homepage 中的 workflow/operator-lanes 信息架构，还是允许彻底重写叙事顺序？
