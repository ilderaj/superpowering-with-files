# 夜班执行载体与模型钉定 — 侧栏排查发现

- 记录日期：2026-09-20（Asia/Shanghai）
- 来源：侧栏会话（side conversation）只读排查，非主线程 nightly 运行产物
- 变更状态：**未做任何文件/配置/Git/Linear 写入，未新建 planning 任务**
- 用途：供主 session 审计确认后决定是否执行
- 触发问题：夜班是否为每个 ticket spawn 独立 session，还是在单 session 内 inline 串行；默认 LLM 是否为 opencode-go DeepSeek

## 1. 结论摘要

1. 夜班**一次 cron 运行 = 一个自动化自有的本地 session**，不是你的交互 thread。该 session 内所有 slice **inline 串行**执行，无 per-ticket session spawn。
2. 夜班与白班交接两个自动化**显式钉住** `opencode-go/deepseek-v4.1-flash`（effort high）。这是 per-automation 钉定，**不是全局默认**。
3. 存在两个真实缺口：**模型钉定覆盖不全**（9 个 heartbeat 无 model 字段）、**缺少运行时模型实证**（无法证明实际跑的是钉住值）。

## 2. 发现 A：执行载体 = 单 session 内串行

配置层面没有线程分发字段，是 cron + local + project 目标：

- `~/.codex/automations/swf-night-executor/automation.toml:3` — `kind = "cron"`
- 同文件 `:10` — `execution_environment = "local"`
- 同文件 `:11` — `target = { type = "project", project_id = "local-8de225de40a3a2886c8065ccb69a4588" }`
- 同文件 `:12` — `cwds = ["~/SuperpoweringWithFiles"]`

prompt 层面明确要求同一 session 内串行（`automation.toml:5` 单行 prompt 内含以下原文）：

- `Run a bounded serial nightly pass for this repository`
- `one task at a time, no parallel edits to this repository`
- `Continue with the next independent eligible slice within the SAME budget`

预算：整轮共享一个窗口，`3 次 attempted slice / 45 分钟` 先到先停。

运行记忆印证（`~/.codex/automations/swf-night-executor/memory.md`，2026-09-20 run 2）：一个 session 内选中并做完 SUP-17，随后因时间预算停在 SUP-24 / SUP-15 未领取；全程只记录了一个 thread binding。

相关但**不同**的机制：chief-worker 设计里的 subagent 委派是在**同一 session 内部**发生，不是新 session。 nightly prompt 不要求必须委派。升级为可见并行 worker 的条件是 slice 变成跨阶段、长时运行、独立可变状态或需人直接介入（`docs/superpowers/specs/2026-07-10-chief-worker-operating-model-design.md:364`）。日常 nightly slice 不满足。

## 3. 发现 B：模型钉定是 per-automation，不是全局默认

夜班与白班交接确实钉住 DeepSeek：

- `~/.codex/automations/swf-night-executor/automation.toml:8` — `model = "opencode-go/deepseek-v4.1-flash"`
- 同文件 `:9` — `reasoning_effort = "high"`
- `~/.codex/automations/swf-morning-handoff/automation.toml:8` — `model = "opencode-go/deepseek-v4.1-flash"`
- 同文件 `:9` — `reasoning_effort = "high"`

但全局默认不是它：`~/.codex/config.toml:17` — `model = "p459531/gpt-5.6-sol"`。

全部 22 个自动化的模型分布（`grep -m1 '^model'` 逐条读取）：

