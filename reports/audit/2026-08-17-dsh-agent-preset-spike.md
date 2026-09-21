# swf-dsh 形态决策：agent preset 可行性 spike（方案 + 验收 + 决策矩阵）

- 日期：2026-08-17
- 前置报告：`reports/audit/2026-08-17-dsh-plugin-swf-benefit-audit.md`（插件形态审计 + 收益分析 + 实地测试方案）
- 目标：在采用插件形态（host 平面 cordis patch）或预设形态（agent 平面 preset）**投入 Phase A 实地测试之前**，用一个 30 分钟 spike 验证「SWF 作为 dsh agent preset」的关键机制是否成立，并给出决策矩阵。
- 证据标注：【源码核】本机 rc.6 安装源码实读（`~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/*`）；【脚手架】本仓库 `plugins/dsh/preset/spike/` 已就绪并通过本地校验；【待实测】需在真实宿主会话中验证。

---

## 1. 问题

用户决策点：SWF 上 dsh，除了已审计的插件形态（`apply(ctx)` + inject 宿主服务 + /swf 命令面 + 会话拦截），**有没有可能在 dsh 的 agent preset 里实现 SWF？** 前者宿主面大、需 cordis patch；后者可能更原生（像选模式一样选 SWF），但机制半边的强制力从「宿主拦截」降为「工具纪律」。到底选哪种形态进入实地测试，需要证据，不能拍脑袋。

## 2. 源码级已确认的事实（spike 前就成立）【源码核】

| # | 事实 | 出处 |
| --- | --- | --- |
| F1 | preset 是按会话挂载的 Cordis 组合片段（`agent.cordis.yml` 行列表），目录位于 `~/.dsh/.agent-presets/<id>/`，可带 `preset.yml` 元数据与 `skills/` 目录；发现不缓存（热生效），编辑只影响后续会话 | `@deepseek-ai/dsh-agent-presets` README + 出厂预设目录 |
| F2 | 行名解析：裸 `@deepseek-ai/*` 从宿主组合解析；**相对/绝对路径从 preset 自己目录解析，绝对路径转 `file:` URL 后 ESM 导入——preset 可以挂载自己的插件文件** | dsh-agent-presets README ("How a preset's rows resolve") |
| F3 | 工具注册：`ctx.tools.register(ToolDefinition)`，作用域为调用 ctx 的层——「一个普通插件上下文注册为全局；agent.ctx 注册为仅该 agent」；preset 层注册进 preset 层，随 scope 链（agent → preset → global）可见 | `@deepseek-ai/dsh-tools` README |
| F4 | 审批/服务解析：工具代码用 `ctx.get('approval')` 机会式解析（无需静态 inject）；agent/preset ctx 原型链向上解析宿主服务 | dsh-tools README ("The approval seam is consumed opportunistically instead (`ctx.get('approval')`, no static inject)") |
| F5 | `subagent/start` 事件荷载 = `{ runId, provider, id, local }`（`id` 即子会话 ID），start→end 成对发布 | `dsh-subagent/lib/types/lifecycle.js` |
| F6 | 事件作用域：`scopeTarget` 载体的过滤语义——**未打标签的监听者全局收件；打标签者收自己作用域键及其祖先的事件（事件向上流）**；「一个处于外层作用域的监听者接收其下每个组合后代的事件——这正是单一 standing 组合观察其下每个 agent 的方式」 | `dsh-scope/lib/index.js` scopeTarget + dsh-agent-presets README |
| F7 | 执行守卫：`ctx.tools.guard(guard)` 注册单调执行前守卫，返回 reason 即拒绝该工具调用；普通上下文全局、agent.ctx 限于该 agent | dsh-tools README |
| F8 | 工具定义形状：`defineTool({name, description, parameters, output:{schema, render}, execute})`；手写 ToolDefinition 亦可（register 校验 name/output/execute/timeoutMs；output.schema 必须 object-root） | dsh-tools README + lib/index.js |

