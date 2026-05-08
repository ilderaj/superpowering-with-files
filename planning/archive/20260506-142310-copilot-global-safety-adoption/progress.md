# Progress Log

## Session: 2026-04-28

### Phase 1: 现状核对
- **Status:** complete
- Actions taken:
  - 读取流程技能并确认本任务按 tracked task 处理。
  - 扫描 `planning/active/` 现有任务，确认需要新建独立 task id。
  - 初步检索到 README 仍展示 `user-global --profile=safety --hooks=on`，需要与当前 adopt/global 目标重新对齐。
  - 读取 `README.md`、`docs/install/copilot.md`、`harness/installer/commands/adopt-global.mjs`、`harness/installer/lib/adoption.mjs` 与 `tests/installer/adoption.test.mjs`。
  - 形成局部假设：空 user-global bootstrap 默认包含 Copilot，是当前“全局不要开启 Copilot”的唯一实现面冲突。
- Files created/modified:
  - `planning/active/copilot-global-safety-adoption/task_plan.md` (created)
  - `planning/active/copilot-global-safety-adoption/findings.md` (created)
  - `planning/active/copilot-global-safety-adoption/progress.md` (created)

### Phase 2: 收敛方案
- **Status:** complete
- Actions taken:
  - 先在 `tests/installer/adoption.test.mjs` 增加 bootstrap 边界断言，确认默认 targets 应排除 Copilot。
  - 运行 `node --test tests/installer/adoption.test.mjs`，观察红测只失败在 Copilot 默认 target 上。
  - 在 `harness/installer/lib/adoption.mjs` 把空 bootstrap 默认 targets 收敛为非 Copilot 集合。
- Files created/modified:
  - `tests/installer/adoption.test.mjs` (modified)
  - `harness/installer/lib/adoption.mjs` (modified)

### Phase 3: 实施与验证
- **Status:** complete
- Actions taken:
  - 更新 `README.md`：user-global adopt 默认不再暗示全局 Copilot，Safety 段只保留 workspace 推荐路径。
  - 更新 `docs/install/copilot.md`：明确 Copilot repo-local 优先，user-global 仅显式 opt-in。
  - 更新 `harness/installer/commands/adopt-global.mjs` 帮助文本，写明空 bootstrap 排除 Copilot。
  - 运行聚焦验证与静态错误检查。
- Files created/modified:
  - `README.md` (modified)
  - `docs/install/copilot.md` (modified)
  - `harness/installer/commands/adopt-global.mjs` (modified)

### Phase 4: 实机校准与 live 状态收敛
- **Status:** complete
- Actions taken:
  - 按用户新目标回改 `tests/installer/adoption.test.mjs`、`harness/installer/lib/adoption.mjs`、`README.md`、`docs/install/copilot.md` 与 `harness/installer/commands/adopt-global.mjs`。
  - 运行 `node --test tests/installer/adoption.test.mjs tests/installer/policy-render.test.mjs`，确认“default bootstrap 含 Copilot”与“默认不是 safety”两条边界同时通过。
  - 在真实 HOME 上执行 `./scripts/harness install --scope=user-global --targets=all --projection=link --profile=always-on-core --skills-profile=full --hooks=on`、`./scripts/harness sync`、`./scripts/harness adopt-global` 与 `./scripts/harness doctor --check-only`，把 live baseline 恢复到包含 Copilot。
  - 复核真实 HOME 下的 Copilot 文件：baseline entry 与 planning/superpowers hooks 存在，但 safety 相关文件不存在。
- Files created/modified:
  - `.harness/state.json` (updated live state)
  - `.harness/adoption/global.json` (updated live receipt)

### Phase 5: workspace-only safety 硬保护与最终 apply
- **Status:** complete
- Actions taken:
  - 先在 `tests/installer/commands.test.mjs` 添加 “install rejects safety profiles outside workspace scope”。
  - 再在 `tests/installer/adoption.test.mjs` 添加 “adopt-global rejects user-global safety profiles”，并把 preserve case 改回 non-safety profile。
  - 首轮红测失败，证明当前缺口真实存在：`install` 会先进入 sync，`adopt-global` 会保留 user-global safety state。
  - 在 `harness/installer/commands/install.mjs` 增加 workspace-only safety 校验；在 `harness/installer/lib/adoption.mjs` 增加 user-global safety 拒绝逻辑。
  - 更新 `README.md` 与 `docs/install/copilot.md`，把“global safety 不支持、workspace-only”写成明确口径。
  - 运行 `node --test tests/installer/commands.test.mjs tests/installer/adoption.test.mjs`，24 passing, 0 failing。
  - 依次执行最终 apply：
    - `./scripts/harness adopt-global`
    - `./scripts/harness adoption-status`
    - `./scripts/harness doctor --check-only`
    - `./scripts/harness install --scope=workspace --targets=copilot --projection=link --profile=safety --skills-profile=full --hooks=on`
    - `./scripts/harness doctor --check-only`
  - 复核 global 与 workspace 边界：
    - global：Copilot baseline 文件存在，但没有 safety 文件
    - workspace：`.github/hooks/safety.json`、`pretool-guard.sh`、`session-checkpoint.sh` 存在
