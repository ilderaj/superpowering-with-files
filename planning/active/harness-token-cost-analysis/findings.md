# Findings: Harness Token Cost Analysis

## Findings Record: 2026-05-20 14:39:18 UTC+8

## Local Harness Evidence
- `harness doctor` result: passed.
- `harness sync dry-run` result summary observed: `create=81 update=0 stale=81`.
- Dry-run structured targets observed: `codex`, `copilot`, `cursor`, `claude-code`.
- Planned artifacts included entry files and hooks/hook scripts, including examples:
  - `~/.codex/AGENTS.md`
  - `~/.claude/CLAUDE.md`
  - `~/.copilot/instructions/harness.instructions.md`
  - `.cursor` hook config paths
- Root repo contains `AGENTS.md`, `CLAUDE.md`, `.harness/`, `.superpowers/`, and `harness/`.

## Initial Token Cost Model

### Ordinary Direct Tasks
Typical sources:
- system/developer prompt and user request
- limited conversation history
- targeted file reads
- targeted shell output
- final answer

Rough order of magnitude noted in analysis:
- Small single-file task: ~5k-30k input, ~1k-8k output.
- Medium 2-5 file task: ~20k-80k input, ~5k-20k output.
- Analysis/research answer: ~5k-50k input, ~2k-15k output.

### Complex Superpowers/Harness Tasks
Additional sources:
- planner/product-manager context
- developer/generator execution context
- evaluator acceptance context
- task plan/findings/progress files
- IDE-specific entry/rule projections
- skills/superpowers documentation
- verification and retry loops

Rough order of magnitude noted in analysis:
- Small feature, 1-2 loops: ~100k-300k total.
- Multi-component feature, 2-4 loops: ~300k-1M total.
- Complete app / multi-stage build: 1M+ total is plausible.

Main risk: large tool/shell output can dominate all other costs.

## Reddit/Codex Byte-cap Pattern
Pattern from user-provided image:

```bash
COMMAND 2>&1 | head -c 4000
```

Assessment:
- Effective as a prompt-level instruction when placed in Codex `AGENTS.md` because Codex supports `AGENTS.md` project instructions.
- Not a hard enforcement mechanism.
- Good for unknown or potentially huge command output.
- Risk: head-only truncation can cut off the actual error, especially for tests/builds where failure appears late.
- Risk: JSON may become unparsable after byte truncation.
- Risk: upstream process may see SIGPIPE.

## IDE/CLI Evidence Summary

### OpenAI Codex CLI
- Official/project docs support `AGENTS.md`.
- Official/project docs include config/hooks references.
- Source-level evidence reported by researcher: exec output has a larger default byte cap around 1MiB.
- `AGENTS.md` byte-cap instruction is compatible but soft.

### Claude Code
- Official docs support `CLAUDE.md`, `.claude/rules/*.md`, imports, and hooks.
- Hooks can match Bash via PreToolUse/PostToolUse.
- `CLAUDE.md`/rules are context guidance, not hard enforcement.
- Hook enforcement is possible in principle, but requires careful design and testing.

### Cursor
- Official docs support `.cursor/rules` and `AGENTS.md`.
- Official docs support `.cursorignore` and related context exclusions.
- Agent terminal commands are compatible with shell pipelines.
- No confirmed official shell output truncation setting yet.

### Gemini CLI
- Official docs support `GEMINI.md`, custom context file names, custom commands, hooks, `.geminiignore`.
- Official setting `tools.truncateToolOutputThreshold` exists according to researcher verification.
- Strongest native mechanism among surveyed tools for output truncation.

### OpenCode
- Official docs support `AGENTS.md`, fallback to `CLAUDE.md`, `instructions`, custom commands, plugins/hooks.
- `compaction.prune` removes old tool outputs to save tokens.
- No confirmed fixed shell output truncation threshold yet.

## Token Reduction Levers Identified
- Byte-cap unknown/large shell outputs.
- Use IDE-native ignore/exclude files to reduce irrelevant context.
- Keep entry files thin; load detailed skills/rules on demand.
- Preserve summaries of decisions, modified files, verification status, and unresolved issues.
- Avoid full logs, broad grep, huge diffs, and whole-file reads unless required.
- Prefer command-specific wrappers over one global `head -c 4000`.

