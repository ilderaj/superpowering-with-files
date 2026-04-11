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
