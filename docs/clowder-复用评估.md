# Clowder 协调层复用评估

> 日期：2026-07-05  
> 目的：评估 `ball-custody` 等协调原语 **复用 vs 自研**；判断 myteams 是否应 **复刻 clowder-ai**  
> 代码锚点：`references/clowder-ai/packages/api/src/domains/ball-custody/`、`routing/`、`invocation/`

---

## 1. 执行摘要

| 问题 | 结论 |
|------|------|
| 能否复用 `ball-custody-state-machine`？ | **可借鉴 / 可裁剪复用**（MIT），但需去 `CatId`、减事件种类，**不能原样搬** |
| 能否复用整个 ball-custody cell？ | **不建议**——EventLog/ProjectionStore 绑 Redis Lua，还带 F254 freshness、ProbeScheduler |
| 能否复用 `a2a-mentions`？ | **移植规则，重写实现**（~280 行，绑 `catRegistry`） |
| 能否复用 `route-serial`？ | **不要**——3657 行，与猫/SOP/telemetry 深度耦合 |
| **是否要复刻 clowder-ai？** | **不要整包复刻**；做 **Pi-first 轻量协作平台**，**抽取协调模式 + 少量纯函数** |

**推荐策略**：**Pattern Port（模式移植）> Code Fork（代码分叉）> Full Replica（全量复刻）**

---

## 2. Clowder 协调层解剖

### 2.1 Ball Custody Cell（球权）

文档：`docs/architecture/ownership/cells/ball-custody.md`

```text
事件源（route-serial / hold / invocation）
    → buildXxxEvent()（纯函数，ball-custody-events.ts）
    → BallCustodyIngest.record()（append + apply guard）
    → BallCustodyEventLog（Redis append-only）
    → BallCustodyProjector（transition + 字段 effect）
    → BallCustodyProjectionStore（Redis 读模型）
    → 简报 / Hub UI

副作用路径（不在 projector）：
    ProbeScheduler / WakeSender → 唤醒 invoke（best-effort）
```

| 模块 | 行数（约） | IO | 可复用性 |
|------|-----------|-----|----------|
| `ball-custody-state-machine.ts` | 155 | 无（纯函数） | ⭐⭐⭐⭐ 高 |
| `shared/types/ball-custody.ts` | 130 | 无 | ⭐⭐⭐ 需裁剪 |
| `BallCustodyProjector.ts` | 167 | 仅 store 接口 | ⭐⭐⭐ 模式可搬 |
| `BallCustodyIngest.ts` | 70 | eventLog | ⭐⭐⭐ 模式可搬 |
| `ball-custody-events.ts` | — | 无 | ⭐⭐ 事件构建器，猫语义重 |
| `BallCustodyEventLog.ts` | 75 | **Redis Lua** | ⭐ 低（存储绑 Redis） |
| `BallCustodyProjectionStore` | — | Redis | ⭐ 低 |
| `ProbeScheduler` / `WakeSender` | — | 外部 invoke | ⭐⭐ 理念可学，实现后置 |
| F254 Freshness 子系统 | — | 独立 event log | ❌ v1 不需要 |

**状态机规模**：8 态 × 17 事件，INV-10 穷举测试钉死。

```text
状态: new | active | blocked | parked | dead | void | zombie | resolved
事件: ball.handed | ball.held | invocation.* | task.* | 安乐死三件套 | …
```

### 2.2 @ 路由（A2A Mention）

`a2a-mentions.ts`（~282 行）：

- 剥离围栏代码块后解析
- **仅行首** `@handle`（支持 markdown 列表/引用前缀）
- 长匹配优先、token boundary
- 过滤自 @；单条最多 2 个 target；链深度 `MAX_A2A_DEPTH`（默认 15）
- 依赖 `catRegistry`、`resolveCatTarget`、`isCatAvailable`

**可复用**：规则与测试用例思路。  
**不可原样复用**：`CatId`、猫可用性、routing_warnings 与猫配置绑定。

### 2.3 串行路由（route-serial）

`route-serial.ts`：**3657 行**。

职责远不止「串行调猫」：

- A2A worklist 链式扩展（同一次调用内）
- BallCustody 事件 fire-and-forget 接线
- SOP skill 解析、Freshness、C2 verdict hint、inline action shadow
- OpenTelemetry spans、大量 metrics
- Session continuation、rich blocks、用户 mention

**这是 Clowder 的心脏，也是 myteams 最不该 fork 的文件。**

### 2.4 投递队列（InvocationQueue）

`InvocationQueue.ts`：**938 行**，默认 **内存 Map**（per `threadId:userId`）。

- 与 `InvocationTracker`（谁在跑）互补
- 支持 idempotency、priority、A2A continuation、sourceCategory
- 真实生产路径还与 Redis、connector、多用户交织

