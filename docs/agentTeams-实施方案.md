# agentTeams 实施方案（详细版）

> 版本：v1.1（phase 由平台枚举升级为 Charter 定义的轻量状态机）
> 日期：2026-07-05
> 状态：实施规划稿，基于 `docs/` 内全部 15 篇文档（草案 + 12 个参考项目分析 + 横向对比矩阵 + clowder 复用评估）收敛
> 上游：[myteams-草案.md](./myteams-草案.md)（产品意图）、[横向对比矩阵.md](./横向对比矩阵.md)（选型依据）、[clowder-复用评估.md](./clowder-复用评估.md)（复用边界）

---

## 0. 执行摘要

**agentTeams = myteams 草案的工程实现方案**：一个「养多支专业 Agent 团队」的本地优先平台。

核心决策一览（详细论证见后文）：

| 决策项 | 结论 | 依据 |
|--------|------|------|
| 技术栈 | TypeScript monorepo（pnpm workspace）+ Node ≥ 22 | 与 Pi / acpx / Clowder / Paseo 生态同栈，纯函数可直接借鉴 |
| 存储 | **SQLite 单文件优先**（better-sqlite3），预留 adapter 接口 | 本地优先、无 Redis 运维；clowder-复用评估 §4.2 结论 |
| 执行引擎 | **EngineAdapter 注册表**，首发 `pi`（RPC）+ `acpx`（ACP 兜底 20+ agent） | 横向对比矩阵 §11、§13；Harness 中立 |
| 协作模型 | **三平面**：策略平面（TeamCharter）/ 协作平面（Thread + 可选 WorkflowRun）/ 执行平面（Delivery + EngineAdapter） | 横向对比矩阵 §13 推荐分层 |
| Phase 模型 | **Charter 定义的轻量状态机**（段数/名称/回退/循环均队级自定义），「头脑风暴→定案→实施」仅为模板默认值 | 草案 §4「同一节奏、不同诠释」的彻底化 |
| 球权/责任 | 裁剪版 custody 状态机：**5 态 × 8 事件**，表驱动纯函数 + 穷举测试 | clowder-复用评估 §4.1（MIT 裁剪复用） |
| @ 路由 | 自研 `mentions.ts`（行首 @、代码块剥离、深度上限），测试用例对齐 Clowder | clowder-复用评估 §4.3 |
| route-serial | **自研短实现（300–600 行）**，禁止 fork Clowder 3657 行版本 | clowder-复用评估 §4.4 |
| MCP + Skills | 双轨：MCP = 编排 API；Skills = 说明书（Paseo 模式 C） | mcp-skills-分析 §4 模式 C、§5 |
| 团队进化 | Closeout → 团队记忆（principles/patterns/scars）→ 下次注入 | opencrew-分析 §3.3、草案 §5 |
| Phase 1 样板队 | **应用开发队**（参考最多、可机器验收） | 草案 §10（待用户确认） |

---

## 1. 目标与非目标

### 1.1 目标（来自草案，工程化表述）

1. **Team 是一等持久对象**：有身份、成员、章程、记忆、历史；跨多个作品/项目长期存在。
2. **每支队自定义工作方式**：phase 结构（段数、名称、顺序、回退、循环）完全由队级 Charter 定义，平台只提供阶段容器、迁移事件与门禁钩子，不硬编码任何流程；「头脑风暴 → 确定方案 → 实施」只是模板的默认三段。
3. **可见的协作现场**：append-only 时间线 + 阶段视图 + 待拍板升级；人可旁观、插话、拍板。
4. **自主进化**：收尾沉淀写回团队记忆，下次自动带上惯例；进化在团队层，受自治边界约束。
5. **Harness 中立**：Pi 为默认引擎之一，但 Member 可配 codex/claude/opencode 等任意引擎。

### 1.2 非目标（边界收敛，防止范围失控）

