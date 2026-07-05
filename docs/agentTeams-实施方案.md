# agentTeams 实施方案

> 版本：v2.0（按「一支队伍的生命周期」主线重写）
> 日期：2026-07-05
> 状态：实施规划稿
> 上游：[myteams-草案.md](./myteams-草案.md)；选型依据与参考项目对照见附录 B

---

## 0. 一句话与一条主线

**agentTeams 做一件事：让你养一支（然后是多支）长期存在的专业 Agent 团队，把事从想法做到成品，并且一次比一次做得好。**

整个系统围绕**一支队伍的生命周期**设计，五步闭环：

```text
① 建队 ──→ ② 接活 ──→ ③ 干活 ──→ ④ 交付 ──→ ⑤ 变聪明
（章程+成员）（项目+现场）（推进+叫人）（产物+拍板）（沉淀→记忆）
     ▲                                              │
     └────────── 下一个活，队伍带着记忆回到 ② ─────────┘
```

每个技术组件都为主线上的某一步服务，不为步骤服务的东西不做。本文第 2 章先用一个真实场景把五步走一遍，第 3 章逐步给出每一步的设计与实现，第 4 章是实施排期。

---

## 1. 边界（先说不做什么）

- ❌ 不做一次性多 Agent 会话工具（队伍是持久对象，不是 session）
- ❌ 不做通用 Workflow DAG 平台（流程属于队伍自己，平台只给容器）
- ❌ 不自建 LLM 调用层（执行一律交给现成 Harness：Pi、codex、claude 等）
- ❌ 不复刻任何参考项目全栈（借鉴点逐条列在附录 B，均为裁剪后自研）
- ❌ 第一版不做：云端多租户、外部 IM 桥、多队模板市场

---

## 2. 主线走一遍：app-dev 队做一个真实需求

以下场景是 Phase 1 的**端到端验收用例**，也是理解全部设计的入口。

**① 建队**（一次性，之后长期存在）

```bash
agentteams team create --template app-dev --name 应用一队
```

得到一支队：3 个 Agent 成员（@pm 产品、@builder 开发、@reviewer 评审）+ 你自己（@owner，人也是成员）。队伍自带一份**章程（Charter）**：本队的阶段怎么走（默认：头脑风暴→定案→实施）、什么事必须叫人、哪些规矩队伍自己能改。

**② 接活**

```bash
agentteams post 应用一队 "@pm 做一个命令行番茄钟，要能统计每日专注时长"
```

系统创建一个 Project（作品）和第一个 Thread（协作现场），处于本队定义的第一阶段 `brainstorm`。Hub 上能看到：这支队正在做什么、处于哪个阶段。

**③ 干活**（主循环，无人值守推进）

- @pm 被唤起（平台把「你是谁、队友是谁、当前阶段目标、团队记忆摘要」注入 prompt，然后交给 Pi 执行），产出需求澄清和两个方案，行首 `@builder` 交棒；
- **谁被 @ 谁持球**：任何时刻 Thread 有唯一责任人，卡住了状态会亮红，不会无声挂死；
- 每个成员的输出必须以三选一收尾：**@队友交棒 / hold 等外部条件 / escalate 叫人**——这是平台强制的推进协议，防止聊天空转；
- 阶段迁移受门禁约束：`brainstorm → plan` 由 @pm 确认方案备选后触发；`plan → execute` 的门禁是 **human**——自动生成一份决策包（Decision Packet）进你的拍板箱。

**④ 交付**

你在 Hub 拍板定案后，@builder 在隔离 workspace 写码提交产物（PR + 测试报告），@reviewer 评审（规则：评审者与实现者不得是同一成员）。产物挂在时间线上，验收不过可回退到 plan 阶段重来。

**⑤ 变聪明**

Thread 关闭前强制走一次结构化收尾（closeout）：什么管用、什么翻车、候选惯例。蒸馏后写入团队记忆三个文件：`principles.md`（原则）/ `patterns.md`（模式）/ `scars.md`（伤疤）。**下一个需求进来时，③ 的 prompt 注入会自动带上这些记忆**——第二次做同类任务，队伍表现可感知地不同。这就是「养」的含义。

