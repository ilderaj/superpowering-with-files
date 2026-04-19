# 当前发现

## 上游问题输入

- TypeMint handoff 将问题拆成三层成本：
  - 固定成本
  - 恢复成本
  - 执行成本
- handoff 额外指出：
  - local workspace agent 比 CLI agent 更容易吃进 editor / attachment / terminal / tree 等环境态
  - 长任务、多 phase、详细 planning、丰富技能生态会显著放大问题
  - 全局 harness、`using-superpowers`、`planning-with-files` 和大 skill roots 会形成持续背景税

这份 handoff 当前应视为“问题假设与外部症状来源”，需要在 HarnessTemplate 内部逐项核对哪些已经被当前架构放大，哪些只是 TypeMint 本地工作方式特有的放大器。

## 可见规则来源

- workspace 级 Codex 入口：`/Users/jared/HarnessTemplate/AGENTS.md`
- user-global 级 Codex 入口：`/Users/jared/.codex/AGENTS.md`
- 共享 policy 源：`/Users/jared/HarnessTemplate/harness/core/policy/base.md`
- 平台 override：
  - `/Users/jared/HarnessTemplate/harness/core/policy/platform-overrides/codex.md`
  - `/Users/jared/HarnessTemplate/harness/core/policy/platform-overrides/copilot.md`
  - `/Users/jared/HarnessTemplate/harness/core/policy/platform-overrides/cursor.md`
  - `/Users/jared/HarnessTemplate/harness/core/policy/platform-overrides/claude-code.md`

## 当前体积基线

- `base.md`：
  - 16384 chars
  - 2381 words
  - 约 4096 tokens（按 chars / 4 粗估）
- workspace `AGENTS.md`：
  - 16751 chars
  - 2432 words
  - 约 4188 tokens
- user-global `~/.codex/AGENTS.md`：
  - 14880 chars
  - 2183 words
  - 约 3720 tokens

## rendered entry 体积

- `rendered:codex`：约 4188 tokens
- `rendered:copilot`：约 4234 tokens
- `rendered:cursor`：约 4195 tokens
- `rendered:claude-code`：约 4181 tokens

结论：四个平台入口体积几乎相同，说明主要负载来自共享 policy，而不是平台差异。

## 重复度

- `base.md` 与 workspace `AGENTS.md` 相似度：0.9889
- workspace `AGENTS.md` 与 user-global `~/.codex/AGENTS.md` 相似度：0.9003
- `base.md` 与 user-global `~/.codex/AGENTS.md` 相似度：0.8874

结论：Codex 当前本地 global + workspace 两份规则文本存在高重复；如果两者在会话启动时都进入上下文，重复成本很高。

## 体积主要来源

按 `base.md` section 粗估，较重的部分包括：

- `Complex Task Orchestration`：约 552 tokens
- `Core Behavioral Guidelines`：约 464 tokens
- `Companion Plan Model`：约 354 tokens
- `Plan Location Boundaries`：约 315 tokens
- `Development Guidelines`：约 289 tokens
- `Output Style`：约 254 tokens
- `Task Classification`：约 240 tokens
- `Mandatory Sync-Back Rule`：约 219 tokens

这些 section 共同决定了大部分上下文体积。

## 结构判断

- 模板壳很薄，几乎不构成优化目标。
- 平台 override 仅几十到一百 token 左右，也不是主要矛盾。
- 真正的上下文成本几乎全部集中在共享 `base.md`。
- 当前 workspace `AGENTS.md` 比 user-global `~/.codex/AGENTS.md` 更长，主要新增内容集中在 deep-reasoning companion-plan 模型与 summary-only sync-back 语义。

## 当前需要继续核实的核心问题

- 只看 HarnessTemplate 自身，global harness 是否已经内建了“过重默认加载”的结构性问题。
- 规则入口之外，projected skills discovery 自身是否会把 skill inventory 或 skill 正文变成启动税。
- 当前 `planning-with-files` 的恢复设计是否默认偏向“读大文件”，从而放大恢复成本。
- 各 IDE 在官方加载模型上，是否允许或鼓励更薄的 global 基线 + 按需展开。
- 哪些优化可以只在 HarnessTemplate source 做一次，就能以较低 adopt 成本传导到 user-global 与 workspace consumer。

## 2026-04-19 本地架构补充发现

### 1. Harness 的 entry 负担是“全量共享 policy 内联”

- `renderEntry()` 直接读取并模板注入：
  - `harness/core/policy/base.md`
  - 平台 override
- 模板本身都是 `{{basePolicy}}` 全量注入，而不是引用式或分层式装配。
- 结论：当前 entry 侧没有任何“按需裁剪”或“轻入口/重详情分离”机制。

### 2. Harness 自身投影的 skills 规模不小

- `harness/core/skills/index.json` 当前只管理两类 source：
  - `superpowers` collection
  - `planning-with-files` single skill
- 但 `superpowers` baseline 本身约：
  - 14 个子技能
  - 108508 chars
  - 粗估约 27127 tokens