- ❌ 复刻 Clowder 全栈（12MB api、Redis、猫 persona、48 skills）
- ❌ 全局 Workflow DAG 编辑器作为产品中心（Workflow 是可选重模式，非核心）
- ❌ Phase 1 做多队模板、飞书/Slack 桥、云多租户 SaaS
- ❌ 平台替团队改代码式的"进化算法"——进化 = 记忆文档 + 章程微调
- ❌ 自建 LLM 调用层——一律通过 Harness（Pi/acpx）执行

---

## 2. 总体架构

### 2.1 三平面分层（对齐横向对比矩阵 §13）

```text
┌───────────────────────────────────────────────────────────┐
│ 策略平面（每 Team 自有）                                     │
│   TeamCharter（章程：自治边界、必须叫人的事项）                │
│   PhasePlaybook（本队 phase 状态机：段数/参与者/产物/门禁/回退） │
│   Autonomy L0–L3（借鉴 OpenCrew）                           │
│   TeamMemory（principles / patterns / scars）               │
├───────────────────────────────────────────────────────────┤
│ 协作平面（平台提供的容器）                                    │
│   Team / Member / Project（作品）                           │
│   Thread 模式：Message + 行首 @ 路由 + Custody（默认，轻）     │
│   WorkflowRun 模式：DAG 步骤 + 审批/重试（Phase 3，重）       │
│   Escalation：待人拍板队列                                   │
├───────────────────────────────────────────────────────────┤
│ 执行平面                                                    │
│   Delivery 队列（SQLite jobs：谁在跑/谁在等）                 │
│   EngineAdapter registry（pi-rpc / acpx / …）               │
│   Workspace 隔离（git worktree / 独立目录）                  │
└───────────────────────────────────────────────────────────┘
```

### 2.2 运行时拓扑

```text
agentteams hub（单 Node 守护进程，类 Paseo Daemon / Symphony Orchestrator）
  ├── HTTP + WebSocket（Hub UI + API，默认 127.0.0.1:7100）
  ├── MCP Server（Streamable HTTP，暴露编排工具给 Agent）
  ├── SQLite（~/.agentteams/agentteams.db）
  ├── DeliveryWorker（消费 delivery_jobs，调 EngineAdapter）
  └── 文件区（~/.agentteams/teams/<teamId>/memory/*.md 等）

agentteams CLI
  ├── agentteams init / team create / member add
  ├── agentteams post <team> "@writer 开始头脑风暴：…"
  └── agentteams ui（打开 Hub）
```

- **单进程、无外部服务依赖**（无 Redis/Postgres）：对齐 Symphony「无 DB 简化运维」与本项目本地优先主张。
- Hub 崩溃恢复：SQLite 即权威状态；running 任务重启后按 job 状态重新 dispatch（借鉴 Symphony §4.3，但 blocked **持久化**，修正其缺陷）。

### 2.3 Monorepo 结构

```text
agentteams/
├── packages/
│   ├── shared/          # 类型、Zod schema、ID 生成（单一真相源）
│   ├── custody/         # 球权状态机（纯函数，零 IO）+ projector + event-log
│   ├── router/          # mentions 解析 + route-serial（短实现）
│   ├── delivery/        # SQLite job 队列 + worker
│   ├── engines/         # EngineAdapter 接口 + pi-rpc / acpx 适配器
│   ├── memory/          # 团队记忆读写 + closeout 沉淀
│   ├── hub/             # Fastify HTTP/WS server + MCP server + 装配
│   ├── ui/              # Hub 前端（React + Vite，单页）
│   └── cli/             # agentteams 命令行
├── skills/              # agentteams / agentteams-handoff / … SKILL.md
├── templates/           # Team 模板（app-dev 首发）
└── docs/
```

技术选型细则：

| 项 | 选择 | 理由 |
|----|------|------|
| Schema | Zod | acpx/Paseo 同款，协议契约单一真相源 |
| DB | better-sqlite3（同步 API）| 单进程写者，简单可靠 |
| Server | Fastify + ws | Clowder 同款，轻 |
| 测试 | Vitest，custody 穷举矩阵 ≥ 覆盖率门槛 | Pi/acpx 工程标准 |
| Lint | Biome | Pi 同款，快 |
| 包管理 | pnpm workspace，依赖精确 pin | Pi 供应链硬化实践 |

