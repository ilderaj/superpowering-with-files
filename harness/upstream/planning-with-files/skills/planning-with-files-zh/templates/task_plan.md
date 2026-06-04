# 任务计划：[简要描述]

## 目标
[用一句话描述最终状态]

## Routing Decision
- Selected Route: tracked-lean
- Route Reason: 此任务需要持久 planning，但暂时还不需要 deep reasoning。
- Promotion Trigger: none
- Route Evidence Surface: planning + summary

## 当前阶段
阶段 1

## 各阶段

### 阶段 1：需求与发现
- [ ] 理解用户意图
- [ ] 确定约束条件和需求
- [ ] 将发现记录到 findings.md
- **状态：** in_progress

### 阶段 2：规划与结构
- [ ] 确定技术方案
- [ ] 如有需要创建项目结构
- [ ] 记录决策及理由
- **状态：** pending

### 阶段 3：实现
- [ ] 按计划逐步执行
- [ ] 先将代码写入文件再执行
- [ ] 增量测试
- **状态：** pending

### 阶段 4：测试与验证
- [ ] 验证所有需求已满足
- [ ] 将测试结果记录到 progress.md
- [ ] 修复发现的问题
- **状态：** pending

### 阶段 5：交付
- [ ] 检查所有输出文件
- [ ] 确保交付物完整
- [ ] 交付给用户
- **状态：** pending

## Execution Contract
<!--
  WHAT: 仅在任务需要结构化拆解时定义重任务执行单元。
  WHY: 让执行意图保留在权威 planning 中，而不是散落在备注或进度 prose 中。
  WHEN: 重型 tracked task 填写此节；轻任务可以省略或保留为 stub。
-->

### Unit: unit-01
- Kind: implementation
- Status: planned
- Scope:
  - Do: 描述这个执行单元负责的精确交付物
  - Not do: 描述这个执行单元不应吸收的相邻工作
- Owner Mode: inline
- Allowed Ops:
  - Files: 列出允许触达的精确文件或路径类别
  - Commands: 列出允许执行的精确命令
  - External effects: 除非明确允许，否则写 none
- Dependencies:
  - 列出依赖的 unit id 或证据引用
- Verification Plan:
  - 列出能证明这个单元成立的精确命令或证据要求
- Return Artifacts:
  - 写出具体产物名称，例如 patch、report、note 或 follow-up
- Integration Target:
  - 明确结果要回写到哪里，例如 progress.md 或 findings.md
- Exit Criteria:
  - 定义从 done 进入 verified 的精确条件

## 关键问题
1. [待回答的问题]
2. [待回答的问题]

## 已做决策
| 决策 | 理由 |
|------|------|
|      |      |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
|      | 1       |         |

## 备注
- 随着进度更新阶段状态：pending → in_progress → complete
- 做重大决策前重新读取此计划（注意力操纵）
- 记录所有错误，避免重复
