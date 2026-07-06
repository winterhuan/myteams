# 01 - 参考项目文档洞察提炼

> 作者：doc-explorer
> 日期：2026-07-06
> 范围：通读 `docs/` 下 16 份 `*-分析.md`、`横向对比矩阵.md`、`mcp-skills-分析.md`、`myteams-方案.md`，提炼对设计「用户能看懂的 agent teams 平台」有价值的洞察。
> 原则：不复述项目，只提炼机制层面的借鉴；每条洞察标源文档路径，便于追溯。

---

## 1. 各参考项目核心创新点速览

| 项目 | 一句话创新 | 对 myteams 的启发 | 风险/教训 |
|------|------------|-------------------|-----------|
| **Pi** | 极简 harness，Skills 优先（刻意不做 MCP/子 agent） | 默认执行底座之一；Steering/Follow-up 双队列模型可借鉴；「不 fork 内核」哲学 | 无内置沙箱；orchestrator 实验性；不能当团队平台用 |
| **acpx** | ACP 统一 CLI + 可嵌入 runtime + Conformance 套件 | 多引擎统一接入层参考；Session scope key `(agent,cwd,name)` 支持并行；`compare` 跨模型对比 | Alpha；表面积仍在演进；不提供业务语义 |
| **Paseo** | Daemon-as-Infrastructure + Protocol/Feature 双契约 + 跨设备 | Timeline epoch+sequence 去重；Tab vs Archive 解耦；终端性能管线范式 | AGPL；协议契约维护成本高；偏开发者环境而非团队养成 |
| **Omnigent** | Meta-Harness 插件注册表 + Bridge 文件 rendezvous + Policy 三层栈 | Harness 能力矩阵声明式表达；跨进程桥接用文件系统+原子 rename；策略单一评估端点 | Alpha；全栈复杂；Harness 双轨维护负担 |
| **Clowder AI** | 球权状态机（8 态 17 事件）+ @行首路由 + SOP 双轨 + MCP Callback Bridge | 球权是 Thread 模式子机制；SOP YAML + predicate 渐进机器化；跨模型 review 硬规则；Prompt 片段化注入 | 生产级但全栈重；Redis 依赖；品牌/文化绑定强；不宜整体 fork |
| **Symphony** | WORKFLOW.md 版本化策略 + 每工单 workspace + Continuation + Blocked 显式建模 | 策略跟 repo 走、可 PR review；长跑任务断点续作；blocked 不停服不丢 claim；SPEC 与实现分离 | Codex 单绑定；blocked 仅内存不持久；参考实现是 Elixir |
| **Multica** | Issue 看板 + Agent 一等公民 + Squad+leader 路由 + Daemon 执行 | Agent 出现在看板可 assign；Squad 稳定寻址避免人名爆炸；Skill 复利沉淀 | 完整 PM 产品过重；云 SaaS 优先；Issue 当全产品中心会降格「养队」 |
| **OpenTeams** | Free Chat + Workflow 双模式 + 共享 session 上下文 + 步骤级控制 | 双模式是 myteams 最接近的参考；计划图可见；hybrid 模板（Chat 澄清 + Workflow 调度） | 偏单 session 多 agent；Rust/Tauri 全栈重；无 custody 事件溯源 |
| **OpenCrew** | 频道=岗位 + L0–L3 自主等级 + Closeout/Artifact + KO 知识层分离 | 持久 Member 角色不必每次临时拉人；Autonomy 阶梯写入平台 Policy；知识层与协作层可分；Markdown 即规范 | 强依赖 Slack+OpenClaw；A2A 独立 App 防循环较复杂 |
| **Archon** | YAML DAG workflow + 确定性/AI 混合节点 + worktree 隔离 + approval gate | WorkflowRun 模式参考；步骤级重试/审批；跟 repo 走的 YAML；DAG schema | 单 Agent 按 DAG 跑，非多 Agent 群聊；多 Agent 需外接 |
| **CCG** | Strategy Router（intent→strategy）+ Phase HARD STOP + Hook 状态注入 | 小修不走重流程的路由思想；HARD STOP 人批门禁；并行 Builder+文件所有权 | 仅 Claude Code 生态；是 Harness 插件赛道，非平台 |
| **LangGraph** | Pregel BSP + Channel/reducer + Checkpoint+thread + interrupt/Command | WorkflowRun 后端引擎候选；Checkpoint 恢复 + interrupt 审批；Send fan-out 并行；子图组合 | Python 中心；低层无团队语义；中断重跑需注意幂等 |
| **Deep Agents** | Middleware 栈 + SubAgent 委托 + 文件系统 + 摘要 + Skills 渐进披露 | 可选成员执行引擎；子任务委托模式；上下文工程成熟（offload/摘要/DeltaChannel） | LangChain 深度绑定；无团队协作语义；Opinionated 重量 |
| **OpenWiki** | Agent-first 文档 + 仓库内嵌 wiki + 证据驱动 + 增量 no-op + AGENTS.md 注入 | 队知识沉淀范式；Git 增量驱动刷新；双层 no-op 省 token；子 Agent 只读调研+主 Agent 写入 | 单 Agent 架构；文档形态固定；0.0.1 Alpha |
| **Agno** | TeamMode 四分法 + RunEvent 流 + checkpoint+continue_run + LearningMachine + AgentOS | Team 编排语义参考；tasks 模式任务板；事件流驱动 UI；Registry 组件持久化 | Python 单体；配置即代码；无「队宪/领域阶段」一等公民；无团队养成顶层抽象 |
| **MCP/Skills** | Skills（知识层）与 MCP（工具层）职责分离；5 种可复用架构模式 | Skill 说明书 + MCP API 双轨；Callback Bridge 适配无 MCP 的 CLI；WORKFLOW 点名 Skills | 每 CLI 的 MCP 配置方式不同；跨 Agent Skills 需同步 |

