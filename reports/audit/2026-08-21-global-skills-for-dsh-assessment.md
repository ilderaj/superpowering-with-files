# 全局技能（~/.agents/skills）可否为 dsh 所用：评估与建议

- 日期：2026-08-21
- 背景：用户决定 dsh 保持原生（不装 SWF 插件/预设机制），但询问全局 `.agents/skills` 里的技能是否可以为 dsh 所用、哪些仍有价值。
- 结论先行：**可以，而且已经是现状——这些技能天生可跨主机，dsh 会直接加载它们，无需插件、无需任何宿主改造。** 收益集中在纯方法/质量/交付类技能；少数夹带 SWF Trio 治理的技能需要甄别。

---

## 1. 机制确认【verified 本日】

- dsh 的技能发现：`dsh-skill-filesystem` 的 `agentsHome` 默认 `~/.agents`（`config.agentsHome ?? $DSH_AGENTS_HOME ?? ~/.agents`），standard 预设的 `skill-filesystem` 行扫描该根。
- **本 dsh 会话的可用技能目录里已经包含这些全局技能**（chiefops、code-review、codebase-design、diagnosing-bugs、domain-modeling、kami、office-humanizer、office-work-quality、overengineering-review、planning-with-files、risk-assessment…、safe-bypass-flow、simplification-ledger、tdd、trio 均在 catalog 中，`skill` 工具可直接加载）。
- 技能机制 = 带 YAML frontmatter（name/description）的 SKILL.md + 可执行脚本/资产，与 CODE 语言无关；dsh 的 skill 加载器解析同一 frontmatter 形状。
- 因此「技能」与「SWF 插件/预设」是两个层面：前者是软性声明式方法论（代码无关、已加载），后者是硬性宿主/机制（已决定不 apply）。**用技能 ≠ 装 SWF。**

## 2. 全局技能清单与分类【verified 本日】

`~/.agents/skills/` 共 17 项，分三类：

### A 类 —— 主机无关、纯方法/质量/交付 → 对 dsh 有真实增量，保留即可（13 项）

| 技能 | 价值（dsh 原生语境） |
| --- | --- |
| `tdd` | red-green-refactor 流程，纯方法，dsh 照用 |
| `diagnosing-bugs` | 硬 bug/性能回归诊断循环，纯方法 |
| `code-review` | 双轴审查（Standards/Spec），用**并行 subagent** —— 与 dsh 原生 subagent 机制直接匹配 |
| `codebase-design` | deep module 词汇，跨主机设计语言 |
| `domain-modeling` | 术语 / ubiquitous language / ADR |
| `overengineering-review` | 只查可去除复杂度 |
| `simplification-ledger` | `swf-simplify:` 标记租约，主机无关 |
| `risk-assessment-before-destructive-changes` | 破坏性变更风险登记，与 dsh 的 sandbox/approval 互补 |
| `safe-bypass-flow` | 高风险编码隔离执行，纯过程 |
| `kami` | 排版/PDF/落地页（中文关键词触发） |
| `office-humanizer` | Office 文案人设/去 AI 腔 |
| `office-work-quality` | Office 工件源/数据/渲染/交付 QA |
| `weread-skills` | 微信读书外部助手 |

这些都是内容/方法论，不与 dsh 原生任务模型冲突，零张力，默认即可用。

### B 类 —— SWF Trio 治理耦合 → 与「保持 dsh 原生」有张力，甄别（3 项）

| 技能 | 夹带的 SWF 治理 | 建议 |
| --- | --- | --- |
| `trio` | Trio 路由（quick/tracked/deep）+ 能力包（dev/office/safety）+ **planning/active/ 三件套唯一权威** + 人类 gate | **不在 dsh 当作路由权威启用**；它会把文件级任务权威与 dsh 原生 goal 造成双权威。仅当用户把「文件规划」当作轻量实践时部分保留。 |
| `chiefops` | Trio tracked 任务治理：恢复三件套、验证 binding、以 candidate check-in、按 slice 分类 + **经济档硬约束**（Execution 仅 Flash，Chief 才可 Sol/Terra，unknown complexity=blocker，人类 override 需 reason+provenance） | **不在 dsh 默认启用**——这是最「SWF 内核」的一项，正是用户决定不 apply 的治理层。 |
| `planning-with-files` | 文件式规划（task_plan/findings/progress，/clear 后恢复）| **价值较高、可保留为 dsh 原生 goal 的互补**：给长任务提供文件级持久状态与跨会话恢复（dsh goal 是会话内、resume 后 disarm；它是文件级无条件持久）。代价：引入 `planning/active/` 文件权威这一平行面——是否接受是用户取舍。body 含 `HARNESS_*`/`/clear`/`.cursor/.copilot/.claude` 路径占位，dsh 里为软引用、模型自行适配，非硬障碍。 |

## 3. 用户若想让 dsh 只启用子集（不装插件）的可选做法

dsh 原生的 `skill-filesystem` 扫的是全局 `~/.agents/skills`（与 Codex 共享）。若想 **dsh 单独** 不放行 trio/chiefops 而 Codex 保留，原生层面没有 preset 则难以按会话隔离技能目录；三个不影响插件的粗粒选择：

1. **省心**：维持现状——dsh 照常扫全局面；B 类技能在 dsh 里只是「模型可选的软提示」，并非强制路由（不像插件那样拦截）。风险仅是模型可能引用 Trio 文件权威/经济档，属低扰动。
2. **dsh 专属技能根**：在 settings 配置 `skill-filesystem.agentsHome`（或 roots）指向一个 dsh-only 目录，把 A 类技能放进去；B 类留在 `~/.agents/skills` 只服务 Codex。零插件、纯配置，副作用是 dsh 与 Codex 技能集分叉。
3. **保持双栈**：A 类照用、B 类在 dsh 里仅当用户明确要求「按文件规划/按 Trio 纪律操作」时才由模型调用（靠模型判断而非机制），符合「保持原生、技能作软资产」的主旨。

## 4. 建议

- **默认**：让 dsh 继续使用 A 类 13 项（已验证可用、零张力、与 subagent/sandbox/approval 等 dsh 原生机制互补）。
- **B 类**：`trio` 与 `chiefops` 在 dsh 里不作为权威/默认启用；`planning-with-files` 是否保留取决于你是否接受「文件级持久规划」这一轻量实践（它正是 SWF 声明半边里跨主机价值最高的一块，也可算 dsh goal 的补强）。
- 选 1（省心）/ 2（dsh 专属根）/ 3（软提示）由你定；三者都不需要安装任何 SWF 插件或宿主机制改造。

## 5. 状态

- [x] 清理 spike 宿主痕迹（预设目录 + headless profile + 12 个 spike 会话；`~/.dsh/settings.yaml` 与根 `cordis.patch.yml` 均未改动）
- [x] 确认 dsh 直接加载 `~/.agents/skills`（无需插件）
- [x] 分类评估：A 类 13 项保留可用；B 类 trio/chiefops 甄别、planning-with-files 可选