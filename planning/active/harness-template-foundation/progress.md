# 进展：Harness Template Foundation

## 2026-04-10

- 创建 task-scoped planning 文件
- 确认工作目录为空，尚未初始化 Git
- 开始检查本机 Codex / Cursor / Copilot / Claude Code 配置结构
- 确认现有 Harness 实际上已经是“主源 + 共享技能 + IDE 投影”的多层结构
- 识别出当前最关键的设计决策：未来模板的唯一事实源应该放在哪里
- 用户已确认：主源方案选择 `IDE-neutral`
- 用户已确认：运行模式选择双模式，v1 默认项目内安装
- 用户已确认：v1 必须支持 Codex / Copilot / Cursor / Claude Code
- 用户已确认：superpowers 与 planning-with-files 采用基线副本 + 上游更新的混合集成
- 用户已确认：模板必须完全去个人化
- 用户已确认总体架构：`Core + Adapters + Installer`
- 已完成设计确认：
  - 仓库结构与单一事实源边界
  - core 内容模型与统一规则主源拆分
  - adapter 投影策略与 link / materialize / render 判定
  - installer / CLI 命令分工与状态文件思路
  - README / docs 分层策略

## 2026-04-11

- 用户确认验证策略
- 准备汇总为完整执行计划框架，覆盖抽取、验证、梳理、README、通用化、GitHub 仓库与分支策略
- 写入设计 spec：`docs/superpowers/specs/2026-04-11-harness-template-design.md`
- 完成 spec 自检并修正个人路径示例与开放决策歧义
- 根据 spec 写出 implementation plan review/index 和 4 个子计划
- 完成 plan 自检：
  - 无占位符关键词
  - 无旧 scope 术语
  - 无个人绝对路径字面量
- 未执行任何 implementation task
- 用户已确认 implementation plan review
- 等待选择执行方式：subagent-driven 或 inline execution
- 用户选择 Subagent-Driven execution
- 已将 plans 基线提交到 `main`
- 已创建并切换到 `dev` 分支开始 implementation
- 派发 Core plan Task 1：添加 Node test harness
- Task 1 已完成：新增 `package.json`，并通过 `npm test` 验证无测试时为 0 tests / pass
- Task 1 code quality review 发现 `verify` 过早引用未来 `doctor.mjs`
- 已修复计划和实现：Task 1 先保持 `verify = node --test`，后续 installer plan Task 7 再加入 doctor check
- Task 1 spec compliance 和 code quality 复审均通过
- Task 2 已完成：新增 depersonalization test `tests/core/no-personal-paths.test.mjs`
- 初版扫描命中 `planning/active/...` 中的研究路径，已按计划把 `planning` 加入忽略目录
- `npm run test:core` 已通过