| 自动化 | kind | model |
|---|---|---|
| automation-2 | cron | opencode-go/deepseek-v4.1-flash |
| sequre-wiki-nightly-draft | cron | opencode-go/deepseek-v4.1-flash |
| sequre-wiki-morning-handoff | cron | opencode-go/deepseek-v4.1-flash |
| swf-night-executor | cron | opencode-go/deepseek-v4.1-flash |
| swf-morning-handoff | cron | opencode-go/deepseek-v4.1-flash |
| swf-weekly-planning-review | cron | main/gpt-5.6-luna |
| weekly-pacypay-mirror-refresh | cron | p459531/gpt-5.6-luna |
| daily-codex-migration-audit | cron | gpt-5.3-codex |
| weekly-asc-submission | cron | gpt-5.4 |
| weekly-governance-sync | cron | gpt-5.4-mini |
| weekly-harness-global-adoption | cron | gpt-5.4 |
| weekly-release-readiness | cron | gpt-5.4 |
| automation | heartbeat | **无 model 字段** |
| codex-opencodex | heartbeat | **无 model 字段** |
| jira-demand-review-subtask-backfill | heartbeat | **无 model 字段** |
| jira-teams | heartbeat | **无 model 字段** |
| kb-code-biz | heartbeat | **无 model 字段** |
| onerway-open-story-audit | heartbeat | **无 model 字段** |
| pr-136-review | heartbeat | **无 model 字段** |
| pr-139 | heartbeat | **无 model 字段** |
| sequre-10-20-seo | heartbeat | **无 model 字段** |
| sequre-seo | heartbeat | **无 model 字段** |
| swf-trio-v2-read-only-monitor | heartbeat | **无 model 字段** |

含义：DeepSeek 只在被写明的地方生效。9 个 heartbeat 跑在绑定 thread 内、继承该 thread 的模型，不受钉定约束。

## 4. 发现 C：缺少运行时模型实证

自动化目录只有 `automation.toml` + `memory.md`，**没有任何运行日志记录该轮实际使用的模型**。可复核：`ls -la ~/.codex/automations/swf-night-executor/`。

仓库自身结论（`planning/active/deepseek-context-recovery-diagnosis-20260917/findings.md:4`）：
`Requested/route model opencode-go/deepseek-v4.1-flash; no claim about provider-internal actual model identity.`

Trio 入口策略（`~/SuperpoweringWithFiles/AGENTS.md`）：`The Host owns lifecycle, continuation, permissions, and authenticated model evidence. Actual model and effort remain unknown without that evidence.`

因此当前只能确认"请求路由是 DeepSeek"，**不能确认"实际跑的是 DeepSeek"**。

附带风险：`deepseek-flash` 短别名与 `opencode-go/deepseek-v4.1-flash` 是 catalog 中两个不同条目（`findings.md:38`）。前者不支持 experimental context；后者 `supports_experimental_context=true`、context_window=1048576。任何回退到短别名都会静默换模型，且直接关联上下文丢失问题。

## 5. 未确立 / 待确认

- 未验证 Host 是否实际遵守 automation.toml 的 `model` 覆盖（无运行日志可查）。
- 未验证 heartbeat 继承的 thread 当前各自是什么模型。
- 未验证 45 分钟硬截止在超预算时的实际中断行为。
- 以上均需 Host 侧或运行日志证据，属 unknown，不作断言。

## 6. 建议主 session 执行的动作（草案，未创建 ticket）

1. **审计确认**：核对本节发现 A/B/C，确认是否接受"单 session 串行"为既定拓扑，还是需要 per-ticket session 隔离。
2. **模型实证**：在 nightly/白班 memory 或 run report 增加一行 model attestation，记录 Host 报告的实际模型；与钉住值不符则该轮判失败。
3. **覆盖补齐**：为 9 个 heartbeat 明确 model 钉定，或显式接受"继承 thread 模型"并写入决策记录。
4. **别名防线**：禁止 `deepseek-flash` 短别名进入 nightly 路径，并在校验中拒绝该别名。
5. 以上若纳入实施，按仓库约定拆为 spec/ticket/impl plan 后排入 nightly 队列。

## 7. 证据清单（可复核路径）

- `~/.codex/automations/swf-night-executor/automation.toml`（:3, :8, :9, :10, :11, :12）
- `~/.codex/automations/swf-night-executor/memory.md`（2026-09-20 run 2）
- `~/.codex/automations/swf-morning-handoff/automation.toml`（:8, :9）
- `~/.codex/config.toml`（:17）
- `planning/active/deepseek-context-recovery-diagnosis-20260917/findings.md`（:4, :38）
- `docs/superpowers/specs/2026-07-10-chief-worker-operating-model-design.md`（:59, :72, :364, :402）
- `~/SuperpoweringWithFiles/AGENTS.md`（Host 持有 authenticated model evidence）
