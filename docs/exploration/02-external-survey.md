# myteams 外部方案调研报告（2025-2026）

> 调研范围：2025 年下半年至 2026 年中期的 multi-agent / agent teams 框架、协作模式、看板/可观测性、自进化机制、记忆标准、内容创作类 agent 方案。
> 已知参考项目（Pi / pi-orchestrator / acpx / Paseo / Omnigent / Clowder AI / Symphony / Multica / OpenTeams / OpenCrew / Archon / CCG / LangGraph / Deep Agents / OpenWiki / Agno）不再重复，本报告只补充**新发现**的外部方案。
> 调研方式：WebSearch + WebFetch，覆盖 GitHub、技术博客、arXiv 论文综述。
> 调研时间：2026-07-06。

---

## 1. 发现的新项目 / 框架

### 1.1 新项目总览表

| 项目 | 类型 | 一句话 | 核心机制 | 与 myteams 关联 |
|---|---|---|---|---|
| **Hermes Agent Kanban**（Nous Research） | 多 agent 看板编排 | 把多 agent 协作做成 SQLite 持久化看板，60s tick 调度器自动派活 | 七状态任务机 + parent-child DAG + 六阶段 dispatcher tick + 工具化看板（kanban_*）+ 断路器 + 多看板隔离 | **看板+持久化团队**的现成参考；多看板隔离 ≈ 多团队并存；防死循环三重门可借鉴 |
| **KaibanJS** | JS 看板框架 | Trello-for-AIagents，可视化多 agent 工作流 | Redux 风格状态管理 + 角色化 agent + LangChainJS 工具兼容 + 看板 UI | **用户可看懂**的看板 UX 范本；前端可视化参考 |
| **Toonflow**（开源） | 短剧/小说创作 | 小说→剧本→分镜→视频全流程多 agent | 三层 Agent 协作（决策/执行/监督）+ 章节事件图谱 + 角色一致性 Agent + ONNX 本地向量记忆 + 无限画布工作台 | **短剧团队/小说团队**的端到端范本；事件图谱驱动改编可借鉴 |
| **Open Multi-Agent (OMA)** | TS 多 agent 编排 | 目标驱动而非图驱动，协调器运行时分解 DAG | `runTeam(team, goal)` + planOnly/createPlanArtifact/runFromPlan 三段控制 + FileStore 原子持久化 + 共识原语 runConsensus | **头脑风暴→确定方案**阶段的"目标驱动"范式；计划可检视可回放 |
| **aevatar.ai**（开源） | 跨域多 agent 平台 | Actor + Event 内核的统一多 agent 协作系统 | 基于 Orleans 的分布式 actor 模型 + 插件化部署（DLL/容器/分布式）+ 跨语言 agent 通信协议 | **多领域团队并存平台**的架构参考；事件驱动的 actor 模型 |
| **AgentHub**（Dmatut7） | 多 agent 协作框架 | 通过消息路由实现多 AI agent 可靠通信 | 消息路由 + agent 注册 + 协调工作 | 跨 agent 通信机制参考 |
| **Self-Evolving Agent 论文群**（2025-2026） | 学术 + 工程 | 自进化智能体：经验驱动、非参数、三层进化 | 单体闭环（EvolveR）/ 技能自生成（SkillEvolver）/ 集群协同进化（Meta-Team, MetaGen）| **团队自主进化**的理论基础与实现路径 |
| **A2A 协议**（Google → Linux Foundation） | 通信标准 | Agent 间的 HTTP，跨框架互通 | Agent Card（JSON 名片）+ Client-Server + 任务状态机 + Skills 注册 + 与 MCP 互补 | **多团队/多框架并存**的标准化通信底座 |
| **MCP**（Anthropic → Linux Foundation） | 工具标准 | Agent 与工具/数据的 USB-C | 8000+ 社区服务器，工具调用标准化 | myteams agent 工具层的标准底座 |
| **Mem0 / Zep / LangMem / TiMem** | 记忆框架 | 解决 agent 长期记忆的"金鱼困境" | 语义向量 / 情节图谱 / 工作记忆+长期存储 / 五层时序记忆树 | **团队持久化记忆**选型参考 |
| **OpenClaw heartbeat + 多 Agent 治理**（kejun blogpost） | HITL 框架 | 从 HITL 到 HOTL 的 4 层人类介入模式 | 审批/指导/干预/兜底四层 + L1-L4 权限分级 + 熔断 + 审计日志 | **自治与人在环**的成熟方案 |
| **多 Agent 协作设计模式综述**（刘道玉 2026-05） | 模式语言 | 六种核心协作拓扑 + 演化元模式 | 管道 / 层级 / 辩论 / 黑板 / 共识 / 演化 + 小世界网络理论 | myteams 各团队**按自己方式协作**的模式语言 |
| **ZhiJuTong (ZJT) / ai-short-drama** | 短剧生成 | 开源 AI 短剧生成平台 | 多 agent pipeline（编剧→分镜→角色→视频）| 短剧团队流水线参考 |

