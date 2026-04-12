# README 改造计划

## Goal
在保留现有 README 核心事实与两张 Mermaid 图的基础上，把 README 改成一份面向 human 和 agents 都清晰、精简、可执行的 HarnessTemplate 使用说明。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: README 改造已完成并通过仓库验证与 Markdown 结构检查。

## Scope
- In scope:
  - 重写 README 信息结构，让项目定位、核心能力、安装路径、整合策略更清楚。
  - 明确新用户如何把 Harness 固化到本地 workspace 或 user-global。
  - 明确已有本地规则用户如何在 workspace 或 user-global 范围内选择完全替换、更新、增强整合、包裹低层规则等路径。
  - 强调 HarnessTemplate、Superpowers、Planning with Files 是更高层次的本地整合规则集合，优先在项目内生效，不必默认污染全局规则。
  - 保留并校验现有两张 Mermaid 图；仅在不准确或结构调整需要时更新。
  - README 正文按仓库规则使用英文，planning 文件和对话使用中文。
- Out of scope:
  - 初始规划轮不修改 README；用户随后点名 `executing-plans` 后进入执行。
  - 不修改 installer、policy、adapter、tests 或 vendored upstream 内容。
  - 不创建 `docs/superpowers/plans/` 长期计划文件；本任务长期状态仅保存在本目录三份 planning 文件里。

## Finishing Criteria
- README 能在开头用少量段落说明 HarnessTemplate 的作用和主要能力。
- Quick Start 能清楚区分新用户和已有本地规则用户，并同时覆盖 workspace 与 user-global 固化。
- 整合说明覆盖 replace、update、enhance、wrap 四种方式，并解释何时使用 workspace、user-global、both scope。
- Mermaid 图仍然保留，且与当前实现一致。
- README 结构比现状更易扫读，不引入冗长的新章节。
- 完成后运行适合文档改造的验证：README diff review、Markdown 结构检查、必要时运行现有 docs/adapter 相关测试。

## Proposed README Structure
1. `# HarnessTemplate`
   - 用两到三句话说明：这是一个项目内优先的 agent/human governance harness，用统一规则投影到 Codex、Copilot、Cursor、Claude Code。
   - 保留现有核心模型 bullet，但压缩措辞。
2. `## What It Gives You`
   - 列出主要功能：durable task memory、temporary Superpowers reasoning、multi-agent entry files、upstream baselines、workspace/user/both scopes。
3. `## Quick Start`
   - `New workspace`：install workspace、sync、doctor。
   - `New user-global baseline`：install user-global 或 both，让新项目继承全局 Harness baseline。
   - `Existing local rules`：先审查现有 workspace 与 user-global 入口文件，再选择 replace / update / enhance / wrap。
   - 强调默认推荐项目内生效；如果用户要统一本机多项目行为，再使用 user-global 或 both。
4. `## Integration Modes`
   - `Replace`：用 Harness rendered entry files 接管目标入口。
   - `Update`：保留现有安装范围，用 HarnessTemplate 刷新或升级该范围的 Harness 规则。
   - `Enhance`：保留已有低层 skills / rules，让 Harness 成为上层路由与治理规则。
   - `Wrap`：把 Carnival 或其他本地规则路由当作下层能力，由 Harness 决定何时调用。
5. `## Workflow`
   - 保留第一张 Mermaid 图。
   - 根据最终措辞检查是否需要把节点改成更贴近“workspace-first / higher-level harness”的表达。
6. `## Installation Structure`
   - 保留四层结构和第二张 Mermaid 图。
   - 检查图中的 `sync renders entry files`、skill projection 未完全接入等节点是否仍准确。
7. `## Entry Files`
   - 保留表格，但把解释写得更像安装后核对清单。
8. `## Upstream Updates`
   - 保持现有流程，压缩说明，突出“只更新 upstream baselines，不改 core governance”。
9. `## Commands and Docs`
   - 合并现有 `Common Commands` 与 `Documentation`，减少尾部碎片感。

## Execution Plan After Approval
### Phase 1: README rewrite
- [x] 修改 README 的 intro、feature summary、Quick Start、Integration Modes。
- [x] 保持英文正文、简洁句式和 agent-friendly 指令格式。

### Phase 2: Diagram review
- [x] 对照当前 README 的两张 Mermaid 图和本次新结构。
- [x] 只在语义不准确时更新图，不为了风格重画。

### Phase 3: Verification
- [x] Review README diff，确认没有过度扩写或删除关键事实。
- [x] 检查 Markdown heading 顺序和 Mermaid block 完整性。
- [x] 视最终改动范围运行现有相关验证；如果只改 README，至少做文档结构检查。

### Phase 4: Sync planning state
- [x] 更新 `findings.md` 和 `progress.md`。
- [x] 若 README 改造完成且验证通过，将状态改为 `closed` / `Archive Eligible: yes`，但不自动归档。

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 保留两张 Mermaid 图 | 用户明确认为图不错，且当前图覆盖 workflow 与 installation structure 两个核心解释面。 |
| 新增 `Integration Modes` | 这是当前 README 最缺的部分，能同时服务新用户和已有本地规则用户。 |
| `Integration Modes` 覆盖 replace / update / enhance / wrap | 用户明确补充 README 也要讲替换、更新或整合到本地 user-global，而不只是 workspace 固化。 |
| 默认强调 workspace-first，同时明确 user-global 和 both | 用户希望新建本地项目或 workspace 可在项目内生效，但也需要支持本地全局替换、更新和整合。 |
| 不使用 `docs/superpowers/plans/` | 仓库 AGENTS.md 要求 durable state 只写入 task-scoped Planning with Files。 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` command not found | 1 | 按仓库降级规则使用 `rg --files` 定位文件。 |
| `zsh:1: unmatched \"` during planning grep | 1 | 改用单引号包裹的简化 `rg` pattern 后核对通过。 |
