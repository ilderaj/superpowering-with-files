# Economic Execution Routing 执行结论报告

Task: `economic-execution-routing-20260809`
执行时间: 2026-08-10（Asia/Shanghai）
执行性质: 可见执行 worker 生产变更 + 主验证;结果为 candidate,待 Chief 验收
执行现场: Host 创建的执行 worktree（`/Users/jared/.codex/worktrees/e8eb/SuperpoweringWithFiles`,HEAD `ae9f2c4`,clean 基线）;未提交、未推送、未开 PR、未全局 adopt、未归档 Trio

## 1. 结论摘要

Slices A–E 全部完成,计划内允许路径内的实现与测试证据齐全:经济路由/角色/复杂度/结构化 override 进入纯路由决策与只读输出;goal 契约、Host 模型策略与 packet 摘要绑定 fail-closed;ChiefOps 作为自包含治理伴生文件进入投影与打包;上游注册表收敛为 planning-with-files 单一来源并带语言变体 curation;十个冗余 runtime 模块与其专属测试退役,十一个 installer 消费者直连 Trio Core authority。

核心验证:`verify:trio` 251/251 + import-boundaries final;`verify:upstream-refresh` 83/83（66+16+1）;`verify:core` 307/307;`plugin:verify` 24/24;`plugin:smoke` exit 0;Slice D focused 120/120;全树 601 中 597 通过,剩余 4 项失败在 pristine HEAD 上可复现（见 §6,非本任务回归）。

## 2. Retained / Retired / Absorbed 决策

**Retained（保留为来源-owned）:**
- `harness/trio/core/authority.mjs` 作为唯一 authority 实现;11 个 installer 命令直连导入。
- `harness/trio/governance/chiefops/SKILL.md`（来源-owned 治理伴生文件）;`harness/upstream/planning-with-files` + `harness/core/upstream-overlays/planning-with-files`。
- `scripts/ci/lib/upstream-*.mjs` 通用解析/刷新/pr 机制;`trio` 命令的 `next --dry-run` 只读经济输出。

**Retired（退役,全部在计划允许路径内）:**
- `harness/runtime/` 十个模块:`authority-root`、`decision-plane-router`、`execution-contract`、`policy-evaluator`、`policy-signature`、`redaction`、`root-policy`、`source-root`、`verification-contract`、`write-plan`（authority-root 原为 Core authority 的 re-export shim）。
- 对应专属测试:`tests/installer/{authority-root,decision-plane-router,execution-contract,verification-contract}.test.mjs` 与 `tests/runtime/{policy-signature,redaction-source-root,registry-policy,root-policy}.test.mjs`。
- 上游 vendor 树:`harness/upstream/superpowers/`、`harness/upstream/mattpocock-skills/`;`sources.json` 与 `.source-lock.json` 收敛为唯一 `planning-with-files` 键。
- PWF 语言变体 `planning-with-files-ar/-de/-es` 由 update 流程确定性裁剪（候选 curation 失败则目标不变,fail-closed）。

**Absorbed（吸收进 Trio Core）:**
- runtime authority 解析逻辑并入 `harness/trio/core/authority.mjs`;goal 契约（`assertGoalContract`）与 Host 模型策略（`resolveHostModelPolicy`）并入 `harness/trio/core/routing.mjs`;`tests/trio/authority-parity.test.mjs` 重写为纯 Core authority 测试并承载退役 inventory 断言。

## 3. 结果清单（Resulting Inventories）

- **Trio 生产模块（final inventory,10 项）**:`harness/trio/core/{authority,read,routing,store}.mjs`、`compatibility/legacy-reader.mjs`、`hosts/{generic,codex}.mjs`、`config.mjs`、`projection.mjs`、`installer/commands/trio.mjs`（import-boundaries `--milestone final` 实测一致）。
- **投影/打包清单**:entry policy + 四个 Trio skills + 一个 ChiefOps 治理伴生（`skills/chiefops/SKILL.md`）,packages/plugin-kit 与 docs/install、docs/release 描述一致。
- **上游注册表**:`harness/upstream/sources.json` / `.source-lock.json` 均只有 `planning-with-files`;vendor 根只剩 `planning-with-files/`。
- **运行时目录**:`harness/runtime/` 为空（仅空目录留存,无文件）。

## 4. 依赖与结构性证明

- `harness/upstream/superpowers`、`harness/upstream/mattpocock-skills` 及带引号的 `superpowers`/`mattpocock-skills` 键在 `harness/installer/**`、`scripts/ci/**`、`tests/automation/**` 中零命中（rg exit 1）。
- 十个退役 runtime 模块在 `harness/**`、`scripts/**`、`tests/**` 中无任何 importer（唯一命中是 `tests/installer/checkpoint.test.mjs` 的 fixture rm,属计划允许的 fixture 豁免,非 importer）。
- PWF 语言 allow-list:en/zh/zht 保留、ar/de/es 在 update 后被裁剪,allow-list 测试阻止未知变体并保证裁剪失败时目标不变。

## 5. No-Host 限制与未来 external-adapter seam

- **No-Host 限制**:请求配置为 opencode-go/deepseek-v4-flash / xhigh;actual provider/model/effort 无 authenticated Host 证据,一律如实报告 `unknown`。任何 Host 生命周期/实际身份声明都只能停在 `manual_pending`;本地路由契约不构成动态 child 权限或跨线程 goal 控制。
- **验证面修复**:`scripts/ci/verify-upstream-refresh.mjs` 的 child 输出此前被 `execFile` 静默吞掉（2026-06-22 的 streaming 修复在现 Node 上未生效）;改为 `spawn(process.execPath, ...)` + stdio inherit 后输出真实 streaming,`verify:upstream-refresh` 现可提供逐组计数证据。
- **未来 external-adapter seam**:`scripts/ci/lib/upstream-{heads,resolver,refresh,pr,base-health}.mjs` 与 `harness/installer/commands/{fetch,update,sync}.mjs` 是外部上游/适配器操作面;`harness/trio/governance/chiefops/SKILL.md` 是治理投影的打包 seam。本任务未实现任何外部 Claude Code/PI adapter,也未新增 runner/daemon/registry。

## 6. 未解决 gate 与候选边界

- **Pre-existing（pristine HEAD 可复现,非本任务回归）**:`tests/trio/evaluation.test.mjs` 的 cost-proxy 三项（`deterministic replay`、`context proxy`、`report validator`）在 HEAD 即失败（cost proxy 的 legacy/trio 上下文字节比在 HEAD 上中位数即负值）;`tests/trio/import-boundaries.test.mjs` 以裸 `node --test` 运行缺少 `--milestone final` 参数属既有脚本形态,仓库脚本均显式传参。两者均不在本任务允许路径内,未改动。
- **人类/Host gate 未执行**:commit、push、PR、全局 adopt/sync、Trio 写回/关闭/归档、worktree 删除均未执行,等待 Chief 验收后按协议执行。
- 本报告与计划/审计文档一样只描述来源-owned 事实,不声称外部安装状态。

## 7. 建议验收动作（Chief）

1. 复核三件套 hash 与派单一致（binding）,`git diff --check` 无警告。
2. 复跑 `npm run verify:trio`、`npm run verify:upstream-refresh`、`npm run verify:core`、`npm run verify:plugin`（plugin:verify）与 `npm run plugin:smoke`。
3. 对照计划允许路径核对变更清单与删除清单。
4. 对 §6 的 pre-existing 失败单独裁决（是否另立任务）,不并入本任务验收。