## Key Judgment
The safest optimization direction is not to remove planning/evaluation layers. It is to reduce noisy tool output and repeated full-context loading while preserving durable decision state.

## Findings Record: 2026-05-20 22:50:45 UTC+8

Chosen safest implementation direction: shared prompt-level shell output compression guidance rendered into all four currently supported IDE targets: Codex, Claude Code, Copilot, and Cursor.

Rationale: this targets the largest token risk, shell/tool output, while avoiding hook-level command rewriting and preserving Harness planning/evaluation effectiveness.

Implementation posture:
- Put the guidance in the canonical shared policy source, not duplicated per IDE.
- Keep Copilot concise by budget test.
- Verify rendered outputs contain the guidance for all four targets.
- Do not install or mutate hooks for this first step.

## Findings Record: 2026-05-27 11:11:54 UTC+8

## Current Repo-State Rebaseline
- `harness/core/policy/base.md`、`harness/core/policy/entry-profiles.json`、workspace root `AGENTS.md`、workspace root `CLAUDE.md`、`.github/copilot-instructions.md`、`.cursor/rules/harness.mdc` 均已包含 `Shell And Token-Saving Preferences`，说明 shared prompt-level shell guidance 已经在当前仓库中落地，而不是仅存在于 companion implementation plan。
- `tests/installer/policy-render.test.mjs` 与 `tests/installer/context-budget.test.mjs` 当前均通过，说明 shared policy render 与 context budget 守卫没有处于失效状态。

## Measured Context Costs
- 当前实测 always-on entry 体量：Codex `1230` approx tokens、Copilot `1024`、Cursor `1237`、Claude Code `1222`。全部显著低于 entry budget（warn `7500` / problem `11250`）。
- 当前 planning hot context 为 `979` chars / `19` lines / `245` approx tokens，在四个目标上都显著低于 planningHotContext budget（warn `4000` / problem `6000` tokens）。
- 当前 skill profile discovery 为 `225-226` approx tokens，显著低于 skillProfile budget（warn `5500` / problem `8000` tokens）。

## Copilot Hook Payload Finding
- 当前 `readHarnessHealth()` 汇总出的 hook payload summary 以 Copilot 为最差目标：`2878` chars / `8` lines / `720` approx tokens，超过 Copilot 专用 `hookPayload` problem 阈值 `500` tokens。
- 但按单个 hook event 拆开后，Copilot 当前四个已测事件都没有单独超阈值：
  - `superpowers SessionStart` 约 `88` tokens
  - `planning-with-files SessionStart` 约 `105` tokens
  - `planning-with-files UserPromptSubmit` 约 `270` tokens
  - `planning-with-files Stop` 约 `257` tokens
- 因此当前异常更像是“多生命周期事件累计后的 target total 超阈值”，而不是“单次 hook 注入文本过长”。这会直接影响后续优化方向：先确认预算模型语义，再决定是压缩文本还是重构统计。
- 当前 `scopeOverlap` 结果为 `undefined`，说明这次 Copilot hook 超标并不是 workspace + user-global 双投影重叠导致的重复注入。

## Measurement Coverage Gaps
- `harness/installer/lib/health.mjs` 当前只对 `MEASURED_HOOK_PAYLOAD_TARGETS = ['codex', 'copilot']` 做 hook payload 实测。
- 同一模块当前只测 `MEASURED_HOOK_PAYLOAD_SKILLS = ['superpowers', 'planning-with-files']`，因此 Cursor、Claude Code 以及其他 skill/hook 的运行时注入量仍未被当前分析框架直接覆盖。

## Planning-State Drift
- active task planning 仍将 `docs/superpowers/plans/2026-05-20-harness-token-output-compression-plan.md` 视为“implementation plan ready, execution not started”，但当前仓库状态显示 shared policy 与相关测试已存在。
- `readHarnessHealth()` 同时发出 warning：该 companion plan 虽被 active task planning 引用，但未回指 `planning/active/harness-token-cost-analysis/`。这说明 tracked planning 与 repo state 之间存在同步漂移，后续需要先修正分析叙事，再决定是否继续推进新优化。

## Findings Record: 2026-05-27 11:29:41 UTC+8