---

## 3. 数据模型（核心 Schema）

### 3.1 实体总览

```text
Team 1─N Member
Team 1─N Project（作品/项目：一部短剧、一个应用）
Project 1─N Cycle（可选子周期：第 N 集 / 第 N 章 / 第 N 个迭代，各自走一遍 phase 状态机）
Project/Cycle 1─N Thread（协作现场；每 Thread 归属一个 phase）
Thread 1─N Message（append-only）
Thread 1─1 CustodyProjection（读模型）
Team 1─1 TeamMemory（文件 + 索引表）
Team 1─N Escalation（待人拍板）
Delivery: delivery_jobs（执行队列）
```

### 3.2 关键表定义（SQLite）

```sql
CREATE TABLE teams (
  id TEXT PRIMARY KEY,            -- team_xxx
  name TEXT NOT NULL,
  domain TEXT NOT NULL,           -- 'app-dev' | 'short-drama' | 'novel' | custom
  charter_json TEXT NOT NULL,     -- TeamCharter（见 3.3）
  created_at INTEGER, archived_at INTEGER
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,            -- mem_xxx
  team_id TEXT NOT NULL REFERENCES teams(id),
  handle TEXT NOT NULL,           -- @architect / @writer（team 内唯一）
  display_name TEXT,
  role TEXT NOT NULL,             -- 岗位描述（persona prompt 的核心）
  engine TEXT NOT NULL,           -- 'pi' | 'acpx:codex' | 'acpx:claude' | …
  engine_config_json TEXT,        -- model、cwd 策略、mcp 注入等
  is_human INTEGER DEFAULT 0,     -- 人也是 Member（可被 @）
  UNIQUE(team_id, handle)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL,
  title TEXT NOT NULL,
  phase TEXT NOT NULL,            -- 自由文本，合法值由 charter.phases 校验（非平台枚举）
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE cycles (              -- 可选子周期：循环创作（每集/每章/每迭代各走一遍 phase 状态机）
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
  title TEXT NOT NULL,            -- '第 3 集'
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE phase_events (        -- phase 迁移事件日志（append-only，与 custody_events 同款）
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key TEXT NOT NULL,      -- project_id 或 cycle_id
  type TEXT NOT NULL,             -- 'phase.advanced' | 'phase.reverted'
  from_phase TEXT, to_phase TEXT,
  gate_result_json TEXT,          -- 门禁检查结果（人拍板 / 产物存在 / 谓词）
  actor_member_id TEXT, created_at INTEGER
);

CREATE TABLE threads (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
  cycle_id TEXT,                  -- NULL = 直属 project
  title TEXT, phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'        -- open | blocked | resolved
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL,
  author_member_id TEXT,          -- NULL = 系统
  kind TEXT NOT NULL,             -- 'chat' | 'artifact' | 'decision' | 'closeout' | 'system'
  body_md TEXT NOT NULL,
  artifact_path TEXT,             -- kind=artifact 时指向文件
  seq INTEGER NOT NULL,           -- thread 内单调递增（客户端去重，借鉴 Paseo timeline）
  created_at INTEGER
);

CREATE TABLE custody_events (      -- append-only 事件日志（Event Sourcing 骨架）
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key TEXT NOT NULL,      -- thread_id
  type TEXT NOT NULL, payload_json TEXT, created_at INTEGER
);

CREATE TABLE custody_projections ( -- 读模型
  subject_key TEXT PRIMARY KEY,
  state TEXT NOT NULL,            -- new|active|blocked|resolved|dead
  holder_member_id TEXT, updated_at INTEGER
);

CREATE TABLE delivery_jobs (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL, target_member_id TEXT NOT NULL,
  prompt_md TEXT NOT NULL,
  status TEXT NOT NULL,           -- queued | running | done | failed | blocked
  idempotency_key TEXT UNIQUE,    -- 借鉴 Clowder QueueEntry
  source TEXT NOT NULL,           -- 'user' | 'a2a' | 'workflow' | 'wake'
  depth INTEGER DEFAULT 0,        -- A2A 链深度
  attempt INTEGER DEFAULT 0, last_error TEXT,
  created_at INTEGER, started_at INTEGER, finished_at INTEGER
);

CREATE TABLE escalations (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL, thread_id TEXT,
  reason TEXT NOT NULL,           -- 'irreversible' | 'conflict' | 'acceptance' | 'charter'
  packet_md TEXT NOT NULL,        -- Decision Packet（借鉴 Clowder @co-creator）
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | decided
  decision_md TEXT, decided_at INTEGER
);
```

