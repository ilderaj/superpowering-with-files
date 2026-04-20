# Progress Log：Cross-IDE 单一同源收敛审计

## Session: 2026-04-20

### Phase 1: 现状恢复与相关历史任务复核
- **Status:** complete
- Actions taken:
  - 读取仓库 `AGENTS.md`。
  - 读取 `using-superpowers` 与 `planning-with-files` 技能说明。
  - 扫描 `planning/active/` 中相关历史任务。
  - 读取 `cross-ide-projection-audit`、`projection-health-analysis`、`copilot-instructions-path` 中与本次问题相关的结论。
- Files created/modified:
  - `/Users/jared/HarnessTemplate/planning/active/cross-ide-single-source-consolidation/task_plan.md`
  - `/Users/jared/HarnessTemplate/planning/active/cross-ide-single-source-consolidation/findings.md`
  - `/Users/jared/HarnessTemplate/planning/active/cross-ide-single-source-consolidation/progress.md`

### Phase 2: 当前实现审计
**Status:** complete
- Actions taken:
  - 检查 `harness/core/metadata/platforms.json`、`harness/core/skills/index.json`。
  - 检查各 adapter manifest。
  - 检查 `README.md`、`docs/install/*`、`docs/architecture.md` 中的当前路径声明。
  - 确认当前实现仍以平台专属 skill roots 为主，只对 Codex 使用 `.agents/skills`。

### Phase 3: 官方文档对照
- **Status:** complete
- Actions taken:
  - 查阅 OpenAI Codex 官方 docs，确认 `.agents/skills`、`AGENTS.md`、`.codex/hooks.json`、`.codex/config.toml`。
  - 查阅 VS Code / GitHub Copilot 官方 docs，确认 `.github/copilot-instructions.md`、`AGENTS.md`、`CLAUDE.md`、`.instructions.md`、`.github/skills`、`.agents/skills`、`.github/hooks/*.json`、`~/.copilot/hooks`。
  - 查阅 Cursor 官方 docs 与 changelog，确认 `.cursor/rules`、User Rules 在 settings、`AGENTS.md` 支持、Agent Skills 与 `SKILL.md` 支持。
  - 查阅 Claude Code 官方 docs，确认 `CLAUDE.md`、`.claude/skills`、`.claude/settings.json` hooks 模型。

### Phase 4: 收敛原则与执行计划
**Status:** complete
- Durable conclusions:
  - `skills` 存在局部通用标准，`Codex + Copilot` 可收敛到 `.agents/skills` / `~/.agents/skills`。
  - `instructions` 适合以 `AGENTS.md` 为通用 authoring source，再为 Claude 补 `CLAUDE.md` projection。
  - `hooks` 与 settings/config 不适合按物理路径做单一同源，只适合按 canonical schema + projection 收敛。
- Actions taken:
  - 读取 `writing-plans` 技能要求并按其 header/step 结构撰写详细 implementation plan。
  - 生成 companion artifact：`/Users/jared/HarnessTemplate/docs/superpowers/plans/2026-04-20-cross-ide-single-source-consolidation.md`
  - 将 companion-plan path、summary、sync-back status 写回本 task 的 planning files。

### Phase 5: Subagent-Driven execution
- **Status:** in_progress
- Worktree base:
  - Worktree base: dev @ 536772e56070dbb8dd10556db48edef69d4cbdf8
- Actions taken:
  - 创建隔离 worktree：`$HOME/.config/superpowers/worktrees/HarnessTemplate/codex-cross-ide-single-source-exec`
  - 基线 `npm run verify` 初次因 companion plan 含绝对用户路径触发 `tests/core/no-personal-paths.test.mjs` 失败。
  - 将 companion plan 中的 worktree 命令改为使用 `$HOME/...`，避免 author-specific absolute path。
  - 修正后重新运行 `npm run verify`，结果：154 pass, 0 fail。
  - Task 1 implementer 完成 Copilot shared skill roots 的 metadata 与 focused tests 改动。
  - Task 1 spec review 首轮指出缺少 Copilot user-global skill-root 断言；修复后复审通过。
  - Task 1 code quality review 首轮指出 `scope=both` 覆盖缺失与一个过度放松的断言；修复后复审通过。
  - 主执行 worktree 独立复跑 `node --test tests/installer/paths.test.mjs tests/adapters/skill-profile.test.mjs tests/adapters/skill-projection.test.mjs`，结果：31 pass, 0 fail。