---

## 2. 横向洞察（按主题）

### 2.1 团队组织模式（Team / Role / Charter）

**核心洞察**：团队组织有三种范式，myteams 需融合而非选一。

| 范式 | 代表项目 | 一等对象 | 适用 |
|------|----------|----------|------|
| **岗位即频道** | OpenCrew | Channel + 持久 Member + SOUL.md | IM 原生、身份感强 |
| **编队即配置** | Multica / Agno | Squad/Team + members + instructions | 程序化、可嵌套 |
| **团队即生命体** | Clowder | Cat persona + Pack + 平行世界 | 养成感、文化沉淀 |

**对 myteams 的启发**：
- v1.2 的 `Team + Member + Charter` 已吸收前两种范式，但 **「团队即生命体」的养成感不足**——Briefing 是记忆，但团队缺少「人格画像、成长轨迹、风格辨识」这类用户可感知的维度。
- OpenCrew 的「KO（知识官）与协作层分离」值得借鉴：团队应有一个 **显式的知识维护角色**，而非让所有成员都隐式承担记忆更新。
- Agno 的 `TeamMode`（coordinate/route/broadcast/tasks）比 v1.2 的 `thread/workflow/hybrid` 更细粒度——`tasks` 模式（分解任务列表并行执行）正是应用开发队 delivery 阶段所需，v1.2 目前用 WorkflowRun 笼统覆盖。

**关键引用**：
- `docs/opencrew-分析.md` §3 治理协议、§4 与 Clowder 对比
- `docs/agno-分析.md` §3.3 Team + TeamMode、§7.2 映射关系
- `docs/clowder-ai-分析.md` §1.2 品牌叙事、§6 世界模型
- `docs/multica-分析.md` §2 核心概念 Squad

### 2.2 协作模式（Thread / Workflow / 混合怎么取舍）

**核心洞察**：成熟产品都占 ≥2 轴（Work/Thread/Workflow），纯单轴产品会缺腿。

```
Work 轴（活从哪来）    Thread 轴（谁在对谁说什么）   Workflow 轴（步骤怎么跑）
Multica、Symphony      OpenCrew、Clowder           Archon、CCG
                       OpenTeams Chat              OpenTeams Workflow
```

**对 myteams 的启发**：
- v1.2 已有 Thread + Workflow 两轴，**Work 轴偏弱**。Mission brief 是高阶输入，但「brief → 卡片」的分解过程是黑盒，委托人看不见也干预不了。Multica 的 Issue-as-work-object 值得部分吸收——不是做完整 PM，而是让 **工作分解过程可见可干预**。
- CCG 的 Strategy Router 思想（小修不走重流程）是 v1.2 缺失的：当前三支队都走 brainstorm→scheme→delivery，但短剧队「改一句台词」不该走全流程。需要 **意图路由层**。
- Clowder 球权状态机太重（8 态 17 事件），v1.2 用 `custody` 字段轻量化是对的；但 **「谁现在拿着球」这件事在看板上要可见**——v1.2 的 WorkCard 只有 assignee，没有「当前责任方」的运行时语义。

