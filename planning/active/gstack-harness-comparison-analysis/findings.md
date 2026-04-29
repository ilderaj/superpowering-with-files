# gstack 与 Harness 对比发现

## 研究来源

- 本仓库文档与代码：已读取 `README.md`、`docs/architecture.md`、`docs/safety/architecture.md`、`package.json`、`harness/` 顶层结构。
- gstack 公开仓库：已读取 GitHub 元数据、README 页面、文件树、`package.json`、`setup` 前段、`ARCHITECTURE.md` 前段、`BROWSER.md`、`docs/skills.md`，并用 GitHub repo search 抽查 host config、skill generator、checkpoint/context、team mode、review/ship/qa 相关源码和测试片段。

## 发现

### 本仓库 Harness 基线

- 定位：本仓库是 local coding-agent workflow 的治理 harness，不是单一 agent runtime。核心目标是把一份共享政策投影为 Codex、GitHub Copilot、Cursor、Claude Code 的原生入口文件、skills 和可选 hooks。
- 核心模型：`planning-with-files` 是唯一 durable task-memory；`superpowers` 是可选、临时、只在 deep-reasoning 阶段使用的推理层。
- 任务状态：`planning/active/<task-id>/{task_plan.md,findings.md,progress.md}` 是 authoritative task state；archive 需要 lifecycle guard。
- 架构层次：`harness/core` 是政策、模板、schema 与 metadata 的源；`harness/adapters` 负责平台 manifest；`harness/installer` 负责 CLI、状态、安全写入与投影；`harness/upstream` vendor `superpowers` 与 `planning-with-files`。
- 投影能力：支持 rendered entry files、skill materialization/linking、hook config merge、hook script projection、Harness-owned manifest 跟踪、stale projection GC、冲突备份。
- 上下文治理：默认入口文件保持 thin profile；完整 tracked-task/deep-reasoning 规则留在 canonical policy source，避免每次会话过载。
- 安全 profile：opt-in，提供 path-boundary hooks、dangerous command gating、risk assessment gate、checkpoint/recovery artifacts、cloud-safe 扩展。
- 安装/维护命令：`./scripts/harness install`、`sync`、`doctor`、`verify`、`summary`、`worktree-preflight`、`worktree-name`、`adopt-global` 等。
- 默认包形态：Node ESM repo，测试脚本使用 `node --test`，没有看到独立 runtime server 或外部服务依赖。

### 初步对比假设

- 本仓库 Harness 的主要优势可能在跨 IDE governance、任务记忆约束、安全 hooks 和投影健康检查。
- gstack 的潜在优势需要重点看：是否提供更一体化 CLI、实际 agent orchestration、provider/model 管理、应用生成/执行能力、快速上手体验或更清晰的 end-user product surface。

### gstack README 与仓库元数据层发现

- 定位：gstack 自称 “Garry Tan's exact Claude Code setup”，把 Claude Code 变成一个 virtual engineering team。它的产品表达是 CEO、Designer、Eng Manager、Release Manager、Doc Engineer、QA 等 23 个 opinionated tools，而不是中性治理框架。
- 规模与活跃度：GitHub 元数据显示 MIT、默认分支 `main`、约 86.4k stars、12.6k forks，最近 push 在 2026-04-29，README 页显示大量近期 PR/commit。
- 核心 workflow：强调 `Think → Plan → Build → Review → Test → Ship → Reflect` 的 sprint 流程。代表技能包括 `/office-hours`、`/plan-ceo-review`、`/plan-eng-review`、`/plan-design-review`、`/review`、`/qa`、`/ship`、`/retro`、`/autoplan`。
- 安装体验：README 主路径是面向 Claude Code 的 30 秒安装，直接 clone 到 `~/.claude/skills/gstack` 并运行 `./setup`；团队模式通过 `./setup --team` 和 `gstack-team-init required|optional` 加入 repo 级自动更新约束。
- 多 host 支持：README 声称支持 10 个 AI coding agents，不只 Claude，包括 Codex CLI、OpenCode、Cursor、Factory Droid、Slate、Kiro、Hermes、GBrain 等；通过 `./setup --host <name>` 定向安装。
- 浏览器能力：`/browse`、`/open-gstack-browser`、`/qa`、`/pair-agent` 提供真实 Chromium、截图、点击、cookie import、sidebar agent、anti-bot stealth、跨 agent 共享浏览器等能力。
- 安全能力：`/careful` 警告危险命令，`/freeze` 限制编辑目录，`/guard` 组合两者；浏览器/sidecar 侧还有 prompt injection defense、CDP allowlist、domain skill quarantine/promote 等机制。
- 记忆与恢复：continuous checkpoint mode 可用 WIP commits 保存 `[gstack-context]`，`/context-restore` 从提交恢复；`/learn` 管理项目级 learnings；GBrain 集成提供可选持久知识库。
- 质量与发布：`/review` 自动修复明显问题，`/qa` 用真实浏览器测试并生成 regression tests，`/ship` 同步主线、运行测试、打开 PR，`/land-and-deploy` 合并并验证生产健康。
- 差异初判：gstack 更接近 end-to-end product/engineering operating system；本 Harness 更接近 cross-agent governance/projection substrate。