## Official-Source Findings For Codex/X Token Advice
- User-provided X content should be treated as a hypothesis source only. For this task, accepted source of truth remains official documentation or local quantitative measurement.
- Official Codex docs fetched so far do not confirm an exact `Process_narration=false` setting. The official config schema includes `hide_agent_reasoning = true`, described as hiding `AgentReasoning` events from UI/output. This can reduce visible/log noise, but it is not evidence by itself that reasoning tokens are no longer generated or billed.
- Official Codex controls that can plausibly affect token/cost behavior include `model_verbosity`, `model_reasoning_summary = "none"`, `model_reasoning_effort`, `tool_output_token_limit`, `model_auto_compact_token_limit`, `project_doc_max_bytes`, `project_doc_fallback_filenames`, `service_tier`, and explicit `model` selection.
- Official Codex subagent docs state that subagent workflows consume more tokens than comparable single-agent runs because each subagent does its own model and tool work. They are therefore a context-quality and parallelism tool, not automatically a token-saving tool.
- Official Codex subagent docs also state custom agent files can include supported `config.toml` keys such as `model`, `model_reasoning_effort`, and `sandbox_mode`; examples route explorer/worker/docs agents to different model tiers such as mini/spark/full models.
- Official Codex pricing docs recommend controlling prompt size, reducing `AGENTS.md`, limiting MCP servers, and switching to smaller models for routine tasks to make usage limits last longer.

## Cross-IDE Findings
- Claude Code official docs explicitly state subagents preserve context and can control costs by routing tasks to faster, cheaper models like Haiku. Subagent frontmatter supports `model: sonnet|opus|haiku|inherit|full model id`, and Agent tool responses expose token usage telemetry.
- VS Code/Copilot official docs support model selection, thinking effort for supported models, BYOK/custom endpoints, `chat.utilityModel`/`chat.utilitySmallModel`, and custom agents with `model` frontmatter and subagent availability lists. Debug tooling exposes token usage, cache behavior, raw prompts, context, and tool payloads.
- Cursor official docs state rules are included at the start of model context when applied, so short/scoped rules can reduce always-on prompt bloat. Cursor pricing docs also support Auto/Composer pools and model-specific API pricing, but Cloud Agents documentation says Cloud Agents always run Max Mode with no toggle to turn it off.
- Cursor hooks expose full terminal output and full MCP JSON results in after-execution events, and allow `additional_context` injection. This is a potential token/cost risk if Harness later adds hook-injected summaries without strict caps.

## Harness Optimization Hypotheses From Official Evidence
- Current measured Harness always-on entries, planning hot context, and skill profile are not hotspots; the most evidenced near-term risk remains noisy tool/shell/MCP output.
- Repeated global + workspace instructions, broad fallback instruction filenames, oversized `AGENTS.md`/rules, and unnecessary MCP servers are officially recognized cost drivers in Codex/Cursor/Copilot-style systems and should be kept thin or scoped.
- Subagent fan-out should be budgeted explicitly. It can reduce main-context pollution and improve evidence gathering, but may increase total token spend through duplicated startup context, independent tool calls, and verbose returned summaries.
- Lower-cost model routing is promising, but should be policy-gated by task class: cheap/read-only exploration and mechanical checks first; stronger models for architecture, ambiguous debugging, security-sensitive review, and final synthesis.

## Findings Record: 2026-05-27 11:36:11 UTC+8

## Local Quantitative Evidence: Hook Payload Semantics
- Current `readHarnessHealth()` hook summary reports Codex at `333` approx tokens and Copilot at `715` approx tokens. Copilot receives a `problem` verdict because its target-specific hookPayload threshold is `500` tokens and the summary sums multiple lifecycle events.
- Copilot single-event measurements were all below the `500` token problem threshold: `superpowers SessionStart` `88`, `planning SessionStart` `105`, `planning UserPromptSubmit` `245`, `planning Stop` `277` approx tokens.
- Code inspection confirms the semantics: `aggregateHookPayloadEntries()` aggregates by target/skill/event/category, then `readHarnessHealth()` sums all measured hook entries by target into `targetLedger.turn.hookPayload` and the target summary.
- `harness/installer/lib/health.mjs` still limits automatic hook payload measurement to `MEASURED_HOOK_PAYLOAD_TARGETS = ['codex', 'copilot']` and `MEASURED_HOOK_PAYLOAD_SKILLS = ['superpowers', 'planning-with-files']`.