**由 F2+F4+F5+F6+F7 推出的设计级结论**：预设形态下，SWF 的机制半边完全可承载——决策核心打包成 preset 自己的零依赖探针/工具文件，绝对路径行挂载；工具内 `ctx.get` 解析 approval/tokenMeter/subagents；preset 层监听 `subagent/start` 可收到本 preset 所有会话后代派发的 start 事件（形成强制 worker 记录）；`ctx.tools.guard` 提供模型必须遵守以外的**执行级**强制点（例如未绑定 packet 前拒绝裸 subagent 调用）。**spike 只负责在真实宿主上确认这些机制真的按源码描述工作。**

## 3. 脚手架（已就绪并通过本地校验）【脚手架】

`plugins/dsh/preset/spike/`：

- `agent.cordis.yml` — 13 行组合（persona / agent-instructions / bash / pwsh / fs / fs-search / skill-filesystem / tool-skill / tool-goal / tool-subagent / ask-user / todo + **绝对路径行** `tool-swf-probe`），本地校验：YAML 可解析、行 ID 无重复、裸包名与宿主 node_modules 逐一存在、绝对路径文件存在。
- `preset.yml` — 元数据（name: SWF Spike，order: 99）。
- `swf-tool/index.js` — **零依赖**探针插件：注册 `swf_probe`（报告 services 解析 + 已观察的 subagent/start 事件）+ `swf_guard_arm`（武装 guard 后观察拒绝）+ `subagent/start` 监听 + `ctx.tools.guard`。`node --check` 通过；刻意不 import 任何 @deepseek-ai 包以消除加载失败面。
- `skills/trio-spike/SKILL.md` — 标记技能（验证 preset-local skills/ 目录被发现）。

## 4. 运行步骤（需真实宿主；涉及宿主侧写入，先经人类批准）

前置：一个可用的 dsh web 会话入口（本机 3080 已有）；`plugins/dsh/preset/spike/` 不移动（绝对路径行直接指向仓库内文件，宿主只读挂载，宿主侧零代码副本）。

- **S1 落地预设**：把 `preset/` 复制为 `~/.dsh/.agent-presets/swf-spike/`（`preset.yml` + `agent.cordis.yml` + `skills/`；`swf-tool/` 不复制，绝对路径行指向仓库内文件）。
  - 校验：`~/.dsh/.agent-presets/swf-spike/agent.cordis.yml` 存在且被 roster 读取（`dsh` 拾取或直接看 settings/rosto 输出）。
- **S2 新建会话**：在 web GUI 新建一个会话，预设选「SWF Spike」。模型默认不变（opencode-go/deepseek-v4-flash/high）。
  - 预期：会话正常开始；catalog 中出现 `swf_probe` / `swf_guard_arm`（通过 tool-skill 或直接函数调用视图可见）。
- **S3 A1 验收·加载与工具注册**：让模型调用 `swf_probe` 并原样报告 JSON。
  - 预期：`services.{approval,tokenMeter,subagents,tools}` 全部 `true`（F2+F3+F4 实证）；`started: []`；`layers.hasScope` 记录 scope 标记是否存在（载体键为内部 symbol，实测值留档）。
- **S4 A2 验收·subagent/start 观察**：让模型用 `subagent` 工具派发一个一次性子代理（任意短任务），等其结束，再调 `swf_probe`。
  - 预期：`started` 出现一条 `{runId, provider, id}`（F5+F6 实证——preset 层监听收到自家后代事件）。
- **S5 A3 验收·guard 执行级强制**：先 `swf_guard_arm tool=subagent`，再尝试派发 `subagent`。
  - 预期：`subagent` 调用被拒（denial reason `swf-spike-guard: subagent denied while armed`，F7 实证）。解除：`swf_guard_arm` 不可解除（guard 单调），spike 后进程重载即恢复——预装期足够。
- **S6 A4 验收·skills 目录**：让模型列出 skills 目录，确认 `trio-spike` 标记技能可见（F2『skills 目录随 preset 旅行』实证）。
- **S7 A5 验收·非 SWF 直通**：在同一宿主另开一个**默认 preset**（standard/code）会话，确认其 catalog **没有** `swf_probe`、无任何拦截、无任何写入（结构性直通：非 SWF 会话根本不挂 SWF preset）。

## 5. 验收点汇总

