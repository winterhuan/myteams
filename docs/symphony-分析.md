# Symphony 项目深度分析

> 分析对象：`references/symphony`  
> 维护方：OpenAI  
> 许可证：Apache 2.0  
> 状态：Engineering Preview（低调实验预览）

---

## 1. 项目定位与愿景

### 1.1 核心定位

Symphony 把 **项目管理** 从「监督 coding agent」升级为 **「管理工作本身」**。

> *"Symphony turns project work into isolated, autonomous implementation runs, allowing teams to manage work instead of supervising coding agents."*

它不是又一个 Agent Harness，而是一个 **长期运行的工单调度守护进程**：

```
Linear 看板（工单源）
    ↓ 轮询
Symphony Orchestrator（调度器）
    ↓ 每工单一个 workspace
Codex App Server（执行层）
    ↓
PR、CI、Review、Walkthrough 等「工作证明」
```

### 1.2 与 Harness Engineering 的关系

Symphony 明确建立在 [Harness Engineering](https://openai.com/index/harness-engineering/) 之上——代码库必须先对 Agent 友好，Symphony 才是「下一步」：从管理 coding agent 到管理待完成的工作。

### 1.3 设计边界（SPEC 明确）

| Symphony 是 | Symphony 不是 |
|-------------|---------------|
| 调度器 / Runner / Tracker 读取器 | 富 Web UI 或多租户控制面 |
| 每工单隔离 workspace 的守护进程 | 通用分布式工作流引擎 |
| 策略在仓库 `WORKFLOW.md` 中版本化 | 内置 PR/评论/工单编辑业务逻辑 |
| 可选可观测性（日志 + Dashboard） | 强制沙箱/审批策略 |

**关键边界**：工单状态变更（Done、Comment、PR 链接）通常由 **Agent 通过工具** 完成，Symphony 只负责调度与隔离。

### 1.4 两种使用方式

1. **按 SPEC 自实现**（语言无关）：`SPEC.md` 是权威契约，鼓励各团队用任意语言实现
2. **参考实现**：`elixir/` 目录下的 Elixir/OTP 原型（OpenAI 标注为 as-is，建议生产环境自研加固版）

---

## 2. 整体架构

### 2.1 六层抽象（SPEC §3.2）

```
┌─────────────────────────────────────────────────────────┐
│  Policy Layer        WORKFLOW.md prompt body            │
├─────────────────────────────────────────────────────────┤
│  Configuration Layer YAML front matter + env 解析       │
├─────────────────────────────────────────────────────────┤
│  Coordination Layer  Orchestrator（轮询/并发/重试）      │
├─────────────────────────────────────────────────────────┤
│  Execution Layer     Workspace + Agent 子进程           │
├─────────────────────────────────────────────────────────┤
│  Integration Layer   Linear API 适配器                  │
├─────────────────────────────────────────────────────────┤
│  Observability Layer 结构化日志 + 可选 Dashboard        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Elixir 参考实现组件

| 模块 | 路径 | 职责 |
|------|------|------|
| `Orchestrator` | `elixir/lib/symphony_elixir/orchestrator.ex` | GenServer 轮询循环，调度/重试/停止/释放 |
| `AgentRunner` | `elixir/lib/symphony_elixir/agent_runner.ex` | 单工单执行：建 workspace → 跑 Codex |
| `Workspace` | `elixir/lib/symphony_elixir/workspace.ex` | 工单→路径映射，生命周期 hooks |
| `Codex.AppServer` | `elixir/lib/symphony_elixir/codex/app_server.ex` | Codex app-server JSON-RPC 2.0 客户端 |
| `Tracker` / `Linear` | `elixir/lib/symphony_elixir/linear/` | Linear API 读取与状态归一化 |
| `PromptBuilder` | `elixir/lib/symphony_elixir/prompt_builder.ex` | 工单 + 模板 → 最终 prompt |
| `Config` | `elixir/lib/symphony_elixir/config.ex` | 类型化配置 getter |
| `StatusDashboard` | `elixir/lib/symphony_elixir/status_dashboard.ex` | 终端状态展示 |
| `DashboardLive` | `elixir/lib/symphony_elixir_web/live/dashboard_live.ex` | Phoenix 可选 Web Dashboard |
| `ObservabilityApiController` | `elixir/lib/symphony_elixir_web/controllers/` | JSON API 可观测性 |

### 2.3 运行时拓扑

```
./bin/symphony ./WORKFLOW.md [--port 4000] [--logs-root ./log]
         │
         ├── Orchestrator GenServer（单进程权威状态）
         │     ├── poll tick（默认 5s）
         │     ├── running: %{issue_id => worker_pid}
         │     ├── claimed / blocked / retry_attempts
         │     └── max_concurrent_agents（默认 10）
         │
         ├── Task.Supervisor → AgentRunner.run/3（每工单一个 Task）
         │     └── Codex app-server 子进程（stdio JSON-RPC）
         │
         └── 可选 Phoenix HTTP（--port）→ Dashboard + JSON API
```

数据持久化：**无数据库**。调度状态在内存；重启后从 Linear + 文件系统恢复，blocked 状态会清空。

---

## 3. 核心模块深度拆解

### 3.1 Orchestrator（协调层）

`Orchestrator` 是 **唯一权威运行时状态** 的 GenServer：

```elixir
defstruct [
  :poll_interval_ms,
  :max_concurrent_agents,
  running: %{},      # 正在跑的工单
  completed: MapSet.new(),
  claimed: MapSet.new(),
  blocked: %{},      # 需要人工介入（仅内存）
  retry_attempts: %{},
  codex_totals: nil, # token 统计
]
```

核心循环（简化）：

1. **Tick** → 触发 poll cycle
2. **Reconcile** → 拉取 Linear 状态，停止不再符合条件的 running 任务
3. **Dispatch** → 按优先级选候选工单，受 `max_concurrent_agents` 限制
4. **Retry** → 失败指数退避（base 10s）；continuation 重试 1s
5. **Blocked** → Codex 请求 operator input / approval / MCP elicitation 时标记 blocked

### 3.2 AgentRunner（执行层）

单工单执行管线：

```
Workspace.create_for_issue(issue)
  → before_run hook
  → AppServer.start_session(workspace)
  → do_run_codex_turns (最多 max_turns 轮)
  → AppServer.stop_session
  → after_run hook
```

关键设计：
- **Worker host 固定**：一次 worker 生命周期不跨机器跳转（SSH 远程 worker 可选）
- **多 turn 循环**：单 session 内最多 `max_turns`（默认 20）轮，每轮检查工单是否仍 active
- **Continuation**：工单仍在 active 状态且 agent 结束 → 带 `attempt` 上下文重试 prompt

### 3.3 Codex App Server 集成

Symphony **硬绑定 Codex App Server 模式**，不是通用 Agent 协议：

```elixir
# WORKFLOW.md 示例
codex:
  command: codex ... app-server
  approval_policy: never
  thread_sandbox: workspace-write
```

`AppServer` 实现：
- stdio JSON-RPC 2.0 流
- `initialize` → `thread/start` → `turn/start` 协议
- 非交互模式自动拒绝 operator input
- 注入 `linear_graphql` 动态工具（`Codex.DynamicTool`），供 repo skills 调用 Linear API
- 可选 SSH 远程执行（`SymphonyElixir.SSH`）

### 3.4 WORKFLOW.md 契约

仓库级策略文件 = YAML front matter + Markdown prompt 模板：

```yaml
---
tracker:
  kind: linear
  project_slug: "..."
  active_states: [Todo, In Progress, Rework, ...]
  terminal_states: [Done, Closed, ...]
workspace:
  root: ~/code/workspaces
hooks:
  after_create: |   # git clone 等
  before_remove: |  # 清理
agent:
  max_concurrent_agents: 10
  max_turns: 20
codex:
  command: codex app-server
---
```

Prompt 模板支持变量：`{{ issue.identifier }}`、`{{ issue.title }}`、`{% if attempt %}...{% endif %}`（EEx 风格）。

**策略与代码分离**：团队改工作流只需改 `WORKFLOW.md` 并 commit，无需改 Symphony 二进制。

### 3.5 Workspace 隔离

- 路径：`{workspace.root}/{sanitized_issue_identifier}/`
- 每工单独立 git clone（`after_create` hook）
- Agent **只能** 在 workspace 内操作（Codex sandbox policy）
- Terminal 工单（Done/Closed/Cancelled/Duplicate）→ 停止 agent + 清理 workspace

### 3.6 可观测性

| 层面 | 实现 |
|------|------|
| 结构化日志 | `elixir/docs/logging.md` |
| Token 统计 | `elixir/docs/token_accounting.md`，orchestrator 聚合 codex_totals |
| 终端 Dashboard | `StatusDashboard` 实时渲染 |
| Web Dashboard | Phoenix LiveView（`--port` 启用） |
| JSON API | `ObservabilityApiController` |

---

## 4. 调度与状态管理

### 4.1 工单生命周期

```
Linear active state
    → Symphony dispatch（claim）
    → AgentRunner 执行（running）
    → 成功 / 失败 / blocked / 工单变 terminal
    → stop + release / retry / 保持 claimed
```

### 4.2 并发模型

- **Orchestrator 单 GenServer**：所有调度决策串行化，避免竞态
- **Agent 并发**：`Task.Supervisor` 启动多个 `AgentRunner`，上限 `max_concurrent_agents`
- **无跨工单协调**：各工单完全独立，无 A2A/handoff

### 4.3 失败恢复

| 场景 | 行为 |
|------|------|
| 瞬时失败 | 指数退避重试 |
| 工单仍 active 但 agent 结束 | Continuation prompt（带 attempt 号） |
| 工单变 terminal | 立即停止 + workspace 清理 |
| Orchestrator 重启 | 内存状态丢失；blocked 清空；active 工单可重新 dispatch |
| Codex 进程崩溃 | AgentRunner raise，orchestrator 记录失败并重试 |

### 4.4 Blocked 语义

当 Codex 需要 operator input / approval / MCP elicitation：
- 工单保持 **claimed**
- 记入 `blocked` map（**仅内存**）
- Dashboard/API 展示 blocked 状态
- 重启后 blocked 清空，工单可再次被 dispatch（可能重复工作）

---

## 5. 与 pi-orchestrator / acpx / myteams 的对比

| 维度 | Symphony | pi-orchestrator | acpx | myteams（愿景） |
|------|----------|-----------------|------|-----------------|
| **驱动源** | Linear 工单 | 手动 spawn | CLI / 脚本 / Flow | 待定 |
| **Agent** | Codex only | Pi only | 20+ ACP Agent | 可能以 Pi 为主 |
| **协议** | Codex app-server JSON-RPC | Pi RPC JSONL | ACP JSON-RPC | — |
| **隔离单位** | 每工单 workspace | 每实例 cwd | 每 session (agent,cwd,name) | — |
| **策略定义** | `WORKFLOW.md` in repo | 无 | Flow TS / CLI flags | — |
| **并发语义** | 多工单并行 | 多 Pi 实例并行 | 多 named session | — |
| **持久状态** | 无 DB（内存+FS） | instances.json | ~/.acpx/sessions | — |
| **产品层** | 可选 Dashboard | 无 | CLI + Flow | 待建设 |

### 5.1 Symphony vs pi-orchestrator

两者都叫 "orchestrator"，但层次完全不同：

```
Symphony Orchestrator          pi-orchestrator
─────────────────────          ─────────────────
「什么工作该做」                  「哪些 Pi 进程在跑」
工单驱动、自动派发               手动/程序化 spawn
Codex 执行                      Pi RPC 代理
有业务策略 WORKFLOW.md           无业务语义
```

Symphony 是 **工作编排**；pi-orchestrator 是 **进程监督**。

### 5.2 Symphony 若要用 Pi

SPEC 语言无关，理论上可把 `codex.command` 换成 Pi 相关协议，但参考实现 **只实现了 Codex App Server**。要用 Pi 需要：

1. 实现新的 `AgentRunner` 后端（Pi RPC 或 `acpx pi` 或 pi-acp）
2. 在 `WORKFLOW.md` 增加 `agent.kind: pi` 配置
3. 处理 Pi 的 extension_ui_request（blocked 语义）

---

## 6. 设计亮点与可借鉴点

| 亮点 | 可借鉴价值 |
|------|-----------|
| **SPEC 与实现分离** | 协议先行，参考实现可替换；适合 myteams 先写契约 |
| **WORKFLOW.md 版本化策略** | 工作流 prompt + 配置跟代码走，团队可 PR review |
| **每工单 workspace 隔离** | 多 Agent 并行开发的安全边界（比共享 cwd 更强） |
| **Continuation + attempt 上下文** | 长跑任务的重试不从头开始 |
| **Blocked 显式建模** | 需要人工时不停服、不丢 claim |
| **无 DB 简化运维** | Tracker + FS 足够恢复；适合小团队 |
| **linear_graphql 工具注入** | 调度器给 Agent 注入领域 API，而非让 Agent 自己配 MCP |
| **Token 聚合可观测** | 多并发 run 的成本可见 |

---

## 7. 与 myteams 项目的潜在关联

### 7.1 定位互补

```
myteams 若要做「自主团队」：

  工单/任务源（Linear/GitHub Issues/内部 Backlog）
           ↓
  ┌────────────────────────────────────┐
  │  Symphony 式调度层（借鉴 SPEC）     │  ← 管「做什么」
  │  poll / dispatch / workspace / retry│
  └──────────────┬─────────────────────┘
                 ↓
  ┌────────────────────────────────────┐
  │  执行层（多选）                       │  ← 管「谁来做」
  │  Pi (acpx pi / pi --mode rpc)       │
  │  Codex / Claude (acpx)              │
  │  Clowder 式 A2A 互审（可选叠加）      │
  └────────────────────────────────────┘
```

### 7.2 可直接借鉴

| Symphony 能力 | myteams 用途 |
|---------------|--------------|
| `SPEC.md` 分层架构 | myteams 编排层设计文档模板 |
| `WORKFLOW.md` 契约 | 每 repo 一份 Agent 工作流策略 |
| Workspace per task | 多 Agent 并行不互踩 |
| Orchestrator 状态机 | claimed/running/blocked/retry |
| Continuation prompt | 长跑任务断点续作 |
| 可选 Dashboard | 运维可见性 |

### 7.3 不建议照搬

- **Codex 单绑定**：myteams 应走 acpx/多 Provider 路线
- **无 blocked 持久化**：生产环境可能需要持久化 blocked 状态
- **Elixir 参考实现**：若团队栈是 TypeScript，应新写而非 fork Elixir

### 7.4 建议演进路径

1. **短期**：精读 `SPEC.md` §3–§6，抽取调度状态机与 WORKFLOW 契约
2. **中期**：用 TypeScript 实现最小调度器 + `acpx pi` 作为执行后端
3. **长期**：叠加 Clowder 式跨模型 review gate（Symphony 的 Human Review 状态 → 多 Agent 互审）

---

## 附录：关键文件索引

| 类别 | 路径 |
|------|------|
| 权威规范 | `SPEC.md` |
| 项目说明 | `README.md` |
| Elixir 实现说明 | `elixir/README.md` |
| 工作流示例 | `elixir/WORKFLOW.md` |
| 编排器 | `elixir/lib/symphony_elixir/orchestrator.ex` |
| Agent 执行 | `elixir/lib/symphony_elixir/agent_runner.ex` |
| Codex 客户端 | `elixir/lib/symphony_elixir/codex/app_server.ex` |
| Web Dashboard | `elixir/lib/symphony_elixir_web/live/dashboard_live.ex` |
| 日志规范 | `elixir/docs/logging.md` |
| Token 统计 | `elixir/docs/token_accounting.md` |
| Codex Skills | `.codex/skills/{commit,push,pull,land,linear}/SKILL.md` |

---

*文档生成于 2026-07-05，基于 references/symphony 源码与 SPEC.md 分析。*