## Local Quantitative Evidence: Cursor And Claude Code Hook Gap
- Manual execution of projected Cursor hooks showed `superpowers SessionStart` injects about `1408` approx tokens of context (`5905` chars JSON output), while planning hooks inject about `220` tokens on `user-prompt-submit`, `79` tokens on `post-tool-use`, and `254` tokens on `stop`. Cursor `pre-tool-use` currently emits the planning reminder to stderr and returns `{"decision":"allow"}`, so it is not represented as `additional_context` in the measured stdout JSON.
- Manual execution of projected Claude Code hooks showed `superpowers SessionStart` injects about `1408` approx tokens of context (`5973` chars JSON output), while planning hooks inject about `220` tokens on `UserPromptSubmit`, `53` tokens on `PreToolUse`, `79` tokens on `PostToolUse`, and `254` tokens on `Stop`.
- This is the strongest new evidence of an unmeasured Harness cost hotspot: Cursor/Claude Code use upstream superpowers session-start behavior that injects the full `using-superpowers` skill, while Codex/Copilot use a concise Harness wrapper of about `88` tokens.

## Local Quantitative Evidence: Planning Compression And Staleness
- The active task planning files currently measure approximately: `task_plan.md` `1230` tokens, `findings.md` `2792`, and `progress.md` `1835`; combined tracked planning text is about `5867` approx tokens.
- `buildPlanningHotContext()` currently emits about `220` approx tokens for the same task, a `26.67x` compression ratio by the local `ceil(chars / 4)` estimator.
- However, the hot-context preview was stale before this record because `extractPhases()` recognizes bracketed status in headings or `**Status:** ...` lines, while the plan used plain `Status: ...` lines. This means planning context can be cheap but misleading if plan formatting drifts from parser expectations.
- After normalizing phase status formatting in this plan, `currentPhase` correctly resolved to Phase 6, but `nextStep` still resolved to an older Phase 2 checklist item because `firstIncompleteChecklistItem()` scans the whole plan from the top. This is a second staleness vector: the summary may show the right phase but an old next action.

## Local Quantitative Evidence: Shell Output Compression
- `git --no-pager diff` on the current workspace produced about `3532` approx tokens; `head -c 4000` would reduce this to about `1000` tokens (`71.7%` savings), while `tail -n 80` would reduce it to about `1560` tokens (`55.8%` savings).
- `git --no-pager diff --stat` produced only about `65` approx tokens, so compression provides no useful savings for already summarized output.
- `git --no-pager log --oneline --decorate -n 200` produced about `3339` approx tokens; `head -c 4000` reduced it to about `1000` tokens (`70.1%` savings), and `tail -n 80` to about `1433` tokens (`57.1%` savings).
- `git ls-files` produced about `79,298` approx tokens; `head -c 4000` reduced it to about `1000` tokens (`98.7%` savings), and `tail -n 80` to about `748` tokens (`99.1%` savings).
- The focused installer tests produced only about `334` approx tokens, so the evidence supports category-aware output compression rather than blanket truncation of every command.

## Local Quantitative Evidence: Entry Duplication Risk
- Workspace and user-global entry files are individually light but near-duplicates by target: Codex workspace `1231` tokens vs global `1230`; Claude workspace/global `1222`; Copilot workspace/global `1024`; Cursor workspace rule `1237`.
- If a client loads both global and workspace instructions for the same Harness policy surface, the duplicated always-on cost would roughly double for that client. Current health did not report Copilot scope overlap in the previous baseline, so this remains a client-specific loading/precedence risk rather than a confirmed current double-injection in Copilot.

## Findings Record: 2026-05-27 13:16:04 UTC+8