**可复用**：「谁在跑 / 谁在等」双结构、QueueEntry 字段设计。  
**自研更合适**：myteams MVP 用 SQLite + 更简单 job 表即可。

### 2.5 体量对照

| 范围 | 规模 |
|------|------|
| `packages/api/src` | ~12MB，2100+ `.ts` 文件 |
| ball-custody 目录 | ~1400 行 |
| route-serial 单文件 | 3657 行 |
| 全仓库 | api + web + mcp-server + shared + skills + desktop(AGPL)… |

---

## 3. 许可证

| 部分 | 许可证 |
|------|--------|
| 根目录 / README | **MIT** |
| `desktop/` | AGPL-3.0-only（Electron 壳，与协调层无关） |

**结论**：`ball-custody-state-machine.ts`、`a2a-mentions.ts` 等 **可在保留版权声明前提下复制/改写**。  
不要搬 `desktop/`；api 层复制需逐文件确认 header。

---

## 4. 复用 vs 自研：分项建议

### 4.1 推荐「裁剪复用」— state-machine 模式

**做法**：

1. 新建 `packages/teams-custody/`，**不依赖** `@cat-cafe/shared`
2. 借鉴表驱动 `transition()` + 穷举测试（INV-10 思想）
3. **MVP 裁剪**为 myteams 语义：

```text
状态（5）: new | active | blocked | resolved | dead
事件（8）:
  custody.handed      # @ 路由接球
  custody.held        # hold 等待
  custody.hold_expired
  invoke.started
  invoke.died
  thread.blocked
  thread.unblocked
  thread.done
```

4. 从 Clowder **复制并改写** `STATIC_TABLE` / `DYNAMIC_TABLE` 结构（MIT 注明出处）

**收益**：省 2–3 周状态机设计与边界测试。  
**风险**：若抄全 17 事件，myteams 会被 Clowder 运维语义（安乐死、parked、void…）拖走。

### 4.2 推荐「模式移植」— Event Sourcing 骨架

借鉴 Clowder，自研 myteams 版：

```text
CustodyEventLog（SQLite JSONL 或单表）
  → CustodyIngest（append guard + per-subject 串行 chain）
  → CustodyProjector（调用 transition + 字段 effect）
  → CustodyProjection（读模型，进 thread UI）
```

**不要搬 Redis Lua EventLog**——myteams v0.4 主张 SQLite/文件优先；Redis 作 Phase 2 可选 adapter。

Clowder `BallCustodyIngest` 的 **per-subjectKey promise chain**（防并发 apply clobber）值得原样学：

```typescript
// Clowder: 同 subject 的 record 串行，不同 subject 并行
private readonly chains = new Map<string, Promise<void>>();
```

### 4.3 推荐「重写」— a2a-mentions

| 选项 | 建议 |
|------|------|
| npm 依赖 `@cat-cafe/api` | ❌ 不可能，私有 monorepo |
| 复制 282 行改 Cat→Member | ⚠️ 可行但后续上游变更不同步 |
| **重写 `teams-router/mentions.ts`** | ✅ 读 Clowder 测试用例，绑 `MemberRegistry` |

把 `a2a-mentions.test.js` 的边界用例 **移植为 myteams 测试**（行首、代码块、自 @、深度），比复制实现更有长期价值。

### 4.4 明确「自研」— route-serial

myteams 目标 `teams-router/route-serial.ts`：**300–600 行**，只做：

```text
worklist = [触发 member]
while worklist not empty && depth < max:
  invoke(member)
  append thread messages
  mentions = parseLineStartMentions(output)
  custody.record(handed)
  enqueue next members
```

**禁止**：从 Clowder cherry-pick route-serial 片段——耦合太深，摘不干净。

### 4.5 明确「自研」— delivery

MVP：`delivery_jobs` SQLite 表 + hub 内 worker。  
字段借鉴 `InvocationQueue.QueueEntry`：`threadId`、`targetMember`、`status`、`idempotencyKey`、`source`。

---

## 5. 是否要复刻 clowder-ai？

### 5.1 「复刻」的三种含义

| 级别 | 含义 | 建议 |
|------|------|------|
| **L1 全量 fork** | 复制 monorepo，改品牌 | ❌ **强烈反对** |
| **L2 协调层 fork** | 只 fork ball-custody + routing + queue | ⚠️ 仍带入 Cat 语义与 Redis 假设 |
| **L3 模式对齐** | 自研 myteams hub，借鉴 cell 文档与纯函数 | ✅ **推荐** |

### 5.2 反对全量复刻的理由

**1. 产品重心不同**

| Clowder | myteams |
|---------|----------|
| 猫猫 persona、咖啡馆叙事 | Pi-first、无绑定 persona |
| Feature 治理、Mission Hub、Bulletin | Thread + workspace 轻 Hub |
| 48 skills + SOP YAML 生态 | 可选 WORKFLOW，小技能包 |
| 游戏模式、财务包、connector | 无 |
| Hub 是一等公民 | **Pi 执行 + 协作平面** |