### gstack 源码与架构层发现

- 技术栈：`package.json` 显示 gstack 是 Bun/TypeScript 项目，`version` 为 `1.20.0.0`。依赖包括 Playwright、Puppeteer Core、ngrok、HuggingFace transformers、Anthropic SDK、xterm 等；构建会产出 `browse/dist/browse`、`design/dist/design`、`make-pdf/dist/pdf`、`bin/gstack-global-discover` 等编译二进制。
- 浏览器 runtime：`ARCHITECTURE.md` 明确核心思想是 “persistent browser + opinionated workflow skills”。CLI 读 `.gstack/browse.json`，通过 localhost HTTP 与 Bun daemon 通信，daemon 驱动 Chromium；首次启动约 3 秒，后续命令约 100-200ms。
- Browser command surface：`BROWSER.md` 显示约 70+ commands，覆盖 reading、inspection、navigation、interaction、style cleanup、visual、cookies/headers、tabs/frames、snapshot、server lifecycle、handoff、batch、browser-skills、domain-skills、CDP 等。
- 元素定位模型：gstack 用 Playwright accessibility tree 生成 `@e` refs，用 cursor-interactive 生成 `@c` refs；不注入 DOM attribute，降低 CSP、hydration、Shadow DOM 问题。
- Browser-skill runtime：支持三层存储 project/global/bundled，`$B skill list/show/run/test/rm`，每个 browser-skill 自带 `script.ts`、fixtures、parser tests 和 vendored `_lib/browse-client.ts`。这是“浏览一次 → codify → 下次 200ms deterministic run”的 compounding layer。
- `/scrape` + `/skillify`：`BROWSER.md` 描述 `/scrape <intent>` 先匹配已有 browser-skill，没有命中再 prototype；`/skillify` 将最近成功 scrape 原型沉淀为 deterministic browser-skill，具备 provenance guard、input slice、atomic staging/test/rename。
- Domain-skills：每 hostname 保存 agent-authored note，生命周期 quarantined → active → global；和 browser-skills 不同，前者是站点知识，后者是确定性脚本。
- Pair-agent：通过 ngrok 远程共享本地浏览器。安全上采用 local listener + tunnel listener 双监听器，tunnel 只暴露 `/connect`、allowlisted `/command`、`/sidebar-chat`，root token 不能走 tunnel，scoped token 有 tab ownership、rate limiting、denial log。
- Prompt injection 防线：L1-L3 datamarking/hidden strip/URL blocklist/envelope，L4 本地 TestSavantAI ONNX classifier，L4b Haiku transcript classifier，L5 canary token，L6 ensemble combiner；有 `GSTACK_SECURITY_OFF` 和 DeBERTa ensemble opt-in。
- setup 行为：`setup` 依赖 Bun，默认 host 是 Claude，支持 `--host claude|codex|kiro|factory|opencode|auto`，README 还描述 OpenClaw/Hermes/GBrain 等通过生成 artifacts 或 mod 方式集成。脚本会保存 skill prefix 偏好，检测已安装 host，按需 build browse binary，并在 macOS arm64 对 Bun compiled binary 做 ad-hoc codesign。
- Host config 系统：源码 search 显示 `hosts/*.ts` typed config 是多 host 的中心，包括 Claude、Codex、Factory、Kiro、OpenCode、Slate、Cursor、OpenClaw、Hermes、GBrain。`HostConfig` 描述 CLI detection、global/local roots、frontmatter transform、path/tool rewrites、runtime symlink manifest、adapter、learnings mode 等。
- Skill docs generator：`scripts/gen-skill-docs.ts` 从 `SKILL.md.tmpl` 生成 host-specific `SKILL.md`，支持 `--host all`、`--dry-run`、frontmatter transform、path/tool rewrites、Codex `openai.yaml` metadata、token budget output、freshness checks。
- 测试覆盖：仓库有大量 Bun tests，包括 browser command tests、security tests、dual-listener tests、CDP tests、browser-skill tests、host config tests、skill generation dry-run/e2e/evals、team mode tests、context-save/restore e2e 等。
- Context 模型：除了 README 的 continuous checkpoint mode，源码 search 还显示 `/context-save` 写 `~/.gstack/projects/$SLUG/checkpoints/*.md`，`/context-restore` 可跨 branch/Conductor workspace 恢复；continuous checkpoint 用 `WIP:` commit + `[gstack-context]` 块保存 Decisions/Remaining/Tried/Skill。
- Memory 模型：`/learn` 写 `~/.gstack/projects/$SLUG/learnings.jsonl`，可搜索/剪枝/导出；GBrain 集成提供可选持久知识库、MCP 注册、per-remote trust policy；gstack brain sync 还可把 allowlisted artifacts 同步到私有 git repo，并有 secret scanner。
- Team mode：README 描述 `gstack-team-init required|optional`，目标是 repo-level 自动更新和团队一致性，避免 vendored files/version drift；启动时做 throttled auto-update check。
- Product surface：gstack 把技能组织成“软件团队”而不是“规则集合”：planning/review/design/QA/release/security/memory/browser 都有清晰角色和 slash command 入口。

