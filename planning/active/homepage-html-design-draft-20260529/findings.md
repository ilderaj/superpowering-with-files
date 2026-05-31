# Findings

## 项目定位

- `superpowering-with-files` 是 local coding-agent workflows 的治理 harness。
- 它把一套共享政策渲染为多个 IDE/agent 平台的原生 instruction files、projected skills 与可选 hooks。
- `planning-with-files` 是唯一持久任务状态来源；`superpowers` 是临时、可选的深度推理层。
- 支持目标包括 Codex、GitHub Copilot、Cursor 和 Claude Code；Gemini CLI 当前不是支持安装目标。

## 核心价值

- 统一多平台 agent 行为，而不是为每个 IDE 维护一份漂移的规则。
- 用 task-scoped markdown 文件保留 durable task state，让长任务、跨会话恢复和验证有依据。
- 将 deep reasoning 限制在真正需要的阶段，避免每次任务都加载重型流程。
- 为 hooks、sync、doctor、verify、MCP runtime facade 和 safety profile 提供可审计控制面。

## 首页内容方向

首页应像现代产品页一样快速回答：what it is, why it matters, how it works, where it runs, how to start。首屏应强调“one governance layer for local coding agents”，并展示“policy -> native projections -> durable task state -> verified finish”的路径。

## Findings Record: 2026-05-30 16:01:03 UTC+8

- 当前真实 homepage 位于 `homepage/` 子应用，技术栈是 React + Vite，启动配置已在 `.claude/launch.json` 中注册为 `homepage`。
- 当前实现主要由 `homepage/src/homepage-content.mjs`、`homepage/src/App.tsx` 和 `homepage/src/styles.css` 驱动，并有结构、内容、样式、SEO 四类 node:test 测试保护。
- 用户提供的 `homepage_design_draft.html` 比现有实现信息量更完整，目标 section 包括 sticky nav、hero、problem、system、workflow、start、footer，以及 terminal/route/proof 等视觉模块。
- 设计稿文案重点已经从“Claude Code workflow kit”转向“governance harness for local coding agents”，因此 `homepage-content.mjs` 的内容模型需要整体换代，而不是局部补丁。
- SEO 元信息当前仍指向公开主页与 og-image，重构首页主体时应尽量保持这些 metadata 不回退，除非用户明确要求同步改写搜索文案。
