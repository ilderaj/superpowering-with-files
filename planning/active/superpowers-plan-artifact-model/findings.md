# Findings & Decisions

## Requirements
- 用户要求执行 `planning/active/superpowers-plan-artifact-model/task_plan.md` 中的 implementation plan。
- 用户明确要求使用 `$subagent-driven-development`。
- 最终必须检查并精确说明四个 supported targets 在哪些验证层已经适配了新的 companion-plan 范式，以及哪些 patch 是 target-specific。
- 仓库 policy 要求 durable task state 仍由 `planning/active/<task-id>/` 承载。

## Research Findings
- 当前规则链条一致地把 `docs/superpowers/plans/**` 当作默认非 canonical 路径：
  - `AGENTS.md`
  - `harness/core/policy/base.md`
  - `harness/installer/lib/superpowers-writing-plans-patch.mjs`
  - `harness/installer/lib/plan-locations.mjs`
  - `tests/adapters/*` 与 `tests/installer/health.test.mjs`
- 当前所有 supported IDE 的入口渲染都依赖 `renderEntry()` 从 core policy 投影：
  - `codex`
  - `copilot`
  - `cursor`
  - `claude-code`
- `writing-plans` skill 的 patch 目前是通过 projection 层注入，而不是修改 vendored upstream baseline。
- health warning 目前是按路径静态判断，不会识别 active task 对 companion plan 的引用关系。
- 仓库本身的 `npm test` 会跑到 vendored upstream superpowers tests，并在 `server.test.js` 处因为缺少 `ws` 失败；这不是本任务引入的问题。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| companion plan 继续使用 `docs/superpowers/plans/**` | 这是用户偏好的 superpowers 路径，同时能与 human-facing docs 语义兼容 |
| companion plan 只允许 deep-reasoning task 创建 | 防止 tracked task 普遍双写，重新生成重复 planning system |
| 合法 companion plan 需要被 active task 显式引用 | 这样 health/doctor 才能区分合法 artifact 与 orphan file |
| companion-plan 适配验证需要拆成 rendered entry、skill projection / patch、installer health 三层 | 单看某一层不够；同时还要注明哪些 patch 是四 target 共有、哪些是 target-specific |

## Task 1 Findings
- 三层模型必须写进核心 policy，而不只是 README，否则投影后的入口文件会继续保留旧语义。
- `docs/superpowers/plans/**` 必须被定义为 companion artifact path only，才能和 `planning/active/<task-id>/` 的 authoritative 语义同时成立。
- companion plan 的边界必须与 sync-back 绑定，否则维护者无法从 active task 记录判断某个 companion plan 是否仍受控。
- README 和 maintenance 文档需要使用同一套术语，否则不同入口与维护视角会产生分歧。

## Durable Conclusions
- companion-plan semantics now have one authority in core policy, while README stays user-facing and compact.
- `docs/plans/*` remains a human-facing documentation path; `docs/superpowers/plans/**` remains a secondary companion artifact path for Deep-reasoning tasks.
- `AGENTS.md` must mirror the same companion-plan rule because it is the Codex workspace entry and therefore a live consumer of the policy.
- maintenance wording should frame projection patches, health checks, and tests as verification targets rather than already-established mechanics.
- `AGENTS.md` needs the same structural `Companion Plan Model` block as source policy so Codex consumes the exact same companion-plan grammar.
- task_plan should keep only durable plan and conclusions; progress should carry review/session history.
- projected `writing-plans` should say two things at once: active task files remain authoritative, and Deep-reasoning companion plans are allowed only as secondary artifacts.
- a companion plan becomes legitimate only when an active task planning file records its path; that reference scan is the mechanical boundary between supported artifact and orphan file.
- health output should preserve inspection visibility for referenced companion plans without escalating them into warnings.
- companion-plan reference scanning should be constrained to canonical task-scoped planning files only: `task_plan.md`, `findings.md`, and `progress.md`.
- the path-match seam should stay explicit enough to reject loose free-text mentions; canonical files should record the path as a standalone path token, a backticked path, or a labeled `path:` style line.
- unreadable canonical planning paths are a health problem, not absence of reference evidence.

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| worktree 目录未被忽略 | 将 `.worktrees/` 加入 `.gitignore` 并单独提交 bootstrap commit |
| 基线测试不干净 | 记录原因，后续只把相关 focused tests 与 `npm run verify` 作为完成门槛 |