## 对比结论

### 一句话判断

gstack 是“面向 Claude Code 起家的 AI 软件工厂”：它把端到端产品构思、计划审查、浏览器 QA、设计生成、发布、复盘、跨模型复审和记忆沉淀都产品化成 slash-command skills，并配了真实 browser runtime。  
本仓库 Harness 是“跨 IDE/agent 的治理与投影底座”：它把统一政策、技能来源、hook 能力、任务记忆、安全 profile、安装状态和健康检查稳定地投影到多个 agent 环境。

二者不是同一层。gstack 更靠近“用户每天怎么交付软件”；本 Harness 更靠近“多 agent 环境里规则怎么可信、可恢复、可验证地存在”。

### 范围对照

| 维度 | gstack | 本 Harness | 判断 |
| --- | --- | --- | --- |
| 核心定位 | Opinionated software factory / virtual engineering team | Governance harness / policy projection substrate | gstack 产品感更强；本 Harness 治理边界更清晰。 |
| 首要 host | Claude Code | Codex、GitHub Copilot、Cursor、Claude Code 平级 | gstack Claude-first；本 Harness cross-IDE-first。 |
| 安装路径 | 30 秒 clone 到 `~/.claude/skills/gstack`，再 `./setup` | `./scripts/harness install/sync/doctor`，支持 workspace/user-global/both、targets/profile/projection/hooks | gstack 上手更快；本 Harness 状态管理、冲突处理更严谨。 |
| 技能形态 | 大量 domain workflow skills，slash commands 是产品入口 | 投影 upstream skills + policy skills，重点是规则和流程约束 | gstack 的技能即产品；本 Harness 的技能更多是治理工具。 |
| 浏览器能力 | 自研 compiled CLI + persistent Chromium daemon + sidebar + pair-agent | 无浏览器 runtime；依赖外部 agent/IDE 工具能力 | gstack 在实际 QA、视觉验证、网页自动化上明显领先。 |
| 任务记忆 | `~/.gstack/projects` artifacts、context-save/restore、WIP commit checkpoint、learn/GBrain | `planning/active/<task-id>` authoritative files + lifecycle + hooks summary | 本 Harness durable task state 更规范；gstack memory 更贴近日常工作流和跨 session UX。 |
| 安全模型 | `/careful`、`/freeze`、`/guard`、browser prompt-injection stack、tunnel scoped tokens | opt-in safety profile、path-boundary hooks、risk assessment、checkpoints、protected cwd/path deny | gstack browser security 很强；本 Harness destructive ops/governance 更系统。 |
| 多 host 支持 | typed host configs + generated skills，README 声称 10 hosts | adapter manifests + native entry/skill/hook roots，官方 doc-backed support matrix | 两者都在演进；gstack 的 host generator 更产品化，本 Harness 的 adapter governance 更保守可信。 |
| 发布/交付 | `/ship`、`/land-and-deploy`、`/canary`、test bootstrap、coverage audit、PR body | 无 end-to-end release skill；有 verify/doctor/sync 和 repo 自测 | gstack 在“把分支交出去”上领先。 |
| 设计/前端 | design consultation、shotgun、HTML/Pretext、visual review | 规则层有 frontend guidance，但没有专用 runtime 或 skill pipeline | gstack 在设计闭环和视觉资产工作流上领先。 |
| 可观测性 | local analytics、telemetry opt-in、activity stream、security dashboards、retros | health checks、verification reports、context budgets、summary | gstack 更偏使用数据/工作流观测；本 Harness 更偏安装和策略健康。 |
| 文档表达 | 强叙事、强角色、强 demo，README 即产品说明 | 架构/治理/兼容性/安全文档更工程化 | gstack 更容易传播；本 Harness 更容易审计。 |