多队 = 重复①，但换一份 Charter：短剧队可以定义 5 个阶段并按「集」循环，平台零改动。

---

## 3. 五步的设计与实现

### 3.0 平台底座（支撑所有步骤的最小内核）

单进程本地守护 `agentteams hub`（Node ≥ 22，TypeScript monorepo）：

```text
agentteams hub
  ├── SQLite（~/.agentteams/agentteams.db，唯一权威状态）
  ├── HTTP + WebSocket（Hub UI，127.0.0.1:7100）
  ├── MCP Server（Agent 干活时回调平台的唯一通道）
  └── DeliveryWorker（执行队列消费者，调 Harness）
```

原则：**无 Redis/Postgres、无微服务**；崩溃恢复 = 重启后按 SQLite 状态重新调度。包结构：

```text
packages/
  shared/    # Zod schema + migration（单一真相源）
  phases/    # 步骤①：phase 状态机
  custody/   # 步骤③：持球状态机
  router/    # 步骤③：@ 解析 + 串行推进循环
  delivery/  # 步骤③：执行队列 + worker
  engines/   # 步骤③：EngineAdapter（pi / acpx）
  memory/    # 步骤⑤：记忆读写与蒸馏
  hub/       # 装配 + HTTP/WS + MCP
  ui/ cli/
```

### 3.1 步骤①：建队 —— Team、Member、Charter

**Team 是一等持久对象**（不是 session）：

```sql
teams(id, name, domain, charter_json, created_at, archived_at)
members(id, team_id, handle, role, engine, engine_config_json, is_human)
```

- Member 绑定执行引擎（`pi` / `acpx:codex` / `acpx:claude`…），**人也是 Member**（可被 @，被 @ 到即产生待办）。
- **Charter 是队伍的宪法**，也是「每队工作方式不同」的唯一载体——平台不硬编码任何流程：

```jsonc
{
  "phases": [                          // 本队自定义的阶段状态机（段数不限、可回退、可循环）
    { "id": "brainstorm", "participants": ["@pm"], "exit_criteria": "...", "next": ["plan"] },
    { "id": "plan",       "gate": { "type": "human" }, "next": ["execute", "brainstorm"] },
    { "id": "execute",    "rules": ["实现者≠评审者"], "gate": { "type": "artifact-exists" }, "next": ["done", "plan"] },
    { "id": "done", "terminal": true }
  ],
  "cycles": { "enabled": false, "unit": "集" },   // 循环创作队开启：每集独立走一遍 phases
  "autonomy": { "default": "L2", "L3_requires_human": ["对外发布", "合并 main"] },
  "evolution": {                       // 步骤⑤的进化边界
    "self_editable": ["memory/*", "phases[*].description", "phases[*].exit_criteria"],
    "human_approval": ["autonomy.*", "phases[*].gate", "phases[*].next", "members"]
  },
  "max_a2a_depth": 10
}
```

- 阶段迁移由 MCP `advance_phase`/`revert_phase` 或人触发，受 `gate` 约束（human / artifact-exists / 谓词），全部落 append-only 的 `phase_events` 日志。
- Charter 双轨存储：DB JSON 为机器真相源，同时导出 `CHARTER.md` 供 Agent 阅读。
- 模板（`templates/app-dev/`）= 一份 Charter + 成员岗位 prompt，建第二支队就是换模板。

### 3.2 步骤②：接活 —— Project、Cycle、Thread

```sql
projects(id, team_id, title, phase, status)      -- phase 合法值由 charter 校验
cycles(id, project_id, title, phase, status)     -- 可选子周期：第 N 集/章/迭代
threads(id, project_id, cycle_id, title, phase, status)
messages(id, thread_id, author_member_id, kind, body_md, artifact_path, seq)
```

- Project = 作品（一个应用、一部短剧）；Thread = 协作现场，**append-only 时间线**（kind：chat / artifact / decision / closeout / system；seq 单调递增供 UI 增量同步）。
- 循环创作队开启 cycles 后，每个 Cycle 独立走一遍 phase 状态机。