- `planning-with-files` baseline 约：
  - 11066 chars
  - 粗估约 2767 tokens
- 结论：如果目标 IDE/agent 不具备足够好的 skill 懒加载，Harness 当前 global adoption 可能天然带来一个很大的 skill 背景面。

### 3. 当前 user-global skill roots 中，Harness 管理的核心技能体量仍大

- 仅看 Harness 这批核心技能，在各 global roots 的量级约为：
  - `~/.agents/skills`：约 31597 tokens
  - `~/.copilot/skills`：约 31738 tokens
  - `~/.claude/skills`：约 30239 tokens
  - `~/.cursor/skills`：约 31396 tokens
- 这还不包括其他外部技能生态。

### 4. Hook 链路是高风险上下文放大器

- `harness/core/hooks/superpowers/scripts/session-start`
  - 会读取 `using-superpowers/SKILL.md` 全文
  - 再以 `<EXTREMELY_IMPORTANT> ... </EXTREMELY_IMPORTANT>` 包裹后注入 `additionalContext`
- `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
  - `session-start` / `user-prompt-submit` 时会注入：
    - `task_plan.md` 前 80 行
    - `progress.md` 后 20 行
  - `pre-tool-use` 时会再注入 `task_plan.md` 前 40 行
- 结论：一旦 hooks 打开，固定成本和恢复成本不只是“文件存在”，而是会直接转成 prompt 注入。

### 5. 当前测试偏向“功能存在”，而不是“负担受控”

- hooks 测试只校验：
  - `superpowers` hook 的输出里包含 `using-superpowers`
  - `planning-with-files` hook 的输出里包含 `ACTIVE PLAN`
- 没有预算类测试，例如：
  - 最大输出大小
  - 多任务时的降级行为是否足够轻
  - 长 planning 文件时的截断/摘要质量
  - user-global + workspace 双层入口叠加时的负担约束

### 6. doctor/verify 当前没有上下文治理视角

- `doctor` 重点检查：
  - entry/skill/hook 是否存在
  - patch marker 是否存在
  - home path 泄露
- `verify` 当前更轻，只输出 state 摘要
- 两者都还没有：
  - entry token/char 预算
  - projected skills 预算
  - hook 注入体积预算
  - active planning 恢复体积预算
  - global + workspace 重叠风险提示

## 与既有任务的关系

- `planning/active/harness-init-skill-projection-audit/` 记录了当前四个 IDE 的入口与 skill projection 结构。
- `planning/active/cross-ide-projection-audit/` 记录了各 IDE 入口路径、skills、hooks 的官方/实现差异。
- `planning/active/workflow-constraints-audit/` 记录了 companion-plan、tracked-task precedence、summary-only sync-back 的最近落地情况。

## Claude Code 官方文档核对

### 官方确认

- `CLAUDE.md` 作为项目/用户/组织级指令入口存在，层级包括管理策略、项目指令、用户指令和本地指令；更具体的位置优先于更宽泛的位置。
- 工作目录上方的 `CLAUDE.md` / `CLAUDE.local.md` 会在启动时完整加载；子目录里的文件在 Claude 读取这些目录中的文件时按需加载。
- `CLAUDE.md` 支持 `@path/to/import` 导入，导入内容会在启动时进入上下文；导入链最大深度为 5 hop。
- Claude Code 的技能来自个人、项目和插件三个来源；个人技能位于 `~/.claude/skills/`，项目技能位于 `.claude/skills/`，插件技能随已安装插件提供。
- 技能描述用于帮助 Claude 决定何时加载；在普通会话里，技能描述会进入上下文，但完整技能内容只在被触发时加载。
- 可以通过 `disable-model-invocation: true` 阻止 Claude 自动触发某个技能；`user-invocable: false` 只影响菜单可见性，不阻止模型调用。
- Hooks 通过 settings files 配置，配置入口包括 `~/.claude/settings.json`、`.claude/settings.json`、`.claude/settings.local.json` 和企业托管策略。
- `disableAllHooks` 可以关闭 hooks，但只能关闭当前层级允许关闭的 hooks；托管策略层的 hooks 不能被较低层级的 `disableAllHooks` 覆盖。
- Settings 是官方的分层配置机制；用户、项目、本地和 managed settings 有明确优先级。
- Claude Code 官方文档明确把 subagents 作为减轻主对话上下文负担的机制，subagents 使用独立 context window；技能也被官方描述为按需加载、减少重复说明的机制。

### 基于现象推断

- `CLAUDE.md` / `CLAUDE.local.md` / 导入文件 / skills / subagents / hooks 共同构成了“分层、按需、局部化”的官方加载模型，但它们并不是同一种机制，不能简单等同为单一“层级记忆”功能。
- 对 context 负担的缓解主要来自按需加载、范围收敛和独立上下文窗口，而不是把所有规则统一塞进一个更大的全局记忆层。

### 未确认

- 官方文档没有把“分层记忆”定义成一个统一术语，也没有给出一个横跨 `CLAUDE.md`、skills、hooks、subagents 的单一记忆总线。
- 官方文档没有明确说明 Claude Code 是否会在所有场景下先预加载技能目录索引或仅在需要时发现技能元数据到什么粒度。
- 官方文档没有明确证明“workspace/user-global 入口”在所有安装形态下的实际文件系统投影一定与 HarnessTemplate 当前投影一致；只能确认 Claude Code 自身接受上述官方路径。
- 官方文档没有说明 `CLAUDE.md` 导入、技能描述、subagent 配置和 hooks 的合并策略是否会在具体会话里显著增加固定启动成本，需要结合实际使用场景评估。

## GitHub Copilot / VS Code 官方文档核对

### 官方确认

- VS Code 的 workspace always-on 指令入口包括：
  - `.github/copilot-instructions.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `*.instructions.md`（可配 `applyTo`）
