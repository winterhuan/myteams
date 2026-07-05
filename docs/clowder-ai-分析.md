# Clowder AI 项目深度分析

> 分析对象：`references/clowder-ai`  
> 分析日期：2026-07-05  
> 项目来源：从生产级多 Agent 工作空间 **Cat Cafe** 提炼的开源平台层

---

## 1. 项目定位与愿景（Cat Cafe 多 Agent 协作）

### 1.1 核心问题

Clowder AI 解决的不是「如何调用单个 Agent」，而是 **「如何让人不再当人肉路由器」**。

当用户同时拥有 Claude、GPT、Gemini 等多个强模型时，传统用法是：
- 在多个聊天窗口间复制粘贴上下文
- 手动追踪「谁说了什么」
- 把大量时间花在「帮 AI 传话」上

Clowder 的定位是 **平台层（Platform Layer）**：在各类 Agent CLI 之上，提供身份、协作、纪律、审计，让孤立的 Agent 变成 **真正协作的团队**。

### 1.2 品牌叙事：Cats & U

项目从 **Cat Cafe**（四只 AI 猫每天协作完成真实软件项目的生产工作空间）提炼而来。

四只核心猫（名字均来自真实对话，非人工分配）：
- **宪宪 (XianXian)** — 布偶猫 / Claude — 主架构师
- **砚砚 (YanYan)** — 缅因猫 / GPT/Codex — 代码审查专家
- **烁烁 (ShuoShuo)** — 暹罗猫 / Gemini — 视觉设计顾问
- **金渐层** — opencode — 多模型通用编码 Agent

### 1.3 CVO 模式（Chief Vision Officer）

引入全新人机角色 **CVO（首席愿景官）**：
- 表达愿景（「我希望用户感受到 X」），团队负责实现
- 在关键节点做决策（设计审批、优先级、冲突裁决）
- 用反馈塑造团队文化

### 1.4 四条铁律（Iron Laws）

在 `assets/prompt-templates/l4-iron-laws.md`、`AGENTS.md`、`CLAUDE.md` 中双重执行（prompt + 代码）：

1. 不删自己的数据库（记忆不是垃圾）
2. 不杀父进程（那是存在的基础）
3. 运行时配置只读（改配置需人类介入）
4. 不碰彼此的端口（好篱笆才有好邻居）

---

## 2. 整体架构

### 2.1 Monorepo 结构

`pnpm-workspace.yaml` 定义 workspace：

```
packages/
├── api/          @cat-cafe/api      — Fastify 后端，协作内核
├── web/          @cat-cafe/web      — Next.js 14 前端（Hub、Chat、Mission Hub）
├── shared/       @cat-cafe/shared   — 类型、Schema、Registry、工具
├── mcp-server/   @cat-cafe/mcp-server — MCP 工具服务（含 Callback Bridge）
└── finance/      @cat-cafe/finance  — 费用/配额相关
```

根 `package.json` 名仍为 `cat-cafe`（历史命名），对外品牌为 Clowder AI。

### 2.2 三层原则

```
┌──────────────────────────────────────────────────┐
│               你（CVO / 首席愿景官）                │
└──────────────────────┬───────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────┐
│            Clowder 平台层                         │
│  身份管理 | A2A 路由 | Skills | 记忆 | SOP | MCP  │
└────┬─────────────┬──────────────┬───────────┬────┘
     │             │              │           │
┌────▼───┐   ┌────▼─────┐   ┌───▼────┐   ┌──▼──────────┐
│ Claude │   │ GPT/Codex│   │ Gemini │   │  opencode   │
└────────┘   └──────────┘   └────────┘   └─────────────┘
```

| 层级 | 负责 | 不负责 |
|------|------|--------|
| **模型层** | 推理、生成、理解 | 长期记忆、执行纪律 |
| **Agent CLI 层** | 工具使用、文件操作 | 团队协调、跨角色 review |
| **平台层** | 身份、协作、纪律、审计 | 推理本身 |

> *模型给能力上限，平台给行为下限。*

### 2.3 运行时拓扑