### 3.3 TeamCharter（章程，策略平面核心）

**Phase = Charter 定义的轻量状态机**：平台不内置任何 phase 枚举；`charter.phases` 是有序数组，每个 phase 自带 `next`（允许回退与循环）与 `gate`（迁移门禁）。段数  2–N 不限；「头脑风暴→定案→实施」仅是 app-dev 模板的默认值。迁移由 MCP `advance_phase` / `revert_phase`（受 gate 约束）或人在 Hub 上触发，一律落 `phase_events`。

```jsonc
{
  "phases": [                      // 有序数组 = 本队自定义的 phase 状态机
    {
      "id": "brainstorm",
      "description": "需求澄清、方案备选、风险与边界",
      "participants": ["@pm", "@architect"],
      "artifacts": ["需求摘要", "方案对比"],
      "exit_criteria": "人或 @pm 确认方案备选 ≥2 且风险已列出",
      "next": ["plan"]
    },
    {
      "id": "plan",
      "participants": ["@architect", "@pm"],
      "artifacts": ["设计说明", "任务拆分", "验收标准"],
      "gate": { "type": "human" },               // 定案必须人拍板（escalation: acceptance）
      "next": ["execute", "brainstorm"]          // 允许回退重风暴
    },
    {
      "id": "execute",
      "participants": ["@builder", "@reviewer"],
      "artifacts": ["PR", "测试报告"],
      "rules": ["builder 与 reviewer 不得为同一 member（跨引擎优先）"],
      "gate": { "type": "artifact-exists", "artifacts": ["PR"] },
      "next": ["done", "plan"]                   // 验收不过可退回 plan
    },
    { "id": "done", "terminal": true }
  ],
  "cycles": {                      // 循环创作队（短剧/小说）可开启：每个 Cycle 独立走一遍 phases
    "enabled": false,
    "unit": "集"                   // '集' | '章' | '迭代'
  },
  "autonomy": {                    // OpenCrew L0–L3
    "default": "L2",               // 可回滚操作自主
    "L3_requires_human": ["对外发布", "删除数据", "合并到 main"]
  },
  "evolution": {                   // 进化边界（草案 §11 问题 2）
    "self_editable": ["memory/*", "phases[*].description", "phases[*].artifacts", "phases[*].exit_criteria"],
    "human_approval": ["autonomy.*", "phases[*].gate", "phases[*].next", "phases 增删", "members"]
  },
  "max_a2a_depth": 10
}
```

Charter 存 DB（JSON），同时导出为 `~/.agentteams/teams/<id>/CHARTER.md` 供 Agent 阅读——**双轨：机器真相源 + 人类可读**（借鉴 Clowder SOP 双轨）。

---

## 4. 核心机制设计

### 4.1 Custody 状态机（packages/custody）

裁剪自 Clowder ball-custody（MIT，保留出处声明），按复用评估 §4.1 定为 **5 态 × 8 事件**：

```text
状态: new | active | blocked | resolved | dead
事件:
  custody.handed        # @ 路由接手         new/active → active（换 holder）
  custody.held          # hold 等待外部条件   active → blocked
  custody.hold_expired  # 唤醒                blocked → active
  invoke.started        # 执行开始            （字段 effect：记录 running）
  invoke.died           # 执行崩溃            active → dead（可 re-hand 复活为 active）
  thread.blocked        # 显式升级人裁决      active → blocked
  thread.unblocked      # 人已裁决            blocked → active
  thread.done           # 收尾                active → resolved
```