### 3.3 步骤③：干活 —— 推进协议（本方案的技术核心）

干活的本质是回答一个问题：**多个 Agent 无人值守协作时，怎么保证「事永远在被推进、卡住必被发现」？** 答案由四个环环相扣的机制组成：

**(a) @ 路由 = 交棒**（`router/mentions.ts`，自研）

只有**行首** `@handle` 触发交棒（正文中的 @ 只是提及）；剥离代码块后解析；过滤自 @；单消息最多 2 个目标；链深上限取 charter（默认 10，防死循环）。

**(b) 持球状态机 = 责任归属**（`custody/`，表驱动纯函数，零 IO）

```text
状态（5）: new → active ⇄ blocked → resolved；active → dead（崩溃，可复活）
事件（8）: custody.handed / custody.held / custody.hold_expired /
          invoke.started / invoke.died / thread.blocked / thread.unblocked / thread.done
```

任何时刻 Thread 有唯一持球人；`transition(state, event)` 的 5×8=40 组合穷举测试；事件写 `custody_events`（append-only），投影到 `custody_projections` 供 UI 读。并发写保护：per-thread promise chain 串行化。

**(c) 三选一收尾协议 = 强制推进**

每次成员输出必须以其一结束：行首 @ 交棒 / MCP `hold_thread`（定时或条件唤醒）/ MCP `escalate`（叫人）。route-serial 循环（自研，≤600 行）检测到「无路由输出」→ 记 held + 定时提醒；连续两次违约自动转 escalation。这是防「聊天空转」的关键设计。

**(d) 执行 = 队列 + 引擎适配**

```sql
delivery_jobs(id, thread_id, target_member_id, prompt_md, status,
              idempotency_key, source, depth, attempt, ...)
```

- worker 消费队列（并发上限 4，指数退避重试，blocked 持久化）；幂等键防重复投递。
- 每次唤起的 prompt 组装（~300 token）：`[你是谁+队友] [当前阶段目标/产物/门禁] [持球规则+三选一] [团队记忆摘要] [MCP 工具]`。
- **EngineAdapter** 隔离 Harness 差异：

```typescript
interface EngineAdapter {
  invoke(req: { member, prompt, cwd, sessionKey, mcp, signal }): AsyncIterable<EngineEvent>;
}
```

首发 `pi`（spawn `pi --mode rpc`，能力最全）与 `acpx`（一个适配器覆盖 codex/claude 等 20+ agent）。session 以 `(engine, cwd, member+project)` 续接；execute 阶段可用 git worktree 隔离 workspace。

**Agent 回调平台的唯一通道是 MCP 工具面**：`get_thread / post_message / post_artifact / hold_thread / escalate / advance_phase / revert_phase / read_memory / close_out`。

### 3.4 步骤④：交付 —— 产物、拍板、Hub

- **产物**：`post_artifact`（文件 + 描述）挂时间线，kind=artifact 分色展示。
- **拍板**：`escalations(id, team_id, thread_id, reason, packet_md, status, decision_md)`——human gate、超自治边界操作、冲突升级都汇成 Decision Packet 进拍板箱；人决定后 `thread.unblocked` 继续推进。
- **Hub UI**（React 单页，WebSocket 增量）四个视图，对应人旁观/介入的四种需要：
  1. 队列表：各队在做什么、处于哪个阶段
  2. Thread 现场：时间线 + 持球状态条（谁持球/为何 blocked）+ 阶段进度
  3. 拍板箱：pending escalations + 决定输入
  4. 插话框：人随时 @ 任意成员

### 3.5 步骤⑤：变聪明 —— Closeout → 记忆 → 注入

进化闭环三段：

1. **收尾**：`thread.done` 前强制 `close_out({ what_worked, what_failed, artifacts, candidate_conventions })`。
2. **蒸馏**：MemoryDistiller（一个由 charter 指定成员执行的内置 job）把 signal≥2 的条目合并进 `memory/principles.md / patterns.md / scars.md`；记忆目录是 git repo——每次变更一个 commit，可回滚、可审计，防记忆污染。
3. **注入**：下次唤起时 `[团队记忆摘要]` 段自动带上（≤10 条检索）。