全量复刻 = 维护第二个 Cat Cafe，不是 myteams。

**2. 复杂度不在状态机，在 route-serial 与周边**

球权纯函数只有 ~155 行；**route-serial 3657 行 + api 12MB** 才是成本。  
复刻协调层必然滑向复刻猫路由、SOP、telemetry、freshness——范围失控。

**3. 存储与部署假设不同**

Clowder 生产路径：**Redis 是球权与消息的 canonical store**。  
myteams：**本地 SQLite / 文件队列优先**。搬 EventLog 等于默认要上 Redis。

**4. 身份模型不可兼容**

`CatId` / `catRegistry` / breed / voice / budget 贯穿全栈。  
myteams 是 `Member { handle, provider: pi|codex }`——硬 fork 要全局 rename，不如自研边界清晰。

**5. 演进独立性**

Clowder 为自家 Hub 迭代（F233/F254/安乐死…）；myteams 跟跑会永久 merge 负担。

### 5.3 不复刻 ≠ 不重造 Clowder

myteams v0.4 应对齐 **同一类产品能力**：

- @ 路由、球权、custody 事件流、delivery 队列、Web Hub 时间线、MCP post/handoff/hold

实现路径是 **更轻的 Pi-native 版**，不是 Cat Cafe 换皮。

### 5.4 三条可行路径对比

| 路径 | 描述 | 适合 |
|------|------|------|
| **A. 直接用 Clowder** | pi 作为 Clowder 的一只「猫」 | 能接受猫 Hub 与 Redis；最快验证 |
| **B. 抽取 MIT 纯函数 + 自研 Hub** | custody SM + mention 规则；其余自建 | **myteams 推荐** |
| **C. 全量复刻改品牌** | fork 整个 repo | ❌ 除非团队愿维护 12MB api |

**若目标是协作平台且 Pi-first**：选 **B**。  
**若目标是零开发上线**：选 **A**（集成 Clowder），不要做 myteams 平台。

---

## 6. myteams 推荐技术选型（落地表）

| 组件 | 决策 | 来源 |
|------|------|------|
| `teams-custody/transition` | 裁剪复用 Clowder 表驱动 SM | MIT 复制 + 改写 |
| `teams-custody/projector` | 自研，仿 BallCustodyProjector 结构 | 模式 |
| `teams-custody/event-log` | 自研 SQLite | 不搬 Redis |
| `teams-router/mentions` | 自研，测试对齐 Clowder | 规则 |
| `teams-router/route-serial` | 自研短实现 | 不碰 3657 行 |
| `teams-delivery` | 自研 SQLite queue | 借鉴 QueueEntry |
| `teams-hub` + `teams-ui` | 自研 | 借鉴 Paseo Timeline 形态 |
| MCP tools | 自研，对齐 Clowder callback 语义子集 | 概念 |
| Skills / SOP | 5–10 个起步，非 48 个 | 量级 |

---

## 7. 决策树

```text
你要维护 Cat Cafe 全栈吗？
  ├─ 是 → 用 Clowder，别建 myteams 平台
  └─ 否 → Pi-first 协作平台？
           ├─ 是 → 模式对齐 Clowder + 自研 Hub（路径 B）
           │        state-machine: 裁剪 MIT 复用
           │        route-serial: 必须自研
           └─ 否 → 保持 myteams 薄层（退回 v0.3，与「协作平台」目标冲突）
```

---

## 8. 开放问题（实施前）

1. **是否向 Clowder 上游贡献 `ball-custody-core` 提取包？**（双赢但需上游意愿）
2. **MVP 球权 5 态是否够？** `parked` / `void` / `zombie` 是否 Phase 2 再加？
3. **是否 Phase 1 就接 Redis EventLog？** 建议否；做 `ICustodyEventLog` 接口预留 adapter。
4. **集成测试是否移植 Clowder `ball-custody-state-machine.test.js` 矩阵？** 建议是。

---

## 9. 结论

- **ball-custody-state-machine**：值得 **裁剪复用**（MIT、纯函数、表驱动、穷举测试），不是整 cell 搬运。
- **a2a-mentions**： worth **重写 + 测试对齐**，不绑 catRegistry。
- **route-serial / 全 api**： **不要复刻**。
- **整个 clowder-ai**： **不要复刻**；应做 **Pi-first、SQLite 优先、语义对齐的轻量协作平台**。
- 若团队不想自建 Hub，更诚实的产品选择是 **直接采用 Clowder**，而不是 fork 后改 logo。

---

*关联：[myteams-草案.md](./myteams-草案.md) v0.4 · [clowder-ai-分析.md](./clowder-ai-分析.md)*