### 1.2 重点新项目详评

#### 1.2.1 Hermes Agent Kanban —— 最贴近 myteams 看板诉求的项目

- **项目地址**：hermes-agent.nousresearch.com
- **时间**：2026 年 v0.14+，社区热度高（magnus919、vaitk、xopcx 多篇深度评测）
- **核心机制**：
  - **七状态机**：`triage → todo → ready → running → done → archived`，外加 `blocked`
  - **parent-child DAG**：任务通过依赖边形成有向无环图，父任务全完成才自动提升子任务到 ready
  - **六阶段 dispatcher tick**（60s 一次）：① 回收过期 claim（15min TTL）→ ② 检测崩溃 worker（`kill(pid,0)`）→ ③ 自动分解 triage（LLM 把一句话拆成任务图）→ ④ 提升依赖 → ⑤ 原子 claim + 启动 worker → ⑥ 等待
  - **SQLite WAL + compare-and-swap**：无需分布式共识，单机即可原子 claim
  - **工具化看板**：worker 不 shell out，而是用 `kanban_show / kanban_complete / kanban_block / kanban_heartbeat / kanban_comment / kanban_create / kanban_link` 等结构化工具
  - **三重安全门**：① 任务所有权门（不能改别人的任务）② 幻觉卡片门（声称创建的卡片必须真实存在且属于自己）③ 断路器（连续失败 N 次自动阻塞）
  - **多看板隔离**：每个看板独立 SQLite DB、独立工作区，无跨看板链接
  - **结构化交接**：`summary + metadata` 是阶段间通信主通道，`task_runs` 表永久记录每次尝试（blocked/crashed/completed），新 worker 能看到完整失败历史
  - **工件交付**：完成时可附带 PDF/CSV/DOCX/图片/视频等，自动推送到 Telegram/Discord/Slack

#### 1.2.2 Toonflow —— 短剧/小说团队的端到端范本

- **项目地址**：开源（Apache-2.0），GitHub Releases
- **核心架构**：三层 Agent 协作体系
  - **决策层**：导演 Agent 统筹叙事节奏、任务优先级
  - **执行层**：编剧 Agent（小说→剧本）、分镜 Agent（景别/构图/光线/镜头运动）、一致性 Agent（角色外貌数据库，跨场景锚定）、配音 Agent（声线匹配+TTS）
  - **监督层**：质检 Agent 自动审查情节漏洞与角色矛盾
- **关键技术**：
  - **章节事件图谱**：自动提取原著章节级事件，按图谱精准调用上下文，避免一次性投喂全文
  - **持久化记忆**：基于 ONNX 本地向量检索，短期消息缓存 + 长期摘要压缩 + 语义召回
  - **可编程供应商系统**：设置中心直接写 TypeScript 即时生效，不重启
  - **无限画布工作台**：节点化编排剧本/角色/分镜/素材/视频
  - **模型无关**：支持 Nano Banana / GPT Image 2 / 可灵 / 即梦 / 海螺等

#### 1.2.3 Open Multi-Agent (OMA) —— 目标驱动的 TS 框架

- **项目地址**：github.com/open-multi-agent/open-multi-agent
- **时间**：2026-04 v0.1.0，当前 core v1.9.0
- **核心创新**：
  - **目标驱动 vs 图驱动**：用户描述目标而非画图，协调器运行时分解为任务 DAG
  - **计划即数据**：`planOnly`（预览）→ `createPlanArtifact`（冻结）→ `runFromPlan`（回放），计划可检视、可修改、可回放
  - **轻量核心**：3 个核心依赖，其他 provider/Gemini/Bedrock/MCP/Vercel AI SDK bridge 都是可选 peer dependency
  - **FileStore**：零依赖文件系统持久化，fsync+rename 原子写入，崩溃可恢复
  - **runConsensus**：提议者→评审者原语，per-task `verify` 钩子
  - **运行后仪表板**：任务 DAG、节点负责人、状态、token 分解、agent 输出日志

#### 1.2.4 aevatar.ai —— 跨域多 agent 平台

- **项目地址**：github.com/aevatarAI/aevatar
- **核心机制**：
  - **Actor + Event 内核**：基于 Microsoft Orleans 的分布式 actor 模型
  - **插件化部署**：从 DLL 加载到容器化到分布式执行，统一生态系统
  - **跨语言/跨平台 agent 通信协议**：自称"open-source universal protocol"
  - **多 agent 管理**：高效互联 + 复杂事件调度
- **启示**：为 myteams "多领域团队并存平台"提供了基于 actor 模型的架构参考

#### 1.2.5 Self-Evolving Agent 论文群 —— 团队自主进化的理论基础

