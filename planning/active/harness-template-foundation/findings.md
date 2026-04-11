# 研究记录：Harness Template Foundation

## 初始发现

- `/Users/jared/HarnessTemplate` 当前为空目录
- 当前目录还不是 Git 仓库
- 本机未安装 `fd`，后续需以 `rg` / `ls` 为主

## 已确认的本机机制

### Codex

- 全局规则主入口是 `/Users/jared/.codex/AGENTS.md`
- 该文件已经承载了当前 hybrid workflow policy：
  - `planning-with-files` 是长期记忆与任务持久化系统
  - `superpowers` 仅在复杂场景下作为临时推理工具使用
  - 强制把持久化任务状态写入 `planning/active/<task-id>/`
- `/Users/jared/.codex/superpowers` 是 superpowers 仓库克隆
- `/Users/jared/.codex/skills/planning-with-files` 不是独立副本，而是软链接到 `/Users/jared/.agents/skills/planning-with-files`

### Shared skills 源

- `/Users/jared/.agents/skills/` 是当前共享技能源之一
- `/Users/jared/.agents/skills/planning-with-files` 是 planning-with-files 的实际源码目录
- `/Users/jared/.agents/skills/superpowers` 软链接到 `/Users/jared/.codex/superpowers/skills`
- 这说明当前已经存在“Codex 仓库 + .agents 聚合”的双层结构

### Copilot

- 全局规则入口不是 Codex 的 `AGENTS.md`，而是 `/Users/jared/.copilot/copilot-instructions.md`
- Copilot 明确声明：
  - 不假设会直接读取 `~/.codex/AGENTS.md`
  - 不假设会自动发现 `~/.agents/skills/`
  - 需要同时在 `~/.copilot/skills/` 下存在必需技能
- `/Users/jared/.copilot/skills/` 中：
  - 多数 superpowers 技能是软链接到 `/Users/jared/.codex/superpowers/skills/*`
  - `planning-with-files` 是本地复制目录，不是软链接
- Copilot 本地版本的 `planning-with-files` 文案明确写了：
  - 保留工作流本体
  - 刻意移除不兼容的 frontmatter hooks
- `/Users/jared/.copilot/config.json` 中安装了 `obra/superpowers` 插件，但同时又存在你自己的本地桥接层，说明插件安装并不足以承载当前 Harness 的全部约束

### Claude Code

- `/Users/jared/.claude/CLAUDE.md` 很薄，只是 `@RTK.md`
- `/Users/jared/.claude/skills` 直接软链接到 `/Users/jared/.codex/skills`
- Claude 这边更依赖：
  - `settings.json` 里的 hooks
  - 已安装插件（包括 `superpowers@claude-plugins-official`）
- `/Users/jared/.claude/agents/` 当前为空，说明你的现有 Harness 并没有把长期主规则入口落在这里

### Cursor

- `/Users/jared/.cursor/skills/planning-with-files` 软链接到 `/Users/jared/.agents/skills/planning-with-files`
- Cursor 有独立的：
  - `/Users/jared/.cursor/rules/`
  - `/Users/jared/.cursor/skills/`
  - `/Users/jared/.cursor/skills-cursor/`
- 当前看到的规则中，`rtk-always.mdc` 是单独的 Cursor 规则投影
- 说明 Cursor 更像“原生 skills/rules 并存”的平台，需要单独适配投影层

## 初步结构判断

- 当前体系不是单一目录结构，而是：
  - Codex 主控层
  - `.agents/skills` 共享技能层
  - 各 IDE 的本地适配 / 投影层
- `planning-with-files` 比 `superpowers` 更接近跨平台稳定内核
- `agents.md` / `copilot-instructions.md` / `CLAUDE.md` / Cursor rules 之间并不等价，不能指望只靠一个文件原样通吃
- 真正需要模板化的，不只是文件内容，还包括：
  - 主源布局
  - 适配投影策略
  - 安装 / 更新命令
  - 跨平台软链接或复制回退策略

## 用户已确认的方向

- 模板 v1 选择 `IDE-neutral` 主源目录
- 不再把 Codex 目录结构直接视为最终唯一主源
- 目标是让多个 IDE / agent 从同一个中立主源生成、链接或投影各自所需文件
- 运行模式选择双模式：
  - 默认以项目仓库内模式工作，便于分享和模板化
  - 允许用户后续切换或扩展到用户级 Harness home
