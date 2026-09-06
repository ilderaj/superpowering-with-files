# V1.3 执行入口：可靠完成

状态：V1.3 实现、投影、全量静态门禁、E7 行为回放和 E8 独立审阅均已完成并由 Chief 接受，当前发布目标为 1.3.0。纠偏后七条 Luna high 回放为 7 pass、0 fail：Q1/Q2/R1/R2/H2/H2-delivery 沿用原 run，H1 在改为 default/native continuation 后单独重跑；旧 strict-visible unavailable 观察仍保留但不再是 V1.3 release gate。实施基线：`2ecdfc9bf99cbce4e9a128d613a78fe8ae150c42`、包版本 1.2.0；2026-09-06 工作区另有未提交变更，见实施计划 E0。上位范围：[三版路线图](../../research/swf-60d-20260906/roadmap.md)。本包覆盖 13-A/B/C/D。

本包专门供 Terra/Luna 执行：架构选择已经固定，执行者按包做局部修改，不需要重读 60 天历史、不需要 Astra 接管，也不应重新设计生命周期。

## 阅读顺序

1. 本页：确定当前包及授权范围。
2. [实施计划](implementation.md)：固定接口、精确文件范围、实现步骤、依赖与回滚。
3. [测试与验证计划](verification.md)：逐项输入/期望、可执行命令、模型行为回放和退出门槛。
4. [派单与恢复模板](handoff.md)：将一个包交给下一执行者时复制使用。

这四份文档是设计与证据说明。执行状态只记录在当次绑定的 `task_plan.md`、`findings.md`、`progress.md`，不在多个文件中维护独立状态。

## 已固定的产品决定

- 修正文档和 CLI 帮助的真实矛盾，不新增目录形式的 verify 报告功能。
- 新增 **`trio status --summary --task <id>`**：纯只读摘要；原 `status`、`next` 和写命令保持兼容。
- 摘要从当前 Trio 中显式记录的目标、决定、制品、未完项、恢复条件提取；缺失、重复或无法可靠识别时返回缺失/歧义，不猜测。
- 不改 `close` 的 Chief 接受/停止前置条件，不让摘要决定授权、归档、自动继续或外部动作。
- 在现有方法中补充恢复与交付约定；不增加 capability、默认角色队列或第四任务文件。
- 用六个主要场景 Q1/Q2/R1/R2/H1/H2 及交付受限变体做真实行为回放；静态测试与真实模型运行分开验收。
- 普通工作遵循 Astra 简化后的 direct/native-first。显式 `visible_worker_required` 保留为兼容路由，由确定性测试验证 fail-closed，不要求 V1.3 恢复或等待专用 Host bridge。

## 执行队列

| 波次 | 包 | 推荐执行者 | 产出 |
| --- | --- | --- | --- |
| 0 | E0 基线；E1 冻结案例 | Luna high | 基线记录、去敏案例与参考标准 |
| 1 | E2 CLI 帮助；E3 摘要纯函数 | E2 Luna high；E3 Terra high 或 Luna high | 准确帮助、可验证摘要提取 |
| 2 | E4 CLI 接入；E5 恢复与交付方法 | Terra high 或 Luna high | 可用只读入口、方法与语义检查 |
| 3 | E6 产品/旧规划对齐 | Luna high | 当前路线入口与历史条目处置 |
| 4 | E7 集成/回放；E8 验收/交接 | Luna high；必要时 Terra high 修复 | 精确结果、剩余限制和可交付候选 |

默认一个主执行者串行推进；E2/E3 文件无交叉时最多两个并行包。E4 与 E2 共用 CLI 文件，必须串行。E5 与 E6 都涉及读者入口，由主执行者统筹。review 可由另一个 Luna high 有界检查，角色不要求固定昂贵模型。

本次可调用子代理目录列出了 Luna，未列 Terra；因此本轮核对使用 Luna high。以后 Host 确认支持 Terra 时才请求 `main/gpt-5.6-terra`；不可用就用 Luna high，不悄悄升到 Astra。模型请求记录与实际模型认证分开。

## 完成标准

E0–E8 的相关验证通过，默认 CLI 无回归，摘要不写文件，旧任务无需迁移，六场景及交付受限变体的实际模型行为满足标准。只有静态/确定性测试通过时，状态为 `candidate_code_verified`，不能声称完整 V1.3 验收。某个案例确实依赖而 Host 未提供能力时才保留待验证；可选 strict-visible 能力缺失不阻塞普通版本验收。

规划请求本身不执行代码修改、全局 adopt、提交或发布。后续获得实施授权后，直接依此推进该范围；已有效的授权不逐包重新索取。提交、合并、发布及全局目标变更仍使用当时已有授权与 Host 规则。