- **综述 1**：IEEE Computational Intelligence Magazine 2026《A Comprehensive Survey of Self-Evolving AI Agents》（arXiv:2508.07407）
- **综述 2**：ACM Computing Surveys《A Survey of Self-Evolving Agents: On Path to ASI》（arXiv:2507.21046）
- **三层进化维度**：
  1. **个体自进化**：单 agent 复盘改错、优化推理策略（EvolveR, Darwin Gödel Machine, EvoTest）
  2. **技能自进化**：自动生成/打磨/淘汰工具技能（SkillEvolver, SkillWeaver, EvoSkill）
  3. **集群协同进化**：多 agent 自适应分工、调整团队结构（**Meta-Team**, MetaGen）
- **关键论文 Meta-Team**（arXiv:2605.29790）：个体-交互-团队三层协同进化，初始无预设分工，协作过程中自主演化组织形态，多 Agent 协同任务整体成功率 +45%
- **关键论文 MetaGen**（arXiv:2601.19290）：内置专职架构师 Agent，动态管控角色生成与协作拓扑，任务复杂度自适应切换星型/树型/网状拓扑

#### 1.2.6 A2A + MCP —— 2026 年通信标准双栈

- **MCP**（2024.11 Anthropic 发布，2025 年底归 Linux Foundation）：Agent ↔ 工具/数据，8000+ 社区服务器，78% 企业 AI 团队定为标准
- **A2A**（2025.04 Google 发布，2026 年归 Linux Foundation）：Agent ↔ Agent，"AI 界的 HTTP"
- **核心概念**：
  - **Agent Card**：JSON 名片，`GET /.well-known/agent.json`，包含 name/description/url/skills/capabilities/authentication
  - **任务状态机**：`submitted → working → input-required → completed/failed/canceled`
  - **消息与工件**：TextMessage / ImageMessage / FileMessage / Artifact
  - **三种发现方式**：已知 URL / 目录服务 / 广播
- **互补关系**：MCP 让 agent 能"做事"（调用工具），A2A 让 agent 能"协作"（与其他 agent 配合）

#### 1.2.7 记忆框架横评（Mem0 / Zep / LangMem / TiMem）

| 框架 | 架构 | LoCoMo 基准 | 核心特点 | 适用场景 |
|---|---|---|---|---|
| **Mem0** | 语义向量检索 | ~64% | 轻量、接入极简、生态成熟 | 短期上下文、简单偏好、快速原型 |
| **Zep** | 情节记忆图谱 | 78.94% | 时序感知好、社区活跃 | 中等周期（周~月）时序对话 |
| **LangMem** | 工作记忆 + 长期存储 | 78.05% | LangChain 原生 | 已用 LangChain 技术栈 |
| **TiMem** | 五层时序记忆树（TMT） | 75.30%（官方 LongMemEval-S 76.88%） | 跨月/季度记忆、token 省 52.20% | 长期陪伴、用户画像、跨周期推理 |

---

## 2. 按主题的外部最佳实践

### 2.1 团队持久化与进化机制

#### 2.1.1 持久化的三个递进维度（来自持久化 Agent 综述）

1. **会话持久化**：同一会话维持上下文（基本上下文窗口即可）
2. **跨会话持久化**：重启后仍记得历史（需向量库/KV store）
3. **持续运行持久化**：agent 主动后台运行，监听事件、执行任务（heartbeat 机制）

> **myteams 对应**：长期存在的团队必须达到第三级——不只是"记得过去"，还要"主动感知现在"。

#### 2.1.2 四层记忆架构（来自持久化 Agent 综述）

| 记忆类型 | 内容 | 在 myteams 中的映射 |
|---|---|---|
| **工作记忆** | 当前处理任务上下文，超限自动 compress | 团队当前正在做的任务上下文 |
| **情景记忆** | 过去发生的事件（向量库 ChromaDB/Qdrant） | 团队历史：会议决策、项目里程碑、协作记录 |
| **语义记忆** | 知识/偏好/事实（KV 存储 Redis/SQLite） | 团队共识、成员画像、项目背景、组织规范 |
| **程序记忆** | 任务操作流程/策略 | 团队 SOP、最佳实践模板、工作流 |

#### 2.1.3 自进化的三层维度（来自 Self-Evolving 综述）

1. **个体自进化**：agent 自我复盘改错、优化推理策略
   - **EvolveR**（ICML 2026）：在线采样 → 离线蒸馏规则 → 上线向量检索复用，工单任务 +42%
   - **Darwin Gödel Machine**（ICLR 2026 Oral）：种群+自指，Prompt/算法/元 三层变异，故障修复耗时 -63%
2. **技能自进化**：自动生成/打磨/淘汰工具技能
   - **SkillEvolver**（清华 2026.5）：轨迹监测→标准化封装→迭代淘汰，技能复用率 72%
   - **EvoSkill**：失败驱动，双层故障溯源 + 帕累托择优，长时序任务失败率 -53%