**关键引用**：
- `docs/横向对比矩阵.md` §13.1 三轴分类
- `docs/ccg-workflow-分析.md` §2 策略矩阵
- `docs/openteams-分析.md` §2 双模式协作
- `docs/clowder-ai-分析.md` §3.3 球权状态机
- `docs/multica-分析.md` §4 Thread + 可选 WorkItem 双轨

### 2.3 记忆与进化（团队如何跨任务学习）

**核心洞察**：记忆要分桶、要由结构化事件触发、要能增量刷新，不能是一坨对话历史。

| 机制 | 代表项目 | 做法 |
|------|----------|------|
| **分桶记忆** | OpenCrew | `knowledge/{principles,patterns,scars}.md` 三桶 |
| **多 Store 学习** | Agno | LearningMachine：user_profile / user_memory / session_context / entity_memory / learned_knowledge / decision_log |
| **Closeout 触发** | OpenCrew | `closeout (signal≥2) → #know → KO → knowledge/` |
| **Git 增量刷新** | OpenWiki | `.last-update.json` + `git log <lastHead>..HEAD` + impact plan + diff 预算 |
| **证据驱动** | Clowder | SqliteEvidenceStore + EntityRegistry + `search_evidence` MCP |
| **渐进披露** | Pi / Deep Agents | Skills 仅 name+description 常驻 context，按需 read 全文 |

**对 myteams 的启发**：
- v1.2 的 `Briefing (principles/patterns/scars/changelog)` 三桶结构是好的，但 **「进化」对用户是不可见的**——用户看不到「这支队这季学到了什么」。需要把 Briefing changelog 做成 **用户可读的「队成长日志」**，而不只是内部注入。
- OpenWiki 的 **Git 增量 + no-op + diff 预算** 是 Briefing 刷新的最佳范式：不是每次 Mission 结束全量重写，而是基于本次 Mission 的产物 diff，外科手术式更新对应桶。
- Clowder 的「跨 family review 硬规则」（写者与审者必须不同 family）应写入队宪，作为 Briefing 的 `principles` 默认条目——这是跨任务学习沉淀下来的纪律。
- v1.2 缺一个角色：**谁负责把 Closeout 写入 Briefing？** OpenCrew 有 KO（知识官），Clowder 有 KO 猫，myteams 应在 Member 里显式设一个「记忆维护者」角色，否则 Closeout 模板会沦为摆设。

**关键引用**：
- `docs/opencrew-分析.md` §3.3 知识沉淀
- `docs/agno-分析.md` §4.3 记忆与学习、LearningMachine
- `docs/openwiki-分析.md` §4.2 Wiki 生成策略、§4.4 Update No-op
- `docs/clowder-ai-分析.md` §3.5 Memory & Evidence、§4.5 跨模型 Review
- `docs/pi-分析.md` §5.2 Skills 渐进披露

### 2.4 看板与可观测性（委托人怎么看进展）

**核心洞察**：看板回答「有什么活」，时间线回答「发生了什么」，阶段回答「在哪一段」——但委托人最想问的是「这支队现在健康吗、要不要我操心」。

| 项目 | 可观测性强项 | 盲区 |
|------|--------------|------|
| Multica | Agent 在看板上可见、可 assign、主动报 blocker | 偏 Issue 生命周期，无团队养成视角 |
| Paseo | Timeline epoch+sequence 去重；Tab/Archive 解耦 | 偏单 Agent 时间线，无多角色协作现场 |
| Symphony | StatusDashboard + token 聚合 + blocked 可见 | 无团队概念，每工单独立 |
| Clowder | Mission Hub + Bulletin Board + Skills 标签页 | 信息密度高，非技术用户难看懂 |
| OpenTeams | Workflow 计划图可见、步骤级状态 | 偏 session 内，跨 Mission 视角弱 |