实现要点：

1. `transition(state, event) → { next, effects } | { error }` 表驱动纯函数，**零 IO**。
2. **穷举测试矩阵**（5×8 = 40 组合全部显式断言，移植 Clowder INV-10 思想）。
3. `CustodyIngest` 使用 **per-subjectKey promise chain**（Clowder 防并发 clobber 模式原样学习）：

```typescript
private readonly chains = new Map<string, Promise<void>>();
record(subjectKey: string, event: CustodyEvent): Promise<void> {
  const prev = this.chains.get(subjectKey) ?? Promise.resolve();
  const next = prev.then(() => this.applyAndPersist(subjectKey, event));
  this.chains.set(subjectKey, next.catch(() => {}));
  return next;
}
```

4. `ICustodyEventLog` 接口化（SQLite 实现先行，Redis adapter 留作 Phase 4 可选）。
5. `parked/void/zombie` 等 Clowder 运维态 **不进 v1**（复用评估开放问题 2 的答案：Phase 2 视需要再加）。

### 4.2 @ 路由（packages/router/mentions.ts）

自研实现，**测试用例对齐 Clowder a2a-mentions**（复用评估 §4.3）：

- 剥离围栏代码块与行内代码后解析
- **仅行首** `@handle` 触发路由（容忍 markdown 列表/引用前缀 `- > *`）
- 长匹配优先 + token boundary；过滤自 @
- 单条消息最多 2 个路由目标；链深度上限取 `charter.max_a2a_depth`（默认 10）
- `@human` / 人类 Member 的 handle → 产生 Escalation 而非 delivery job
- 正文中非行首 @ 仅渲染链接不路由（对齐 Multica mention 契约）

### 4.3 串行路由（packages/router/route-serial.ts）

自研短实现（目标 300–600 行），只做（复用评估 §4.4 伪代码落地）：

```text
worklist = [触发 member]
while worklist 非空 && depth < charter.max_a2a_depth:
  job = delivery.enqueue(member, prompt(thread 上下文 + charter + memory 摘要))
  await job 完成 → 把 agent 输出 append 为 thread message
  custody.record(handed/held/…)
  mentions = parseLineStartMentions(输出)
  worklist.push(解析出的下游 members)
```

**禁止**从 Clowder route-serial 摘代码；SOP hint、telemetry、rich block 等一概不做（Phase 4 再议）。

并行模式（多 member 对同一消息独立回答，永不链式 handoff）为 Phase 2 可选，语义对齐 Clowder route-parallel。

### 4.4 Delivery 队列与 Worker（packages/delivery）

- `delivery_jobs` 表 + 单进程 worker 轮询（500ms tick），`max_concurrent_jobs` 默认 4（借鉴 Symphony 并发上限）。
- 「谁在跑 / 谁在等」双结构：`status=running` 集合即 InvocationTracker 等价物。
- 失败指数退避重试（base 10s，max 3 attempts）；`blocked` 状态**持久化**（修正 Symphony 内存丢失缺陷）。
- idempotencyKey = `hash(threadId, targetMember, triggerMessageId)`，防重复投递。
- Continuation：job 失败重试时 prompt 注入 `attempt` 上下文（Symphony continuation 模式）。

### 4.5 EngineAdapter（packages/engines）

```typescript
interface EngineAdapter {
  readonly id: string;                       // 'pi' | 'acpx'
  invoke(req: {
    member: Member;
    prompt: string;                          // 已含身份注入 + thread 上下文
    cwd: string;                             // workspace 路径
    sessionKey: string;                      // (member, project) 稳定续接
    mcp: { url: string; token: string };     // agentTeams MCP 注入
    signal: AbortSignal;
  }): AsyncIterable<EngineEvent>;            // text_delta | tool_call | done | error
}
```

首发两个适配器：

| 适配器 | 机制 | 说明 |
|--------|------|------|
| `pi` | spawn `pi --mode rpc`（JSONL stdio），Paseo Pi Provider 契约为参考 | Pi 全量能力；MCP 经 `pi-mcp-adapter` 扩展注入 |
| `acpx` | 嵌入 `acpx/runtime` 或 spawn `acpx <agent> --format json --mcp-config …` | 一个适配器覆盖 codex/claude/gemini/opencode 等 20+ agent |

