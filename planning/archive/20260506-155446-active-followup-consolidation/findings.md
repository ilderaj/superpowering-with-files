## Follow-up Matrix

### Batch A: 报告与分析收口

- `cursor-official-load-model-research`
  - 当前状态：官方文档事实已采集，尚未整理成最终结论
  - 下一步：输出 source-backed 研究结论，明确 Cursor 官方 load model / rules / skills / hooks 的真实边界
  - 完成信号：形成可 review 报告，附官方链接

- `global-rule-context-load-analysis`
  - 当前状态：预算与上下文面已完成测量，关键结论已形成
  - 下一步：把当前测量结果整理成 ledger-style 报告，明确默认 profile、lazy-load 与 hook payload 风险建议
  - 完成信号：报告定稿，建议可直接进入 review

- `gstack-harness-comparison-analysis`
  - 当前状态：对比素材和优势/短板已经写入 findings
  - 下一步：收口成最终对比报告，区分“值得借鉴”和“保持差异”的点
  - 完成信号：形成最终汇报，不再继续扩展源码采样

- `rtk-support-feasibility-analysis`
  - 当前状态：前置调研与 open questions 已基本完成，报告交付 phase 仍在进行
  - 下一步：完成基于官方文档 / GitHub issues / PR 的可行性与 ROI 报告
  - 完成信号：Phase 5 收口，给出明确推荐路径

- `typemint-skill-duplication-check`
  - 当前状态：结构性根因已收敛到 Copilot symlink projection 与客户端去重行为叠加
  - 下一步：输出最终结论，并给出“是客户端显示问题、还是 projection 设计问题”的边界判断
  - 完成信号：形成可 review 结论稿

### Batch B: 实现收口与治理建议

- `backup-fix-session-investigation`
  - 当前状态：恢复来源与错误归因已查清，缺少最终治理建议
  - 下一步：把根因、恢复路径和预防建议写成可执行治理方案
  - 完成信号：调查任务从“事实收集”收口到“治理建议”

- `cross-ide-hook-capability-alignment`
  - 当前状态：实现、文档与验证看起来已完成，但 authoritative planning 还未完成最终 closeout
  - 下一步：核对 merge/push/companion sync 是否都已在 planning 中反映，再判断是否转 `waiting_review` 或直接 close
  - 完成信号：task memory 与真实完成状态一致

### Batch C: 长尾运行与基础设施治理

- `post-upstream-automation-followups`
  - 当前状态：verify repair 已完成，当前主要依赖首次 scheduled run 观察窗口
  - 下一步：观察计划任务首次稳定运行，记录结果并决定是否关闭 follow-up
  - 完成信号：scheduled run 结果被记录，后续仅保留常规运维

- `harness-template-foundation`
  - 当前状态：Task 5 schema review 仍在进行
  - 下一步：先收紧 `state.schema.json` 顶层与 target 结构，再决定是否进入后续 foundation tasks
  - 完成信号：Task 5 review 闭环，基础元数据/schema 达到稳定状态

## 执行顺序建议

1. 先做 Batch A，尽快减少“分析已完成但任务仍 active”的噪音。
2. 再做 Batch B，把已经接近完成的实现/调查任务收口。
3. 最后保留 Batch C，等待自动化观察窗口与基础设施评审自然收尾。