**对 myteams 的启发**：
- v1.2 的 Hub 三视图（看板/时间线/阶段）是工程师视角的合理设计，但 **委托人视角缺位**。委托人 landing 到看板，看到「进行中 5 张卡、阻塞 1 张」——然后呢？他需要的是 **「这周这支队做了什么、卡在哪、要不要我拍板」的摘要层**，而不是原始卡片列表。
- Symphony 的 **token 聚合** 和 Clowder 的 finance 包提醒：委托人关心成本。v1.2 完全没提 token/费用可见性——这对「用户能看懂」是缺失，因为「这支队烧了多少钱」是委托人会问的问题。
- Paseo 的 **Tab vs Archive 解耦** 对多 Mission 并行有意义：委托人可能同时关注 3 支队的 3 个 Mission，需要 Tab 级布局而非强制单 Mission 聚焦。
- v1.2 的「待拍板队列」太薄。L3 escalation 不仅要列条目，还要给委托人 **决策上下文包**（Symphony 的 Decision Packet、Clowder 的 handoff Decision Packet）——「为什么要我拍、选项是什么、各有什么后果」。

**关键引用**：
- `docs/multica-分析.md` §2 Agent 一等公民 + 看板
- `docs/paseo-分析.md` §4.3 Tab vs Archive、§3.2 Timeline
- `docs/symphony-分析.md` §3.6 可观测性、token 统计
- `docs/clowder-ai-分析.md` §3.6 Mission Hub
- `docs/openteams-分析.md` §2 Workflow 计划图可见

### 2.5 自治与门禁（L0–L3 怎么落地）

**核心洞察**：自治等级要写入平台 Policy，更要让委托人在看板上「看见」当前在哪个等级。

| 项目 | 门禁机制 | 落地方式 |
|------|----------|----------|
| OpenCrew | L0–L3 自主等级 | 写入 SOUL.md + Charter，L3 必须人确认 |
| Archon | `interactive: true` approval gate | 节点级，等 APPROVED |
| CCG | Phase HARD STOP | 阶段级，planning 后等人批 |
| LangGraph | `interrupt(value)` + `Command(resume)` | 节点级，恢复重跑整个节点 |
| Deep Agents | `interrupt_on` + `FilesystemPermission` | 按工具名 / 路径规则 |
| Agno | `HumanReview` + approvals router | 全链路 HITL：确认/输入/审核/超时 |
| Symphony | `approval_policy` + blocked 建模 | Codex 请求 operator input 时标 blocked |

**对 myteams 的启发**：
- v1.2 的 L0–L3 表格是好的，但 **「当前这支队在哪个等级运行」对委托人不可见**。看板卡片应显示「L1 可逆」或「L3 待批」标记——让委托人一眼知道哪些动作需要他操心。
- CCG 的 **HARD STOP** 比 v1.2 的「人批后进入实施」更明确：应有一个 **不可绕过的暂停态**，而非靠「委托人记得去批」。LangGraph 的 `interrupt` 是技术实现参考。
- Symphony 的 **blocked 显式建模** 值得吸收：当 Agent 需要人介入时，不是默默卡住，而是在看板上 **标红 + 进入 blocked 列 + 通知**。v1.2 的 WorkCard 有 blocker 字段但语义偏弱。
- Agno 的 `HumanReview` 四态（确认/输入收集/输出审核/超时策略）比 v1.2 的单一「人批」更细——委托人可能不只是 yes/no，还要补信息或审核产物。

**关键引用**：
- `docs/opencrew-分析.md` §3.2 治理协议、L0–L3
- `docs/archon-分析.md` §2 工作流模型、approval gate
- `docs/ccg-workflow-分析.md` §3 阶段状态机 HARD STOP
- `docs/langgraph-分析.md` §3.5 控制原语、§4.3 HITL
- `docs/deepagents-分析.md` §3.5 权限模型、§4.7 HITL
- `docs/agno-分析.md` §3.4 Workflow HumanReview、§4.6 AgentOS approvals
- `docs/symphony-分析.md` §4.4 Blocked 语义

### 2.6 Harness 中立（如何不绑死单一引擎）

**核心洞察**：Harness 中立不是「接很多引擎」，而是「换引擎不改协作语义」。

| 项目 | 中立策略 | 借鉴点 |
|------|----------|--------|
| acpx | ACP 作为稳定边界 | 换 agent 只改 agent 名，不改编排代码 |
| Omnigent | Harness 插件注册表 + 能力矩阵声明 | 声明式能力表达，动态加载 |
| Paseo | Provider Registry（ACP + Direct 双模式） | 协议适配层 + 能力 flag |
| LangGraph | langchain-core Runnable 解耦 | 图编排与 LLM 提供商解耦 |
| Deep Agents | Middleware/Backend/Profile 可替换 | 任何中间件/后端可覆盖 |