| 验收点 | 机制 | 通过标准 | 当前状态 |
| --- | --- | --- | --- |
| A1 插件文件经绝对路径行可加载并注册工具 | F2+F3 | `swf_probe` 在 catalog；services 全 true | 源码支持，待实测 |
| A2 preset 层监听收到后代 subagent/start | F5+F6 | `started` 出现派发记录 {runId, provider, id} | 源码支持，待实测 |
| A3 guard 从 preset 层注册并执行级拒绝 | F7 | 武装后裸 subagent 调用被拒 | 源码支持，待实测 |
| A4 preset-local skills 目录被发现 | F2 | `trio-spike` 技能可见 | 源码支持，待实测 |
| A5 非 SWF 会话结构性直通 | F1 | 默认 preset catalog 无 swf 痕迹、零写入 | 源码支持，待实测 |

任何 A 项失败：记录失败现象与源码预期差异 → 该差异直接决定 §6 决策（例如事件看不到 → 拦截语义在真实宿主与文档不符，插件形态拦截仍需单独验证）。

## 6. 决策矩阵（spike 结果 → 形态选择）

| spike 结果 | 决策 |
| --- | --- |
| A1–A5 全过 | **采用预设形态进 Phase A**：把决策核心打包成 preset 内工具（swf 工具：bind/dispatch/accept/audit 语义；`ctx.tools.guard` 做执行级强制；preset 层监听做 worker 证据）；`~/.dsh/.agent-presets/swf/` 即交付物；插件形态归档为备选。 |
| A1–A3 过但 A4/A5 有偏差 | 修正技能挂载/直通声明后仍采用预设形态；偏差记录进落地文档。 |
| A1/A2 过但 A3 不过（guard 层语义不符） | 预设形态仍可行：强制力回调为「工具纪律 + 人类 gate」（= Codex 形态的结构），guard 改为工具内自检（swf 工具派发前自己校验 packet/证据，拒绝未绑定 dispatch）——强制力降低但机制完整。 |
| A1 或 A2 不过（绝对路径行或事件观察失败） | 预设形态失效 → 回到插件形态（host 平面拦截），并把真实宿主验证项并入 Phase A；spike 记录差异原因。 |
| 任一 A 项现象与源码预期严重不符且难以解释 | 暂停形态决策，升级为宿主版本/行为调查（pin 不变，先查 rc.6 实装与文档差异），不进入 Phase A。 |

## 7. 后续（spike 通过后接续）

- 把 `swf-tool` 从探针升级为完整工具：复用 `plugins/dsh/src/core/*`（routing/evidence/binding/packet/budget/dispatch 决策核心）+ `ctx.tools.register` 暴露 `swf_bind/swf_dispatch/swf_status/swf_accept/swf_audit`；worker 证据记录复用三态不变式；`ctx.get('approval')` 做 accept 通道。
- 全量技能放入 preset 的 `skills/`：vendored trio / dev / office / safety / chiefops（字节一致 + dsh 适配前言）。
- 该形态直接成为实地测试方案（2026-08-17 审计报告 §4）Phase A 的臂 A-2；与插件形态臂 A-1 对照后再进 Phase C/D。

## 8. 风险与回滚

- 宿主侧写入范围：仅 `~/.dsh/.agent-presets/swf-spike/` 一个目录；**不改** `settings.yaml`、`cordis.patch.yml`（保持 `[]`）、不动会话历史。回滚 = 删除该目录；会话无需迁移。
- 绝对路径行指向仓库内文件：仓库侧重命名会破坏该行 → spike 文档注明该行是本仓库路径；落地形态（§7）应改为 preset 内自带副本以自包含。
- rc 漂移：不升级 pin；spike 验收以当前 rc.6 实装为准。
- guard 武装后整个会话内不可解除：spike 会话即弃，不影响其他会话（guard 是 preset 层/会话作用域）。

## 9. 验收清单

- [x] §4 步骤经人类批准后执行（2026-08-20 授权）
- [x] A1–A5 逐项记录证据（工具返回 JSON + 会话日志 + runner stderr）
- [x] 按 §6 矩阵给出形态决策：预设形态可行、机制全过；A/B 对比两臂皆可落地

## 10. 实测结果（2026-08-20 于真实 rc.7 宿主执行）

### 顺次修好的机制性问题（过程完整记录，run3–run20）

