# Cursor 官方加载模型研究

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 任务目标

- 仅基于 Cursor 官方来源，核对 rules、`AGENTS.md`、skills、hooks、workspace/user-global 入口、上下文负担和按需加载相关的可确认事实。
- 输出结论时必须区分：
  - 官方确认
  - 基于现象推断
  - 未确认
- 不修改代码。

## 完成标准

1. 明确 project rules / user rules / `AGENTS.md` 的官方加载模型。
2. 明确 skills 的发现路径与行为。
3. 明确 hooks 的官方定位与作用。
4. 明确是否存在 scoped rules、按需应用、减少默认上下文负担的官方机制。
5. 列出未确认项，避免过度推断。

## 研究范围

- 官方站点优先：`cursor.com/docs`
- 仅使用官方来源，不引用第三方转载或社区转述
- 结果以中文输出，附完整官方链接