- Session 续接：`(engine, cwd, sessionKey)` 三元组（acpx scope key 模式）。
- 无 MCP 能力的 CLI：v1 直接不支持结构化回调，靠输出解析（@ 路由本来就基于文本）；HTTP Callback 桥（Clowder 模式 D）列为 Phase 4 可选。

### 4.6 身份注入（Prompt 组装）

每次 invoke 组装 ~200–400 token 的注入头（借鉴 Clowder SystemPromptBuilder，但片段极简）：

```text
[identity]   你是 <team> 的 @<handle>（<role>）。队友：@a(角色), @b(角色), 人类：@owner。
[phase]      当前项目 <title> 处于 <phase> 阶段。本阶段目标/产物/完成判据：<charter 摘录>。
[custody]    你现在持有本 thread 的推进责任。回复末尾必须三选一：
             ① 行首 @队友 交接  ② 调 MCP hold_thread 等外部条件  ③ 调 MCP escalate 请人拍板。
[memory]     团队惯例摘要（≤10 条，来自 memory/principles.md + scars.md 检索）。
[mcp]        可用工具：post_artifact / hold_thread / escalate / read_memory / close_out …
```

片段化为 `packages/hub/prompt-segments/*.md`，条件注入（Clowder 亮点，不搬其 L/S/D 编号体系）。

### 4.7 MCP 工具面（借鉴 Paseo「MCP = 编排 API」）

Hub 内置 MCP Server（Streamable HTTP + per-invocation token）：

| 工具 | 作用 |
|------|------|
| `get_thread` | 拉取 thread 时间线摘要（含 custody 状态） |
| `post_message` | 发消息（正文行首 @ 触发路由） |
| `post_artifact` | 提交产物（文件路径 + 描述，kind=artifact） |
| `hold_thread` | 等外部条件：`{ wakeAfterMs }` 或 `{ wakeWhen: { command } }`（Clowder hold_ball 2a/2c 子集） |
| `escalate` | 生成 Decision Packet 请人拍板 |
| `read_memory` / `search_memory` | 读团队记忆 |
| `advance_phase` / `revert_phase` | 按 charter.phases[*].next 迁移 phase；gate 不满足时拒绝并提示缺口（human gate 自动转 escalation） |
| `close_out` | 结构化收尾（见 4.8） |
| `list_threads` / `cross_post` | 跨 thread 协作（Phase 2） |

### 4.8 Closeout 与团队记忆（packages/memory）

进化闭环（草案 §5 + OpenCrew §3.3 落地）：

```text
thread.done 前必须 close_out({
  what_worked: [...], what_failed: [...],
  artifacts: [...], candidate_conventions: [...]
})
  → closeout 消息入时间线
  → MemoryDistiller（一个内置 delivery job，由 charter 指定的 member 执行）
      将 signal≥2 的条目合并进:
        memory/principles.md   # 原则（做事底线）
        memory/patterns.md     # 模式（什么管用）
        memory/scars.md        # 教训（什么翻车）
  → 记忆变更 = git commit（~/.agentteams/teams/<id>/ 是 git repo，可回滚、可审计）
  → 下次 invoke 的 [memory] 段自动带上
```

进化边界执行：`charter.evolution.self_editable` 内的文件 Agent 可直接改；`human_approval` 列表内的变更自动转 Escalation。

### 4.9 Hub UI（packages/ui）

Phase 1 最小集（草案 §6）：

1. **队列表页**：选 Team → 项目列表（phase 徽章）
2. **Thread 页**：append-only 时间线（消息/产物/决策/closeout 分色）、custody 状态条（谁持球、blocked 原因）、阶段进度条
3. **拍板箱**：pending escalations 列表 + Decision Packet 展示 + 决定输入框
4. **插话框**：人随时发消息（可 @ 成员）