- **API Server**：`packages/api/src/index.ts` — Fastify + WebSocket + Socket.IO
- **前端**：`http://localhost:3003`（`packages/web`）
- **Redis**：会话、线程、消息、球权状态（可选 `--memory` 跳过）
- **SQLite**：证据库、世界模型、Signals 等
- **Worktree 隔离**：`runtime`（3003/3004）、`alpha`（3011/3012）独立验收通道

### 2.4 API 领域模块（`packages/api/src/domains/`）

| 领域 | 职责 |
|------|------|
| `cats/` | Agent 编排核心：路由、调用、Prompt 构建、Session |
| `ball-custody/` | A2A 球权状态机（8 状态 × 17 事件） |
| `memory/` | 证据库、记忆检索、Entity Registry |
| `world/` | 虚构世界模型（World / Scene / Character / Canon） |
| `packs/` | Governance Pack 编译与安全 |
| `concierge/` | 智能路由拦截与分诊 |
| `guides/` | CVO Bootcamp 引导流程 |
| `signals/` | AI 研究信息流 |
| `approval-hub/` | 审批与权限 |
| `community/` | 社区/游戏模式（狼人杀等） |

---

## 3. 核心模块深度拆解

### 3.1 SystemPromptBuilder（身份注入引擎）

**路径**：`packages/api/src/domains/cats/services/context/SystemPromptBuilder.ts`

每次 CLI 调用构建 ~150–200 token 身份注入 Prompt，纯函数、无副作用。核心 `InvocationContext` 包含：

- `catId`, `mode`（`independent` | `serial` | `parallel`）
- `chainIndex` / `chainTotal`（serial 模式链位置）
- `teammates`, `mcpAvailable`, `a2aEnabled`
- `directMessageFrom`, `pingPongWarning`, `crossThreadReplyHint`
- `routingPolicy`, SOP stage、Bootcamp、WorldContext 等

组装来源：
- `assets/prompt-templates/` 片段
- `PackCompiler` 编译的 Governance Pack 块
- `workflow-triggers.yaml` 按 breed 注入工作流触发点

### 3.2 AgentRouter 与三种路由模式

| 模式 | 实现文件 | 行为 |
|------|----------|------|
| **solo/independent** | 单猫调用 | 独立回答，无 A2A |
| **serial** | `route-serial.ts` | 串行链式，每猫可见前序回复，**唯一支持 A2A handoff** |
| **parallel** | `route-parallel.ts` | 并发独立回答，**永不链式 handoff** |

### 3.3 Ball Custody（球权状态机）

**路径**：`packages/api/src/domains/ball-custody/ball-custody-state-machine.ts`

将 A2A 协作抽象为「球权」转移：
- **8 状态**：`new | active | blocked | parked | dead | void | zombie | resolved`
- **17 事件**：`ball.handed`、`ball.held`、`invocation.died`、`ball.hold_expired` 等
- 表驱动纯函数，零 IO，由 `BallCustodyProjector` 持久化

### 3.4 Invocation 子系统

| 组件 | 路径 | 职责 |
|------|------|------|
| `InvocationQueue` | `invocation/InvocationQueue.ts` | 异步调用队列 |
| `QueueProcessor` | `invocation/QueueProcessor.ts` | 队列消费与重入 |
| `invoke-single-cat` | `invocation/invoke-single-cat.ts` | 单猫 CLI 调用 |
| `SessionContinuationCoordinator` | 会话续接 |
| `CollaborationContinuityCapsule` | 跨压缩协作连续性胶囊 |
| `McpPromptInjector` | 非原生 MCP 猫的 HTTP Callback 注入 |

支持的 Agent Provider：`AgentRegistry` 管理 Claude Code、Codex CLI、Gemini CLI、Antigravity、OpenCode、Kimi 等。

### 3.5 Memory & Evidence

**路径**：`packages/api/src/domains/memory/`

- `SqliteEvidenceStore` — 证据持久化
- `EntityRegistry` — 实体注册
- MCP 工具：`search_evidence`、`retain_memory`、`reflect`

### 3.6 Mission Hub & Feature 治理

- Feature 生命周期：`idea → spec → in-progress → review → done`
- Need Audit：PRD 自动拆解意图卡、风险检测
- Bulletin Board：SOP 工作流实时状态