3. **集群协同进化**：多 agent 自适应分工、调整团队结构
   - **Meta-Team**（arXiv:2605.29790）：个体-交互-团队三层，无预设分工自主演化，成功率 +45%
   - **MetaGen**：内置架构师 Agent，角色生命周期管理（新建/优化/淘汰）+ 拓扑自适应（短任务星型/长任务网状）

#### 2.1.4 主动记忆巩固（防"日落型遗忘"）

- 每日提取关键事实存入长期记忆
- importance > 0.8 的事件检索权重 ×1.5
- 合并重复记忆、压缩低价值记忆至 30%
- 定期"记忆审计"：哪些经验从未复用？哪些被过度依赖？哪些已过时？

### 2.2 看板 / 可观测性设计

#### 2.2.1 Hermes Kanban 的看板哲学

> **核心转变**：从 `delegate_task` 的层级 RPC 协调，变为**持久化消息队列 + 状态机**的对等协调。

- **看板 = 持久化消息队列**：任务在重启、上下文压缩后仍存活
- **对等协调**：任何 profile 可读写任何任务（vs caller→callee 的层级）
- **永久审计**：`task_runs` 表记录每次 claim/blocked/crashed/completed，永不压缩
- **结构化交接**：`summary + metadata` 是阶段间主通信通道
  ```json
  {
    "changed_files": ["path/to/file.py"],
    "verification": ["pytest tests/ -x"],
    "dependencies": ["t_abc (parent task)"],
    "decisions": ["token-bucket over sliding-window"],
    "residual_risk": ["edge case in IP fallback not tested"]
  }
  ```
- **工件交付**：完成时附带 PDF/CSV/DOCX/图片/视频，自动推送消息平台

#### 2.2.2 KaibanJS 的可视化哲学

- **Trello/Jira 风格看板**：用户熟悉的 UX，降低"看懂"门槛
- **角色化 agent 卡片**：每个 agent 有 name/role/goal，像团队成员卡
- **实时任务流转**：agent 工作时卡片在列间移动
- **本地运行 + 团队共享**：无 vendor lock-in

#### 2.2.3 OMA 的运行后仪表板

- 任务 DAG 可视化
- 每个节点的负责人、状态、token 分解
- agent 输出日志
- `onProgress` + `onTrace` span 追踪

#### 2.2.4 可观测性最佳实践小结

| 维度 | 实践 | 来源 |
|---|---|---|
| 任务状态 | 七状态机 + DAG 依赖 | Hermes |
| 历史记录 | 永不压缩的 task_runs | Hermes |
| 阶段交接 | 结构化 summary+metadata | Hermes |
| 可视化 | Trello 风格看板 + DAG 图 | KaibanJS / OMA |
| 工件交付 | 完成时附带多模态文件 | Hermes |
| 追踪 | onProgress/onTrace span | OMA |
| 心跳 | kanban_heartbeat 长任务保活 | Hermes |

### 2.3 多领域团队并存

#### 2.3.1 Hermes 的多看板隔离模式

- 每个看板独立 SQLite DB（`~/.hermes/kanban/boards/<slug>/kanban.db`）
- 独立工作区和日志目录
- Worker 看不到其他看板（环境变量 `HERMES_KANBAN_BOARD` 固定）
- 无跨看板链接（任务依赖每看板独立）
- 单一安装管理多个域

#### 2.3.2 aevatar.ai 的 actor 模型平台

- 基于 Orleans 的分布式 actor
- 每个 agent 是一个 actor，独立生命周期
- 事件驱动互联，跨语言/跨平台
- 插件化部署：DLL/容器/分布式统一生态

#### 2.3.3 A2A 协议的跨框架互通

- 不同框架构建的 agent 通过 Agent Card 互相发现
- 任务状态机标准化
- 适合 myteams 让不同团队用不同框架，但通过 A2A 跨团队协作

#### 2.3.4 多领域并存的最佳实践小结

> **关键洞察**：多领域团队并存 ≠ 一个大统一框架，而是**隔离 + 标准化通信**。

| 层级 | 做法 | 来源 |
|---|---|---|
| 数据隔离 | 每团队独立 DB/工作区 | Hermes |
| 执行隔离 | 每团队自己的 profile/actor | Hermes / aevatar |
| 通信标准 | A2A Agent Card + 任务状态机 | A2A |
| 工具标准 | MCP 8000+ 服务器 | MCP |
| 团队自治 | 各团队自己的协作模式 | 六种协作设计模式 |

### 2.4 自治与人在环（HITL）

#### 2.4.1 HITL vs HOTL 范式

| 维度 | HITL（人在回路） | HOTL（人在环上） |
|---|---|---|
| 人类角色 | 审批者/决策者 | 监督者/例外处理者 |
| Agent 自主权 | 低（每步需批准） | 高（规则内自主） |
| 响应速度 | 慢 | 快 |
| 可扩展性 | 差（人力瓶颈） | 好（一人监督多 agent） |
| 适用 | 高风险决策 | 常规任务 + 例外升级 |