- v1 强覆盖客户端范围：
  - Codex
  - Copilot
  - Cursor
  - Claude Code
- `superpowers` 与 `planning-with-files` 的集成方式选择混合模式：
  - 仓库内提供可工作的基线副本，保证开箱可用
  - 同时允许从上游拉取更新，便于你持续维护与分发
- 模板要求完全去个人化：
  - 不能把 `/Users/jared/...` 这种机器特定路径带入设计
  - 所有目标路径都必须由安装器根据用户环境解析

## 已确认的总体方案

- 采用 `Core + Adapters + Installer` 架构
- 仓库中保留一个 IDE-neutral 的 core 作为唯一事实源
- 为 Codex、Copilot、Cursor、Claude Code 各自提供 adapter / projection 逻辑
- 由安装器负责：
  - 询问用户要适配的 IDE / agent
  - 选择软链接、复制或生成策略
  - 写入对应平台要求的入口文件
  - 后续执行 fetch / update / sync

## 待补充

- Codex 全局规则入口与 superpowers / skills / plugins 的实际布局
- Cursor / Copilot / Claude Code 侧的目录结构、软链接关系、可复用程度
- 各工具对全局规则、项目级规则、skills、plugins、hooks 的支持差异
- 哪些能力可以模板内固化，哪些只能通过安装器或软链接投影

## Task 2 记录

- depersonalization 测试必须忽略 `planning` 目录，否则会把保留的本机研究证据误判成模板泄漏
- 当前测试仅约束模板与实现文件中的作者专属绝对路径字符串

## Task 3 记录

- 最新全局 policy 已包含 planning lifecycle/archive guard，抽取到 core policy 时必须保留，不能只抽取 superpowers/planning 协同规则
- superpowers plans path 被项目 policy 覆盖：长期计划必须回写 active task 的三份 planning 文件，除非用户明确要求写入 `docs/superpowers/plans/`
- Task 3 的 `base.md` 使用平台中立表述，保留完整硬约束；shell/token guidance 单独拆为 snippet，并同步在 base policy 中保留

## Task 6 记录

- `harness/core/skills/index.json` 现在是 v1 skill source metadata 的事实源
- `planning-with-files` 对 Copilot 明确走 `materialize`，其余四个平台当前都按 `link` 设计
- `harness/upstream/sources.json` 记录了 `superpowers` 的 git source 和 `planning-with-files` 的 local initial import source
- core tests 已扩展到 2 个：作者路径泄漏检查 + skill index 元数据检查

## Task 7 记录

- `harness/upstream/superpowers` 已通过浅 clone 获取初始 baseline，并移除了 `.git`
- `harness/upstream/planning-with-files` 已从本机共享 skill 目录复制初始 baseline
- 当前 core tests 在 vendored baselines 存在的情况下仍保持通过

## Installer Task 1 记录

- `scripts/harness` 采用 repo-root 解析后直接 `exec node .../harness.mjs`，满足后续命令扩展需要
- dispatcher 目前只做命令选择与统一错误出口，没有提前引入 metadata/state 依赖，避免给 Task 2-7 造成返工
- 两层 review 都确认当前 CLI skeleton 与 plan 一致，且不会明显阻碍后续 `install/doctor/sync/status/fetch/update` 实现

## Installer Task 2 记录

- 仅有 roundtrip 测试不够，state helper 必须在这一层就拒绝非法 state；否则 `install/doctor/sync/status` 都会各自补一遍校验
- `writeState` 的原子写不能只做到 “temp + rename”，temp 文件名还必须避免同进程同毫秒并发碰撞
- 当前 `state.mjs` 已补齐三层保障：
  - state shape validation
  - atomic write with temp file + rename
  - collision-resistant temp filename with `randomUUID()`
- 当前 `tests/installer/state.test.mjs` 已覆盖：
  - default state
  - roundtrip
  - invalid stored state
  - invalid write payload
  - constant timestamp 下的 concurrent write regression

## Installer Task 3 记录

- `metadata.mjs` 当前保持最小职责：只读取 `platforms.json` 并做 scope / target 归一化，不提前掺入路径解析和安装逻辑
- code quality review 认为当前测试仍偏 happy path，但这不阻塞 Task 3；schema drift 或非 repo-root 场景可在后续 installer 集成阶段补

