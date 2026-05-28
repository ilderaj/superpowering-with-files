# 任务计划：Codex Harness 能力与适配审计

## 目标
审计本项目的能力范围、实现目的、当前缺陷，以及 Codex 相关 harness 是否完整且符合预期地生效。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 当前阶段
阶段 1

## 各阶段

### 阶段 1：范围界定与证据收集
- [x] 理解用户意图与审计边界
- [x] 确认仓库内相关文档、适配器、测试与策略入口
- [x] 将初步发现记录到 findings.md
- **状态：** complete

### 阶段 2：项目能力与实现目的分析
- [x] 阅读项目总览、架构与安装文档
- [x] 提炼项目声明能力与真实落地对象
- [x] 识别“文档承诺”与“代码实现”的差异
- **状态：** complete

### 阶段 3：Codex harness 生效链路审计
- [x] 检查 Codex adapter、hook、policy、projection 与 runtime 相关实现
- [x] 检查 Codex 安装/兼容性说明
- [x] 检查测试是否覆盖关键生效路径
- **状态：** complete

### 阶段 4：缺陷与风险归纳
- [x] 归纳能力缺口、实现不完整点、验证盲区
- [x] 区分“已证实问题”“高风险推断”“待人肉验证项”
- [x] 将证据与行号整理为可交付结论
- **状态：** complete

### 阶段 5：交付审计结论
- [x] 形成按严重度排序的发现列表
- [x] 补充假设、开放问题与验证状态
- [x] 向用户交付审计结论
- **状态：** complete

## 关键问题
1. 本项目实际支持哪些平台、能力与工作流，哪些只是目标或宣传？
2. Codex 的 harness 生效链路是否闭合，还是只在文档/测试层面声称支持？
3. 缺少人肉测试的情况下，哪些结论可以被代码与测试证据支持，哪些不能？

## 已做决策
| 决策 | 理由 |
|------|------|
| 新建独立 task id，不复用历史 planning | 用户明确要求不要跟以前的混用 |
| 仅做审计分析，不修改代码 | 用户明确要求 |
| 以“文档声明 -> 实现链路 -> 测试证据 -> 残余风险”作为主线 | 便于判断 Codex 支持是否真实闭环 |
| 为 Codex 后续修正与优化单独产出 companion plan | 用户明确要求 review 计划后再决定是否执行 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 初次读取 planning 模板路径失败 | 1 | 改为定位实际投影模板路径继续 |

## 备注
- 所有 planning 内容使用中文。
- 审计过程中如引用代码、文档与测试，最终答复需附具体文件与行号。
- 不对现有代码做任何变更，仅创建本任务 planning 文件。
- Companion plan: `docs/superpowers/plans/2026-05-28-codex-harness-hardening-plan.md`
- Companion summary: 聚焦 Codex 的事实校准、runtime evidence、planning hook 可测性、profile guidance 与文档刷新。
- Sync-back status: synced through 2026-05-28 11:55:18 UTC+8