WebSocket 推送时间线增量（seq 去重，Paseo timeline 双轨同步模式）。每队自定义现场布局（短剧队场景表等）为 Phase 3 的「布局由 charter 驱动」扩展，Phase 1 统一布局。

---

## 5. 分阶段实施计划

### Phase 0：骨架与契约（约 1 周）

| # | 任务 | 验收 |
|---|------|------|
| 0.1 | monorepo 初始化（pnpm + Biome + Vitest + CI） | `pnpm build && pnpm test` 绿 |
| 0.2 | `shared`：全部 Zod schema + SQLite migration | schema 快照测试 |
| 0.3 | `custody`：状态机 + 穷举测试 + ingest/projector | 40 组合矩阵全绿 |
| 0.4 | `router/mentions`：解析器 + Clowder 对齐用例 | 行首/代码块/自@/深度用例全绿 |
| 0.5 | phase 状态机：charter.phases 校验 + advance/revert + gate 钩子（human / artifact-exists）+ phase_events | 非法迁移拒绝、回退/循环用例全绿 |

### Phase 1：一支队走完三段（约 3–4 周，对应草案 §10）

| # | 任务 | 验收 |
|---|------|------|
| 1.1 | `engines`：pi-rpc 适配器（invoke + session 续接 + abort） | 真实 pi 跑通单次 invoke 集成测试 |
| 1.2 | `delivery`：队列 + worker + 重试 + blocked 持久化 | 并发/重试/崩溃恢复测试 |
| 1.3 | `hub`：Team/Project/Thread CRUD + route-serial + MCP server（get_thread/post_message/post_artifact/hold_thread/escalate/close_out/advance_phase/revert_phase） | 两个 mock member A2A 链跑通 |
| 1.4 | app-dev Team 模板（charter + 3 member 岗位 prompt：@pm/@builder/@reviewer） | `agentteams team create --template app-dev` |
| 1.5 | `memory`：closeout → distill → 注入 | 第二次同类任务 prompt 含上次沉淀（黄金用例） |
| 1.6 | `ui`：队列表 / thread 时间线 / 拍板箱 | 人工走查 |
| 1.7 | `cli`：init/create/post/ui | — |
| 1.8 | **端到端验证**：给 app-dev 队一个真实小需求，完整走 brainstorm → plan（人拍板）→ execute（builder 写码 + reviewer 互审）→ closeout | 产出可运行交付物 + 记忆写回 |

**Phase 1 明确不做**：第二支队模板、workflow 模式、并行路由、跨 thread、Callback 桥、飞书/Slack。Cycle（子周期）机制 schema 先行落地，UI/流程支持随 Phase 2 循环创作队模板一起交付。

### Phase 2：多引擎 + 第二支队（约 2–3 周）

- 2.1 `acpx` 适配器（覆盖 codex/claude/…），builder 与 reviewer 跨引擎互审规则生效
- 2.2 并行路由模式（brainstorm 阶段多成员同题发散）
- 2.3 **短剧队或小说队模板**（验证「同平台、异工作方式」：charter 不同即工作方式不同——含不同段数与 Cycle 循环，平台零改动为验收标准）+ Cycle UI/流程支持
- 2.4 跨 thread 工具（list_threads / cross_post）
- 2.5 custody 扩展态评估（是否加 parked）

### Phase 3：Workflow 模式 + 现场定制（约 3–4 周）

- 3.1 WorkflowRun：轻量 DAG（yaml 节点：ai / bash / gate），步骤级审批/重试（Archon/OpenTeams 参考，考虑兼容 Archon YAML 子集）
- 3.2 execute 阶段可选 worktree 隔离（每 workflow run 一个 worktree）
- 3.3 Hub 现场布局由 charter 驱动（开发队突出任务/diff，短剧队突出分集/场景表）
- 3.4 WorkItem 轻量层（thread 可绑定 issue 式工作项，Multica 启示）

### Phase 4：生态与硬化（持续）

- HTTP Callback 桥（无 MCP CLI）、Redis event-log adapter、token/成本聚合看板（Symphony）、skills 同步器（`sync:skills` 到各 CLI 目录）、外部 IM 桥。