### gstack 相对本 Harness 的主要优势

1. **端到端 workflow 产品化**  
	gstack 不是告诉 agent “要怎么做”，而是把怎么做变成 `/office-hours → /autoplan → /review → /qa → /ship → /retro` 的可执行路线。它把角色、顺序、输入输出和 artifacts 都串起来，本 Harness 目前更像规则底座，缺少同等清晰的“交付跑道”。

2. **真实浏览器是巨大能力差**  
	gstack 的 persistent Chromium daemon、ref-based snapshot、console/network/dialog capture、screenshots、responsive、cookie import、handoff、headed browser、side panel、pair-agent、browser-skills runtime，直接解决 coding agent “没有眼睛”的问题。本 Harness 当前没有这一层，因此在 QA、设计验证、网页登录态、视觉回归、网页数据提取上不具备同等闭环。

3. **技能目录像产品菜单**  
	gstack 的 slash commands 命名清晰、场景明确，用户不用理解 harness internals。`/qa`、`/ship`、`/review`、`/design-shotgun`、`/careful` 的 mental model 很直接。相比之下，本 Harness 的核心概念如 profile、projection、adapter、planning lifecycle、companion plan，对最终用户更抽象。

4. **host config generator 值得抄**  
	gstack 把 host 支持收敛成 typed `HostConfig`，描述 roots、frontmatter、rewrites、runtime assets、metadata、adapter。新增 host 是“加一个 config 文件 + 注册”，生成器、setup、tests、docs 共享这一配置。本 Harness 已有 adapters，但可以借鉴 gstack 的 typed host config 与 generated skill docs freshness checks，让跨 IDE 支持更可扩展、更少手写分支。

5. **技能文档自动生成与 freshness gate**  
	`SKILL.md.tmpl` + resolver + generated sections 解决了命令参考漂移问题。尤其 browser command reference、preamble、base branch detect、QA/design methodology 等由源码/metadata 填充。本 Harness 的 projection patch 与 rendered entry 已经类似，但 skill docs 的 template+resolver freshness 可以更系统。

6. **“学习会复利”的 UX 更完整**  
	`/learn`、taste memory、domain-skills、browser-skills、context-save/restore、GBrain、private repo sync，把学习分成多种粒度：项目偏好、站点知识、确定性浏览流程、工作上下文、长期知识库。本 Harness 有 planning memory，但用户感知的“越用越懂我/懂项目”的入口较弱。