> **关键立场**：HITL 与 HOTL 不是二选一，而是**分层使用**——高风险用 HITL，常规任务用 HOTL。

#### 2.4.2 四层人类介入金字塔

```
        ┌─────────────┐
        │   兜底层    │ ← 紧急熔断/人工接管
   ┌────┴─────────────┴────┐
   │      干预层           │ ← 执行中暂停/修改
  ┌┴───────────────────────┴┐
  │          指导层          │ ← 提供建议/方向
 ┌┴───────────────────────────┴┐
 │              审批层          │ ← 事前批准/拒绝
 └──────────────────────────────┘
```

1. **审批层**（事前）：agent 提出行动 → 人类批准 → 执行（LangGraph `interrupt()`）
2. **指导层**（方向）：人类提供目标/约束 → agent 自主执行（OpenClaw `HEARTBEAT.md`）
3. **干预层**（执行中）：人类发现异常 → 暂停/修改（`subagents steer`）
4. **兜底层**（熔断）：连续错误超阈值 → 自动熔断 → 人工接管（CircuitBreaker）

#### 2.4.3 权限四级分类

| 级别 | 名称 | 示例 | 控制方式 |
|---|---|---|---|
| L1 | 只读 | 搜索、读文件、查询 API | 无需审批 |
| L2 | 低风险写 | 创建草稿、内部消息、测试环境 | 事后通知 |
| L3 | 中风险写 | 发布内容、改配置、小额支付 | 事前审批 |
| L4 | 高风险写 | 删数据、生产部署、大额支付、权限变更 | HITL + 二次确认 |

#### 2.4.4 Hermes 的三重安全门（防 agent 失控）

| 门 | 防御的失败模式 | 机制 |
|---|---|---|
| **所有权门** | Agent 修改非自己的任务 | `HERMES_KANBAN_TASK` scope 检查 |
| **幻觉卡片门** | Agent 虚报不存在的任务 ID | 验证卡片真实存在且属于当前 profile |
| **断路器** | 无限重试死循环 | `consecutive_failures >= N` 自动阻塞，需人工 unblock |

#### 2.4.5 常见陷阱

| 陷阱 | 解决方案 |
|---|---|
| 审批疲劳（盲目批准） | 提高 L2 自主范围，减少 L3 |
| 上下文缺失 | 强制包含"为什么需要这个操作" |
| 超时未响应 | 设置合理超时，超时升级或拒绝 |
| 权限漂移 | 定期权限审计（每季度） |
| 单点故障 | 设置备份审批者 |

### 2.5 内容创作类 agent 团队

#### 2.5.1 Toonflow 的三层 Agent 协作体系

```
┌──────────────────────────────────────┐
│         决策层（导演 Agent）          │  ← 统筹叙事节奏、任务优先级
├──────────────────────────────────────┤
│  编剧    分镜    一致性    配音      │  ← 执行层
│  Agent   Agent   Agent     Agent     │
├──────────────────────────────────────┤
│         监督层（质检 Agent）          │  ← 审查情节漏洞、角色矛盾
└──────────────────────────────────────┘
```

#### 2.5.2 关键创新

- **章节事件图谱**：自动提取原著章节级事件结构化存储，改编时按图谱精准调用上下文，控制 token 消耗的同时保持 fidelity
- **角色一致性 Agent**：建立角色外貌数据库，跨场景/跨镜头保持人物特征稳定，解决 AI 短剧最核心的"角色变脸"难题
- **可编程供应商系统**：设置中心直接写 TypeScript 即时生效，无需重启或改源码
- **无限画布工作台**：节点化编排，支持并行生产
- **持久化记忆**：ONNX 本地向量检索，短期消息缓存 + 长期摘要压缩 + 语义召回

#### 2.5.3 内容创作 pipeline 模式

```
小说/创意
   ↓ 事件图谱提取
事件图谱
   ↓ 编剧 Agent（按图谱调用上下文）
结构化剧本
   ↓ 分镜 Agent（景别/构图/光线/镜头）
分镜脚本
   ↓ 一致性 Agent + 批量出图
角色/场景素材
   ↓ 配音 Agent
多角色语音
   ↓ 视频合成
成片（9:16 / 16:9）
```

#### 2.5.4 其他内容创作参考

- **ZhiJuTong (ZJT)**：开源 AI 短剧平台，自动化专业短剧
- **ai-short-drama**：多 agent pipeline（screenwriter → ...），AI 短剧/微剧视频生成器
- **OpenAI Agent SDK 多智能体小说创作框架**：基于 Responses API 的小说创作实践

---

## 3. 外部方案对 myteams 的启示

### 启示 1：看板应是"持久化消息队列 + 状态机"，而非 RPC 调用