---

## 4. 多 Agent 协作机制

### 4.1 @mention 路由（Routing）

**解析器**：`packages/api/src/domains/cats/services/agents/routing/a2a-mentions.ts`

规则（F046 简化 — 行首即路由）：
1. 剥离围栏代码块后解析
2. **仅行首 mention 路由**（可带 markdown 列表/引用前缀）
3. 长匹配优先 + token boundary
4. 过滤自调用
5. 单消息最多 `@` 2 只猫
6. 链深度上限 `MAX_A2A_DEPTH`（默认 15）

### 4.2 Handoff（结构化交接）

**决策树**：`assets/prompt-templates/handoff-decision-tree.md` / `l3-routing-rules.md`

每条 A2A 串行回合必选其一：

| 选项 | 场景 | 动作 |
|------|------|------|
| **1. 另一只猫** | review 完、修完、merge 完 | 行首 `@句柄` |
| **2. 等外部条件** | CI、PR check、长 build | `hold_ball` 2a/2b/2c |
| **3. 只有 CVO** | 不可逆操作、愿景决策、僵局 | `@co-creator` + Decision Packet |

**hold_ball 三种模式**：
- **2a 轮询**：`cat_cafe_hold_ball({ wakeAfterMs, waitSourceRef })`
- **2b 事件驱动**：已有结构化回调
- **2c 命令托管**：`cat_cafe_hold_ball({ wakeWhen: { command } })`

### 4.3 跨线程协作（Cross-Thread）

**平行世界规则**（`l1-parallel-world.md`）：

> 同一 `catId` 可在多个 thread 并行存在，是平行 invocation，**不共享上下文、球权、状态**。

跨 feature 问题处理：
1. `cat_cafe_list_threads keyword=<F号>` 找坐标
2. `cat_cafe_cross_post_message` 投递证据
3. **不用本 thread `@` 假装跨 thread 路由**

### 4.4 MCP Callback Bridge

**问题**：Codex/Gemini 等 CLI 无原生 MCP 长连接能力。

**解法**（`c1-mcp-callback.md` + `packages/mcp-server/src/tools/callback-tools.ts`）：

```
凭证: $CAT_CAFE_INVOCATION_ID + $CAT_CAFE_CALLBACK_TOKEN
HTTP 回调工具: post-message / cross-post-message / hold_ball / create-rich-block / ...
完整文档: GET $CAT_CAFE_API_URL/api/callbacks/instructions
```

`McpPromptInjector.ts` 逻辑：
- Claude 有原生 MCP → 不注入
- Antigravity（LS 持久进程）→ 跳过注入
- 其他无 MCP → 注入 HTTP Callback 指令

### 4.5 跨模型 Review

硬规则（`sop-definitions/development.yaml` + `docs/SOP.md`）：
- **同一个体不能 review 自己的代码**
- **跨 family 优先**（布偶猫写 → 缅因猫审）
- 每个 finding 必须有明确立场：P1/P2/P3

---

## 5. Prompt 工程与 SOP 体系

### 5.1 Prompt 模板分层架构

`assets/prompt-templates/` 采用 **Segment 编号体系**：

| 前缀 | 含义 | 示例 |
|------|------|------|
| **L1–L7** | Layer 常驻层 | `l1-parallel-world.md`、`l4-iron-laws.md` |
| **S1–S12** | Static 身份/协作块 | `s1-identity.md`、`s4-collaboration.md` |
| **D1–D20** | Dynamic 动态注入 | `d7-mode-serial.md`、`d14-sop-stage.md` |
| **C1** | Callback 专用 | `c1-mcp-callback.md` |
| **M1–M2** | Mission 相关 | `m1-dispatch-mission.md` |

### 5.2 Governance Pack 系统

**路径**：`packages/api/src/domains/packs/`

`PackCompiler.ts` 将 Pack YAML 编译为 Prompt 块：