## Installer Task 4 记录

- 路径 resolver 不能维护一份独立的 entry file 真源；否则后续 `platforms.json`、resolver、tests 会一起漂移
- 当前 `paths.mjs` 已改成：
  - 从 `harness/core/metadata/platforms.json` 读取 `entryFiles`
  - 仅保留最小 scope root 规则
  - 对 unknown target 直接抛错
- 当前 `tests/installer/paths.test.mjs` 已覆盖：
  - workspace path
  - user-global path
  - both path
  - unknown target rejection

## Installer Task 5 记录

- `fs-ops` 这一层必须安全处理“旧 target 已经是 symlink”的场景；否则从 `link` 切换到 `portable` 时会静默污染源文件
- 当前 `fs-ops.mjs` 已在 render / materialize / link 前统一 `replaceTargetPath`
- 当前 `tests/installer/fs-ops.test.mjs` 已覆盖：
  - template render
  - materialize copy
  - writeRenderedFile replaces symlink target
  - materializeFile replaces symlink target

## Installer Task 6 记录

- `install.mjs` / `status.mjs` 本身没有问题；真正冲突的是计划里要求把 `.harness/state.json` 提交进仓库
- `.harness/state.json` 是本地机器状态，内容天然包含 workspace / home 绝对路径，不能进 template Git 历史
- 当前仓库修正策略：
  - `.harness/` 加入 `.gitignore`
  - `tests/core/no-personal-paths.test.mjs` 忽略 `.harness`
  - 允许 `install` 在本地生成 state，但不把它视为模板内容

## Installer Task 7 记录

- `verify` 不能依赖 `doctor --check-only`，因为 `doctor` 检查的是本地安装状态，不是仓库自身可重复验证面
- 当前稳定做法是：
  - `verify` 只跑 repo-scoped tests
  - `doctor` 保持为独立的安装健康检查命令
- `doctor` 的个人路径检测必须是泛化规则，不能只匹配单一用户名；当前已覆盖：
  - `/Users/<name>/`
  - `/home/<name>/`
  - `C:\\Users\\<name>\\`

## Adapters Task 1 记录

- 四个平台入口模板现在都只保留：
  - 模板标题
  - `{{basePolicy}}`
  - `{{platformOverride}}`
- 这保证 adapter 层不复制 policy 正文，只负责投影外壳

## Adapters Task 2 记录

- manifest 现在是每个平台投影规则的第一层事实源，明确了：
  - 模板路径
  - platform override 路径
  - workspace/global entries
  - skill projection strategy
- Copilot 的 `planning-with-files` 已按设计固化为 `materialize`，其余当前保持 `link`

## Adapters Task 3 记录

- adapter manifest 可以保留 `workspaceEntries` / `globalEntries` 作为描述性配置，但 runtime path resolution 不能把它们当成第二真源
- 当前 `entriesForScope` 已改为直接委托给 `paths.mjs`
- 当前 `tests/adapters/templates.test.mjs` 已覆盖：
  - renderEntry combines base policy and platform override
  - entriesForScope uses installer path metadata instead of adapter entry arrays

## Adapters Task 4 记录

- `sync` 测试不能永久污染 repo 根目录；即使测试必须用 `process.cwd()` 作为 root，也必须恢复 `AGENTS.md` 和本地 state
- `.harness/state.json` 必须保持 ignored local state；如果它被 Git tracking，任何一次 sync/install 测试都会把机器路径重新带回模板历史
- `verify` 必须包含 adapters tests，否则 adapters-projection 阶段的回归不会被默认验证覆盖

## Adapters Task 5 记录

- skill projection lookup 必须 fail-closed：
  - unknown skill 抛错
  - unknown target 抛错
  - unsupported strategy 抛错
- `projection.default` 只能作为已知 target 的显式默认策略，不能掩盖拼写错误或平台配置漂移
- 当前 Copilot `planning-with-files` 返回 `materialize`，Codex `superpowers` 返回 `link`

## Task 5 记录

- Task 5 仅涉及静态元数据与本地状态 schema，文件内容必须严格按 plan 中的 JSON 结构落地
- `platforms.json` 需要保持平台键与入口文件列表的顺序，避免后续导出和测试出现不必要差异