- **来源**：Hermes Agent Kanban
- **应用**：myteams 的看板不应是 `delegate_task` 式的同步 RPC（caller→callee），而应是 Hermes 式的**持久化消息队列 + 七状态机**。任务在重启、上下文压缩后仍存活，支持 fire-and-forget 创建。跨 agent/团队的工作建模为消息传递而非函数调用。
- **关键设计**：SQLite WAL + compare-and-swap 即可实现原子 claim，无需引入 Redis/etcd 等额外基础设施。

### 启示 2：多团队并存 = 数据隔离 + 标准化通信，而非一个大框架

- **来源**：Hermes 多看板隔离 + aevatar.ai actor 模型 + A2A 协议
- **应用**：myteams 的短剧/小说/应用开发三个团队各干各的，应像 Hermes 多看板一样——每团队独立 DB/工作区/profile，无跨团队链接。团队间协作通过 A2A 协议的 Agent Card 互相发现，通过 MCP 共享工具。每团队可以选自己的协作模式（短剧用 Toonflow 式三层架构，应用开发用 OMA 式目标驱动 DAG）。
- **关键设计**：单一安装管理多个团队，而非每个团队单独部署。

### 启示 3：头脑风暴 → 方案阶段采用"目标驱动 + 计划可回放"

- **来源**：Open Multi-Agent (OMA)
- **应用**：myteams 的"头脑风暴 → 确定方案"阶段，不要让用户画 DAG，而要让协调器在运行时把目标分解为任务 DAG。提供 `planOnly`（预览计划）→ `createPlanArtifact`（冻结为制品）→ `runFromPlan`（精确回放）三段控制，让用户在看板上**看到计划、调整计划、再执行**。
- **关键设计**：计划即数据，可检视、可修改、可回放，避免重复调用协调器的成本。

### 启示 4：团队自主进化 = 三层进化 + 主动记忆巩固

- **来源**：Self-Evolving Agent 论文群（Meta-Team, MetaGen, SkillEvolver）+ 持久化 Agent 综述
- **应用**：myteams 的"自动优化"诉求对应自进化。三层落地：
  1. **个体层**：每个 agent 复盘改错（EvolveR 式在线采样 + 离线蒸馏规则 + 向量检索复用）
  2. **技能层**：自动生成/淘汰团队技能（SkillEviver 式轨迹监测 + 标准化封装 + 成功率<60% 淘汰）
  3. **团队层**：自主演化分工与拓扑（Meta-Team 式无预设分工 + MetaGen 式架构师 Agent 动态角色管理）
- **配套**：每日"主动记忆巩固"——提取关键决策存长期记忆、提升重要事件权重、合并重复、压缩低价值、定期记忆审计。

### 启示 5：看板 UX 要"Trello 风格 + DAG 可视化 + 工件交付"

- **来源**：KaibanJS + OMA 仪表板 + Hermes 工件交付
- **应用**：myteams 强调"用户要能看懂、能理解"。看板应：
  - 主视图用 Trello/Jira 风格列式看板（KaibanJS），用户熟悉的 UX
  - 任务卡片展示角色化 agent（name/role/goal，像团队成员卡）
  - 切换到 DAG 视图看任务依赖（OMA 仪表板）
  - 任务完成时自动交付工件（PDF/视频/代码）到看板卡片（Hermes 工件交付）
  - 永久历史记录，任何时刻可回溯（Hermes task_runs）

### 启示 6：HITL 分层介入，匹配团队风险等级

- **来源**：kejun 多 Agent 治理 blogpost + Hermes 三重安全门
- **应用**：myteams 不同团队不同操作匹配不同介入层级：
  - 短剧团队：剧本发布用 L3 事前审批，角色一致性检查用 L1 自动
  - 小说团队：章节发布用 L2 事后通知，敏感内容用 L3
  - 应用开发团队：生产部署用 L4 HITL+二次确认，测试环境用 L2
- **配套**：每团队配置断路器（连续失败 N 次自动阻塞），所有权门（agent 不能改别人的任务），幻觉卡片门（验证所有声明的事实）。

### 启示 7：内容创作团队采用"事件图谱 + 角色一致性 Agent"

- **来源**：Toonflow
- **应用**：myteams 的短剧/小说团队直接借鉴 Toonflow 架构：
  - **事件图谱驱动改编**：自动提取原著章节事件，按图谱调用上下文，控制 token + 保持 fidelity
  - **角色一致性 Agent**：建立角色外貌数据库，跨场景/跨镜头锚定，解决"角色变脸"
  - **三层 Agent 协作**：决策层（导演）+ 执行层（编剧/分镜/一致性/配音）+ 监督层（质检）
  - **可编程供应商系统**：设置中心直接写 TS 即时生效，支持多模态模型自由切换
  - **无限画布工作台**：节点化编排，支持并行生产

### 启示 8：六种协作模式作为团队的"模式语言"