7. **多 agent 协作不是只投影规则，而是共享工作面**  
	gstack 的 `/pair-agent` 用浏览器作为 shared substrate，让 Codex/OpenClaw/Hermes 等远程 agent 驱动同一个本地浏览器，并用 scoped token、tab ownership、activity attribution 限制权限。这比仅把同一套 instructions 投影到多个 IDE 更进一步。

8. **发布最后一公里强**  
	`/ship`、`/land-and-deploy`、`/canary` 覆盖测试、coverage audit、PR、CI、部署和生产验证。这让 agent 工作从“代码改完”延伸到“可安全交付”。本 Harness 目前更多要求 verify，但没有 packaged release engineer workflow。

9. **传播/采用优势明显**  
	README 用 founder/CEO/team narrative 包装能力，快速安装命令很短，star/fork 规模巨大。它让用户先看到价值，再理解架构。本 Harness 更像工程治理项目，可信但入口不够有情境。

10. **测试/eval 覆盖了 agent 行为**  
	gstack 不只测库函数，还测 skill routing、host generation、Claude/Codex/Gemini e2e/evals、context skills、browser security 等。这对“prompt/skill 是否真的工作”很关键。本 Harness 有 verify/doctor 和单元测试，但可增加 agent-skill 行为 eval。

### 本 Harness 相对 gstack 的优势

1. **治理边界更严**  
	本 Harness 明确 `planning-with-files` 是唯一 durable task-memory，明确 docs 不是 active task state，明确 lifecycle/archive guard，明确 superpowers companion plan sync-back。gstack 的 memory/artifacts 更丰富，但权威状态源更分散。

2. **跨 IDE 原生入口更保守可信**  
	本 Harness 对 Codex、GitHub Copilot、Cursor、Claude Code 的 entry files、skill roots、hook roots、adapter contracts 做了官方 doc-backed 区分，unsupported target 显式失败。gstack 多 host 更广，但 README/源码显示 Claude-first，部分 host 属于生成 artifacts 或外部 host 适配，语义不一定等价。

3. **冲突与 ownership 处理更成熟**  
	本 Harness 有 `.harness/projections.json`、Harness-owned path tracking、conflict backup、safe writes、stale projection GC、hook config merge。gstack 的 install 体验更快，但更偏直接在 skill roots 建 symlink/生成文件。

4. **安全 profile 的操作治理更系统**  
	gstack `/careful` 是 session-scoped accident prevention，`/freeze` 也承认 Bash 可绕过。本 Harness safety profile 明确 protected cwd/path、dangerous command gating、risk assessment、checkpoint recovery artifact、cloud-safe profile，更接近可审计治理。

5. **上下文预算是一等约束**  
	本 Harness 有 thin rendered entry、context budget health、summary-first hook、profile rendering。gstack 也有 slim preamble 和 token budget输出，但大量技能本身很重，本 Harness 对 startup payload 的治理更明确。

6. **更适合成为组织级底座**  
	本 Harness 的目标是把规则稳定投影到多 agent/IDE，而不是要求团队接受一整套特定 workflow。对于已有内部流程、合规要求或多个 agent 平台并存的团队，本 Harness 可作为上层治理。

### 可抄作业方向