### Task 1 summary
- **Status:** complete
- Changed files:
  - `harness/core/metadata/platforms.json`
  - `tests/installer/paths.test.mjs`
  - `tests/adapters/skill-profile.test.mjs`
  - `tests/adapters/skill-projection.test.mjs`
- Verification:
  - Spec review: approved
  - Code quality review: approved
  - Focused tests: `node --test tests/installer/paths.test.mjs tests/adapters/skill-profile.test.mjs tests/adapters/skill-projection.test.mjs` -> 31 pass, 0 fail

### Task 2 summary
- **Status:** complete
- Changed files:
  - `harness/installer/lib/copilot-planning-patch.mjs`
  - `tests/adapters/skill-projection.test.mjs`
  - `tests/adapters/sync-skills.test.mjs`
  - `docs/compatibility/copilot-planning-with-files.md`
- Review loop:
  - Spec review 首轮指出 shared-root-first 顺序与测试约束不足；已修正。
  - Code quality review 首轮指出 env override 被降级为 fallback；已改为显式 override 继续优先，同时保留 shared root 作为默认路径。
  - 最终终局 review：approved。
- Verification:
  - Focused tests: `node --test tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs` -> 19 pass, 0 fail
  - 新增行为级测试覆盖：
    - 显式 env override 生效
    - shared roots 缺失时回退到 legacy Copilot workspace root

### Task 3 summary
- **Status:** complete
- Changed files:
  - `harness/installer/lib/skill-projection.mjs`
  - `harness/installer/commands/sync.mjs`
  - `tests/adapters/sync-skills.test.mjs`
- Review loop:
  - Spec review 首轮指出 `coalesceSkillProjections()` 不应额外排序 `targets` 与 `patches`；已改为保留首次出现顺序，仅做去重。
  - 修复后 spec review：approved。
  - Code quality review：approved；仅记录未来扩展边界为低风险空白，不构成当前阻断。
- Verification:
  - Focused tests: `node --test tests/adapters/sync-skills.test.mjs` -> 9 pass, 0 fail
  - 新增行为级测试覆盖：
    - shared `.agents/skills/planning-with-files` 在 manifest 中只保留一条 `kind === 'skill'` entry
    - `coalesceSkillProjections()` 在去重时保留 `targets` 与 `patches` 的首次出现顺序

### Task 4 summary
- **Status:** complete
- Changed files:
  - `harness/core/policy/platform-overrides/copilot.md`
  - `README.md`
  - `docs/architecture.md`
  - `docs/install/copilot.md`
  - `docs/install/codex.md`
  - `tests/adapters/templates.test.mjs`
  - `tests/installer/policy-render.test.mjs`
- Review loop:
  - Spec review 通过，确认 Copilot override、docs、以及 thin-profile 边界都已切到 shared `.agents/skills` 叙述，且未改动 `harness/core/policy/base.md` / `harness/core/policy/entry-profiles.json`。
  - Code quality review 首轮指出新增测试仍对固定措辞有依赖，且没有反向断言旧 Copilot roots 已清理；已收敛为语义断言并补上旧 `.github/skills` / `~/.copilot/skills` 的排他检查。
  - 修复后 code quality review：approved。
- Verification:
  - Focused tests: `node --test tests/adapters/templates.test.mjs tests/installer/policy-render.test.mjs tests/core/no-personal-paths.test.mjs` -> 11 pass, 0 fail
  - 新增行为级测试覆盖：
    - Copilot rendered entry 继续保持 thin，同时指向 shared `.agents/skills` roots
    - README / architecture / install docs 同步声明 Codex + Copilot shared roots，并反向防止旧 Copilot skill roots 回流

### Implementation verification
- Shared-root projection suite: PASS
- Entry/hook/command invariant suite: PASS
- `npm run verify`: PASS
- Decision-path drift check: no change to `harness/core/policy/base.md`, `harness/core/policy/entry-profiles.json`, `harness/installer/lib/hook-projection.mjs`, or `harness/installer/lib/hook-config.mjs`

### Integration and release handoff
- Feature branch merged back to local `dev` as merge commit `64e4033` with no manual conflict edits required.
- Post-merge verification on `dev`: `npm run verify` -> 169 pass, 0 fail.
- Cleaned up feature isolation:
  - removed worktree `$HOME/.config/superpowers/worktrees/HarnessTemplate/codex-cross-ide-single-source-exec`
  - deleted branch `codex/cross-ide-single-source-exec`
- Pushed integrated branch: `origin/dev`
- Opened review PR: https://github.com/ilderaj/superpowering-with-files/pull/22

## Errors

| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-04-20 | `fd` command not found | 1 | 改用 `find` 与 `rg` |