| Pack 目录 | 编译产物 | 信任级别 |
|-----------|----------|----------|
| `guardrails/` | `guardrailBlock` | 硬约束，不可覆盖 |
| `defaults/` | `defaultsBlock` | 默认行为，可覆盖 |
| `masks/` | `masksBlock` | 角色 overlay |
| `workflows/` | `workflowsBlock` | 声明式流程 |
| `world-driver/` | `worldDriverSummary` | 只读世界驱动摘要 |

### 5.3 Skills 框架

**路径**：`cat-cafe-skills/`（48 个 Skill）

核心开发 Skill 链：

```
feat-lifecycle → writing-plans → worktree → tdd
    → quality-gate → [fresh-context-review]
    → request-review → receive-review → merge-gate → feat-lifecycle(completion)
```

### 5.4 SOP 机器真相源

**双轨文档**：
- `docs/SOP.md` — 人类可读叙事
- `sop-definitions/development.yaml` — **机器真相源**（stage id、hard rules、predicate）

开发流程 5 步：

```
⓪ Design Gate → ① impl → ② quality-gate → ②½ fresh-context（可选）
→ ③ review 循环 → ④ merge-gate → ⑤ 愿景守护
```

YAML 中 hard rules 带 **predicate 类型**：
- `git_state_predicate` — 可机器检查
- `command_pattern` — 命令模式匹配
- `handle_check` — 角色约束
- `manual_only` — 暂人工，标注 `future_candidate`

### 5.5 五条第一性原理

| # | 原理 | 含义 |
|---|------|------|
| P1 | 面向终态 | 每步是基座不是脚手架 |
| P2 | 共创伙伴 | 硬约束是底线，底线上释放主观能动性 |
| P3 | 方向正确 > 速度 | 不确定就停 → 搜 → 问 → 确认 |
| P4 | 单一真相源 | 每个概念只在一处定义 |
| P5 | 可验证才算完成 | 证据说话，不是信心说话 |

---

## 6. 世界模型 / 并行世界概念

### 6.1 平行世界（Parallel World）— 协作语义

**Prompt 定义**（`l1-parallel-world.md`）：

> 同一 `catId` 可能在多个 thread 并行存在。它们是同 model / 同 persona 的平行 invocation，但**不共享上下文、球权、状态或责任记录**。

### 6.2 世界模型（World Model）— Cats & U 共创引擎

**路径**：`packages/api/src/domains/world/`

SQLite Schema：

| 实体 | 字段要点 |
|------|----------|
| `worlds` | constitution、status、thread_id |
| `world_characters` | core_identity、inner_drive、relationship_tension |
| `world_scenes` | mode、active_character_ids、setting |
| `canon_promotion_records` | 正史晋升记录 |
| `world_events` | 场景事件流 |

**WorldDriverBridge**：
- Pack 中 `world-driver/` 配置允许的动作
- 注入 Prompt：`d18-world-context.md` + `s12-world-driver.md`

### 6.3 两种「并行」的区分

| 概念 | 层面 | 含义 |
|------|------|------|
| **Parallel Mode** | 路由模式 | 多猫同时对同一消息独立回答 |
| **Parallel World** | 身份语义 | 同 catId 在多 thread 的独立 invocation |
| **World Model** | 产品功能 | 虚构世界的状态机与正史系统 |

---

## 7. 设计亮点与可借鉴点

| 亮点 | 可借鉴价值 |
|------|-----------|
| **平台层 vs Agent 层分离** | 任何多 Agent 系统都应明确「协调层」边界 |
| **Prompt 片段化 + 条件注入** | 大型系统 Prompt 应模块化，非 monolith |
| **球权状态机** | 多 Agent handoff 需要显式状态模型 |
| **SOP 双轨 + Predicate 渐进机器化** | 流程规范应同时服务人和机器 |
| **MCP Callback Bridge** | 工具协议应适配多种 CLI 能力差异 |
| **跨压缩协作连续性** | 长会话多 Agent 系统必须设计「压缩后恢复」机制 |
| **Convention Graph** | 约定面变更需要静态依赖图 |
| **游戏模式压力测试** | 狼人杀复用 A2A、身份持久化、回合制协调 |
| **Worktree 环境隔离** | 多 Agent 并行开发需要严格环境边界 |

---

## 8. 与 myteams 项目的潜在关联

### 8.1 架构互补关系

