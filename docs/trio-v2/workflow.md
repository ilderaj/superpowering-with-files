# 基本作业流程（Trio v2 时序图）

> 本文是 Trio v2 基本作业流程的图版，与 [human-usage.md](human-usage.md) 配套。三张时序图依次覆盖：**路由与绑定 → strict 派单 → 执行、验收与修订**。图源即下方 mermaid 代码块（GitHub 原生渲染）；修改时直接编辑代码块，并保持与 `human-usage.md` 的术语一致。

## 图 1：路由与绑定

quick/tracked 路由与 Trio 三件套的创建/恢复、`bind-thread` 绑定；三件套 sha256 与派单不一致即 `binding_mismatch` 停止。

```mermaid
sequenceDiagram
    actor User as 用户
    participant S1 as 主 Session (Chief)
    participant Trio as Trio 三件套
    User->>S1: 新 Session：五要素任务（目标/影响面/约束/验收/gate）
    S1->>S1: 路由 quick/tracked；选定 capability：dev|office|safety
    alt quick 路由
        S1->>User: 直接回答/小改动，无 Trio、无强制 worker
    else tracked 路由
        S1->>Trio: 创建或恢复 tracked planning（三件套=唯一权威）
        Trio->>S1: 校验 task id 与三件套；返回 task id
        User->>S1: 另开 Session 继续同一任务
        S1->>Trio: bind-thread 同一 task id，恢复同一份三件套
        Trio->>S1: 绑定成功（sha256 校验：不一致 → binding_mismatch 停止）
    end
```

## 图 2：strict 拓扑与派单门禁

strict 必须显式声明 `childDelegation`；策略缺失/未知、合规可见 worker 不可用都只走 `manual_pending`，绝不落到 native 子路由或 Chief inline 执行。

```mermaid
sequenceDiagram
    actor User as 用户
    participant S1 as 主 Session (Chief)
    participant Trio as Trio 三件套
    participant Host as Codex Host
    participant VW as 可见 Worker
    User->>S1: strict 拓扑：「严格使用可见 Worker」
    S1->>S1: 构造 Assignment Packet（8 字段，拒绝第 9 个顶层字段）<br/>childDelegation（strict 必填）+ executionMode（bounded_slice/worker_self_goal）
    alt 策略缺失或未知
        S1->>User: manual_pending（blocker + resumeCondition 原样返回）<br/>绝不落到 native 子路由
    else 策略合法
        S1->>Host: 请求合规可见执行 worker（spawn）
        alt 合规可见 worker 不可用
            Host->>S1: manual_pending（visible_worker_required_unavailable）<br/>绝不 fallback 到 Chief inline / native
        else 可用
            Host->>VW: 分配 execution packet（含 allowedOperations 权限范围）
            S1->>Trio: 写入分配与执行门禁（packet hash）
        end
    end
```

## 图 3：执行、验收与修订

worker 围绕切片做生产变更 + 主验证，产出 candidate；Chief 审计证据链后验收回写，或返回明确修订 packet；worker 本地子委托仅在 packet 显式允许（`worker_discretion`/`encouraged`）时可用。

```mermaid
sequenceDiagram
    actor User as 用户
    participant S1 as 主 Session (Chief)
    participant Trio as Trio 三件套
    participant Host as Codex Host
    participant VW as 可见 Worker
    participant Sub as 本地子代理
    VW->>VW: 围绕切片执行 + 主验证（RED→GREEN 证据）<br/>actual=unknown（无 authenticated 证据）
    opt childDelegation = worker_discretion/encouraged
        VW->>Sub: 有界委派（proper-subset Flash envelope）
        Sub->>VW: 返回局部证据（candidate，非验收）
    end
    VW->>Host: 完成 packet / candidate result（candidate_done/blocked）
    Host->>S1: 重新唤醒主 Session（collect/status）
    S1->>Trio: 审计 candidate：证据链（命令+退出码+计数+路径）<br/>三件套 hash 不一致 → binding_mismatch 停止
    alt 验收通过
        S1->>Trio: 写入 acceptance / 完成状态（trio accept → close）
        S1->>User: 交付已接受结果；merge/push/release 仍需人类 gate
    else 需要修订
        S1->>VW: 返回明确修订 packet
        VW->>VW: 继续执行同一切片
    end
```

## 贯穿注记