- Files created/modified:
  - `tests/installer/commands.test.mjs` (modified)
  - `tests/installer/adoption.test.mjs` (modified)
  - `harness/installer/commands/install.mjs` (modified)
  - `harness/installer/lib/adoption.mjs` (modified)
  - `README.md` (modified)
  - `docs/install/copilot.md` (modified)

### Phase 6: roadmap 记录与安全默认态回归
- **Status:** complete
- Actions taken:
  - 用户提出新的产品判断：safety 当前增益不足，默认应关闭；先修 `global baseline + workspace safety overlay` 与正常 tools 误拦截问题，再考虑重开。
  - 检查仓库内没有现成 roadmap 文档，于是新建 `docs/roadmap.md`。
  - 在 roadmap 中记录三项正式迭代项：overlay 模型、false-positive reduction、default safety posture re-evaluation。
  - 在 README Docs 列表中加入 roadmap 入口。
  - 根据用户提供的终端输出确认：已重新执行 `user-global + always-on-core + targets=all` 的 install/sync/adopt-global/doctor。
  - 直接复核当前 repo 状态：`.harness/state.json` 为 `user-global + always-on-core + full + all targets`，`.harness/adoption/global.json` 为 success/in_sync，`.github/hooks/` 为空。
- Files created/modified:
  - `docs/roadmap.md` (created)
  - `README.md` (modified)

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Red check | `node --test tests/installer/adoption.test.mjs` | 默认 bootstrap 不应带 Copilot；旧实现应失败 | 首轮失败，diff 显示实际多了 `copilot` | ✓ |
| Focused installer/docs validation | `node --test tests/installer/adoption.test.mjs tests/installer/policy-render.test.mjs` | adopt-global 边界与 README / Copilot 文档口径一致 | 13 passing, 0 failing | ✓ |
| Static diagnostics | `get_errors` on changed files | 无新增错误 | No errors found | ✓ |
| Focused installer/docs validation after target restore | `node --test tests/installer/adoption.test.mjs tests/installer/policy-render.test.mjs` | default bootstrap includes Copilot while docs still render correctly | 13 passing, 0 failing | ✓ |
| Live user-global convergence | `./scripts/harness install --scope=user-global --targets=all ... && ./scripts/harness sync && ./scripts/harness adopt-global && ./scripts/harness adoption-status` | real user-global state includes Copilot and final status is `in_sync` | final targets=`claude-code,codex,copilot,cursor`, status=`in_sync`, Copilot baseline files present | ✓ |
| Live doctor | `./scripts/harness doctor --check-only` | no health failures after live convergence | `Harness check passed.` | ✓ |
| Workspace-only safety enforcement | `node --test tests/installer/commands.test.mjs tests/installer/adoption.test.mjs` | user-global/both safety rejected; workspace safety still allowed by existing slices | 24 passing, 0 failing | ✓ |
| Final global adopt verification | `./scripts/harness adopt-global && ./scripts/harness adoption-status && ./scripts/harness doctor --check-only` | global baseline includes Copilot and stays non-safety | `status=in_sync`, `policyProfile=always-on-core`, user-global Copilot safety files absent | ✓ |
| Final workspace safety enablement | `./scripts/harness install --scope=workspace --targets=copilot --profile=safety --hooks=on && ./scripts/harness doctor --check-only` | workspace Copilot safety enabled with local hooks projected | `.github/hooks/safety.json`, `pretool-guard.sh`, `session-checkpoint.sh` all exist; doctor passed | ✓ |
| Final baseline restore | user-provided `install --scope=user-global --targets=all --profile=always-on-core ... && sync && adopt-global && doctor --check-only` | repo returns to global baseline with no workspace safety residue | `adoption-status=in_sync`, `.github/hooks/` empty, `Harness check passed.` | ✓ |
| Roadmap artifact check | `docs/roadmap.md` exists and README links it | roadmap becomes a stable place to track this deferred work | roadmap file created; README docs list updated | ✓ |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
