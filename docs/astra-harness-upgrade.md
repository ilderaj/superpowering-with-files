# Astra harness 改造与验收说明

此前 Astra 改造由用户明确批准，实施范围包括源码、skills/AGENTS、测试、README、PR 合并、main/dev 收敛和本地全局采用。既有授权适用于当时范围；仓库保护和 Host 控制仍然有效。

本轮 Root 路由迁移的文档编辑与验收仅覆盖 Root/Codex；`plugins/dsh/**` 及其测试、投影和发布证据不在本轮范围内。既有 DSH 文字保留为历史/独立能力说明，是否退役另行决定。

## 依据与目标

2026-09-06 阅读了 [OpenAI 最新模型指南](https://developers.openai.com/api/docs/guides/latest-model)和 [Eric Provencher 的 Astra skills 讨论](https://x.com/pvncher/status/2095991462416490862)。采纳的方向是缩短入口、按需披露方法、明确完成条件、按风险验证，以及根据任务选择模型和 effort。保留稳定的授权、任务恢复、证据和委派约束。

目标是减少无效流程和上下文负担，同时维持准确完成工作的约束。模型的长期准确率、成本和延迟需要真实工作样本持续验证；本文的有限场景回放不构成生产性能结论。

## 已实现的结构

1. **共享核心。** AGENTS 和 Trio 入口只保留目标、路由、授权、完成和证据边界。直接执行通过相关验证即可完成；委派主执行仍需整合验收。快速任务不因工具次数自动建立 Trio。
2. **渐进披露。** 六个治理入口保持身份不变，增加五个明确列举的参考文件。投影、安装备份、回滚、插件打包、工作区和 DSH assets 都包含这些引用。
3. **模型与角色解耦。** Astra、Sol、Terra、Luna 可作为 Chief、执行者或有明确范围的 helper；支持 bare ID 以及已支持的 Host 前缀。显式模型与 effort 保留到 handoff。历史未指定请求的 DeepSeek 默认值保持兼容；旧 Chief 包省略 effort 时仍解释为 max。新分派应显式选择 model/effort，再冻结任务包。
4. **按需要委派。** 普通工作可直接完成或使用有收益的 native helpers。遇到 legacy visible input 时按 Root 迁移契约 fail-closed，并显式 rebind 后再恢复内部派发。子任务不能扩大范围和权限；跨模型 effort 不能用一个虚假的统一排名隐式比较。
5. **方法与治理分开。** TDD、代码审查、代码设计、debugging、domain modeling 作为可选方法源码纳入仓库。保留真实需求测试、Standards/Spec 两轴和复现证据，去掉无条件追问、并行和文档创建要求。
6. **规划去仪式化。** PWF 按入口、恢复、决策和里程碑更新，不再强制每两次操作记录、三次失败停工或每步重读。保留三文件权威、时间真实性、外部内容可信边界和恢复信息。
7. **清理与采用。** 三个旧 wrapper（risk-assessment-before-destructive-changes、safe-bypass-flow、office-work-quality）的职责由 safety/office 承接。采用命令备份后更新八个可选/辅助 skill 目录并退休这三个精确目录；不改动其他用户 skills。Matt 原始 corpus 保持锁定，修改放在 overlay，独立插件通过 Host 管理器采用后再清理重复本地副本。

架构和思维路径见 [README](../README.md) 中的两张 Mermaid 图。

## 兼容性与证据边界

- 小任务优先留在当前模型；Luna/低或中 effort 适合有明确边界的工作，Terra 可作为普通实现起点，Sol 适合更复杂的编码，Astra 适合困难推理和整合。这些是可调整的起点，不是固定角色表。
- Astra API effort 为 low、medium、high、xhigh、max；不默认使用 max。Host 的 ultra 需要显式支持证据，不能自行映射成 API 参数；子任务不允许 ultra。
- `requested` 是意图，`actual` 需要 Host authenticated 证据。普通 CLI 返回、静态 persona 或配置文件不会自动升级为实际模型证明。
- DSH 的 stock `start` 不能承载 reasoning effort。显式 effort-bearing dispatch 需要 Host 提供 `startWithModelSelection`；缺少时返回可恢复的 blocker。声明与 host-claimed 都不等于 authenticated。
- Corleone 固定模型 renderer 留作历史兼容；全局采用可使用继承模型的 role 文件，避免 persona 在 Host 中锁死 Flash。新会话才会重新加载这些配置。
- Root 路由迁移：`visible_worker_required` 仅作为 legacy input 保留。Root active routing 只有 direct/native-first 与 `manual_pending`；任一 Host operation 收到该输入都返回 `manual_pending`，blocker 为 `legacy_visible_worker_required_retired`，不恢复 Host bridge，也不做 native fallback。只有在当前 Trio authority 下显式 rebind `primaryExecution=default` 才能重新派发。用户明确要求独立可见任务时，使用 Host 的 user-owned task workflow，该流程不属于内部 routing。
- 安装 receipt 只证明安装字节，不能替代 Trio、模型证据或用户验收。自动化测试、真实模型请求、GitHub 合并和全局采用分别核验。

## 验证组成

- 路由：四模型、多种 effort、Host 别名、错误参数、严格 visible、native 范围、跨模型显式 allowance。
- 投影：旧六入口升级、引用缺失/已拥有/未拥有的组合、原内容校验、父目录替换、符号链接、硬链接、备份与失败回滚。
- 方法：短描述、完整引用、输入 provenance、diff 范围和可选行为语义。
- 可选采用：默认只读、显式 takeover、备份 readback、无关 skills 保留、幂等、修改冲突和单写者锁。
- 整体：`npm run verify:all`、DSH 的 `verify`、插件 build/smoke、独立代码审查，以及最终 Git refs 和全局文件 digest 检查。
- 模型请求回放：四个请求模型各八个场景，输入和结果契约见 [model-policy](../tests/evals/model-policy/README.md)。这种带选项的单轮回放只验证有限指令边界。

## 上线与恢复

实施从隔离 worktree 进行，保留原工作区的未提交内容和未发布历史。PR 合并采用普通 GitHub 路径，随后使用 fast-forward 统一 origin/main、origin/dev、local main、local dev；不重写远端历史。

全局采用顺序为：核对备份与范围 → source 及工作区投影一致 → `harness sync --dry-run` → `sync` → `sync --check` / `doctor --check-only` → 可选 skills 采用 → 插件和角色采用 → 再次核对字节及四个分支 head。遇到与最初快照不一致的本地编辑，先保留并重新判断，不用强制恢复覆盖。

恢复依赖各采用步骤的原文件备份和安装 receipt。安装器不承诺跨文件瞬时原子可见，也不承诺进程崩溃或断电自动回滚。原始 upstream source lock 和历史报告不会因本次提示词优化被重写。

## 本次技术验收结果（2026-09-06）

- 七个常用入口正文合计从 49,654 bytes 降至 15,887 bytes，减少 **68.0%**。该指标只测正文大小；按需 references、模型 tokenizer 和 Host 注入开销另计。
- 最终 `npm run verify:all`、DSH `verify` 均以 exit 0 完成；插件 build/smoke 通过，四个请求模型的八场景回放均为 8/8。
- 独立审查发现并修复了 Host 参数别名丢失、旧冻结包 effort 漂移、全局备份路径逃逸、回滚失败丢失恢复文件，以及安装摘要/首次 ownership 记录问题。修复后复核无剩余阻断项。
- 原工作区在技术验收时仍与开始时的未提交变更备份一致；GitHub landing 与全局采用在实际发生后另行核验，不能由上述测试代替。
