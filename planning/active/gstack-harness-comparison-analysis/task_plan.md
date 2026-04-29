# gstack 与 Harness 范围能力对比分析

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 目标

分析 `https://github.com/garrytan/gstack` 的 harness 范围与能力，和本仓库 Harness 对比，明确 gstack 的优势、可借鉴方向、对齐风险与后续优化放线议题。

## 约束

- 不改代码。
- 只产出研究、对比和规划文件。
- 结论尽量基于 gstack 公开仓库内容、本仓库现有文档和实际结构。
- 后续可能围绕本 planning 继续做对齐、抄作业和优化放线分析。

## 阶段

| 阶段 | 状态 | 完成标准 |
| --- | --- | --- |
| Phase 1: 建立研究上下文 | complete | 读取本仓库 Harness 文档、结构和相关规则，记录对比维度。 |
| Phase 2: 调研 gstack | complete | 获取 gstack README、源码/配置结构和能力边界，记录发现。 |
| Phase 3: 对比分析 | complete | 按范围、能力、体验、治理、安全、可移植性等维度形成对照。 |
| Phase 4: 提炼优势与借鉴议题 | complete | 明确 gstack 相对优势、本 Harness 优势、可抄作业点和后续分析队列。 |
| Phase 5: 交付总结 | in_progress | 更新 findings/progress，向用户汇报关键结论与文件位置。 |

## 对比维度草案

- 目标用户与产品定位
- 安装与启动路径
- Agent/IDE 支持范围
- 规则、技能、hook、模板的投影模型
- 持久任务状态与上下文恢复
- 安全边界与 destructive 操作治理
- 多模型/多 provider 支持
- CLI/命令体验
- 可观测性、调试、验证能力
- 文档与可理解性
- 可复制到本 Harness 的设计

## 当前结论

gstack 和本 Harness 处在不同层级：gstack 是端到端 AI software factory，强在 workflow 产品化、真实浏览器 runtime、设计/QA/发布闭环、学习复利和用户传播；本 Harness 是跨 IDE/agent governance substrate，强在统一政策源、任务记忆权威性、平台原生投影、冲突/ownership 管理、上下文预算和安全治理。

## 后续工作队列

1. Host Config Alignment：对比 `harness/adapters/*` 与 gstack `hosts/*.ts`，设计 typed adapter/host schema。
2. Workflow Skill Roadmap：将本 Harness 能力包装成 plan/debug/review/verify/finish/release lanes。
3. Browser Capability Strategy：评估集成 gstack browser、browser-use/browser-harness-js 或定义外部 browser contract。
4. Memory Taxonomy：设计 task memory、project learnings、domain knowledge、workflow checkpoints、cross-machine brain 的边界。
5. Safety UX Comparison：比较 gstack `/careful`/`/freeze`/`/guard` 与本 Harness safety profile。
6. Skill Eval Harness：为 projected skills 增加行为级 e2e/eval。
7. Team Mode Governance：研究 `team-init required|optional` 是否适合 Harness。
8. Release Lane：拆解 `/ship`、`/document-release`、`/land-and-deploy`、`/canary` 的可借鉴部分。