| 优先级 | 方向 | 从 gstack 学什么 | 对本 Harness 的可能落点 |
| --- | --- | --- | --- |
| P0 | 产品化 workflow lanes | 把能力组织成用户能直接跑的角色/阶段，而不是只暴露规则 | 新增 `docs/roadmap` 或 skills profile：plan/review/qa/ship lanes；先文档化，不急着代码实现。 |
| P0 | typed host config | host roots/frontmatter/rewrites/assets/metadata 统一建模 | 收敛 `harness/adapters` metadata，减少平台分支散落；增加 adapter freshness tests。 |
| P0 | skill template generation | `SKILL.md.tmpl` + resolver + dry-run freshness | 为 Harness patch/projection 的 skill 文档建立 template resolver 和 drift gate。 |
| P1 | review/ship/readiness dashboard | 记录哪些 review gate 已跑、哪些缺失 | 在 planning files 或 `harness summary` 中增加 Review Readiness/Verification Readiness 区块。 |
| P1 | context-save/restore UX | 用户可显式保存/恢复上下文，跨 branch/worktree 可查 | 在 `planning-with-files` 周边增加 `context-save`/`summary` 友好命令，不替代 authoritative planning。 |
| P1 | continuous checkpoint 变体 | WIP commit `[context]` 的崩溃恢复能力 | 谨慎设计为 opt-in safety mode；必须兼容本 Harness checkpoint artifact 与 no surprise commits 原则。 |
| P1 | browser runtime integration | 真实 browser QA/visual verification 是 agent 质变能力 | 不宜直接内置全套；先研究是否集成 gstack/browser-use/Playwright MCP，或定义 Harness browser adapter contract。 |
| P1 | proactive skill suggestion | 根据任务阶段建议 skill | 以 summary/hook 提示为主，不强制；避免 context 噪音。 |
| P2 | learn/domain-skill/browser-skill 分层记忆 | 偏好、站点知识、确定性流程分开存 | 设计 Harness memory taxonomy，和 `planning/active` 的任务记忆保持边界。 |
| P2 | telemetry/local analytics | opt-in usage/success/failure 反馈 | 增加本地-only analytics 先行；远程 telemetry 需要明确隐私策略。 |
| P2 | team mode auto-update | repo 要求/建议团队安装某套 agent workflow | 可设计 `harness team-init required|optional`，但要保留 conflict/ownership 保护。 |

### 不宜直接照搬的部分

- 不宜把 gstack 的所有 workflow skills 直接塞进本 Harness。它们很 opinionated，会改变本 Harness 的中性治理定位。
- 不宜默认启用 continuous WIP commits。本 Harness 当前对用户工作树保守，自动 commit 会改变用户预期；只能 opt-in，并且必须有 clear rollback/cleanup。
- 不宜把 `~/.claude/skills/gstack` 式单 host 安装作为默认。本 Harness 应继续坚持 workspace/user-global/both、target/profile/projection 的可审计安装模型。
- 不宜把 browser daemon 轻率内置进核心。gstack browser 安全面很大：tokens、tunnel、cookies、prompt injection、CDP、extension、side panel、ngrok。可以先做 adapter/research，而不是直接复制。
- 不宜弱化 `planning/active/<task-id>` authoritative state。gstack 的多 memory surface 很有用，但本 Harness 的优势正是任务状态唯一性。

## 后续分析队列

1. **Host Config Alignment**：对比 `harness/adapters/*` 与 gstack `hosts/*.ts`，设计 typed adapter/host schema 是否能统一 entry、skill、hook、frontmatter、path rewrite 和 runtime assets。
2. **Workflow Skill Roadmap**：把本 Harness 能力包装成用户可运行的 lanes：plan、debug、review、verify、finish、release；先定义 command/skill surface，再考虑实现。
3. **Browser Capability Strategy**：评估三条路线：集成 gstack browser、集成 browser-use/browser-harness-js、保持外部工具但定义 Harness browser contract。
4. **Memory Taxonomy**：定义 task memory、project learnings、site/domain knowledge、workflow checkpoints、cross-machine brain 的边界，避免多记忆系统互相覆盖。
5. **Safety UX Comparison**：深入比较 gstack `/careful`/`/freeze`/`/guard` 与本 Harness safety profile，在 accident prevention、policy enforcement、可绕过性、恢复成本上的差异。
6. **Skill Eval Harness**：研究 gstack 的 skill e2e/evals，把本 Harness 的 projected skills 加入行为级测试，而不只测文件投影。
7. **Team Mode Governance**：设计 Harness `team-init required|optional` 是否值得做，如何避免自动更新破坏已有用户-global 配置。
8. **Release Lane**：研究 `/ship`、`/document-release`、`/land-and-deploy`、`/canary` 可拆成哪些 Harness-compatible skills，哪些应留给项目自定义。

## 初步问题

- gstack 的 “harness” 是完整工作流平台、agent 配置层、CLI 工具链，还是某种更轻量的任务运行框架？
- gstack 是否强调多 agent/多 IDE 可移植性，还是聚焦某个 runtime？
- gstack 的能力优势来自架构完整性、安装体验、默认规则、社区采用，还是实际自动化工具？