**对 myteams 的启发**：
- v1.2 的 `EngineAdapter` + `AgentSession` 接口方向正确，但 **「换引擎的代价」没说清**。不同 Harness 的能力差异（如 Pi 无 MCP、Codex 有 app-server、Claude 有原生 MCP）需要像 Omnigent 那样 **声明式能力矩阵**，而非假设所有引擎能力等价。
- acpx 的 **Conformance suite**（21 个 case 测试 adapter 行为一致性）是 Harness 中立的工程保障——myteams 若要多引擎，需要类似的 **行为契约测试**，否则「换引擎」会变成「换 bug」。
- Paseo 的 **Protocol/Feature 双契约分离**（协议只增不删，功能用 capability flag 门控）是跨版本兼容的范式——myteams 的 EngineAdapter 应学习这个，而非每次加引擎就改接口。
- **v1.2 的风险**：Phase 1 只接 Pi RPC，但 Pi 无内置 MCP（靠 extension）、无内置沙箱。若 Phase 2 接 Codex（有 app-server JSON-RPC、有 approval_policy）或 Claude（有原生 MCP），**协作语义层需要补能力差异抽象**，否则 Pi 的限制会变成平台限制。

**关键引用**：
- `docs/acpx-分析.md` §3.8 Conformance 套件、§6 ACP 稳定边界
- `docs/omnigent-分析.md` §4.1 Harness 注册表、§4.4 能力矩阵
- `docs/paseo-分析.md` §5.4 协议兼容性契约、§7 Provider 集成
- `docs/langgraph-分析.md` §6.1 Harness 无关优势
- `docs/deepagents-分析.md` §3.3 Backend 与文件模型、§3.4 Profile

---

## 3. 现有 v1.2 方案的盲点

从「用户能看懂」视角，v1.2 方案有以下考虑不足的视角：

### 3.1 「用户能看懂」本身定义不清

v1.2 反复强调「用户要能看懂」，但 **没有定义「看懂」的标准**。是「能说出团队在干什么」？还是「能预判团队下一步」？还是「能在 10 秒内判断要不要介入」？

- **盲点**：Hub 三视图（看板/时间线/阶段）是 **工程师视角的合理设计**，但委托人（短剧出品人、小说出版人、产品 owner）可能根本不知道「阶段」是什么意思。`brainstorm/scheme/delivery` 是工程语言，不是用户的语言。
- **建议**：补充「委托人视角」设计——每个视图都要回答一个委托人会问的问题，而非工程师会问的问题。例如看板不回答「卡片在哪一列」，而回答「这集这周能出来吗」。

### 3.2 团队「人格」对用户不可见

v1.2 的 Member 有 persona，但 **用户看不到「这支队是什么风格」**。Briefing 是记忆，不是画像。

- **盲点**：委托人选团队时，看到的是 `team.yaml` 配置，而非「这支短剧队擅长甜宠、上季做了 3 部爆款、最爱用反转钩子」这样的可读画像。
- **建议**：增加 **「团队画像」层**——从 Briefing + 历史 Mission 自动合成用户可读的团队介绍，像团队成员的「简历」。

### 3.3 工作分解是黑盒

v1.2 的 Mission brief → WorkCard 拆分过程 **没有定义谁拆、怎么拆、委托人能不能干预**。

- **盲点**：委托人下达「做一个待办应用」后，卡片从哪来？是 Agent 自建？委托人建？Phase 产物拆分？v1.2 §6.4 提了来源但没说过程。用户看不见「团队怎么理解我的需求」。
- **建议**：借鉴 OpenWiki 的 **impact plan** 思想——brief → 团队产出「工作分解草案」→ 委托人可见可调 → 再进入看板执行。让「理解需求」这一步可见。

### 3.4 进化对用户不可见

v1.2 的 Briefing 更新发生在 Closeout，但 **用户看不到「这支队学到了什么」**。

- **盲点**：Briefing changelog 是内部文件，委托人看不到。团队「成长」是 myteams 的核心卖点（「队长期存在，可以自主进化」），但进化过程对用户是黑盒。
- **建议**：把 Briefing changelog 做成 **「队成长日志」** 用户视图——每次 Mission 结束，队用一句话总结「这季我们学到了什么」，委托人可看到团队的成长轨迹。

### 3.5 跨团队视图缺失

v1.2 Phase 3 才提「跨 Team 委托人仪表盘」，但 **用户从第一天就有多支队**。

- **盲点**：委托人同时养短剧、小说、应用开发三支队，但 v1.2 Phase 1 只做单 Mission 看板。用户在 teams 间切换没有统一入口。
- **建议**：Phase 1 就应有 **「我的团队」总览页**——哪怕只是三行：短剧队在做《X》第 3 集、小说队在第 2 卷、应用开发队在 MVP 阶段。不需要完整仪表盘，但要有入口。

### 3.6 决策「为什么」缺失

v1.2 的 Ledger 记录 `decision` 事件，但 **只记结论不记理由**。

- **盲点**：委托人看到「决定用方案 A」，但不知道「为什么不是 B」。这在 L3 拍板时尤其致命——委托人要在两个方案间选，但没看到对比。
- **建议**：借鉴 Clowder 的 **Decision Packet**——L3 escalation 必须附带「选项 A/B/C + 各自后果 + 团队建议」，而非只问「批不批」。

### 3.7 成本与健康度不可见

v1.2 完全没提 **token/费用/队健康度**。

- **盲点**：委托人会问「这支队这个月烧了多少钱」「是不是该换模型」「为什么这么慢」。v1.2 没有任何成本可见性设计。
- **建议**：借鉴 Symphony token 聚合 + Clowder finance 包——Mission 级 token 统计、队级月度成本、模型性价比对比。

### 3.8 「草稿/探索」不是一等对象

v1.2 的 brainstorm 阶段产物是「选题池、人物小传」，但 **探索过程本身不是一等对象**。

- **盲点**：团队在 brainstorm 时探索了 5 个方向、否了 4 个——这些被否的方向对委托人有价值（了解团队思路），但 v1.2 没有地方放。
- **建议**：增加 **「探索空间」** 概念——brainstorm 阶段的备选方案、否决理由、对比过程都可见可追溯。

### 3.9 团队「在干嘛」的实时感缺失

v1.2 有 Ledger 时间线，但 **没有「队现在在干嘛」的实时感**。

- **盲点**：委托人打开 Hub，看到的是卡片状态（静态），不知道「编剧这会儿正在写第 3 场」还是「编剧已经 2 小时没动了」。Paseo 的 Agent 生命周期状态（idle/running/error）是委托人会关心的。
- **建议**：看板卡片或 Member 头像显示 **实时工作状态**——正在执行/等待/空闲，借鉴 Paseo 的 agent lifecycle。

### 3.10 Mission 之间的连续性对用户不可见

v1.2 说 Team 跨 Mission 存在，但 **用户看不到「这支队的第 N 部作品和第 N-1 部的关系」**。

- **盲点**：短剧队做完《A》做《B》，Briefing 注入了《A》的经验，但委托人看不到「这次团队带着什么经验来的」。
- **建议**：Mission 创建时显示 **「本队带入的 Briefing 摘要」**——让委托人知道团队这次会带着哪些教训和模式开工。

---

## 4. 差异化机会

myteams 相对现有项目，最值得做的 3–5 个差异化能力：

### 4.1 团队作为「可养成的角色」（Team as a Character）

**现状缺口**：所有参考项目都把团队当「配置」或「运行时实体」，没有一个把团队当 **有性格、有成长、有故事的角色**。Clowder 的猫猫有 persona 但偏娱乐；OpenCrew 的 SOUL.md 是规范不是画像；Agno 的 Team 是 dataclass。

**myteams 机会**：
- 把 Team 做成 **用户可读的「角色卡」**——包含团队风格、擅长领域、成长轨迹、代表作品、踩过的坑。
- Briefing 不只是内部注入，自动合成 **用户可见的「队成长日志」**：每次 Mission 后一句话总结「我们学到了什么」。
- 委托人选团队时像「相亲」——看简历、看作品、看性格，而非看 YAML 配置。
- 这直接命中「用户能看懂」的核心：用户能看懂角色，看不懂配置。

**借鉴**：Clowder 品牌叙事 + OpenCrew SOUL.md + OpenWiki 自文档化思想，但做成 **用户面向** 而非 Agent 面向。

### 4.2 工作分解可见可干预（Visible Work Decomposition）

**现状缺口**：现有项目要么是「工单驱动」（Multica/Symphony，工单从外部来），要么是「对话驱动」（OpenTeams/Clowder，活在对话里产生）。没有一个把 **「需求 → 团队理解 → 工作分解」这个过程做成用户可见可干预的一等对象**。

**myteams 机会**：
- Mission brief 下达后，团队先产出 **「工作理解草案」**：我们理解你要的是 X，打算分这几个部分做，每个部分的验收标准是 Y——委托人可调。
- 借鉴 OpenWiki 的 impact plan + diff 预算思想——分解要基于 brief 的「证据」，不能臆造。
- 委托人能在执行前 **「校准团队的理解」**，而非等交付才发现理解错了。
- 这解决 v1.2 的「工作分解黑盒」盲点，直接提升「用户能看懂」——因为用户最怕的是「我不知道他们会怎么做」。

**借鉴**：OpenWiki impact plan + Symphony WORKFLOW.md prompt 模板 + LangGraph interrupt（在分解后暂停等人校准）。

### 4.3 决策叙事（Decision Storytelling）

**现状缺口**：所有项目的决策记录都是 **结构化日志**（Ledger entry、LangGraph state、Clowder 球权事件），没有 **叙事性决策视图**。委托人看到的是「decision: 采用方案 A」，不是「我们考虑了 A/B/C，因为 X 选了 A，预期后果是 Y」。

**myteams 机会**：
- L3 escalation 时强制附带 **Decision Packet**：选项列表 + 每个选项的后果 + 团队建议 + 参考的 Briefing 条目。
- Mission 结束后，关键决策汇成 **「决策故事」**——这一路的关键岔路、为什么这么选、结果如何。
- 让委托人能 **读懂团队的思考**，而非只看结论。这是「养队」的信任基础。

**借鉴**：Clowder handoff Decision Packet + Symphony Continuation attempt 上下文 + OpenWiki 证据驱动思想。

### 4.4 跨团队农场视图（Team Farm Dashboard）

**现状缺口**：所有项目都是 **单团队视角**——要么单 Agent（Pi/Deep Agents），要么单 session（OpenTeams），要么单工单（Symphony）。没有一个项目把 **多支团队的协同健康度** 作为一等视图。

**myteams 机会**：
- Phase 1 就提供 **「我的团队农场」总览**：N 支队各自在做什么、健康度、近期产出、待拍板项。
- 像看「农场」一样看团队——哪支队在成长、哪支队卡住、哪支队该换模型、哪支队该加人。
- 跨团队对比：同样一个 Mission 交给不同队，成本/质量/耗时对比（acpx compare 思想的团队级版本）。

**借鉴**：Paseo Tab 多 Agent 视图 + Symphony StatusDashboard + Multica 多 Squad，但做成 **委托人面向的农场视角**。

### 4.5 意图路由（Intent Router）

**现状缺口**：v1.2 和大多数项目都让所有任务走同一套阶段流程。CCG 的 Strategy Router 是少数做意图路由的，但它是 Harness 插件，不是平台层。

**myteams 机会**：
- 委托人下达意图后，平台 **先路由**：是「小修」（直接进 delivery，跳过 brainstorm/scheme）、还是「新作品」（走完整三阶段）、还是「探索」（只 brainstorm 不交付）。
- 路由规则写入队宪，可队自治微调。例如短剧队定义「改台词」是小修，「新一季」是完整流程。
- 这解决 v1.2 的「所有任务都走全流程」盲点，让团队 **不为了流程而流程**。

**借鉴**：CCG Strategy Router + Archon 条件节点 + Agno TeamMode 选择思想，但提到平台层而非 Harness 层。

---

## 5. 关键引用索引

以下按主题归类，便于后续追溯：

### 5.1 团队组织模式
- `docs/opencrew-分析.md` §3.2 治理协议（L0–L3、QAPS、Closeout）、§4 OpenCrew 启示
- `docs/agno-分析.md` §3.3 Team + TeamMode、§7.2 映射关系、§7.3 可借鉴设计
- `docs/clowder-ai-分析.md` §1.2 品牌叙事（猫猫 persona）、§3.1 SystemPromptBuilder、§6 世界模型
- `docs/multica-分析.md` §2 核心概念（Squad/leader）
- `docs/openteams-分析.md` §3 团队模板 hybrid