- **来源**：多 Agent 协作设计模式综述（刘道玉 2026-05）
- **应用**：myteams 各团队"按自己方式协作"需要模式语言支撑。六种模式按场景选：
  - **管道式**：内容创作 pipeline（编剧→分镜→视频）
  - **层级式**：应用开发（PM 调度 + 多专家并行）
  - **辩论式**：方案评审（多 agent 辩论收敛）
  - **黑板式**：跨团队协作（共享状态，去中心化）
  - **共识式**：关键决策投票
  - **演化式**：长期团队的元模式，包裹其他模式自适应变化
- **关键洞察**：协调是架构层，不是实现细节。将协调显式化、可配置化，使协作效率可独立于 agent 能力来优化。

### 启示 9：记忆选型按"周期 + 时序需求"决定

- **来源**：Mem0/Zep/LangMem/TiMem 横评
- **应用**：myteams 长期团队记忆选型：
  - **短期上下文/快速原型**：Mem0（轻量、5 分钟接入）
  - **中等周期（周~月）时序对话**：Zep（情节图谱、时序感知）
  - **已在用 LangChain**：LangMem（零摩擦集成）
  - **长期陪伴/跨月/用户画像**：TiMem（五层时序记忆树，token 省 52.20%）
- **推荐**：myteams 长期团队优先评估 TiMem，因为团队需要跨月/跨季度的长期记忆，且 token 成本是关键。

### 启示 10：A2A + MCP 作为标准化通信底座

- **来源**：A2A 协议 + MCP
- **应用**：myteams 不应自建通信协议，而应：
  - **MCP** 作为 agent ↔ 工具层标准（78% 企业已采用，8000+ 服务器）
  - **A2A** 作为 agent ↔ agent 通信标准（Google + Linux Foundation，2026 事实标准）
  - 每个团队/agent 发布 Agent Card（`/.well-known/agent.json`），其他团队可发现并协作
  - 任务状态机标准化（submitted/working/input-required/completed/failed/canceled）
- **关键收益**：跨团队协作无需自研协议；未来接入第三方 agent 零成本；与生态兼容。

---

## 4. 值得关注的新趋势

### 4.1 A2A + MCP 双栈成为事实标准（2026）

- **A2A**（Google → Linux Foundation）：agent 间通信的"HTTP"
- **MCP**（Anthropic → Linux Foundation）：agent 与工具的"USB-C"
- **趋势**：2026 年两者形成互补生态，78% 企业 AI 团队已将 MCP 定为标准。myteams 应直接采用，而非自研通信层。

### 4.2 自进化智能体从论文走向工业（2025-2026）

- **IEEE CIM 2026 综述**（arXiv:2508.07407）：统一学术定义，划分四大分支
- **ACM Computing Surveys**（arXiv:2507.21046）：从 AGI 视角梳理技术路线
- **工业落地三阶段**：实验室原型 → 小规模商用 → 全场景工业化
- **关键痛点**：新领域冷启动缺样本、技能迭代过拟合、超长任务收益难量化、进化上限受基座大模型限制
- **未来方向**：轻量化混合微调、跨领域技能迁移、**标准化自进化中间件**

### 4.3 协调作为架构层（Coordination as an Architectural Layer）

- **论文**：Nechepurenko & Shuvalov 2026.05（arXiv:2605.03310）
- **核心主张**：协调应与 agent 逻辑、信息访问**分离**，作为可配置的架构层
- **三层架构**：Agent Logic Layer / Coordination Layer / Information Access Layer
- **Murphy 分解**：将 Brier 评分分离为校准度 + 区分度，使不同协调配置产生可区分的"故障签名"
- **关键洞察**：多 Agent LLM 系统生产失败率 41%-87%，大部分源于协调缺陷而非模型能力。myteams 应显式化协调层，使其可独立优化。

### 4.4 小世界网络作为协作拓扑原理

- **论文**：Wang et al. 2025.12
- **核心观点**：多 agent 系统拓扑应借鉴小世界网络——短路径长度 + 高聚类系数
- **反模式**：全连接导致信息过载；纯层级导致全局慢
- **实践启示**：myteams 团队内部保持高聚类（频繁交互的 agent 紧密连接），引入少量"桥梁" agent 连接不同子团队，避免全连接。

### 4.5 演化式元模式 + 协同进化知识图谱

- **MAGE**（arXiv:2605.10064）：四子图协同进化知识图谱（经验/任务/技能/关系），双 Bandit 机制（任务级搜索 + 技能级路由）从同一奖励流更新
- **Swarm Skills**（arXiv:2605.10052）：可移植的协调规范，自演化算法从成功轨迹提炼新技能，多维评分（有效性/利用率/新鲜度）
- **趋势**：从"自然语言反馈"进化到"结构化知识图谱"；从静态拓扑到动态演化。

### 4.6 持久化 agent 的"日落型遗忘"问题被重视

- **问题**：长期运行 agent 的关键知识被新知识稀释或覆盖
- **三大原因**：向量检索相似度偏差、上下文饱和、模型更新灾难性遗忘
- **应对**：主动记忆巩固（每日提取关键事实、提升重要事件权重、合并重复、压缩低价值）
- **新方向**：AgentBench-Persistence 评测长生命周期中的记忆能力、身份一致性、任务完成率
- **趋势**：Cloudflare Agent Memory 2026.04 私测，标志持久化记忆从实验特性走向生产标准。

### 4.7 内容创作 agent 从"单 LLM 直出"走向"多 agent 工业化"

- **代表**：Toonflow、ZhiJuTong、ai-short-drama
- **趋势**：多 agent 协作（导演/编剧/分镜/一致性/质检/配音）的输出质量大幅超越单 LLM 直出
- **关键突破**：角色一致性 Agent 解决"变脸"难题；章节事件图谱解决长篇 token 爆炸；可编程供应商系统支持模型无关
- **对 myteams**：短剧/小说团队不再是"实验性"，而是已有成熟工业化方案可借鉴。

### 4.8 记忆框架从"通用"走向"分层时序"

- **2026 横评结论**：场景越简单选 Mem0，时序需求越强选 TiMem
- **趋势**：五层时序记忆树（TiMem）模拟人脑 CLS 理论，token 消耗减少 52.20%，长期运行成本显著降低
- **对 myteams**：长期团队应评估 TiMem 类时序记忆方案，而非只用扁平向量检索。

---

## 5. 调研覆盖度与局限说明

### 5.1 覆盖较好的方向

- ✅ 看板/可观测性（Hermes / KaibanJS / OMA 三方详评）
- ✅ 多 agent 协作设计模式（六种模式 + 小世界网络 + 协调架构层）
- ✅ 自进化机制（Self-Evolving 综述 + Meta-Team / MetaGen / SkillEvolver 等论文）
- ✅ 持久化与记忆（四层记忆架构 + 四大记忆框架横评 + 主动巩固）
- ✅ HITL 治理（4 层介入 + L1-L4 权限 + 三重安全门）
- ✅ 内容创作（Toonflow 端到端 + ZJT/ai-short-drama）
- ✅ 通信标准（A2A + MCP 双栈）

### 5.2 覆盖有限的方向

- ⚠️ **GitHub star 排行**：WebSearch 返回的项目多为 2025-2026 中等热度项目（Hermes/OMA/Toonflow/aevatar），未找到 2026 年新爆红的"star 数极高的新项目"。可能原因：2026 年新项目尚未积累高 star，主流仍是 LangGraph/CrewAI/AutoGen 等老牌框架（已在已知参考中）。
- ⚠️ **多领域团队并存的纯平台项目**：除了 aevatar.ai，纯"多领域团队并存平台"的公开项目较少，更多是单领域多 agent 框架。
- ⚠️ **企业级生产案例**：大部分资料是开源项目/论文/博客，缺少大型企业的生产案例细节（除 Hermes 部署案例外）。

### 5.3 未深入但值得后续跟进

- **OpenClaw**：在 HITL 文章中多次被引用，似乎是 2026 年重要开源 agent 项目，值得单独调研
- **Orchard**（arXiv:2605.15040）：开源 agentic modeling 框架，提供统一调度原语
- **APWA**（arXiv:2605.15132）：Agent-Parallel Workload Architecture，并行化架构
- **MAGE / Swarm Skills**：自演化与协调规范，论文层有深度，工程实现待跟进
- **AgentBench-Persistence**：长生命周期 agent 评测标准，待正式发布

---

## 6. 给 team-lead 的快速结论

### 6.1 最值得 myteams 直接借鉴的 3 个项目

1. **Hermes Agent Kanban**：看板 + 持久化 + 多看板隔离 + 三重安全门 —— 几乎是 myteams 看板诉求的现成参考
2. **Toonflow**：短剧/小说团队的端到端范本 —— 事件图谱 + 角色一致性 + 三层 Agent 协作
3. **Open Multi-Agent (OMA)**：目标驱动 + 计划可回放 —— 头脑风暴→方案阶段的范式

### 6.2 最值得 myteams 关注的 3 个趋势

1. **A2A + MCP 双栈标准化**：不要自建通信层，直接采用生态标准
2. **自进化从论文走向工业**：Meta-Team / MetaGen 提供团队自主进化的实现路径
3. **协调作为架构层**：把协调显式化、可配置化，独立于 agent 能力优化协作

### 6.3 最值得 myteams 警惕的 3 个陷阱

1. **全连接幻觉**：所有 agent 两两通信 → 信息过载，应用小世界拓扑
2. **日落型遗忘**：长期团队关键知识被稀释 → 必须主动记忆巩固
3. **审批疲劳**：HITL 用太多 → 人类盲目批准，应分层介入

---

> 报告完。如需对某一项目/趋势做更深入的代码级调研，可继续指派任务。