进化受 Charter 边界约束：`self_editable` 内的（记忆、阶段描述、完成判据）队伍自己改；`human_approval` 内的（自治等级、门禁、阶段结构、成员）自动转拍板箱。**进化 = 记忆沉淀 + 章程受控微调**，不是让 Agent 改平台代码。

---

## 4. 实施排期（每阶段以主线可走通的程度验收）

### Phase 0：底座 + 三个状态机（约 1 周）

| # | 任务 | 验收 |
|---|------|------|
| 0.1 | monorepo（pnpm + Biome + Vitest + CI）+ shared schema/migration | build/test 绿 |
| 0.2 | `custody`：状态机 + 40 组合穷举 + 事件日志/投影 | 全绿 |
| 0.3 | `phases`：charter 校验 + advance/revert + gate 钩子 + phase_events | 非法迁移拒绝、回退/循环用例全绿 |
| 0.4 | `router/mentions`：行首 @/代码块/自@/深度用例 | 全绿 |

### Phase 1：主线五步走通一遍（约 3–4 周）＝ 第 2 章场景全流程

| # | 任务（对应主线步骤） | 验收 |
|---|------|------|
| 1.1 | ①：team/member/charter CRUD + app-dev 模板 | `team create --template app-dev` |
| 1.2 | ③：pi-rpc 适配器（invoke/续接/abort） | 真实 pi 集成测试 |
| 1.3 | ③：delivery 队列 + route-serial + 三选一违约处理 | 两个 mock 成员 A2A 链跑通 |
| 1.4 | ③④：MCP 工具面 9 个工具 | conformance 用例 |
| 1.5 | ④：Hub 四视图 + WebSocket 增量 | 人工走查 |
| 1.6 | ⑤：closeout → 蒸馏 → 注入 | **黄金用例：第二次同类任务 prompt 含上次沉淀** |
| 1.7 | **端到端**：第 2 章番茄钟场景完整走完五步 | 产出可运行交付物 + 记忆写回 |

明确不做：第二支队模板、并行路由、跨 thread、外部 IM。Cycle schema 先落地，UI 随 Phase 2。

### Phase 2：验证「同平台、异工作方式」（约 2–3 周）

- acpx 适配器（跨引擎互审生效）；并行路由（brainstorm 发散）
- **短剧/小说队模板**：不同段数 + Cycle 循环，**平台零改动**为验收标准
- 跨 thread 工具；custody 是否加 parked 态评估

### Phase 3：重流程与现场定制（约 3–4 周）

- WorkflowRun 轻量 DAG（ai/bash/gate 节点，步骤级审批重试）——给需要强流程的队
- worktree 隔离默认化；Hub 现场布局由 charter 驱动（开发队看 diff、短剧队看分集表）

### Phase 4：生态硬化（持续）

- HTTP callback 桥、成本看板、skills 同步器、IM 桥、event-log 可换后端

---

## 5. 风险与对策

| 风险 | 对策 |
|------|------|
| A2A 死循环/空转 | 链深上限 + 自 @ 过滤 + 幂等键 + 三选一协议 + 违约转 escalation |
| Agent 不守协议 | route-serial 兜底检测 + probe 提醒 + 两次违约叫人 |
| 长 thread 上下文爆炸 | 注入只带摘要（近 N 条全文 + 更早压缩），产物走文件引用 |
| 记忆污染 | signal≥2 才入库 + 记忆 git 化可回滚 + 结构变更走拍板 |
| Harness 契约漂移 | 适配器集成测试 pin 版本 + conformance 用例 |
| 范围失控 | 硬约束见 §1；每 Phase 黄金用例不达标不进下一阶段 |

## 6. 待拍板

1. Phase 1 样板队 = 应用开发队？（本方案按"是"）
2. 进化边界默认值（§3.1 evolution）是否符合预期？
3. 命名：`agentteams` vs `myteams`？
4. 引擎顺序：先 pi-rpc 后 acpx（本方案），还是对调？