### 5.2 协作模式
- `docs/横向对比矩阵.md` §13.1 三轴分类（Work/Thread/Workflow）
- `docs/openteams-分析.md` §2 双模式协作（Free Chat + Workflow）
- `docs/ccg-workflow-分析.md` §2 策略矩阵（intent→strategy 路由）
- `docs/clowder-ai-分析.md` §3.3 球权状态机、§4.1 @mention 路由、§4.2 Handoff 决策树
- `docs/archon-分析.md` §2 工作流模型（YAML DAG、approval gate）
- `docs/multica-分析.md` §4 Thread + 可选 WorkItem 双轨

### 5.3 记忆与进化
- `docs/opencrew-分析.md` §3.3 知识沉淀（closeout → knowledge/）
- `docs/agno-分析.md` §4.3 记忆与学习（LearningMachine 多 Store）
- `docs/openwiki-分析.md` §4.2 Wiki 生成策略、§4.4 Update No-op（Git 增量 + 双层 no-op）
- `docs/clowder-ai-分析.md` §3.5 Memory & Evidence、§4.5 跨模型 Review 硬规则
- `docs/pi-分析.md` §5.2 Skills 渐进披露
- `docs/deepagents-分析.md` §4.5 Memory（AGENTS.md 规范）、§4.6 Skills

### 5.4 看板与可观测性
- `docs/multica-分析.md` §2 Agent 一等公民 + 看板、§4 借鉴/不搬
- `docs/paseo-分析.md` §3.2 Agent 管理（Timeline epoch+sequence）、§4.3 Tab vs Archive 解耦
- `docs/symphony-分析.md` §3.6 可观测性（StatusDashboard、token 聚合）、§4.4 Blocked 语义
- `docs/clowder-ai-分析.md` §3.6 Mission Hub & Feature 治理
- `docs/openteams-分析.md` §2 Workflow 计划图可见
- `docs/myteams-方案.md` §6 看板设计（v1.2 现状）

### 5.5 自治与门禁
- `docs/opencrew-分析.md` §3.2 治理协议（L0–L3 自主等级）
- `docs/archon-分析.md` §2 approval gate（`interactive: true`）
- `docs/ccg-workflow-分析.md` §3 阶段状态机 HARD STOP
- `docs/langgraph-分析.md` §3.5 控制原语（interrupt/Command）、§4.3 HITL
- `docs/deepagents-分析.md` §3.5 权限模型、§4.7 HITL
- `docs/agno-分析.md` §3.4 Workflow HumanReview、§4.6 AgentOS approvals
- `docs/symphony-分析.md` §4.4 Blocked 语义、§3.3 Codex approval_policy

### 5.6 Harness 中立
- `docs/acpx-分析.md` §3.8 Conformance 套件、§6 ACP 稳定边界、§7 与 myteams 关联
- `docs/omnigent-分析.md` §4.1 Harness 注册表、§4.4 能力矩阵对比
- `docs/paseo-分析.md` §5.4 协议兼容性契约、§7 Provider 集成
- `docs/langgraph-分析.md` §6.1 Harness 无关优势
- `docs/deepagents-分析.md` §3.3 Backend、§3.4 Profile
- `docs/myteams-方案.md` §9.4 Harness 适配层（v1.2 现状）

### 5.7 MCP 与 Skills 分工
- `docs/mcp-skills-分析.md` §1 概念分工、§4 五种可复用架构模式、§5 对 myteams 建议架构
- `docs/pi-分析.md` §5.2 Skills（一等公民）、§5.1 Extensions
- `docs/paseo-分析.md` §3.5 Skills（handoff/loop/committee）、§7.4 工具注入策略
- `docs/clowder-ai-分析.md` §5.3 Skills 框架（48 技能链）、§4.4 MCP Callback Bridge

### 5.8 v1.2 方案现状
- `docs/myteams-方案.md` §1 愿景与边界、§3 两层结构与领域模型、§4 协作模式、§5 三支队工作方式、§6 看板设计、§7 记忆与进化、§9 架构与技术栈、§10 实施路线、§11 风险与缓解

---

## 附：一句话总结

myteams v1.2 在 **架构层面**（Team 一等对象、双模式协作、Briefing 进化、Harness 中立）已经吸收了参考项目的主要机制；但 **「用户能看懂」这一核心诉求还停留在工程视角**——缺少团队画像、工作分解可见性、决策叙事、跨团队视图、意图路由这五个能让用户真正「看懂、放心、养得起来」的差异化能力。后续设计应重点补强这五个维度。

---

*本文档基于 `docs/` 下 16 份参考项目分析、横向对比矩阵、MCP/Skills 分析及 v1.2 方案通读后提炼。*
