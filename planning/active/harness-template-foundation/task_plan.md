# 任务计划：Harness Template Foundation

## 任务目标

把当前本机以 Codex 为主、并已映射到 Cursor / Copilot / Claude Code 的 Harness 机制抽离出来，设计成可复用的 GitHub template 基础模板，覆盖：

- Superpowers 与 Planning with Files 的协同方式
- 统一且可持续维护的 `agents.md` / 规则入口
- 多 IDE / 多 agent 适配与安装策略
- 后续 update / fetch / sync 的可持续更新机制
- 本地仓库与 GitHub 仓库初始化方案

## 完成标准

- 研究本机现有机制并形成事实清单
- 明确模板边界、唯一事实源、适配策略、安装策略、更新策略
- 产出一版设计方案与执行计划
- 设计中明确 README、验证、抽取、通用化与仓库初始化范围

## 当前阶段

1. 研究当前本机 Codex / Cursor / Copilot / Claude Code 的相关目录结构与规则入口
2. 梳理已存在的软链接、全局规则、skills、plugins、hooks、安装方式
3. 基于事实提出 2-3 个模板化方案并给出推荐
4. 与用户逐段确认设计
5. 已进入 implementation plan 分解与执行阶段
6. 已完成 core-policy-upstream 子计划
7. 已完成 installer-cli 子计划
8. 已完成 adapters-projection 子计划
9. 已完成 docs-verification-release 子计划
10. 已完成本地 GitHub repo / main-dev-origin 发布准备

## 已产出

- 设计 spec：`docs/superpowers/specs/2026-04-11-harness-template-design.md`
- spec 自检通过：
  - 无 `TBD` / `TODO` / `FIXME`
  - 无个人绝对路径泄漏
  - 已把关键实现默认值收敛到文档中
- implementation plan review/index：
  - `docs/superpowers/plans/2026-04-11-harness-template-plan-review.md`
- implementation 子计划：
  - `docs/superpowers/plans/2026-04-11-harness-core-policy-upstream-plan.md`
  - `docs/superpowers/plans/2026-04-11-harness-installer-cli-plan.md`
  - `docs/superpowers/plans/2026-04-11-harness-adapters-projection-plan.md`
  - `docs/superpowers/plans/2026-04-11-harness-docs-verification-release-plan.md`

## Companion Plans

- Companion plan: `docs/superpowers/plans/2026-04-11-harness-template-plan-review.md`
- Companion plan: `docs/superpowers/plans/2026-04-11-harness-core-policy-upstream-plan.md`
- Companion plan: `docs/superpowers/plans/2026-04-11-harness-installer-cli-plan.md`
- Companion plan: `docs/superpowers/plans/2026-04-11-harness-adapters-projection-plan.md`
- Companion plan: `docs/superpowers/plans/2026-04-11-harness-docs-verification-release-plan.md`

## 当前子任务

- 当前收尾
- 目标：
  - 记录发布状态
  - 确认验证结果
  - 保持 `main` / `dev` / `origin` 对齐

## 已确认设计前提

- v1 采用 `IDE-neutral` 主源目录，而不是继续以 Codex 目录结构作为唯一中心
- 后续 Codex / Copilot / Claude Code / Cursor 都视为主源的投影目标
- 运行模式采用双模式：
  - v1 默认项目仓库内安装
  - 可选升级到用户目录级 Harness home
- v1 必须完整覆盖：Codex、Copilot、Cursor、Claude Code
- `superpowers` 与 `planning-with-files` 采用混合集成：
  - 模板内自带可工作基线副本
  - 同时保留 fetch / update / sync 上游能力
- 模板必须完全去个人化：
  - 不能依赖 `/Users/jared/...` 这类个人绝对路径
  - 其他用户拿到 GitHub template 后应可直接安装

## Current State
Status: active
Archive Eligible: no
Close Reason:
