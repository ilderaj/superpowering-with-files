# Homepage Refactor From HTML Draft

## 目标

基于 `homepage_design_draft.html` 重构真实 homepage React/Vite 子应用，让线上 homepage 采用现代产品页信息架构与视觉表达，同时保留现有 SEO 元信息能力。

## 当前状态

Status: waiting_review
Archive Eligible: no
Close Reason:

## 阶段

1. 提炼设计稿信息架构，并映射到 `homepage/src/homepage-content.mjs` 的内容模型。 ✅
2. 先写失败测试，锁定新的 section 顺序、关键文案、样式钩子与 SEO 兼容范围。 ✅
3. 实现新的 `App.tsx` 结构与 `styles.css` 视觉系统。 ✅
4. 运行 homepage 子应用测试与类型检查，修正失败项。 ✅
5. 启动预览并验证页面结构、视觉层次与关键 CTA。 ✅
6. 将验证结果与后续注意事项写回 planning 文件。 ✅

## 约束

- 对话、解释和规划文件使用中文。
- 代码、代码注释、文档字符串和 UI 文案使用 English。
- 以用户提供的 `homepage_design_draft.html` 为主要设计依据。
- 遵循 TDD：先写失败测试，再写实现。
- 不引入超出设计稿要求的新抽象或新功能。

## 实现范围

- 主要修改 `homepage/src/homepage-content.mjs`、`homepage/src/App.tsx`、`homepage/src/styles.css`。
- 需要同步更新结构/内容/样式测试；SEO 测试仅在必要时调整。
- 使用 homepage 子应用的 Vite 预览进行可视化验证。

## 初始判断

当前 homepage 已有独立 React/Vite 实现，但内容与结构仍停留在较早版本。此次重构更像一次面向设计稿的内容模型、组件结构和样式系统整体替换，适合在现有子应用内完成，而不是继续维护独立 HTML 原型。