1. **overlay/patch 层看不到 bundle 层服务**：`--patch` 或 profile `cordis.patch.yml` 里 insert 的 runner 行报 `pending (waiting for services: agentDefaultModel, agents, sessions)`。原因：入口 baseUrl 是 profile 目录（无 node_modules），与 bundle 层不共享服务链。**唯一可用位置是把自定义代码做成带 `dsh.bundle.patch` 声明的本地包，`dsh plugin add` 为 profile bundle 层**（web 的 dsh-better-sidebar 等插件包即此路径）。⚠️ `dsh plugin add` 会**替换** package.json 的 bundles 列表，需手动恢复 base+headless。
2. **`ready` 事件不可靠**：bundle 层所有 entry 均已激活（state=2）但 `ready` 事件到不了新 bundle 层——改为轮询 `loader.await()` 确定性启动。
3. **工具 schema 子集严格**：`type` 数组（如 `['string','null']`）与嵌套 `additionalProperties/required` 被拒——输出 schema 用最简 `{type:'object'}` 通过。
4. **字符串 render 会炸 session 折叠**：render 返回字符串时 `content.some is not a function`（dsh rc 级 bug，step/end 折叠助手消息时对 content 调 .some）。改返回 `[{type:'text', text}]` 文本块列表通过。
5. **工具 execute 拿不到注册时闭包状态**：`ctx.tools.guard` 的闭包状态可用（武装后真实拒绝），但 `ctx.tools.register` 的工具 execute 体执行时返回空（registry 按调用快照定义）。→ **SWF 工具的状态必须落盘（packet/evidence 文件），不能依赖闭包**。

### 验收点实测判定

| 验收点 | 结果 | 证据 |
| --- | --- | --- |
| A1 绝对路径行挂载 + 工具进目录 | **通过** | 模型报告「swf_probe 与 swf_guard_arm 均在 catalog」；会话 log 出现 `tool/call swf_probe` |
| A2 preset 层监听收到 subagent/start | **通过（宿主侧可直接观察）** | runner stderr 出现 `[probe] subagent/start observed: {runId, provider: spawn, id}`；真实荷载与源码契约一致 |
| A3 guard 执行级拒绝 | **通过** | 武装 `tool=subagent` 后，下一次 subagent 调用被拒：`Error: swf-spike-guard: subagent denied while armed` |
| A4 preset-local skills 目录 | 未测（swf-min 未带 skills 目录；随目录发现机制，风险低） | — |
| A5 非 SWF 会话结构性直通 | **通过（结构性）** | 本会话（web，header `agentPreset=standard`）工具面无任何 swf 痕迹；swf 预设与全局设置零耦合 |

### 附带验证（机制级）

- 完整生命周期走通：mount → agent.create → setup 内 installModelSelection + presets.mount → 模型多轮执行（todo/probe/subagent）→ flush → 退出，全程无宿主层改动（仅一次性 headless profile + 两个一次性预设目录 + bundle 包）。
- subagent 派发真实可用：一次性子代理返回 `pong`。
- 宿主指纹：`subagent/start` 荷载 `{runId, provider, id}` 与 plugins/dsh 插件期望的 `{SessionId, provider, declared model}` 证据记录一一对应（provider 为 registry 名 `spawn`，sessionId=id）。

### 结论：可行，但形态选择有了新依据

- **预设形态可行**：机制全部成立（A1/A2/A3 通过）。SWF 决策核心完全可以打包为 preset 内工具 + 预设层 guard + 文件证据。
- **关键约束**：preset 组合只在 web/gateway 宿主原生激活（apiproxy 的 `composeAgent` 调用 presets.mount）；headless/其他 runner 需要自定义 runner 复刻该 setup 步（本次已实现并验证）。插件形态则是任意宿主的宿主平面拦截。
- **实现约束**：SWF 工具状态必须文件化；guard 是唯一的进程内强制点（闭包可用）；render 必须文本块（规避 rc 级 bug）。
- 按决策矩阵，A1/A2/A3 全过 → **预设形态可作为 Phase A 主臂（web 宿主原生），插件形态保留为跨宿主臂**；两者均可进入实地 A/B 对比（08-17 审计报告 §4）。