- **权限三层门禁 `adjudicatePermission`**：scope（`allowedOperations.files` 唯一授权；越界/物化输出 `generated_target` → blocked）→ sandbox（需 authenticated + packetDigest；writableRoots 覆盖目标）→ approval（绝不扩大 allowed paths；Full Access/审批/auto-review 不扩权）。
- **`manual_pending` 处置三选一**：① 人工提供/操作合规可见的 Don Michael worker（精确 packet 手动 bind）② 显式释放 strict 拓扑（改回 native-first default 路由）③ 等待/判定 blocked。
- **Host 生命周期桥未实现**：authenticated role/packet/actual、spawn/continue/status/interrupt/collect、动态 child 拒绝缺失时，`manual_pending` 是设计内诚实出口，不本地模拟、不绕过。

## 实现溯源

- 本地 fail-closed 路由契约：`harness/trio/core/routing.mjs`（Assignment Packet 八字段、`childDelegation`/`executionMode` 门禁、`adjudicatePermission` 三层权限、workRole/经济路由）。
- Corleone 请求角色：`harness/trio/hosts/codex.mjs`（`CORLEONE_ROSTER`、`selectCorleoneRole` 与 `renderCorleoneRosterConfig`；Flash high/xhigh/max）。默认执行路由为 native-first；`visible_worker_required` 只选择 Don Michael。
- 绑定校验与 ChiefOps 治理：`harness/trio/governance/chiefops/SKILL.md`。
- 人类操作面与边界：`docs/trio-v2/human-usage.md`。

## 英文版图源（README 静态图）

README 中的三张英文时序图由此渲染为 `docs/trio-v2/trio-workflow-*.png`（同一流程的英文版，供 README 引用；中文版见上文）。注意：mermaid 11.x 的时序图消息文本不能含 ASCII 分号 `;`，请使用逗号或全角 `；`。

```mermaid
sequenceDiagram
    actor User
    participant S1 as Main Session (Chief)
    participant Trio as Trio planning files
    User->>S1: New session: goal / affected surfaces / constraints / proof / gate
    S1->>S1: Route quick/tracked, pick one capability: dev|office|safety
    alt quick route
        S1->>User: Direct answer or small edit, no trio, no forced worker
    else tracked route
        S1->>Trio: Create or restore tracked planning (trio = sole authority)
        Trio->>S1: Validate task id and trio, return task id
        User->>S1: Open another session to continue the same task
        S1->>Trio: bind-thread to the same task id, restore the same trio
        Trio->>S1: Bound (sha256 mismatch → binding_mismatch stop)
    end
```

```mermaid
sequenceDiagram
    actor User
    participant S1 as Main Session (Chief)
    participant Trio as Trio planning files
    participant Host as Codex Host
    participant VW as Visible Worker
    User->>S1: strict topology: "must use the visible worker"
    S1->>S1: Build Assignment Packet (8 fields, 9th top-level field rejected)<br/>childDelegation (required for strict) + executionMode (bounded_slice/worker_self_goal)
    alt policy missing or unknown
        S1->>User: manual_pending (blocker + resumeCondition, packet returned)<br/>never falls back to a native subagent
    else policy valid
        S1->>Host: Request a compliant visible worker (spawn)
        alt no compliant visible worker
            Host->>S1: manual_pending (visible_worker_required_unavailable)<br/>never falls back to Chief inline / native
        else available
            Host->>VW: Assign execution packet (allowedOperations scope)
            S1->>Trio: Record assignment and execution gate (packet hash)
        end
    end
```

```mermaid
sequenceDiagram
    actor User
    participant S1 as Main Session (Chief)
    participant Trio as Trio planning files
    participant Host as Codex Host
    participant VW as Visible Worker
    participant Sub as Worker-local subagent
    VW->>VW: Execute the slice + primary verification (RED→GREEN evidence)<br/>actual=unknown (no authenticated evidence)
    opt childDelegation = worker_discretion/encouraged
        VW->>Sub: Bounded delegation (proper-subset Flash envelope)
        Sub->>VW: Return local evidence (candidate, not acceptance)
    end
    VW->>Host: Complete packet / candidate result (candidate_done/blocked)
    Host->>S1: Re-wake main session (collect/status)
    S1->>Trio: Audit candidate: evidence chain (command+exit+counts+paths)<br/>trio hash mismatch → binding_mismatch stop
    alt accepted
        S1->>Trio: Write acceptance / completion state (trio accept → close)
        S1->>User: Deliver accepted result, merge/push/release still need the human gate
    else revision needed
        S1->>VW: Return explicit revision packet
        VW->>VW: Continue the same slice
    end
```