---

## 6. Skills 配套（与 MCP 双轨，mcp-skills-分析 §5.3 落地）

`skills/` 目录（Agent Skills 标准，Phase 1 交付前三个）：

| Skill | 内容 |
|-------|------|
| `agentteams` | MCP 工具目录与调用顺序（对齐 `refs/mcp-tools.md` 完整 spec） |
| `agentteams-handoff` | 交接 briefing 模板：背景/已做/剩余/验收（Paseo handoff 蓝本） |
| `agentteams-closeout` | closeout 结构与 signal 判定标准 |
| `refs/mcp-tools.md` | 工具完整 spec（真相源；prompt 只留索引） |

Phase 2 增补 `agentteams-review`（跨引擎互审纪律）、`agentteams-worktree`。

---

## 7. 关键风险与对策

| 风险 | 等级 | 对策 |
|------|------|------|
| A2A 死循环 / ping-pong | 高 | 深度上限 + 自 @ 过滤 + 每 job 幂等键 + custody 强制"三选一"结尾协议 |
| Agent 不遵守输出协议（不 @ 不 hold 不 escalate） | 高 | route-serial 检测"无路由输出"→ custody 记 held + 定时 probe 提醒；连续 2 次违约转 escalation |
| pi-rpc 契约漂移（Pi 快速迭代） | 中 | 适配器集成测试 pin Pi 版本；conformance 用例（acpx 思想） |
| 长 thread 上下文爆炸 | 中 | invoke 只带时间线**摘要**（最近 N 条全文 + 更早压缩），产物走文件引用 |
| 记忆污染（错误经验入库） | 中 | distill 需 signal≥2 + 记忆 git 化可回滚 + scars/principles 变更走 charter 边界 |
| 范围失控滑向复刻 Clowder | 高 | 硬约束：route-serial ≤600 行；无 Redis；无 persona 系统；评审时对照本文件 §1.2 |
| 单人维护带宽 | 中 | Phase 顺序严格执行；每 Phase 有明确黄金用例验收，不达标不进下一阶段 |

---

## 8. 开放问题（需拍板）

1. **Phase 1 样板队**：应用开发队 OK？（草案 §11.1，本方案按"是"规划）
2. **进化边界默认值**：`human_approval` 默认含「autonomy 变更、gate 变更、成员增删」是否符合预期？（草案 §11.2）
3. **产品命名**：仓库/包名用 `agentteams` 还是沿用 `myteams`？（本文暂用 agentteams，全局可替换）
4. **Pi 优先还是 acpx 优先**：本方案 Phase 1 先做 pi-rpc（能力全），若更看重"快速多引擎"可对调 1.1 与 2.1。
5. **是否向 Clowder 上游提议提取 `custody-core` 包**（复用评估开放问题 1）——建议 Phase 2 后视社区情况。

---

## 9. 参考索引

| 主题 | 文档 |
|------|------|
| 产品意图 | [myteams-草案.md](./myteams-草案.md) |
| 选型矩阵 | [横向对比矩阵.md](./横向对比矩阵.md) |
| 复用边界 | [clowder-复用评估.md](./clowder-复用评估.md) |
| MCP/Skills 双轨 | [mcp-skills-分析.md](./mcp-skills-分析.md) |
| 执行引擎 | [pi-分析.md](./pi-分析.md)、[acpx-分析.md](./acpx-分析.md) |
| 调度/隔离 | [symphony-分析.md](./symphony-分析.md)、[Archon-分析.md](./Archon-分析.md) |
| 协作语义 | [clowder-ai-分析.md](./clowder-ai-分析.md)、[opencrew-分析.md](./opencrew-分析.md)、[openteams-分析.md](./openteams-分析.md)、[multica-分析.md](./multica-分析.md) |
| Daemon/UI | [paseo-分析.md](./paseo-分析.md)、[omnigent-分析.md](./omnigent-分析.md) |
| 策略路由 | [ccg-workflow-分析.md](./ccg-workflow-分析.md) |