---

## 附录 A：完整 SQLite Schema

```sql
CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL,
  charter_json TEXT NOT NULL, created_at INTEGER, archived_at INTEGER);

CREATE TABLE members (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id),
  handle TEXT NOT NULL, display_name TEXT, role TEXT NOT NULL,
  engine TEXT NOT NULL, engine_config_json TEXT, is_human INTEGER DEFAULT 0,
  UNIQUE(team_id, handle));

CREATE TABLE projects (id TEXT PRIMARY KEY, team_id TEXT NOT NULL,
  title TEXT NOT NULL, phase TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');

CREATE TABLE cycles (id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
  title TEXT NOT NULL, phase TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');

CREATE TABLE phase_events (id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key TEXT NOT NULL, type TEXT NOT NULL,           -- phase.advanced|reverted
  from_phase TEXT, to_phase TEXT, gate_result_json TEXT,
  actor_member_id TEXT, created_at INTEGER);

CREATE TABLE threads (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, cycle_id TEXT,
  title TEXT, phase TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open');

CREATE TABLE messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL,
  author_member_id TEXT, kind TEXT NOT NULL,               -- chat|artifact|decision|closeout|system
  body_md TEXT NOT NULL, artifact_path TEXT, seq INTEGER NOT NULL, created_at INTEGER);

CREATE TABLE custody_events (id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT, created_at INTEGER);

CREATE TABLE custody_projections (subject_key TEXT PRIMARY KEY,
  state TEXT NOT NULL,                                     -- new|active|blocked|resolved|dead
  holder_member_id TEXT, updated_at INTEGER);

CREATE TABLE delivery_jobs (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL,
  target_member_id TEXT NOT NULL, prompt_md TEXT NOT NULL,
  status TEXT NOT NULL,                                    -- queued|running|done|failed|blocked
  idempotency_key TEXT UNIQUE, source TEXT NOT NULL,       -- user|a2a|workflow|wake
  depth INTEGER DEFAULT 0, attempt INTEGER DEFAULT 0, last_error TEXT,
  created_at INTEGER, started_at INTEGER, finished_at INTEGER);

CREATE TABLE escalations (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, thread_id TEXT,
  reason TEXT NOT NULL,                                    -- irreversible|conflict|acceptance|charter
  packet_md TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  decision_md TEXT, decided_at INTEGER);
```

## 附录 B：参考项目借鉴对照（均为裁剪后自研，不 fork）

| 本方案设计 | 借鉴来源 | 说明 |
|-----------|---------|------|
| 持球状态机（5 态×8 事件） | Clowder（MIT） | 从 8 态×17 事件裁剪；不搬 Redis EventLog |
| @ 路由语义、三选一协议 | Clowder / Multica | mentions 自研，测试用例对齐 |
| route-serial 推进循环 | Clowder | 自研 ≤600 行（原 3657 行） |
| delivery 队列/重试/blocked | Symphony | blocked 改为持久化（修正其内存态缺陷） |
| 单守护进程 + WS 时间线 + seq | Paseo | — |
| MCP=编排 API + Skills=说明书 | Paseo / mcp-skills 分析 | — |
| EngineAdapter / 多引擎 | acpx / Paseo Provider | acpx 一个适配器覆盖 20+ agent |
| Autonomy L0–L3、Closeout、记忆三文件 | OpenCrew | — |
| Phase 状态机 / gate / Workflow 双模式 | OpenTeams / Archon | Workflow 仅 Phase 3 可选 |
| 跨引擎互审 | Omnigent Polly | 实现者≠评审者规则 |
| Workspace 隔离（worktree） | Symphony / Paseo | — |
| 技术栈（TS/Zod/SQLite/Fastify/pnpm） | Pi / acpx 生态同栈 | 供应链 pin 版本 |

## 附录 C：Skills 配套

`skills/agentteams`（MCP 工具目录与调用顺序）、`skills/agentteams-handoff`（交棒 briefing 模板）、`skills/agentteams-closeout`（收尾结构与 signal 标准）；Phase 2 增补 review/worktree。