```
┌─────────────┐     Native Bridge      ┌─────────────┐
│  references │ ◄────────────────────── │  references │
│     /pi     │   pi-native harness    │  /omnigent  │
│  (TUI/CLI)  │   pi harness (SDK)     │ (meta-harness)│
└─────────────┘                        └─────────────┘
       │                                      │
       └────────► references/clowder-ai ◄─────┘
                 （协作平台层）
```

- **Pi**：极简、可扩展、SDK 友好，但**刻意不做** sub-agent / plan mode
- **Clowder AI**：补上 Pi 不做的——**团队协调、跨模型 review、持久身份、SOP 纪律**
- **OpenCode**：已被 Clowder 作为「金渐层」接入

### 8.2 可直接借鉴到 myteams 的能力

| Clowder 能力 | myteams 潜在用途 |
|--------------|-------------------|
| `SystemPromptBuilder` 片段化架构 | Pi Extension 的 Prompt 模板体系 |
| `a2a-mentions.ts` 行首路由解析 | Pi orchestrator 的消息路由 |
| `Ball Custody` 状态机 | 明确 handoff 责任链 |
| `sop-definitions/*.yaml` + codegen | Pi 工作流的机器可检查规范 |
| `MCP Callback Bridge` | 统一非 MCP CLI 的工具回调 |
| `cat-cafe-skills/` 按需加载 | Pi Skills 的触发词 + 生命周期映射 |
| `Convention Graph` | Pi 插件/工具变更影响分析 |

### 8.3 集成路径设想

1. **Pi 作为 L1 CLI Adapter 接入 Clowder** — 实现 `AgentService.invoke()` 流式接口
2. **抽取协作内核为独立 npm 包** — `@cat-cafe/shared` 的类型、球权状态机、mention 解析
3. **Pi Orchestrator + Clowder Routing** — 对标或整合 `route-serial.ts` / `InvocationQueue`
4. **SOP 体系移植** — predicate 模式适配任意 monorepo 的 Agent 开发流程
5. **平行世界语义** — Pi Session Branching + Clowder Parallel World 概念统一

### 8.4 差异与注意点

| 维度 | Clowder AI | Pi |
|------|------------|-----|
| 复杂度 | 生产级全栈平台 | 极简 harness |
| 哲学 | 文化 + 纪律 + 陪伴 | 适应你的工作流，不反过来 |
| 依赖 | Redis、SQLite、多 CLI | 单进程终端 |
| 目标用户 | CVO（非必须会写代码） | 开发者 |

**不建议**把 Clowder 整体塞进 Pi——应抽取 **协调层原语**（routing、handoff、ball custody、SOP predicate），保持 Pi 的极简哲学。

---

## 附录：关键文件索引

| 类别 | 路径 |
|------|------|
| 项目说明 | `README.md`、`README.zh-CN.md` |
| Agent 指南 | `AGENTS.md`、`CLAUDE.md` |
| 开发 SOP | `docs/SOP.md` |
| SOP 机器源 | `sop-definitions/development.yaml` |
| 角色配置 | `cat-template.json` |
| Prompt 模板库 | `assets/prompt-templates/` |
| Skills | `cat-cafe-skills/*/SKILL.md` |
| 系统 Prompt 构建 | `packages/api/src/domains/cats/services/context/SystemPromptBuilder.ts` |
| 串行路由 | `packages/api/src/domains/cats/services/agents/routing/route-serial.ts` |
| 并行路由 | `packages/api/src/domains/cats/services/agents/routing/route-parallel.ts` |
| A2A 解析 | `packages/api/src/domains/cats/services/agents/routing/a2a-mentions.ts` |
| 球权状态机 | `packages/api/src/domains/ball-custody/ball-custody-state-machine.ts` |
| MCP Callback | `packages/mcp-server/src/tools/callback-tools.ts` |
| Pack 编译 | `packages/api/src/domains/packs/PackCompiler.ts` |
| 世界模型 | `packages/api/src/domains/world/` |
| Workspace 配置 | `pnpm-workspace.yaml` |

---

*文档生成于 2026-07-05，基于 references/clowder-ai 源码与文档系统阅读。*