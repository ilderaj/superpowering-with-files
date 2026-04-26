# Findings: Worktree Naming Governance

## Verified Findings

- `harness/installer/commands/worktree-preflight.mjs` 当前只负责 base recommendation 与 safety checks；它不生成 branch name，也不生成 worktree directory name。
- `harness/upstream/superpowers/skills/using-git-worktrees/SKILL.md` 直接消费外部给定的 `BRANCH_NAME` 来拼 `path` 与 `git worktree add ... -b "$BRANCH_NAME"`；skill 本身没有定义一个 deterministic naming algorithm。
- `harness/upstream/planning-with-files/scripts/planning_paths.py` 已经把 `planning/active/<task-id>/` 视为 authoritative task identity；其 `resolve_task_id()` 优先级是 explicit task id / 环境变量 / 当前 git branch / `default`，并非 prompt 首句。
- `docs/maintenance.md` 已明确规定：如果规则需要 mechanical support，应落在 `harness/installer`，而不是 patch vendored upstream skills；`harness/upstream/**` 视为 upstream baseline，会在 update 时被替换。
- Harness 当前 projection 体系支持对 materialized skill 做 repo-owned patch：`harness/core/skills/index.json` 可声明 `childPatches`，`harness/installer/commands/sync.mjs` 根据 patch type 调用本地 patch helper。这给 `using-git-worktrees` 增加本地 naming guidance 提供了稳定落点。
- 当前仓库里已经有“任务 slug + agent prefix”的 branch 实践，但没有统一 contract；例如 `codex/cross-ide-projection-fix`、`fix/checkpoint-adoption`、`copilot/using-subagents-for-plans` 都是人为约定。
- live repo smoke 验证显示：一旦仓库同时存在多个 `Status: active` 的 task，`worktree-preflight` 不能只依赖“单 active task”自动解析；必须支持显式 `--task <task-id>` 把 naming helper 锁定到目标任务。
- namespace 为空时不能被归一化成 `default/` 前缀；branch name 应在无 namespace 时退回 canonical label 本体。

## Problem Summary

- 现状没有一个 repo-owned naming source of truth。
- 当宿主或 agent 缺乏 naming rule 时，branch / worktree 名容易退化成 prompt 首句、技能调用模板或临时摘要。
- 这会带来两个具体问题：
  - 多个任务的 worktree 名可读性差，看不出语义。
  - 多次以相似 prompt 开工时，名字容易重复或高度相似，尤其在 Copilot 这类没有内建 task/worktree identity contract 的场景更明显。

## Options Considered

### Option A: 只用 `task-slug`
- 优点：名字短、可读。
- 缺点：同一任务多 worktree 立刻撞名；无法表达“这是第几次隔离执行”。

### Option B: 只加 policy 文案，不提供 helper
- 优点：最小改动。
- 缺点：依赖 agent 自己实现，最容易在不同 IDE / 模型 / skill 版本下漂移；解决不了“prompt 首句启发式”问题。

### Option C: Canonical run label + repo-owned helper + projected skill patch
- 方案：引入 canonical label `YYYYMMDDHHMM-<task-slug>-NNN`；`task-slug` 来自 planning task id；由 Harness CLI 统一生成；通过 `using-git-worktrees` projected patch 与 policy/docs 把它传播到各 target。
- 优点：
  - 唯一性和可读性兼得。
  - 把 durable task identity 建立在 planning 上，而不是 prompt 上。
  - 不需要改 upstream baseline，可通过 repo-owned projection patch 跨 IDE 生效。
- 缺点：需要新增 helper 命令、patch type 与一组回归测试。

## Recommendation

- 采用 Option C。
- 将 `planning/active/<task-id>/` 作为 task identity source of truth。
- 将 `YYYYMMDDHHMM-<task-slug>-NNN` 定义为 canonical run label。
- worktree basename 使用 canonical label；branch name 使用可选 namespace 包裹的 canonical label，例如：
  - `202604281159-codex-app-compatibility-design-001`
  - `copilot/202604281159-codex-app-compatibility-design-001`
  - `fix/202604281159-codex-app-compatibility-design-001`
- `worktree-preflight` 复用 helper 时应保留 base selection ownership，并允许 `--task <task-id>` 覆盖 naming task resolution；这既不改变 base recommendation，也避免多 active task 仓库里的歧义失败。

## Design Constraints To Preserve

- 不改 `harness/upstream/**`。
- 不引入新的长期 task-memory location；只可复用 `planning/active/<task-id>/`。
- Codex App 这类宿主已经在自己的 sandbox/worktree 模型里工作时，新规则应作为 manual branch creation / fallback naming 的补充，而不是强制替代宿主行为。
- `worktree-preflight` 仍然保持 base selection 的 owning abstraction；naming helper 可以被 preflight 调用或并列调用，但不要把 base selection 与 naming state 混成一个隐式黑盒。

## Planned Scope

- 新增 repo-owned naming helper（建议新命令 `./scripts/harness worktree-name`）。
- 扩展 `worktree-preflight` 的 text / JSON 输出，显示建议的 canonical label 和 branch name。
- 为 projected `using-git-worktrees` 增加 Harness patch，要求优先使用 helper 生成的名字，而不是 prompt 摘要。
- 同步 policy / maintenance / safety / install docs 与 adapter tests。

## Non-Goals

- 不回写或重命名已有 branch / worktree。
- 不尝试做跨 clone / 跨机器的全局唯一编号分配。
- 不引入 PR naming、commit naming、archive naming 的统一机制。
- 不强制所有已有手工命名分支迁移到新格式。