## External Comparator: tw93/Waza
- Waza is a lightweight engineering skill collection, not a governance harness. It ships eight hard-capped skills: `think`, `design`, `check`, `hunt`, `write`, `learn`, `read`, and `health`.
- Waza's strongest architecture choice is outcome-first skill design: every major skill starts with an outcome contract, done criteria, evidence requirements, output shape, and explicit `Not for` boundaries in frontmatter or body text.
- Waza uses `skills/RESOLVER.md` plus `rules/waza-routing.md` as a compact human/agent routing layer. This is much smaller than Harness's multi-layer task classification plus projected skill ecosystem, but easier for agents to internalize.
- Waza keeps skill chaining manual: `/think` can lead to implementation and then `/check`, but each transition waits for the user. This avoids accidental workflow fan-out and token runaway.
- Waza separates adaptive judgment into skills and deterministic checks into scripts/rules. Root `AGENTS.md` explicitly says new behavior belongs in `references/`, `rules/`, `scripts/`, or existing skills unless the eight-skill cap is intentionally changed.
- Waza's distribution story is productized: npm `@tw93/waza`, `npx skills add`, Claude Code marketplace metadata, Claude Desktop ZIP, and Pi package metadata. It optimizes for global personal use rather than repo-owned projection ownership.
- Waza's release/package discipline is strong for its size: `VERSION` is the source of truth, `scripts/build_metadata.py` regenerates marketplace/package/README installer refs, and `packaging.allowlist` is default-deny for ZIP contents.
- Waza's validation suite checks skill metadata, descriptions, resolver drift, markdown links, table pipes, missing rules, README install commands, English coaching guardrails, and AI-attribution leaks.
- Waza's `/health` skill overlaps with Harness's `doctor` intent but stays agent-assisted and summary-first. It audits agent config, instruction drift, hooks/MCP surfaces, verifier surfaces, and AI maintainability without owning install state.
- Quantitative snapshot from shallow clone: Waza has about `101` tracked files, `8` skills, `5` rule files, `26` scripts, `23` test files, `207` README lines, and `143` `AGENTS.md` lines. Current SuperpoweringWithFiles snapshot has about `5340` tracked files, `84` projected/upstream/local `SKILL.md` files by naive search, `79` runtime/installer/adapter/MCP files, `64` test files, `255` README lines, and `124` `AGENTS.md` lines.
- Key difference: Waza trusts host installers and marker-based global edits; Harness owns projection manifests, safe writes, conflict backups, budget ledgers, health summaries, task-scoped planning, hooks, and MCP/runtime services.
- Borrowable ideas for Harness analysis: outcome-contract skill templates, strict skill count/scope budgets, resolver drift tests, default-deny packaging allowlists, generated marketplace/install metadata from one source of truth, summary-first health collection, anti-patterns as compact opt-in always-on rules, and manual skill chaining as a token-control principle.
- Non-borrowable as-is: Waza's lack of repo-owned durable task memory, lack of projection ownership manifest, marker-edited global install helpers, and single-entry `AGENTS.md`/`CLAUDE.md` symlink model do not map cleanly onto Harness's multi-target governance requirements.

## Findings Record: 2026-05-27 13:46:07 UTC+8

## Implementation Plan Candidate
- Selected implementation scope for review: compact Cursor/Claude Code superpowers hooks, all-target hook payload measurement, worst-event hook summary accounting, planning hot context current-phase next-step selection, and Waza-style outcome contracts for Harness-owned lazy local skills.
- Rationale: these changes target measured or directly observed issues without increasing always-on entry payloads or replacing the Planning with Files durable state model.
- Highest-confidence token win: Cursor and Claude Code currently use upstream superpowers `SessionStart` behavior that measured about `1408` approx tokens each; routing them to the existing compact Harness wrapper should make them comparable to Codex/Copilot compact bootstrap payloads.
- Highest-confidence correctness win: hook payload budget summary should evaluate the worst individual event, while the cumulative per-turn ledger remains available separately. This avoids Copilot false `problem` verdicts from summing unrelated lifecycle events.
- Waza borrow intentionally kept low-bloat: outcome contracts are added only to lazy Harness-owned local skills and enforced by tests; no broad Waza anti-pattern text is added to always-on policy.
- Companion implementation plan: `docs/superpowers/plans/2026-05-27-harness-token-cost-waza-optimization-plan.md`.

## Findings Record: 2026-05-27 23:57:12 UTC+8

## Execution Evidence: Tasks 1-2
- Cursor and Claude Code superpowers `SessionStart` hook projection now points at compact Harness-managed hook configs under `harness/core/hooks/superpowers/`, instead of the upstream full-skill hook source.
- `harness/installer/lib/health.mjs` now measures compact superpowers hook payloads for all four supported targets: `codex`, `copilot`, `cursor`, and `claude-code`.
- Cursor-native hook output using `{ "additional_context": ... }` is now normalized into the existing `hookSpecificOutput` measurement path without requiring a separate public health response shape.
- Hook budget summary accounting now uses the worst single measured hook event per target, while `targetLedger.turn.hookPayload` remains cumulative and `targetLedger.turn.hookPayloadWorstEvent` makes the distinction explicit.
- `context.summary.hooks.accounting` is now explicitly `worst-event`, turning the previous Copilot cumulative-summary ambiguity into a visible contract.