## Task 2 Findings
- `superpowers-writing-plans-patch.mjs` 之前的问题不是“路径不对”这么简单，而是把 `docs/superpowers/plans/**` 整体描述成默认禁止路径，和 companion-plan 模型冲突。
- `plan-locations.mjs` 需要返回 richer inspection result，而不是只做目录级别 warning；否则 `health.mjs` 无法区分合法 companion artifact 与 orphan。
- 通过扫描 `planning/active/**/*.md` 中的相对路径引用，可以在不引入额外状态文件的前提下识别 companion plan 是否被 task-scoped planning 接管。
- `docs/plans/**` 仍应维持旧 warning 语义，因为它是 human-facing docs path，不是 companion artifact path。
- `planning/active/**/*.md` 的全量扫描面太宽，会把非 canonical note 文件里的随手文本也算成合法引用。
- companion-plan 的最小可靠 seam 是 canonical planning files 中的明确 path token，而不是任意子串命中。
- 若 canonical planning file 存在但不可读，inspection 必须先报告读取失败；此时 companion plan 的状态只能是 `reference-unknown`，不能继续降级成 orphan。

## Task 3 Findings
- `tests/adapters/templates.test.mjs` 原先只覆盖通用 orchestration 文案，没有机械证明四个 supported targets 都已经切到 `Companion Plan Model`。
- 若要声称“四个 supported targets 已在当前验证层完成 companion-plan 适配”，最小可证据集合是五层闭环：
  - 四个 target 的 `renderEntry()` 输出
  - 四个 target 的 `writing-plans` projection / patch 元数据
  - 已 sync 输出的 projected skill 文案
  - installer health 对 companion-plan 的状态分类
  - `npm run verify` 全量通过
- `tests/adapters/skill-projection.test.mjs` 现在需要承担四 target projection 证据，而不只是沿用既有 codex/copilot 样例。
- health 语义最容易被误测的点有两个：
  - referenced companion plan 不应继续作为 warning
  - canonical planning path 读失败时，问题必须升级到 `health.problems`，不能伪装成 orphan warning
- `planning-with-files` patch 本身仍是 Copilot-specific；其它 targets 的证据是“skill 被 materialize 且不带这块 patch”，不能把这一层误写成四 target 都有相同 patch。

## Task 3 Durable Conclusions
- 现在仓库内已经有针对 `codex`、`copilot`、`cursor`、`claude-code` 四个 supported targets 的 rendered-entry 断言，且全部要求 companion-plan 语义而不是旧的默认禁止语义。
- 现在仓库内也有针对 `codex`、`copilot`、`cursor`、`claude-code` 四个 supported targets 的 `writing-plans` projection 断言：四者都 materialize 到各自 skill root，并都带同一个 `Harness Superpowers writing-plans location patch` marker。
- projected skill 内容层的直接文本证明目前来自两处：
  - `tests/adapters/sync-skills.test.mjs` 对 synced `writing-plans` 输出内容的断言
  - `tests/adapters/sync-skills.test.mjs` / `tests/adapters/skill-projection.test.mjs` 对 Copilot-specific `planning-with-files` patch 的断言
- `planning-with-files` patch 不是四 target 共有机制；它只在 Copilot 上被 patch，其它 targets 沿用 materialized baseline skill。这个边界现在已经被测试明确记录。
- installer health 的测试现在明确区分：
  - referenced companion plan = `planLocations` 中 `companion-plan` / 不进入 warnings
  - orphan companion plan = warning
  - unreadable canonical planning path = problem
  - root-level planning files 与 `docs/plans/**` = warning
- `npm run verify` 通过意味着这些 companion-plan 断言已经纳入仓库级验证门槛，而不是只停留在临时 focused test。

## Resources
- `/Users/jared/HarnessTemplate/.worktrees/superpowers-plan-artifact-model/planning/active/superpowers-plan-artifact-model/task_plan.md`
- `/Users/jared/HarnessTemplate/.worktrees/superpowers-plan-artifact-model/harness/core/policy/base.md`
- `/Users/jared/HarnessTemplate/.worktrees/superpowers-plan-artifact-model/harness/installer/lib/superpowers-writing-plans-patch.mjs`
- `/Users/jared/HarnessTemplate/.worktrees/superpowers-plan-artifact-model/harness/installer/lib/plan-locations.mjs`
- `/Users/jared/HarnessTemplate/.worktrees/superpowers-plan-artifact-model/harness/installer/lib/health.mjs`
- `/Users/jared/HarnessTemplate/.worktrees/superpowers-plan-artifact-model/tests/adapters/templates.test.mjs`
- `/Users/jared/HarnessTemplate/.worktrees/superpowers-plan-artifact-model/tests/adapters/sync-skills.test.mjs`
- `/Users/jared/HarnessTemplate/.worktrees/superpowers-plan-artifact-model/tests/adapters/skill-projection.test.mjs`
- `/Users/jared/HarnessTemplate/.worktrees/superpowers-plan-artifact-model/tests/installer/health.test.mjs`

## Visual/Browser Findings
- 本任务不需要浏览器验证；重点是 policy projection、skill patch 和 test/health 语义一致性。
