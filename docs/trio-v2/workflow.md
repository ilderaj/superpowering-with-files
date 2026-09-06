# 基本作业流程（Trio v2 时序图）

> 本文是 Trio v2 基本作业流程的图版，与 [human-usage.md](human-usage.md) 配套。三张时序图依次覆盖：**路由与绑定 → legacy 输入迁移 → 执行、验收与修订**。图源即下方 mermaid 代码块（GitHub 原生渲染）；修改时直接编辑代码块，并保持与 `human-usage.md` 的术语一致。

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

## 图 2：Root active routing 与 legacy 输入迁移

Root active routing 只有 direct/native-first 与 `manual_pending`。历史 packet 中的 `visible_worker_required` 只按 legacy input 处理；基础校验通过后，任一 Host operation 都返回 `manual_pending` 与 `legacy_visible_worker_required_retired`，并要求在当前 Trio authority 下显式 rebind `primaryExecution=default`。

```mermaid
sequenceDiagram
    actor User as 用户
    participant S1 as 主 Session (Chief)
    participant Trio as Trio 三件套
    participant Host as Codex Host
    User->>S1: legacy packet 或普通 default packet
    S1->>S1: 构造并校验 Assignment Packet（8 字段，拒绝第 9 个顶层字段）
    alt 基础 packet/operation/model/authority/envelope 校验失败
        S1->>User: manual_pending（基础 blocker + resumeCondition 原样返回）
    else legacy visible input
        S1->>User: manual_pending（legacy_visible_worker_required_retired）<br/>不恢复 Host bridge，不 fallback 到 native
        User->>S1: 在当前 Trio authority 下显式 rebind primaryExecution=default
    else default
        S1->>Host: 请求 direct/native-first operation
        Host->>S1: 返回 authenticated operation evidence 或 manual_pending
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
    participant Native as Native Worker
    participant Sub as 本地子代理
    Native->>Native: 围绕切片执行 + 主验证（RED→GREEN 证据）<br/>actual=unknown（无 authenticated 证据）
    opt childDelegation = worker_discretion/encouraged
        Native->>Sub: 有界委派（proper-subset envelope）
        Sub->>Native: 返回局部证据（candidate，非验收）
    end
    Native->>Host: 完成 packet / candidate result（candidate_done/blocked）
    Host->>S1: 重新唤醒主 Session（collect/status）
    S1->>Trio: 审计 candidate：证据链（命令+退出码+计数+路径）<br/>三件套 hash 不一致 → binding_mismatch 停止
    alt 验收通过
        S1->>Trio: 写入 acceptance / 完成状态（trio accept → close）
        S1->>User: 交付已接受结果；merge/push/release 仍需人类 gate
    else 需要修订
        S1->>Native: 返回明确修订 packet
        Native->>Native: 继续执行同一切片
    end
```

## 贯穿注记

- **权限三层门禁 `adjudicatePermission`**：scope（`allowedOperations.files` 唯一授权；越界/物化输出 `generated_target` → blocked）→ sandbox（需 authenticated + packetDigest；writableRoots 覆盖目标）→ approval（绝不扩大 allowed paths；Full Access/审批/auto-review 不扩权）。
- **`manual_pending` 处置三选一**：① 在当前 Trio authority 下显式 rebind `primaryExecution=default`，按 direct/native-first 重派；② 用户明确需要独立可见上下文时，使用 Host 的 user-owned task workflow，该任务不进入内部 routing；③ 等待或判定 blocked。
- **Root 内部 Host bridge 已退役**：内部路由不再追求人工可见 worker 的 spawn/continue/status/interrupt/collect 契约。用户明确要求独立可见任务时，由 Host 的 user-owned task workflow 管理，不进入 Root internal routing。

## 实现溯源

- 本地 fail-closed 路由契约：`harness/trio/core/routing.mjs`（Assignment Packet 八字段、`childDelegation`/`executionMode` 门禁、`adjudicatePermission` 三层权限、workRole/经济路由）。
- Corleone 请求角色：`harness/trio/hosts/codex.mjs`（`CORLEONE_ROSTER`、`selectCorleoneRole` 与 `renderCorleoneRosterConfig`；Flash high/xhigh/max）仅保留静态/历史兼容。默认执行路由为 native-first；独立可见任务由 Host 的 user-owned task workflow 承担，不属于内部 routing。
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
    User->>S1: legacy packet or ordinary default packet
    S1->>S1: Build and validate Assignment Packet (8 fields, 9th top-level field rejected)
    alt foundational packet/operation/model/authority/envelope failure
        S1->>User: manual_pending (foundational blocker + resumeCondition, packet returned)
    else legacy visible input
        S1->>User: manual_pending (legacy_visible_worker_required_retired)<br/>no Host bridge restoration or native fallback
        User->>S1: Explicitly rebind primaryExecution=default under the current Trio authority
    else default
        S1->>Host: Request direct/native-first operation
        Host->>S1: Return authenticated operation evidence or manual_pending
    end
```

```mermaid
sequenceDiagram
    actor User
    participant S1 as Main Session (Chief)
    participant Trio as Trio planning files
    participant Host as Codex Host
    participant Native as Native Worker
    participant Sub as Worker-local subagent
    Native->>Native: Execute the slice + primary verification (RED→GREEN evidence)<br/>actual=unknown (no authenticated evidence)
    opt childDelegation = worker_discretion/encouraged
        Native->>Sub: Bounded delegation (proper-subset envelope)
        Sub->>Native: Return local evidence (candidate, not acceptance)
    end
    Native->>Host: Complete packet / candidate result (candidate_done/blocked)
    Host->>S1: Re-wake main session (collect/status)
    S1->>Trio: Audit candidate: evidence chain (command+exit+counts+paths)<br/>trio hash mismatch → binding_mismatch stop
    alt accepted
        S1->>Trio: Write acceptance / completion state (trio accept → close)
        S1->>User: Deliver accepted result, merge/push/release still need the human gate
    else revision needed
        S1->>Native: Return explicit revision packet
        Native->>Native: Continue the same slice
    end
```