- User profile 也有独立 instructions 入口，且支持 organization-level instructions 与 diagnostics。
- Skills 有明确的 project/user 目录，支持 `name` / `description` discovery、`user-invocable`、`disable-model-invocation`。
- 官方明确写明 Skills 的 progressive loading：
  - 先读 frontmatter 做 discovery
  - 再加载 `SKILL.md`
  - 最后只有在引用到时才加载 skill 目录中的额外资源
- Hooks 有 workspace/user 入口，但官方定位是 lifecycle automation，而不是静态上下文压缩机制。

### 基于现象推断

- Copilot/VS Code 官方最鼓励的形态是：
  - 轻量 always-on instructions
  - 细粒度 `applyTo` scoped instructions
  - 重流程、示例、脚本进入 skills 并依靠 progressive loading
- 这意味着 Harness 当前“长 shared policy 直接进 always-on entry”的做法与官方最优上下文经济路线并不一致。

### 未确认

- 官方没有对 instructions 给出像 skills 那样清晰的 progressive loading 语义。
- 官方没有把 global harness 这种跨 IDE 投影层作为一类原生对象来定义，因此跨平台治理仍需 Harness 自己实现。

## Codex / OpenAI 官方文档核对

### 官方确认

- Codex 有清晰的全局与项目级指令入口：
  - `~/.codex/AGENTS.md`
  - 项目内 `AGENTS.md`
- 项目级 `AGENTS.md` 按 root → cwd 分层拼接，且有默认字节上限。
- `skills` 采用元数据先行、正文按需加载的设计。
- `skills.config`、`project_doc_max_bytes`、`model_auto_compact_token_limit`、prompt caching / compaction / token counting 都是官方暴露的上下文治理手段。
- hooks 是单独的运行时机制，不属于 skills 式懒加载。

### 基于现象推断

- Codex 官方已经具备“指令分层 + 字节预算 + skills 按需加载 + 自动压缩”的原生组合。
- 因此 Harness 如果在 Codex 路径上继续主要依赖超长 full-rendered entry，而不利用这些原生预算能力，就容易把可控问题重新做成静态税。

### 未确认

- 官方没有给出一个统一覆盖所有 tools / hooks / plugins 的“通用懒加载总开关”。
- 官方没有把 workspace/user-global 作为统一术语，而是用 global / project scope、Codex home、project root 等表述。

## Cursor 官方文档核对

### 官方确认

- Cursor 将 `Project Rules`、`User Rules`、`AGENTS.md` 视为不同层的规则系统。
- `AGENTS.md` 被明确描述为 root-level、无复杂 metadata 的简化替代入口。
- Skills 默认由 agent 在相关时自动加载，且鼓励把详细资源拆到 `references/` / `scripts/` 中按需读取。
- Hooks 是观察和控制 agent loop 的运行时机制，不是静态规则载体。
- Cursor 官方还提供 summarization 和 Working with Context 之类的上下文减负能力。

### 基于现象推断

- Cursor 官方方向明显偏向：
  - 静态规则保持 scope 化和轻量
  - 动态能力放进 skills
  - 运行时控制交给 hooks
- Harness 当前把完整 shared policy 直接渲染为 Cursor workspace rule，会偏离这一分层。

### 未确认

- 官方没有给出所有安装形态下 project skills 与 user/global skills 的完整优先级矩阵。
- 官方没有把 rules、skills、hooks、subagents 统一定义成单一“层级记忆”产品概念。

## 执行计划产出

- Companion plan:
  - `docs/superpowers/plans/2026-04-19-global-harness-context-remediation-plan.md`
- 该计划将整改拆成 6 个实现任务：
  1. 上下文预算原语与报告
  2. 薄 always-on entry 渲染
  3. planning hot-context 压缩恢复
  4. hook payload 收敛与预算验证
  5. opt-in global skill profile
  6. 最终校准、验证与发布门槛
- 计划明确保持：
  - `harness/core/policy/base.md` 仍是 canonical source
  - 当前 `core / adapters / installer / upstream` 分层不推翻
  - 首轮不直接 flip 默认行为，而是先加预算与 opt-in profile