## Findings Record: 2026-05-28 01:06:15 UTC+8

## Execution Evidence: Task 3
- `extractPhases()` now accepts plain `Status:` lines for phase state parsing while keeping numbered `### Phase <n> ...` headings as the only true phase boundaries.
- `firstIncompleteChecklistItemInPhase()` now prefers checklist items within the active phase without being derailed by intermediate `### Notes`-style subheadings.
- `extractPhases()` and the phase-scoped checklist helper intentionally use different boundary rules: status parsing stops at any later `###` subheading to avoid status leakage, while checklist scanning continues until the next real numbered phase heading so active-phase notes sections do not hide the true next step.
- Focused Task 3 regressions now cover stale-next-step prevention, global fallback when the active phase has no checklist item, fake phase prevention for `### Phase Notes`, and prevention of subheading-local `Status:` leakage into the parent phase.

## Findings Record: 2026-05-28 01:22:46 UTC+8

## Execution Evidence: Task 4
- Harness-owned lazy local skills `risk-assessment-before-destructive-changes` and `safe-bypass-flow` now include compact `## Outcome Contract` sections modeled after the Waza-style outcome/done/evidence/output structure.
- The new static test `tests/core/local-skill-contract.test.mjs` validates local skill front matter, required section presence, section order, non-empty section bodies, and absence of placeholder text.
- `safe-bypass-flow` now explicitly requires a dedicated worktree backed by its task branch, preserving the isolation intent instead of weakening the contract to “worktree or branch”.
- This Waza borrow remains lazy-skill-only; no always-on policy or entry-file text was expanded.

## Findings Record: 2026-05-28 01:56:55 UTC+8

### Task 5 Verification Evidence

- The focused changed-surfaces suite passed after the blocker fixes: `114` tests passed, `0` failed.
- Full repository verification also passed: `npm run verify`.
- `./scripts/harness verify --output=.harness/verification` generated `.harness/verification/latest.md`; the report shows `Targets: none`, `Context entry verdict: ok`, `Hook payload verdict: ok`, `Planning hot context verdict: ok`, and `Skill profile verdict: ok` for the current workspace install state.
- `./scripts/harness sync --dry-run` returned `targets: []` with `create=0`, `update=0`, `stale=0`, and `unchanged=0`, so this worktree has no pending projection drift.
- `./scripts/harness doctor --check-only` passed. The remaining messages are pre-existing companion-plan reference/backlink warnings unrelated to Task 5 and therefore out of scope for this resume step.
- The required post-change hook measurement command returned an empty result set: `hookSummary = { approxTokens: 0, target: null, targets: [], verdict: ok, accounting: worst-event }` and `rows = []`. In context, this means the current worktree has no active synced targets to measure, not that the all-target compact-hook implementation regressed.
- A controlled four-target fixture measurement was run with `hookMode: on` and all workspace targets enabled. It produced `superpowers SessionStart` rows for `codex`, `copilot`, `cursor`, and `claude-code`, each measuring `88` approx tokens / `352` chars.
- In the same controlled measurement, `hookSummary` reported `accounting: worst-event`, overall `verdict: ok`, and worst target `copilot` at `124` approx tokens / `495` chars, which remains below the configured Copilot hook budget (`warn 300`, `problem 500` tokens).
- The all-target compact hook behavior and worst-event accounting are therefore covered by both the automated suites and a direct enabled-target measurement, while the live worktree install state remains neutral (`targets: none`).
- Evidence remains limited to measured prompt/hook payload reduction and verification health. No billing reduction claim is supported by this data.

## Findings Record: 2026-05-28 02:16:14 UTC+8

## Final Verification Addendum
- A final whole-change review found one additional install-state bug outside the earlier focused suites: `sync.mjs` had stripped the `cursor` target argument while adapting the installed Cursor `session-start` hook command.
- After restoring `cursor` in both the local and fallback command paths, the installed Cursor hook command now preserves the target-specific `additional_context` route instead of silently falling back to the default codex payload shape.
- The final fresh verification rerun still passed after this fix, and the controlled four-target fixture measurement continued to show compact `superpowers SessionStart` payloads for all four supported targets (`88` approx tokens each).
