# 任务计划：Cursor / OpenCode Harness 审计

## 目标
只通过仓库实际证据、可执行测试结果与官方文档，审计本项目的能力范围、实现目的、当前缺陷，并判断当前 harness 对 Cursor 是否真实生效、以及是否可直接 adopt 到 OpenCode。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 当前阶段
阶段 5

## 各阶段

### 阶段 1：任务建档与范围确认
- [x] 检查现有 active task，避免与历史审计混用
- [x] 为本次审计建立独立 planning 目录
- [x] 记录审计边界与事实源约束
- **状态：** complete

### 阶段 2：项目能力范围与实现目的盘点
- [x] 阅读仓库总览、架构、安装与 adoption 文档
- [x] 识别项目声明能力与真实实现范围
- [x] 提炼“支持对象 / 目标对象 / 实际落地对象”
- **状态：** complete

### 阶段 3：Cursor 支持链路审计
- [x] 搜索 Cursor 相关 projection、adapter、docs、tests 与 runtime 证据
- [x] 用仓库内命令或测试确认可验证部分是否真的生效
- [x] 对照 Cursor 官方文档判断哪些结论成立、哪些仍缺人肉验证
- **状态：** complete

### 阶段 4：OpenCode adoptability 审计
- [x] 搜索 OpenCode 相关适配、抽象层与平台假设
- [x] 对照 OpenCode 官方文档或官方仓库资料判断接入面
- [x] 评估是否可直接 adopt，还是需要特定适配
- **状态：** complete

### 阶段 5：缺陷、盲区与结论交付
- [x] 区分已证实缺陷、验证盲区、不可下结论项
- [x] 整理文件/行号与测试/文档证据
- [ ] 向用户交付中文审计结论
- **状态：** in_progress

## 关键问题
1. 本项目实际提供哪些 harness 能力，目标是解决什么问题？
2. Cursor 相关 harness 是文档层支持、文件投影支持，还是已有可证实的完整生效链路？
3. 在没有人肉测试的前提下，哪些关于 Cursor 的结论可以成立，哪些不能成立？
4. 当前架构是否足以直接 adopt 到 OpenCode，还是必须做平台特定适配？

## 已做决策
| 决策 | 理由 |
|------|------|
| 本任务只做只读分析，不修改代码 | 用户明确要求 |
| 事实源仅限仓库实证、实际测试结果与官方文档 | 用户明确要求“不能猜测” |
| 新建独立 task id | 避免与既有 Claude/Codex/Cursor 历史任务混用 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 新任务目录不存在 | 1 | 创建 `planning/active/cursor-opencode-harness-audit/` 继续 |
| 官方网页抓取工具返回 429 / 无正文 | 2 | 对外部官方证据仅使用本仓库 vendored 官方文档与仓库内显式 official-doc 引用，不扩张结论 |

## 备注
- planning 内容统一使用中文。
- 最终结论必须标注“仓库实证 / 实测 / 官方文档”证据来源。
- 当前开始时间：2026-05-28 13:33:23 UTC+8
