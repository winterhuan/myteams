# 05 · 架构师技术可行性 Review

> 评审人：架构师 高见远
> 日期：2026-07-06
> 评审对象：`docs/myteams-方案-v2.md`（v2.0，1576 行，12 章）
> 对照基线：`docs/myteams-方案.md`（v1.2）
> 设计依据：4 份探索报告（01-doc-insights / 02-external-survey / 03-comprehensibility-audit / 04-evolution-and-board）

---

## 一、总体判断

**结论：YES WITH CONDITIONS（有条件可实施）**

v2.0 方案在架构骨架上继承 v1.2 的正确决策（Team 一等对象、两层结构、Briefing 进化、Harness 中立），新增的机制层（三档触发、信号阈值、条件注入、双层校验、意图路由、角色卡）方向正确且借鉴来源扎实。领域模型基本自洽，实施路线大体可落地。

但有 **4 个 P0 必改项** 必须在实施前修复，涉及：meta-charter 防篡改机制缺失、Phase 1 引擎能力与功能承诺矛盾、BriefingEntry 字段更新机制未定义、八周计划 W6 进化闭环过载。修复后可进入实施。

一句话结论：**架构方向对、机制设计细、但几处关键实现细节留白可能让工程师无从下手，且 Phase 1 范围偏重需瘦身。**

---

## 二、架构合理性评估

### 2.1 两层结构 + 四层技术分工

**评级：合理**

两层结构（平台层/团队层）继承 v1.2，分工原则清晰（平台回答"怎么养多支队"，团队回答"这支队怎么干"），对用户隐藏后不影响体验。v1.2 已验证此结构可行。

四层技术分工（L5 协调 / L4 工作台 / L3 平台核心 / L2 引擎适配 / L1 执行底座）在 v1.2 四层基础上新增 L5 协调层。

**L5 协调层独立是否过度设计？**——不过度，但需控制粒度。

理由：
1. 探索报告 02 §4.3 引用 arXiv:2605.03310，多 Agent LLM 系统生产失败率 41%-87% 源于协调缺陷。将协调显式化为独立层，使其可独立于 Agent 能力优化，有学术支撑。
2. Phase 1 L5 只放 IntentRouter（最简），Phase 2 才补协作模式调度。渐进式引入，不一步到位。
3. L5 独立的好处：未来可以独立替换协调策略（如从正则路由升级为 LLM 路由）而不影响 L3/L2。

**注意点**：L5 在 Phase 1 实质上只有一个 IntentRouter 模块。建议在项目结构中 `packages/coordination/` 保持轻量，不要过早抽象协作模式调度的接口。§9.6 的三层架构图（Agent 逻辑层 / 协调层 / 信息访问层）是概念模型，Phase 1 不需要完整实现信息访问层抽象。

### 2.2 领域对象关系（ER 图）

**评级：需调整**

v1.2 保留对象（Team / Member / Mission / Phase / Board / Column / WorkCard / Engagement / LedgerEntry / Thread / WorkflowRun / Briefing / Charter / Escalation）关系自洽，无矛盾。

新增对象与保留对象的融洽性逐项检查：

| 新增对象 | 关系 | 评估 |
|----------|------|------|
| MetaCharter | Team \|\|--\|\| MetaCharter : bounded_by | ✅ 1:1 合理，每队一份元队规 |
| TeamProfile | Team \|\|--\|\| TeamProfile : characterized_as | ✅ 1:1 合理，自动合成 |
| BriefingEntry | Briefing \|\|--o{ BriefingEntry : contains | ✅ 1:N 合理，Briefing 从三文件升级为结构化条目集 |
| DecisionPacket | Escalation \|\|--\|\| DecisionPacket : must_attach | ✅ 1:1 合理，L3 升级强制附决策包 |
| IntentRouter | IntentRouter \|\|--\|\| Team : routes_for | ⚠️ **关系标注有误** |

**IntentRouter 关系问题**：§5.1 明确说意图路由是"**平台层**路由"，但 ER 图标注 `IntentRouter ||--|| Team : routes_for`，语义上是"每个 Team 有一个 IntentRouter"。如果 IntentRouter 是平台层组件，它应该是平台单例读取各队规则，而非每队一个实例。两种理解都可行，但文档自相矛盾。

**建议**：改为 `IntentRouter ||--o{ Team : routes_for`（一个平台路由器服务多支队），或在文档中明确"IntentRouter 是平台提供的组件，每队有独立配置实例"，统一口径。

**其他 ER 图缺失的关系**：
- TeamProfile 与 Briefing/Mission 的依赖关系未在 ER 图体现。TeamProfile "从笔记本 + 历史作品自动合成"，但它不持有 Briefing 或 Mission 的引用，而是通过 Team 间接访问。这是合成关系而非引用关系，可以不在 ER 图体现，但建议在 TeamProfile 的数据结构中注明数据来源。
- Curator（记忆维护者）在 §7.2 和 §9.3 都提到，但 ER 图中无对应对象。Curator 是平台级后台任务还是队内角色？文档未明确。建议在 ER 图中补充或明确说明 Curator 是平台服务而非领域对象。

### 2.3 A2A + MCP 双栈通信标准

**评级：需调整（方向正确，但 Phase 1 存在可用性缺口）**

A2A（Agent ↔ Agent）+ MCP（Agent ↔ 工具）作为 2026 年事实标准，方向正确，不自建通信协议的决策合理。

**隐藏成本与风险**：

1. **Phase 1 引擎能力矛盾**（P0 问题，详见 §6.2）：§9.5 能力矩阵声明 Pi 的 MCP 为"✗（靠 extension）"，但 Phase 1 只接 Pi。这意味着 Phase 1 的 MCP 工具调用链路实际不可用。A2A 也需要每个 Agent 发布 HTTP Agent Card，Pi RPC 模式是否能承载 A2A HTTP 端点未说明。**Phase 1 实质上 A2A + MCP 双栈都无法实际使用**，通信仍走平台内部调度。

2. **A2A 的运行时要求**：A2A 要求每个 Agent 暴露 HTTP 端点（`/.well-known/agent.json`），这意味着每个团队成员需要独立进程或 HTTP 路由。在 Phase 1 的 Pi RPC 单引擎模式下，成员是 Pi 的不同 session 而非独立 HTTP 服务，A2A Agent Card 发布机制无法直接落地。

3. **认证与发现**：Agent Card 包含 `authentication` 字段，但文档未定义认证方案。跨团队协作时如何验证对方身份？Phase 3 才做跨队协作，但 Phase 1 如果要验证 A2A 可行性，需要最小认证方案。

**建议**：
- Phase 1 明确声明"A2A + MCP 为通信标准目标，Phase 1 内部通信走平台调度，Phase 2 接入第二引擎时启用 A2A + MCP"
- Phase 1 的 IntentRouter、协作调度等仍走平台内部函数调用，不强制走 A2A 协议
- 在 §9.8 补充 A2A 的 Phase 2 落地路径：每个引擎适配器发布 Agent Card，平台作为 A2A 代理

---

## 三、领域模型自洽性评估

### 3.1 BriefingEntry 激活条件 + 信号阈值 + 三层注入协同

**评级：合理（无循环依赖/死锁，但有一个冷启动问题）**

三者协同流程追踪：

```
T1 触发 → 写 scar 草稿（signal=1, status=draft）
  → 不注入 prompt（draft 状态被三层注入跳过）

T2 触发 → KO 整理，检查是否有其他作品佐证
  → 是 → signal+1，signal≥2 → status=active
  → 否 → 保留 draft
  → 冲突 → 标记 conflicts_with → 升级 L3

active 状态条目进入注入池：
  注入层 1（常驻段）：principles 桶 Top-3（按 hit_count 排序）
  注入层 2（按阶段）：phase[] 匹配当前阶段的 active 条目
  注入层 3（按需检索）：triggers[] 匹配成员查询关键词

Curator 定期维护：
  60 天未引用 → decayed（不注入层 1/2，但层 3 可检索）
  语义重复 → 合并
  冲突 → 上报
```

**循环依赖检查**：Engagement 执行 → Closeout → T2 → BriefingEntry 更新 → 下次 Engagement 注入。这是线性流程，无循环。T1 在 Engagement 执行中写入 draft，不触发注入，不影响当前执行。无死锁可能。

**冷启动问题**（P1）：注入层 1 注入"principles Top-3 by hit_count"。新晋升的 active 条目 hit_count=0，无法进入常驻段。它只能通过层 2（phase 匹配）或层 3（triggers 匹配）首次被引用，引用后 hit_count+1，逐渐有机会进入层 1。这个设计是对的，但文档应明确说明"hit_count 初始为 0，首次通过层 2/3 被引用后递增"，避免工程师误以为新条目应立即进入常驻段。

**signal 晋升的"其他作品佐证"判定**（P1）：§7.1 T2 流程说"是否有其他作品佐证 → signal+1"。但"佐证"的判定标准未定义。是 KO 角色（LLM）主观判断？还是关键词匹配？还是语义相似度？这个判定逻辑直接影响记忆质量，需要明确：
- Phase 1 建议：KO 角色用 LLM 判断新 scar 与已有 patterns 的语义相关性，相关则 signal+1
- 判定结果写入 EvolutionEvent.reason 字段，可追溯

### 3.2 WorkCard 的 eta / last_touched / next_action 字段来源

**评级：有问题（字段更新机制未定义）**

| 字段 | 谁填 | 何时更新 | 如何保证准确 | 文档是否明确 |
|------|------|----------|-------------|-------------|
| `last_touched` | 平台自动 | 每次状态变更或队内动态写入 | 平台在 card_move / ledger_append 事件中自动更新时间戳 | ✅ §6.7 明确"每次状态变更更新 last_touched" |
| `eta` | Agent 估或人填 | 不明确 | **无保障机制** | ⚠️ §3.4 说"Agent 估或人填"但未定义何时估、估的依据、估不准怎么办 |
| `next_action` | 不明确 | 不明确 | **无保障机制** | ⚠️ §3.4 有数据结构但未定义更新触发条件和填充者 |

**问题详解**：

1. **eta 填充机制缺失**（P0）：
   - Agent 估算 eta 需要具备时间预估能力，但 LLM 的时间预估通常不准（容易乐观）
   - 人填 eta 需要队主手动操作，增加负担
   - 未定义：eta 在卡片创建时填还是 assign 时填？谁负责更新？过期了怎么办？
   - **建议**：Phase 1 简化为——卡片创建时 assignee 填 eta（可选）；平台在 `last_touched` 超过 eta 时自动标黄提醒；eta 不作为硬约束，只作为参考

2. **next_action 更新机制缺失**（P0）：
   - next_action 包含 `who`（该谁动）和 `what`（动什么），但未定义谁负责填写、何时更新
   - 如果靠 Agent 自动填写，需要在每次状态变更后触发 Agent 生成 next_action——这增加一次 LLM 调用
   - 如果靠平台规则自动推断，需要定义推断规则（如：卡片在"进行中"列 → next_action.who = assignee, next_action.what = "执行中"）
   - **建议**：Phase 1 用平台规则推断（基于 column_id + status + assignee 自动生成），不额外调用 LLM。例如：
     - status=blocked → next_action = {who: 'human', what: blocker.reason}
     - status=active, column="进行中" → next_action = {who: assignee, what: "执行中"}
     - status=open, column="待办" → next_action = {who: null, what: "待分配"}

### 3.3 meta-charter + charter 双层校验防篡改

**评级：有问题（防篡改机制缺失，P0）**

§7.5 设计了双层校验：
- meta-charter.yaml（平台层不可改）定义 immutable_rules + boundary
- charter.md（队内可改，在 boundary 内）

**核心问题**：文档说 meta-charter "不可被队修改"，但 meta-charter.yaml 存储在 `teams/<id>/meta-charter.yaml`——**在队的工作区目录内**。如果队有文件系统访问权限（v1.2 §3.5 持久化布局是 Git 友好的文件系统存储），队可以直接修改这个文件。

**文档未定义防篡改的技术机制**。可能的方案：

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 文件权限（chattr +i 或 chmod 444） | 简单 | Git 跟踪会覆盖权限；Windows 不支持 chattr |
| B. 平台存储校验和（hash） | 可检测篡改 | 无法阻止篡改，只能事后发现 |
| C. meta-charter 不存在队目录，存在平台控制目录 | 物理隔离 | 文档需改路径 |
| D. 平台启动时校验 meta-charter hash，不匹配则拒绝启动 | 强制 | 增加 启动复杂度 |

**建议**（P0 必改）：采用方案 C + D 组合：
- meta-charter.yaml 存储在 `~/.myteams/meta-charters/<team-id>.yaml`（平台控制目录），不在 `teams/<id>/` 内
- 平台启动时和每次变更校验时读取平台控制目录的 meta-charter
- 队工作区 `teams/<id>/` 内只放 charter.md（队可改）
- 文档 §7.5 和 §3.5 持久化布局需同步修改

### 3.4 IntentRouter 路由规则灵活性与回退

**评级：需调整**

**正则 pattern 灵活性**：
- 当前用正则表达式（如 `"改.*台词|修.*bug|调整.*文风"`）做意图匹配
- 正则能覆盖关键词级匹配，但无法处理语义级意图。例如"帮我把第3集节奏调快一点"不匹配"调整.*文风"，但语义上应路由到 quick_fix
- Phase 1 够用（关键词匹配覆盖 80% 场景），但文档应声明"Phase 1 用正则，Phase 2 评估 LLM 意图分类"

**误判回退路径**：
- §11 风险表提到"误判时队主可手动指定走哪条流程"——这是人工回退，合理
- **缺失**：未定义"无 pattern 匹配时的默认路由"。如果队主说"帮我看看第3集怎么样"——不匹配任何 pattern，走什么流程？
- **建议**：定义默认路由为 `full_flow`（保守，走完整流程），并在路由结果处给队主"路由错了？点这里切换"的选项

**非技术用户微调问题**（P1）：
- §5.1 说"路由规则写队规可微调"，但正则表达式对非技术用户不可读
- 队主（短剧出品人、小说出版人）不会写正则
- **建议**：Phase 1 在工作台提供"关键词列表"UI（队主输入关键词，平台自动生成正则），不暴露正则语法；或直接用关键词列表匹配替代正则

---

## 四、实施路线可落地性评估

### 4.1 八周计划是否现实

**评级：需调整（W5-W6 过载，建议调整）**

Phase 1 同时验证：应用开发队 + 短剧队 + 跨团队总览 + 进化最小闭环 + 意图路由 + 角色卡 + 成本可见 + Decision Packet + Pi 引擎。**这是 10 项交付物，8 周完成，偏重。**

逐周评估：

| 周 | 计划交付 | 工作量评估 | 风险 |
|----|----------|-----------|------|
| W1 | core 包 + 三套模板 + CLI 建队流程 | 中。core 包是所有后续工作的基础，三套模板是 YAML 配置 | 低。v1.2 已有 core 包基础 |
| W2 | 团队总览首页 + 活态摘要卡 + 健康度算法 | 中。总览页是新增 UI，摘要卡需要聚合多团队数据，健康度算法简单 | 低 |
| W3 | 单作品看板（新字段 + 陈旧度）+ 阶段进度条 | 中。看板 UI + WorkCard 新字段 | 低 |
| W4 | 意图路由器 + 工作分解可见 | **高**。意图路由是新模块，工作分解可见需要 brief→草案→校准→冻结→执行 完整流程 | 中。工作分解可见是复杂交互 |
| W5 | Pi 引擎接入 + 头脑风暴跑通（两队并行） | **高**。Pi RPC 接入 + 两支队的头脑风暴阶段跑通 | **高**。Pi RPC 的实际接口可能与假设不符 |
| W6 | 进化最小闭环（T1+T2）+ 笔记本条件注入 | **极高**。这是 Phase 1 最复杂的一周 | **高**。见下文详解 |
| W7 | 团队角色卡 v1 + 成本可见 v1 | 中。角色卡合成需要 LLM 调用，成本可见依赖引擎返回 token | 中。Pi 是否返回 token 用量待验证 |
| W8 | 待你拍板 + Decision Packet + Hub Web 整合 | 中。Decision Packet 结构化生成 + Web 整合 | 低 |

**W6 过载详解**：

W6 要在一周内完成：
1. BriefingEntry 数据结构实现（含 phase/triggers/signal/hit_count/status 字段）
2. T1 即时触发（Member 执行中写 scar 草稿）——需要在 Engagement 执行流程中插入写入点
3. T2 阶段触发（KO 整理 + signal 晋升）——需要 KO 角色逻辑 + 佐证判定
4. 三层注入模型（常驻段 + 按阶段 + 按需检索）——需要 BriefingInjector 模块
5. 草稿/正式两态管理

这实质上是 2 周的工作量压缩到 1 周。而且 W6 依赖 W5（Pi 引擎跑通后才有实际执行数据可触发 T1/T2），如果 W5 延期，W6 连环延期。

**建议调整**：

方案 A（推荐）：八周不变，但 W6 拆分为两周——
- W6：BriefingEntry 数据结构 + T1 即时触发 + 草稿/正式两态（不含注入）
- W7：三层注入模型 + T2 阶段触发（含 signal 晋升）
- 原W7角色卡+成本 → 移到 W8
- 原W8待拍板+Decision Packet+Hub整合 → 移到 W8 后半 / 或 Decision Packet 降级为 Phase 2

方案 B：Phase 1 延长到 10 周，保持原计划不动，给 W5-W6 各两周。

方案 C（最小改动）：W6 只做 T1 + BriefingEntry 存储（不做注入），三层注入推迟到 Phase 2。Phase 1 验收标准从"第二个作品可感知记忆"降为"第二个作品可看到笔记本条目存在"。

### 4.2 依赖关系问题

| 问题 | 详解 | 严重度 |
|------|------|--------|
| W5 → W6 串联风险 | W6 进化闭环依赖 W5 引擎跑通后有实际执行数据。W5 延期则 W6 无法开工 | 高 |
| W4 工作分解可见 → W5 引擎跑通 | W4 的工作分解可见（brief→草案→校准→冻结→执行）需要引擎支持才能"执行"部分。W4 只能做"草案→校准→冻结"，"执行"要等 W5 | 中 |
| W7 角色卡 → 依赖 W6 笔记本数据 | 角色卡从笔记本 + 历史作品合成，W6 没产出笔记本数据则 W7 无数据可合成 | 中 |
| W7 成本可见 → 依赖 Pi 返回 token | §9.5 能力矩阵未列出 Pi 是否返回 token 用量。如果 Pi RPC 不返回 token，W7 成本可见无法实现 | 中（需验证） |

**前置依赖未满足的情况**：
- W4 的"工作分解可见"中"执行"环节需要 W5 的引擎，但 W4 在 W5 前。建议 W4 只做到"冻结为计划制品"，"按计划执行"放到 W5 一起做。
- W7 的"成本可见 v1"需要验证 Pi RPC 响应格式是否包含 token 计数。建议 W1 或 W2 提前做 Pi RPC 接口探针。

### 4.3 Phase 1 不做项评估

| 不做项 | 是否合理 | 理由 |
|--------|----------|------|
| 第三队（小说） | ✅ 合理 | 两队已验证"各队自定义" |
| T3 战略触发 | ✅ 合理 | T1+T2 足够验证进化最小闭环 |
| Curator 衰减 | ✅ 合理 | 需积累数据后才有意义 |
| 第二引擎 | ✅ 合理 | 先把一个引擎跑通 |
| 模板市场 | ✅ 合理 | Phase 3 |
| Briefing 语义检索 | ✅ 合理 | Phase 1 用关键词检索 |
| Desktop Hub | ✅ 合理 | Web 优先 |

**可能遗漏的"必须做"**：

| 遗漏项 | 理由 | 建议优先级 |
|--------|------|-----------|
| Agent 执行失败恢复 | Agent 执行可能崩溃/超时，需 retry/abort 机制。v1.2 §9.4 AgentSession 有 abort/resume 接口但 v2.0 未提及 | P1（Phase 1 必须有最小恢复机制） |
| 基本测试框架 | 进化机制（signal 晋升、条件注入）逻辑复杂，需要单元测试保障 | P1 |
| 数据备份/导出 | 团队数据存在 SQLite + 文件系统，需基本备份能力 | P2 |

---

## 五、风险点与缓解建议

### 5.1 团队角色卡自动合成——复杂度与准确性

**风险**：§7.7 角色卡从笔记本 + 历史作品合成画像。合成规则包括"从 patterns 中提取高频关键词"（风格）、"从 hit_count 最高的 patterns 中提取"（擅长）等。

**复杂度分析**：
- "风格"和"擅长"需要语义理解，纯关键词频率统计可能产出无意义结果（如高频词是"场景""角色"这类通用词）
- "成长轨迹"需要从 changelog 按时间排序提取，需要自然语言生成能力
- "踩过的坑"从 scars 中提取，需要摘要能力

**准确性风险**：
- 早期（第 1 个作品后）笔记本条目少（可能只有 3-5 条），合成结果可能空洞
- 条目质量取决于 T1/T2 触发的准确性，垃圾进垃圾出

**缓解建议**：
1. Phase 1 角色卡用 **LLM 调用合成**（非规则匹配）：每次作品结束后调用一次 LLM，输入笔记本 active 条目 + 历史作品列表，输出结构化角色卡。成本约 2000-5000 token/次，延迟 2-5 秒，可接受（非实时）
2. 早期（条目 < 5 条）角色卡显示"团队正在成长中，完成更多作品后自动生成画像"
3. 角色卡底部显示"基于 N 条经验合成"，让队主知道数据量

### 5.2 Curator 衰减机制——60 天阈值与长期重要经验

**风险**：60 天未引用 → decayed。但"长期重要经验"可能 60 天内未被引用但仍然重要（如"生产部署必须双人复核"——如果 60 天内没有部署任务，这条原则会被衰减）。

**分析**：
- 当前衰减机制纯时间驱动（60 天 + hit_count=0），无重要性区分
- 探索报告 02 §2.1.4 提到"importance > 0.8 的事件检索权重 ×1.5"，但 v2.0 未实现 importance 字段

**缓解建议**：
1. **按 bucket 差异化衰减阈值**：
   - principles 桶：不衰减（原则是长期不变的）或 180 天阈值
   - patterns 桶：90 天阈值（模式可能过时）
   - scars 桶：60 天阈值（教训可能不再相关）
2. **队主可"置顶"条目**：标记为不可衰减（类似浏览器书签）
3. Phase 1 不做 Curator 衰减（已在 Phase 1 不做项中），Phase 2 实现时再定阈值

### 5.3 SQLite WAL + compare-and-swap 多团队高并发

**风险**：SQLite 单写者限制——同一 DB 同时只能有一个写事务。

**分析**：
- myteams 每队独立 SQLite DB（借鉴 Hermes 多看板隔离），队间无竞争
- 队内并发：一支队 4-8 个 Agent 成员，同时写 Ledger / WorkCard / BriefingEntry
- SQLite WAL 模式允许并发读 + 单写，写冲突时重试（默认 busy_timeout 5s）
- Phase 1 规模（2 队 × 4-8 成员 = 8-16 并发写者）：**无瓶颈**
- 未来规模（10+ 队 × 10+ 成员）：队内写竞争增加，可能需要写队列或迁移 PostgreSQL

**缓解建议**：
1. Phase 1 设置 `PRAGMA busy_timeout = 10000`（10 秒重试），覆盖绝大多数写冲突
2. 平台核心层实现写队列（所有写操作排队执行，避免 Agent 直接写 DB）
3. 监控 SQLite `database is locked` 错误率，超过阈值时评估迁移方案
4. **Phase 1 无瓶颈风险**，可放心使用

### 5.4 意图路由正则 pattern——非技术用户微调

**风险**：队主（短剧出品人、小说出版人）不会写正则表达式。

**分析**：
- §5.1 的路由规则用 YAML + 正则，对工程师友好但对队主不友好
- §11 风险表说"路由规则写队规可微调"，但没说怎么让非技术用户微调

**缓解建议**：
1. Phase 1：工作台提供"关键词管理"UI——队主输入关键词列表（如"改台词""修 bug""调文风"），平台自动生成正则
2. Phase 1 模板预置默认路由规则，队主 99% 不需要改
3. Phase 2 评估 LLM 意图分类（队主自然语言输入 → LLM 分类到四档路由），替代正则

---

## 六、具体问题确认

### 6.1 §5.1 意图路由 YAML 语法问题

**确认：存在语法错误。**

原文（§5.1 第 576-577 行）：
```yaml
    - pattern: "试试|探索|调研"
      route: explore_only
    pattern: "继续|接着"      # ← 缺少 "- " 前缀
      route: resume
```

最后一个 pattern 缺少 `- ` 前缀，在 YAML 中会被解析为 `rules` 的同级 key 而非列表项，导致语法错误。

**正确写法**：
```yaml
    - pattern: "继续|接着"
      route: resume
```

**修复优先级**：P0（文档错误，会让工程师照抄报错）。

### 6.2 §9.5 Pi MCP 在 Phase 1 是否可用

**确认：Phase 1 MCP 工具调用不可用（原生），A2A 也不可用。**

§9.5 能力矩阵明确标注 Pi 的 MCP 为"✗（靠 extension）"。Phase 1 只接 Pi（§10.1 步骤 10）。

**影响分析**：
- **MCP 不可用**：团队成员无法通过标准 MCP 协议调用外部工具（文件读写、API 调用等）。Pi 的 extension 机制可能提供类似功能，但不是标准 MCP，与 §3.5 "A2A + MCP 双栈通信标准"的声明矛盾。
- **A2A 不可用**：A2A 要求 Agent 暴露 HTTP 端点发布 Agent Card。Pi RPC 模式是 JSONL 管道，不是 HTTP 服务，无法直接发布 Agent Card。
- **实际影响**：Phase 1 的团队协作走平台内部调度（平台核心直接调用 Pi RPC），不走 A2A；工具调用走 Pi extension，不走 MCP。**双栈标准在 Phase 1 是"声明但不落地"**。

**建议**：
- P0：在 §10.1 Phase 1 步骤 10 中明确声明"Phase 1 内部通信走平台调度，A2A + MCP 在 Phase 2 接入第二引擎时启用"
- P0：在 §9.5 补充 Pi extension 的工具调用机制说明，确保 Phase 1 成员有基本工具能力
- 评估 Pi RPC 是否返回 token 用量（影响 §10.1 步骤 8 成本可见 v1 的可行性）

### 6.3 §7.7 角色卡合成规则——LLM 调用还是规则匹配

**确认：文档未明确，需要补充。**

§7.7 角色卡合成规则：
- "从 patterns 中提取高频关键词" → **风格**
- "从 hit_count 最高的 patterns 中提取" → **擅长**
- "从笔记本 changelog 按时间排序提取" → **成长轨迹**
- "从历史作品列表 + 完成质量排序" → **代表作品**
- "从 scars 中提取（signal≥2 的 active 条目）" → **踩过的坑**
- "统计 principles/patterns/scars 各桶数量" → **累计经验**

**分析**：

| 字段 | 适合 LLM 还是规则 | 理由 |
|------|-------------------|------|
| 风格 | **LLM** | 需要语义理解，"擅长甜宠反转"无法从关键词频率统计得出 |
| 擅长 | **LLM** | 同上，hit_count 只能排序，不能生成"第3集反转钩子"这样的描述 |
| 成长轨迹 | **LLM** | 需要将多条 changelog 总结为一句话"学会了X" |
| 代表作品 | **规则** | 从历史作品列表按完成质量排序即可，不需要 LLM |
| 踩过的坑 | **LLM** | 需要将 scar 条目摘要为可读描述 |
| 累计经验 | **规则** | 纯统计，各桶 count |

**建议**：
- Phase 1：用 **LLM 调用合成**（一次调用生成风格/擅长/成长轨迹/踩过的坑，代表作品和累计经验用规则统计）
- 合成时机：每次作品结束（T3 触发时）自动合成一次，非实时
- 成本估算：每次约 2000-5000 token（输入笔记本条目 + 历史作品，输出结构化角色卡），月度成本可控
- 延迟：2-5 秒，异步合成不阻塞用户

---

## 七、必改项（P0）/ 建议改项（P1）/ 可选优化（P2）

### P0 必改项（实施前必须修复）

| # | 问题 | 章节 | 修复建议 |
|---|------|------|----------|
| P0-1 | meta-charter 防篡改机制缺失 | §7.5 | meta-charter.yaml 移至平台控制目录（`~/.myteams/meta-charters/<team-id>.yaml`），队工作区不放；平台启动时校验 hash。同步修改 §3.5 持久化布局 |
| P0-2 | §5.1 YAML 语法错误（最后一个 pattern 缺 `-`） | §5.1 | 补上 `- ` 前缀 |
| P0-3 | Phase 1 引擎能力与功能承诺矛盾（Pi 无 MCP/A2A，但声明双栈标准） | §9.5 / §10.1 | Phase 1 明确声明"A2A + MCP 为目标标准，Phase 1 走平台内部调度"；补充 Pi extension 工具调用说明 |
| P0-4 | WorkCard eta / next_action 更新机制未定义 | §3.4 | 定义填充者和更新触发条件：eta 由 assignee 创建时填（可选），next_action 由平台规则推断（基于 status + column + assignee） |

### P1 建议改项（实施中修复）

| # | 问题 | 章节 | 修复建议 |
|---|------|------|----------|
| P1-1 | IntentRouter ER 关系与"平台层"描述矛盾 | §3.3 | 统一为"平台组件 + 每队配置"或改为 1:N 关系 |
| P1-2 | W6 进化闭环一周过载 | §10.1 | 拆分为两周（W6: T1+存储，W7: T2+注入），或三层注入推迟到 Phase 2 |
| P1-3 | signal 晋升的"佐证"判定标准未定义 | §7.1 | 定义为 KO 角色 LLM 判定语义相关性，结果写入 EvolutionEvent.reason |
| P1-4 | 意图路由无默认路由（无 pattern 匹配时） | §5.1 | 默认路由为 full_flow，UI 提供"路由错了？切换"选项 |
| P1-5 | 意图路由正则对非技术用户不可读 | §5.1 | Phase 1 提供"关键词管理"UI，模板预置默认规则 |
| P1-6 | 角色卡合成方式未明确（LLM vs 规则） | §7.7 | 明确为 LLM 合成（风格/擅长/成长/踩坑）+ 规则统计（代表作品/累计经验） |
| P1-7 | Agent 执行失败恢复机制缺失 | §9 | Phase 1 实现最小 retry/abort（借鉴 v1.2 AgentSession 接口） |
| P1-8 | Pi RPC 是否返回 token 用量未验证 | §9.5 / §10.1 步骤 8 | W1-W2 提前做 Pi RPC 接口探针，确认 token 计数可用性 |
| P1-9 | Curator 是平台服务还是队内角色不明确 | §7.2 / §9.3 | 明确为平台级后台任务（非队内 Member），Phase 2 实现 |
| P1-10 | BriefingEntry 冷启动问题（hit_count=0 无法进入常驻段） | §7.4 | 文档明确说明新 active 条目通过层 2/3 首次引用后递增 hit_count |

### P2 可选优化

| # | 问题 | 章节 | 优化建议 |
|---|------|------|----------|
| P2-1 | Curator 衰减阈值按 bucket 差异化 | §7.2 | principles 不衰减/180 天，patterns 90 天，scars 60 天 |
| P2-2 | 队主可"置顶"Briefing 条目防衰减 | §7.2 | 增加 pinned 字段 |
| P2-3 | 意图路由 Phase 2 评估 LLM 分类 | §5.1 | 自然语言 → LLM → 四档路由 |
| P2-4 | 六种协作设计模式（§5.4）Phase 1 只做理论框架 | §5.4 | Phase 1 不实现六种模式切换，Phase 2 评估 |
| P2-5 | 能力雷达 5 维的算法未定义 | §7.6 | Phase 2 定义 5 维计算公式（领域知识/协作效率/产物质量/错误减少/自治程度） |

---

## 八、任务分解建议（Phase 1）

基于上述分析，给出 Phase 1 的任务分解建议。考虑到 W6 过载问题，建议采用"八周不变、W6 拆分"方案：

### 任务列表

| Task ID | 任务名 | 周次 | 源文件/模块 | 依赖 | 优先级 |
|---------|--------|------|------------|------|--------|
| T01 | 项目基础设施 + core 包 + 三套模板 | W1 | packages/core/, templates/, package.json, CLI | 无 | P0 |
| T02 | 团队总览首页 + 活态摘要卡 + 健康度算法 | W2 | packages/observability/, Hub UI 总览页 | T01 | P0 |
| T03 | 单作品看板（新字段 + 陈旧度）+ 阶段进度条 | W3 | Hub UI 看板页, WorkCard 数据结构 | T01 | P0 |
| T04 | 意图路由器 + 工作分解可见（草案→校准→冻结） | W4 | packages/coordination/, Hub UI 分解视图 | T01, T03 | P0 |
| T05 | Pi 引擎接入 + 头脑风暴跑通（两队并行）+ 工作分解"执行"环节 | W5 | packages/harness/, Pi RPC adapter | T01, T04 | P0 |
| T06 | 进化最小闭环 Part 1：BriefingEntry 数据结构 + T1 即时触发 + 草稿/正式两态 | W6 | packages/evolution/, BriefingEntry 模型 | T05 | P0 |
| T07 | 进化最小闭环 Part 2：三层注入模型 + T2 阶段触发 + signal 晋升 | W7 前半 | packages/evolution/, BriefingInjector | T06 | P0 |
| T08 | 团队角色卡 v1（LLM 合成）+ 成本可见 v1 | W7 后半 | packages/observability/, TeamProfile 合成器 | T06 | P1 |
| T09 | 待你拍板队列 + Decision Packet + Hub Web 整合 | W8 | Hub UI 拍板页, DecisionPacketBuilder | T01-T08 | P0 |

### 依赖关系图

```
T01 (基础设施+core+模板)
 ├── T02 (总览首页+摘要卡+健康度)
 ├── T03 (单作品看板+进度条)
 │    └── T04 (意图路由+工作分解)
 │         └── T05 (Pi引擎+头脑风暴+执行)
 │              └── T06 (进化Part1: BriefingEntry+T1)
 │                   ├── T07 (进化Part2: 注入+T2)
 │                   └── T08 (角色卡+成本)
 │                        └── T09 (拍板+DecisionPacket+整合)
 ├── T09 (也依赖 T02-T08 的 UI 组件)
```

### 关键路径

T01 → T04 → T05 → T06 → T07 → T09

关键路径上任何一周延期都会影响 Phase 1 交付。T05（Pi 引擎）和 T06（进化 Part1）是最高风险任务。

### 风险缓解

1. **T05 风险**（Pi RPC 接口不确定）：W1 同步做 Pi RPC 接口探针，提前发现接口问题
2. **T06 风险**（进化复杂）：如果 T06 延期，T07（注入+T2）可降级为 Phase 2，Phase 1 只验证 T1 + 存储
3. **T08 可降级**：角色卡 v1 可简化为"统计 + LLM 一句话风格描述"，不做完整角色卡

---

## 九、附：Review 检查清单

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 架构两层结构合理性 | ✅ 合理 | 继承 v1.2，无问题 |
| L5 协调层独立是否过度 | ✅ 合理 | 渐进引入，Phase 1 只放 IntentRouter |
| ER 图自洽性 | ⚠️ 需调整 | IntentRouter 关系标注有误 |
| A2A + MCP 双栈可行性 | ⚠️ 需调整 | 方向对，Phase 1 不落地 |
| BriefingEntry 三机制协同 | ✅ 合理 | 无循环依赖，有冷启动说明需求 |
| WorkCard 三字段来源 | ❌ 有问题 | eta/next_action 更新机制缺失 |
| 双层校验防篡改 | ❌ 有问题 | meta-charter 存储位置需改 |
| IntentRouter 路由灵活性 | ⚠️ 需调整 | 正则够用但需默认路由+UI 简化 |
| 八周计划现实性 | ⚠️ 需调整 | W6 过载，建议拆分 |
| 依赖关系合理性 | ⚠️ 有风险 | W5→W6 串联，需提前探针 |
| Phase 1 不做项合理性 | ✅ 合理 | 遗漏 Agent 失败恢复 |
| 角色卡合成风险 | ⚠️ 需明确 | LLM 合成，非规则匹配 |
| Curator 衰减风险 | ✅ 可接受 | Phase 1 不做，Phase 2 再调 |
| SQLite 并发风险 | ✅ 无瓶颈 | Phase 1 规模内无问题 |
| YAML 语法错误 | ❌ 确认存在 | P0 修复 |
| Pi MCP 可用性 | ❌ 不可用 | Phase 1 需明确声明 |
| 角色卡合成方式 | ⚠️ 未明确 | 需补充为 LLM 合成 |

---

*本 review 从架构合理性和技术可行性角度评估 v2.0 方案，不评价产品决策。方案整体方向正确、机制设计扎实，修复 4 个 P0 项后可进入实施。*

---

## 十、v2.2 三层设计 Review

> 评审人：架构师 高见远
> 日期：2026-07-07
> 评审对象：`docs/myteams-方案-v2.md` §9.9（第 1430-1828 行，A2A/MCP/Skills 三层设计）+ §9.2/9.3/9.5/9.7/10/11/12 的 v2.2 更新处
> 对照基线：本文档 §一至§九（v2.1 review，已通过，4 个 P0 已修复）
> 设计依据：`docs/mcp-skills-分析.md`（§4 五种架构模式、§5 对 myteams 的建议架构、§5.3 推荐 Skill 清单）

### 10.0 总体判断

**结论：YES WITH CONDITIONS（有条件可实施）**

v2.2 的三层设计（Skills 方法层 / MCP 工具层 / A2A 通信层）在概念上自洽、借鉴来源扎实（Paseo + Clowder 是最成熟的组合），"Skill 说明书 + MCP API 双轨"的方向正确。三层成对设计原则（Skill 教何时调什么 MCP → MCP 真正执行 → A2A 处理成员间通信）逻辑清晰，两个示例（myteams-closeout / character-consistency）有效证明了三层协同。

但有 **3 个 P0 必改项**：

1. **Callback Bridge 实现复杂度被严重低估**——它不只是"起个 HTTP 端点"，需要定制 Pi extension + 认证 + 重试 + 错误降级，是一周级工作量，塞进已经过载的 W5 会导致整个 Phase 1 连环延期。
2. **9 个平台级 MCP 工具中 5 个有接口缺陷**——create_submember 缺生命周期、phase_advance 缺门禁失败返回值、card_update 缺 last_touched 自动更新说明、ledger_append 缺 card 关联、member_message 缺消息类型。这些问题会让工程师在实现时被迫做设计决策。
3. **W5 过载加剧**——v2.1 review 已指出 W6 过载，v2.2 又往 W5 加了 MCP 最小集（Callback Bridge）。W5 现在要同时做 Pi 引擎接入 + 首阶段跑通 + Callback Bridge + 3 个 MCP 工具，是不可完成的。

一句话结论：**三层设计方向对、概念好，但 Callback Bridge 的工程量被低估了，9 个工具的接口要逐个补全，W5/W6 必须重新排期。**

---

### 10.1 Skills 层评估

#### 10.1.1 三层存储和加载机制

**评级：合理**

三层存储路径清晰且与项目结构（§9.7）一致：
- 平台级：`packages/skills/`（平台 repo，跟版本化）
- 模板级：`templates/<id>/skills/`（随模板安装）
- 队级：`teams/<id>/skills/`（队工作区内，队有文件系统访问权）

渐进披露机制（name+description 进 system prompt，按需 read 全文）借鉴 Pi 原生 Skills 机制，在 Pi RPC 模式下的实现路径是：
1. 平台 daemon 构建成员 system prompt 时，SkillsLoader 扫描三层目录，提取每个 SKILL.md 的 frontmatter（name + description），拼成 XML 片段注入 system prompt
2. 成员（Pi session）收到 system prompt 后看到 Skill 索引列表
3. 成员通过 `skill_read(skill_name)` MCP 工具（Phase 1 走 Callback Bridge）或直接 `read` 文件获取全文

**注意点**：Pi 的 Skills 发现路径是 `~/.pi/agent/skills/`、`.pi/skills/` 等（mcp-skills-分析.md §2.1）。myteams 的 Skills 存在 `packages/skills/` 和 `teams/<id>/skills/`，与 Pi 的发现路径不同。两种方案：
- **方案 A（推荐）**：平台 SkillsLoader 不依赖 Pi 的原生 Skills 发现，而是自己扫描三层目录后构建 system prompt 注入。Pi 的 Skills 发现机制被旁路。好处是跨引擎统一（acpx/Codex 也用同一个 SkillsLoader）。
- **方案 B**：平台做 `sync:skills`（像 Clowder 那样），把 Skills 软链接到 Pi 的发现路径。好处是 Pi 原生支持按需 read。缺点是引擎绑定。

建议方案 A，文档应明确声明 SkillsLoader 不依赖引擎原生 Skills 发现机制。

#### 10.1.2 Skills 依赖链

**评级：需调整**

§9.9.2 声明依赖链在 frontmatter `depends_on: [skill-name]`，SkillsLoader 加载时自动检查。三个问题：

1. **检查时机**：是在注入 system prompt 时检查（发现依赖未加载则补注入依赖的 name+description），还是在成员 `skill_read` 时检查（发现依赖未读则拒绝/提示先读依赖）？文档未明确。建议：**两阶段**——system prompt 注入时补依赖索引；`skill_read` 时如果依赖 Skill 全文未读，返回提示"请先读 X Skill"。

2. **循环依赖检测**：myteams-decompose → myteams-handoff，myteams-closeout → myteams-review。如果未来加入 handoff → closeout（交接前需收尾），就形成环。SkillsLoader 应在加载时做拓扑排序检测循环依赖，发现则拒绝加载并报错。

3. **依赖是"软提示"还是"硬阻塞"**：如果成员读了 closeout 但没读 review，平台是否阻止成员调用 MCP 工具？建议：**软提示**——skill_read 返回依赖提示，但不阻塞工具调用。Skill 是方法层指导，不是运行时强制约束。成员可能已经知道 review 的内容（从 Briefing 注入获得），不需要再读 Skill 全文。

#### 10.1.3 suggested_skill 阶段门禁触发机制

**评级：需调整**

§9.9.2 的队规配置 `phases[].gate.suggested_skills` 是正确的方向，但"平台怎么知道成员进入了某阶段"的触发机制未说明。

**触发链路应为**：
1. 成员调用 `phase_advance(mission_id)` MCP 工具
2. 平台将 mission 推进到下一阶段
3. 平台读取该队 phases 配置，找到新阶段的 `gate.suggested_skills`
4. 平台在下一次构建该成员 system prompt 时注入提示："你已进入 [后期] 阶段，建议加载 Skill: myteams-closeout"
5. 成员看到提示后主动 `skill_read("myteams-closeout")`

**关键缺口**：phase_advance 的返回值应包含 suggested_skills 提示。目前 §9.9.3 工具 8 的参数只有 `mission_id: string`，返回值未定义。建议补充返回值结构：

```typescript
// phase_advance 返回值
{
  success: boolean,
  current_phase: string,
  suggested_skills?: string[],  // 该阶段建议加载的 Skill
  gate_warnings?: string[]     // 门禁检查结果
}
```

#### 10.1.4 Skills 与 Briefing 的"互相转化"

**评级：合理（Phase 1 做法需明确）**

§9.9.1 定义了两条转化路径：
- **Briefing → Skills**：patterns 反复管用 → 固化为 Skill（"这个模式每次都对"→写成 playbook）
- **Skills → Briefing**：Skill 执行中产生新教训 → 回流 Briefing（T1/T2 触发）

**Briefing → Skills 转化**：Phase 1 应为**人工转化**——队主在 T3 战略触发时（作品结束），看到进化卡片中"反复出现的 pattern"，手动决定"把这个 pattern 写成队级 Skill"。平台不自动把 Briefing 条目转成 SKILL.md。理由：Skill 是结构化 playbook，需要人类判断"这个模式是否已稳定到值得标准化"。自动转化可能产出低质量 Skill。

**Skills → Briefing 转化**：已由 T1 机制覆盖——成员读 Skill 执行任务时遇到翻车/顿悟，调 `briefing_retain` 写 draft 教训。这是自动的，Phase 1 已实现。

文档应明确标注："Phase 1 Briefing → Skills 转化为人工（队主在 T3 触发时决策），不自动生成 Skill"。

---

### 10.2 MCP 层评估（核心）

#### 10.2.1 平台级 MCP 服务器实现方式

**评级：需调整**

§9.9.3 写"Streamable HTTP 或 stdio"，未做出明确选择。这是必须定的：

| 传输方式 | Phase 1 适用性 | Phase 2 适用性 | 理由 |
|----------|---------------|---------------|------|
| **stdio MCP** | ✗ 不适用 | ✓ 适用 | stdio 要求 MCP server 和 client 在同一进程组，Pi RPC 模式下成员是远程 session，无法 stdio 连接 |
| **Streamable HTTP** | ✓ 适用（Callback Bridge 本质就是 HTTP） | ✓ 适用 | 平台 daemon 已有 HTTP（Hub Web），可直接复用或开独立端口 |

**建议**：明确选 **Streamable HTTP** 作为平台 MCP 服务器传输方式。Phase 1 的 Callback Bridge 就是 Streamable HTTP 的简化版（Pi extension 发 HTTP 请求而非标准 MCP JSON-RPC）。Phase 2 接入 acpx/Codex 后升级为完整 MCP JSON-RPC over HTTP，底层端点不变。

#### 10.2.2 Callback Bridge（核心风险点）

**评级：有问题（实现复杂度被严重低估，P0）**

§9.9.3 对 Callback Bridge 的描述只有一句话："平台 daemon 起 HTTP 端点，Pi extension 发 HTTP 请求模拟 tool_call"。实际上这是一个完整的子系统，涉及以下组件：

**组件 1：平台侧 HTTP 端点（packages/mcp/callback-bridge.ts）**
- 暴露 `/mcp/tools/:tool_name` POST 端点
- 接收 `{ params: {...} }` 请求体
- 路由到对应的平台核心能力（briefing_search → BriefingManager.search 等）
- 返回 `{ result: ..., error?: ... }`
- 工作量：~2-3 天

**组件 2：Pi extension（pi-callback-bridge）**
- Pi extension 是 Pi 的扩展机制，需要按 Pi extension API 编写
- extension 注册自定义工具（如 `mcp_briefing_retain`、`mcp_card_update` 等）
- 每个工具内部发 HTTP 请求到平台端点
- 需要处理：环境变量注入（端点 URL + token）、HTTP 请求构造、响应解析、错误传递
- **关键风险**：Pi extension API 文档是否完善？是否支持自定义 HTTP 请求？需要验证。如果 Pi extension 不支持发 HTTP（只支持 bash/exec），则需要通过 bash curl 间接调用——增加复杂度
- 工作量：~3-5 天（假设 Pi extension API 完善）

**组件 3：认证与令牌管理**
- 平台为每个成员 session 签发 Bearer Token
- Token 通过环境变量注入 Pi session（`MYTEAMS_CALLBACK_TOKEN`）
- HTTP 请求头带 `Authorization: Bearer <token>`
- 平台校验 token → 识别成员身份 → 权限检查
- Token 随 session 结束失效
- 工作量：~1-2 天

**组件 4：失败重试与降级**
- HTTP 请求可能失败（网络抖动、平台重启、超时）
- 重试策略：最多 3 次，指数退避（1s/2s/4s）
- 超时设置：单次请求 10s 超时
- 降级策略：如果 Callback Bridge 不可用，成员应能继续基本工作（只是无法记笔记/改卡片）。降级为在队内动态记录一条"Callback Bridge 不可用"告警
- 工作量：~1-2 天

**总工作量**：~7-12 天（1.5-2.5 周）。这不是"起个 HTTP 端点"一句话能概括的。

**P0 建议**：Callback Bridge 应作为独立交付项，从 W5 剥离。两种方案：
- **方案 A（推荐）**：Callback Bridge 提前到 W4（W4 原本只做意图路由 + 工作分解可见，相对轻量）。W4 做 Callback Bridge 的 HTTP 端点 + 认证 + 3 个 MCP 工具接口（briefing_retain/card_update/ledger_append），但不接 Pi（用 curl 测试）。W5 接 Pi 后做 Pi extension + 端到端联调。
- **方案 B**：Phase 1 步骤 11（MCP 最小集）降级为"只实现 HTTP 端点 + curl 测试"，Pi extension 推迟到 W5 后半或 W6。Phase 1 验收时成员暂不通过 Callback Bridge 调 MCP——手动由平台代调。

#### 10.2.3 9 个平台级 MCP 工具接口逐个检查

**评级：5 个需调整（P0/P1）**

逐个检查参数合理性和遗漏：

**工具 1：briefing_search(query, limit?)**
- **合理**。query 是检索关键词，limit 默认 10。
- **小补充**：返回值应包含条目的 `source_mission` 和 `source_ledger_seq`（证据链），让成员能追溯教训来源。参数中 `team_id` 应从成员 session 上下文隐式获取，不需要成员传。

**工具 2：briefing_retain(entry: {bucket, text, triggers?, signal?})**
- **需调整（P1）**。缺少两个关键字段：
  - `phase`：应从成员当前所处阶段自动填充，但文档未说明。如果成员在"后期"阶段记一条教训，这条教训的 `phase` 字段应自动标为 `[post]`。建议：平台在 briefing_retain 内部自动从成员上下文填充 phase，成员不需要传。
  - `source_mission` / `source_ledger_seq`：§7.3 的 BriefingEntry 数据结构有这两个字段（证据链），但 briefing_retain 的参数没有。应自动从成员当前 mission 和最近 ledger 条目填充。
- **signal 默认值**：T1 触发时 signal=1，文档说清楚了。但工具参数中 signal 是可选的，默认值应明确为 1。

**工具 3：card_update(card_id, status?, column_id?, assignee?, blocker?)**
- **需调整（P0）**。§6.7 明确说"每次状态变更更新 last_touched"，但 card_update 工具参数中没有 last_touched，文档也没说"平台自动更新"。
- **建议**：明确声明 `last_touched` 由平台在 card_update 执行时**自动更新**为当前时间戳，成员不需要也不应该手动传。文档应在工具说明中补一句："平台自动更新 last_touched 和 next_action（基于 status/column 推断）"。
- **blocker 参数结构**：示例中 `blocker: { reason: "角色不一致：女主发色" }`，但参数列表写的是 `blocker?`（类型未定义）。应明确定义为 `{ reason: string, since?: string }`。

**工具 4：ledger_append(type, content)**
- **需调整（P1）**。两个遗漏：
  - `card_id`：队内动态条目通常关联到某张卡片（如 closeout 记录关联到被收尾的卡片）。应增加可选参数 `card_id?: string`，让动态条目与卡片双向链接（§6.5 要求）。
  - `actor`：谁写了这条动态？应从成员 session 上下文自动填充，但文档未说明。
- **type 枚举**：`'message'|'decision'|'artifact'|'closeout'`——合理。但应补充 `'escalation'`（升级记录）和 `'phase_change'`（阶段切换记录），因为 phase_advance 和 escalate 也应该写队内动态。

**工具 5：escalate(decision_packet: DecisionPacket)**
- **基本合理**。DecisionPacket 结构已在 §8.3 定义。
- **需补充（P1）**：返回值应包含 `escalation_id`，让成员能后续查询状态。同时应自动触发 `card_update(card_id, status: "blocked", blocker: { reason: "待拍板: <background 摘要>" })`——文档示例（§9.9.5 示例 2）显示 escalate 后应标阻塞，但工具定义中没说这个联动是自动的还是 Skill 教成员手动调的。建议：escalate 工具内部自动标阻塞，减少成员调用步骤。

**工具 6：member_message(to, content, card_id?)**
- **需调整（P1）**。两个遗漏：
  - `message_type`：`'notification'|'request'|'response'`。当前所有消息都是同一种，但"请审一下"（request，需要回复）和"第5集完成了"（notification，不需要回复）语义不同。Phase 1 可不区分，但应预留字段。
  - `reply_to`：如果消息是对之前消息的回复，应能引用原消息 ID。Phase 1 可不实现，但应预留。
- **Phase 1 实现**：Phase 1 走平台内部函数调用（非 A2A HTTP），`to` 参数是成员角色名（如"记忆维护者"），平台通过 mission 上下文找到对应的成员 session，将消息推入其消息队列。这个路由逻辑文档未描述——平台怎么把"记忆维护者"映射到具体的 Pi session？建议：mission 启动时记录角色 → session 映射表，member_message 查表路由。

**工具 7：create_submember(role, task, skills?)**
- **需调整（P0）**。多个严重遗漏：
  - **生命周期**：创建的子成员什么时候结束？是 task 完成后自动结束，还是需要显式调用结束？文档完全没提。建议：子成员完成 task 后自动结束（平台检测到子成员的 WorkCard status=done 后回收 session）。但需要定义超时机制——如果子成员卡住了怎么办？建议增加可选参数 `timeout?: number`（秒，默认 3600s），超时后平台强制结束并记队内动态。
  - **parent_member**：谁创建的子成员？应从 session 上下文自动记录，但文档未说。子成员的 WorkCard 应关联到父成员的 WorkCard（父子关系），便于追溯。
  - **mission_id**：子成员在哪个 mission 内工作？应从 session 上下文自动获取。
  - **资源限制**：一个成员能创建多少个子成员？无限制会导致资源爆炸。建议：Phase 1 限制每队同时活跃子成员 ≤ 5 个。
  - **skills 参数**：传入的是 Skill name 列表。SkillsLoader 需要验证这些 Skill 存在且已加载。如果传入不存在的 Skill name，应返回错误。

**工具 8：phase_advance(mission_id)**
- **需调整（P0）**。门禁失败处理未定义：
  - **门禁失败怎么办**：如果门禁检查未通过（如 closeout Skill 要求先做 review，但 review 还没做），phase_advance 应返回什么？是拒绝推进（返回错误），还是推进但带 warning？
  - **建议**：门禁分硬门禁和软门禁。硬门禁失败 → 拒绝推进，返回 `{ success: false, reason: "门禁未通过: 需先完成 review", gate: "review_required" }`。软门禁失败 → 推进但返回 warning。Phase 1 只有软门禁（suggested_skill 只是建议）。
  - **返回值**：见 §10.1.3 的建议返回值结构。
  - **target_phase**：当前只能推进到"下一阶段"，无法跳到指定阶段。意图路由的"小修"场景需要跳到指定阶段（quick_fix_target_phase）。建议增加可选参数 `target_phase?: string`，不传则推进到下一阶段，传则跳到指定阶段。

**工具 9：skill_read(skill_name)**
- **合理**。这是 SkillsLoader 的 MCP 接口，返回 SKILL.md 全文。
- **小补充**：返回值应包含 `depends_on` 列表（如果该 Skill 有依赖且依赖未加载，提示成员先读依赖）。同时应记录 `hit_count`（Skill 被读取次数，类似 BriefingEntry 的 hit_count，用于判断 Skill 使用频率）。

#### 10.2.4 队级 MCP

**评级：合理（Phase 1 不做，Phase 2 实现）**

character_check / event_graph_query 等队级 MCP 工具，实现方式有两种：
- **方式 A**：模板自带 MCP server（如短剧队模板包含一个 `character-check-server` 进程），随模板安装时启动
- **方式 B**：队级 MCP 工具注册到平台 daemon，由平台统一暴露

建议 **方式 B**——队级 MCP 工具的实现注册到平台 daemon（通过模板 `specialties` 配置声明工具名和 handler），平台统一暴露。理由：减少独立进程管理复杂度，且平台可以统一做认证、日志、限流。

Phase 1 不做队级 MCP，此问题不阻塞。但文档应在 Phase 2 交付物中明确实现方式。

---

### 10.3 A2A 层评估

#### 10.3.1 Phase 1 语义对标 A2A 状态映射表

**评级：需调整**

§9.9.4 的映射表覆盖了 A2A 的 6 个核心状态，但有 2 个 A2A 状态缺失：

| A2A 状态 | myteams 映射 | 问题 |
|----------|-------------|------|
| `submitted` → WorkCard 创建 | ✅ | — |
| `working` → Engagement 执行 | ✅ | — |
| `input-required` → Escalation | ✅ | — |
| `completed` → WorkCard done | ✅ | — |
| `failed` → WorkCard blocked | ⚠️ | A2A `failed` 是终态（任务放弃），myteams `blocked` 是可恢复的（阻塞解除后继续）。语义不完全对等。建议：A2A `failed` 映射为 WorkCard `archived`（取消），`blocked` 映射为 A2A `input-required`（需要输入/干预） |
| `canceled` → WorkCard 归档 | ✅ | — |
| **`rejected`** | **缺失** | A2A 中 Agent 可以拒绝任务（能力不匹配）。myteams 当前模型中成员无法拒绝 WorkCard 分配。Phase 1 可不考虑（平台分配即接受），Phase 2 需补充 |
| **`auth-required`** | **缺失** | A2A 中任务需要认证。myteams Phase 1 内部调用无需认证。Phase 2 平台作代理时需要 |

**建议**：
- P1：修正 `failed` 的映射——A2A `failed` → WorkCard `archived`（取消），而非 `blocked`（阻塞可恢复）
- P1：补充 `rejected` 状态说明——Phase 1 不支持成员拒绝任务，Phase 2 评估
- P2：Phase 2 补充 `auth-required` 映射

#### 10.3.2 Phase 2 平台作 A2A 代理

**评级：需调整**

**成员 session 与 Agent Card 的对应关系**：
- 一个成员（Pi session / Codex app-server）对应一个 Agent Card，URL 为 `https://myteams-daemon/agents/<team>/<role>`
- session 结束后 Agent Card 处理：**不应删除**（保留历史记录），应标记为 `offline`。Agent Card 增加 `status: "online"|"offline"` 字段
- 平台知道成员"在线"的机制：Pi RPC 连接保活——平台 daemon 持有 Pi session 的 RPC 连接，连接断开即 session 结束。daemon 维护 `session_registry: Map<member_id, { session_id, status, last_heartbeat }>`，定期检查连接活性

**缺失**：Agent Card 的 `url` 字段指向平台 daemon 的代理 URL，但 A2A 协议要求该 URL 能响应 `POST /tasks/send`。平台 daemon 需要实现 A2A HTTP 端点路由：
- `GET /.well-known/agent.json` → 返回指定成员的 Agent Card
- `POST /agents/<team>/<role>/tasks/send` → 接收 A2A 任务，路由到对应 session
- `GET /agents/<team>/<role>/tasks/:id/status` → 查询任务状态

这些端点的实现文档应补充到 §9.9.4 Phase 2。

#### 10.3.3 Agent Card 动态刷新

**评级：需调整**

产品经理说 `skills` 字段是动态的（成员加载新 Skill 后刷新）。实现机制：
1. SkillsLoader 在成员 `skill_read` 后触发事件 `skill_loaded`
2. A2AProxy 监听 `skill_loaded` 事件
3. A2AProxy 更新 Agent Card 缓存中该成员的 `skills` 字段

**问题**：
- 动态刷新增加 SkillsLoader 和 A2AProxy 的耦合。建议通过**事件总线**（EventEmitter / pub-sub）解耦，而非直接调用
- Agent Card 是被外部 A2A client 缓存的（HTTP 响应有缓存语义）。动态刷新后，外部 client 可能还用旧的 Agent Card。建议：Agent Card 响应头加 `Cache-Control: no-cache`，或用 ETag 版本号让 client 检测变化

**Phase 1 不做 A2A**，此问题不阻塞 Phase 1。但 Phase 2 实现时需注意缓存一致性。

**`skills` 字段建议**：Phase 2 初始版本用**半动态**——建队时确定基础 Skill 列表（静态），成员 session 运行中加载的新 Skill 在 Agent Card 的 `skills_dynamic` 字段反映（动态）。静态字段用于 A2A 发现（"这个成员能做什么"），动态字段用于实时状态查询。

#### 10.3.4 认证方案

**评级：需调整**

§9.9.4 认证方案描述了 Bearer Token 机制，但两个问题未明确：

1. **令牌生命周期**：
   - 创建时机：成员 session 启动时，平台 daemon 签发 JWT（含 `member_id`、`team_id`、`role`、`exp`）
   - 有效期：建议 session 级——令牌绑定 session，session 结束令牌失效。JWT 的 `exp` 设为 session 预期最长时长（如 24h）
   - 刷新机制：如果 session 运行超过 exp，需要刷新令牌。建议：平台在 session 心跳时自动续期

2. **跨队协作令牌互信**：
   - Phase 3 跨队 A2A 时，两个队可能由不同队主管理，但都在同一 myteams 平台上
   - 同平台内令牌互信简单——平台是唯一签发方，验证 `issuer: "myteams-platform"` 即可
   - 真正的跨平台 A2A（不同 myteams 实例之间）需要 OAuth2 或 mutual TLS，但这是 Phase 3+ 的问题，不在本次 review 范围

**建议**：Phase 2 实现时，令牌用 JWT，签名密钥由平台 daemon 管理。`team_id` 和 `role` 作为 claim，平台在转发 A2A 请求时校验 team_id 是否在权限白名单内。

---

### 10.4 三层协同性评估

#### 10.4.1 myteams-closeout 流程死锁/竞态检查

**评级：合理（无死锁，有一个一致性问题）**

myteams-closeout Skill 的执行流程（§9.9.5 示例 1）：
1. briefing_retain → 写 T1 草稿
2. card_update → 标完成
3. ledger_append → 记收尾
4. member_message → 通知记忆维护者

**MCP 调用是同步的**（request-response 模式），每一步完成后才执行下一步。因此：
- briefing_retain（步骤 1）完成后，draft 已写入 DB → 记忆维护者收到消息（步骤 4）时一定能读到 draft → **无竞态**
- 但如果 briefing_retain 写入是异步的（平台为了不阻塞成员，先返回成功再异步写 DB），则存在竞态。**建议**：briefing_retain 必须同步写入 DB 后再返回成功，不能异步。

**一致性问题（P1）**：如果步骤 2（card_update 标完成）成功，但步骤 3（ledger_append）失败（如 DB 锁超时），会出现：
- 卡片已标 done，但没有收尾记录
- 记忆维护者收到步骤 4 的消息，但查不到收尾记录

**建议**：
- MCP 工具调用不提供跨工具事务（太复杂）
- 改为**补偿模式**：如果步骤 3 失败，成员应重试 ledger_append。Skill playbook 应写"如果 ledger_append 失败，重试 3 次后仍失败，用 member_message 通知队主手动补记"
- 平台应在 card_update 时自动写一条队内动态（"卡片状态变更为 done"），作为最小审计记录，即使 ledger_append 失败也有痕迹

#### 10.4.2 create_submember 与 §5.3 工作分解时序

**评级：需调整（P1）**

§9.9.6 衔接表正确标注了 create_submember 在"冻结后调用"：
> §5.3 工作分解（brief→草案→冻结）→ create_submember（分解后创建子成员分配任务）

但 §5.3 正文（第 658-685 行）的四步流程只写到"冻结执行"，没有提到 create_submember：
> 4. 冻结执行：草案冻结为计划制品，生成看板卡片

**问题**：§5.3 正文与 §9.9.6 衔接表不一致。工程师读 §5.3 时不知道有 create_submember。

**建议（P1）**：在 §5.3 第 4 步"冻结执行"中补充一句："冻结后，团队按 myteams-decompose Skill 调用 `create_submember` 分配子任务（对应 §9.9.3 工具 7），子成员收到任务后各自执行。"

同时，§5.3 的流程图（第 663-671 行）应在"冻结为计划制品"和"按计划执行"之间增加"create_submember 分配子任务"步骤。

#### 10.4.3 character-consistency 示例检查

**评级：合理**

§9.9.5 示例 2（character-consistency）展示了模板级 Skills + 队级 MCP + 平台级 MCP + A2A 的协同：
1. character_check（队级 MCP）→ 不一致
2. briefing_retain（平台级 MCP）→ 记教训
3. card_update（平台级 MCP）→ 标阻塞
4. member_message（A2A）→ 通知导演

**流程自洽**，无死锁。但注意：character_check 是队级 MCP，Phase 1 不做。Phase 1 验证只用示例 1（myteams-closeout，全平台级）。

---

### 10.5 实施路线影响

#### 10.5.1 W5/W6 过载评估

**评级：有问题（P0，W5 严重过载）**

v2.1 review 已指出 W6 过载并建议拆分（已被采纳：W6 只做 T1+存储，W7 做注入+T2）。但 v2.2 又往 W5 和 W6 各加了一项：

| 周 | v2.1 计划 | v2.2 新增 | 合计工作量 |
|----|----------|----------|-----------|
| W5 | Pi 引擎接入 + 首阶段跑通（两队并行） | + 平台级 MCP 最小集（briefing_retain/card_update/ledger_append via Callback Bridge） | **极高**：Pi RPC 调试 + 两队首阶段 + Callback Bridge 子系统 + 3 个 MCP 工具 |
| W6 | BriefingEntry 数据结构 + T1 即时触发 + 草稿/正式两态 | + 平台级 Skills 最小集（myteams-closeout + SkillsLoader 渐进披露） | **高**：进化存储 + T1 触发 + Skills 加载器 + 1 个 Skill playbook |

**W5 分析**：
- Pi 引擎接入本身是高风险任务（v2.1 review 已建议 W1 做 Pi RPC 探针）
- 首阶段跑通需要 Pi RPC + 看板 + 卡片状态 + 队内动态 全链路打通
- Callback Bridge 是一周级子系统（见 §10.2.2 分析，7-12 天）
- 三项加在一起，一周不可能完成

**W6 分析**：
- BriefingEntry 存储 + T1 触发已是一周工作量
- SkillsLoader 渐进披露需要：三层目录扫描 + frontmatter 解析 + system prompt 注入 + skill_read 工具 + 依赖检查
- myteams-closeout SKILL.md 需要编写
- 虽然重，但比 W5 可控——SkillsLoader 不依赖 Pi 引擎跑通（可以先实现加载逻辑，Pi 接入后联调）

#### 10.5.2 Callback Bridge 工作量评估

**评级：有问题（P0，应提前或拆分）**

Callback Bridge 的完整工作量（§10.2.2 估算）：7-12 天。这不是一个可以在一周内与 Pi 引擎接入并行完成的任务。

**建议方案（推荐）**：

```
W4（意图路由 + 工作分解可见）
  → 新增：Callback Bridge 平台侧（HTTP 端点 + 认证 + 3 个 MCP 工具接口），用 curl 测试
  → 理由：W4 做意图路由器（YAML 配置 + 正则匹配）和工作分解可见（UI），工作量中等
  → Callback Bridge 平台侧不依赖 Pi，可独立开发和测试

W5（Pi 引擎接入 + 首阶段跑通）
  → 新增：Pi extension（pi-callback-bridge），与 W4 已建好的 HTTP 端点联调
  → 理由：W5 接 Pi 后立即联调 Callback Bridge，但不从零开始

W6（BriefingEntry + T1 + Skills 最小集）
  → 保持不变
  → Skills 最小集可与 BriefingEntry 并行（不同模块）
```

这样 W4 承担 Callback Bridge 平台侧（~3 天），W5 承担 Pi extension + 联调（~3-5 天），分散到两周。

#### 10.5.3 Phase 1 步骤 11-12 合并建议

**评级：合理（可合并以简化路线）**

步骤 11（MCP 最小集）和步骤 12（Skills 最小集）在概念上是成对的（Skills 教成员调 MCP 工具）。但合并后不减少工作量，只是减少路线图步骤数。

**建议**：合并为步骤 11"三层设计最小集验证（MCP 最小集 + Skills 最小集）"，验收标准不变。但实际工作量仍需两周（W4 Callback Bridge 平台侧 + W5 Pi extension + W6 SkillsLoader），路线图中注明"跨 W4-W6 渐进交付"。

---

### 10.6 具体问题确认

#### 10.6.1 队级 MCP 工具 spec 放哪

**确认：产品经理建议放模板级 Skill 的 refs/ 下，我同意。**

§9.9.3 当前写的是平台级 MCP 工具 spec 放 `packages/skills/refs/mcp-tools.md`。队级 MCP 工具的 spec 应放在对应模板的 Skill refs 下：
- 短剧队 character_check spec → `templates/short-drama/skills/character-consistency/refs/mcp-tools.md`
- 应用开发队 run_tests spec → `templates/app-dev/skills/tdd/refs/mcp-tools.md`

理由：队级 MCP 工具与模板级 Skill 成对设计（character-consistency Skill 教成员调 character_check 工具），spec 放一起符合"文档真相源跟 Skill 走"的原则。平台级 MCP spec 集中在 `packages/skills/refs/mcp-tools.md`。

#### 10.6.2 Agent Card 的 skills 字段静态 vs 动态

**确认：Phase 2 用半动态方案。**

纯动态刷新的实现成本和缓存一致性风险较高（见 §10.3.3 分析）。建议：
- `skills`（静态）：建队时确定的基础 Skill 列表，用于 A2A 发现
- `skills_dynamic`（动态）：运行时加载的 Skill，可选查询

Phase 2 初始版本可只做静态，Phase 2.5 补充动态。

#### 10.6.3 Callback Bridge HTTP 端点复用平台 daemon HTTP

**确认：复用，不开独立端口。**

平台 daemon 已有 HTTP 服务（Hub Web）。Callback Bridge 的 `/mcp/tools/:tool_name` 端点直接挂在 daemon 的 HTTP 路由上，与 Hub Web 共享端口。理由：
- 减少端口管理复杂度
- 共享认证中间件（daemon 已有 session 管理）
- Hub Web 和 MCP 工具共用同一个 daemon 进程，无需额外进程

但需注意路由前缀隔离：Hub Web 用 `/api/*`，Callback Bridge 用 `/mcp/*`。

---

### 10.7 必改项（P0）/ 建议改项（P1）/ 可选优化（P2）

#### P0 必改项（实施前必须修复）

| # | 问题 | 章节 | 修复建议 |
|---|------|------|----------|
| V2.2-P0-1 | Callback Bridge 实现复杂度被严重低估（7-12 天工作量塞进 W5 一周） | §9.9.3 / §10.1 W5 | Callback Bridge 平台侧提前到 W4（HTTP 端点 + 认证 + 3 工具接口，curl 测试），Pi extension 留 W5 联调。或在 §10.1 周计划中明确标注 Callback Bridge 跨 W4-W5 交付 |
| V2.2-P0-2 | 9 个 MCP 工具中 5 个有接口缺陷：create_submember 缺生命周期/资源限制、phase_advance 缺门禁失败返回值/target_phase、card_update 缺 last_touched 自动更新说明、ledger_append 缺 card_id/actor、member_message 缺 message_type/路由机制 | §9.9.3 工具 3/4/6/7/8 | 逐个补全参数和返回值定义（见 §10.2.3 详细建议）。在 `packages/skills/refs/mcp-tools.md` 中写完整 spec（含参数类型、返回值结构、错误码、调用示例） |
| V2.2-P0-3 | W5 严重过载（Pi 引擎 + 首阶段跑通 + Callback Bridge + 3 MCP 工具，一周不可能完成） | §10.1 W5 | 按 V2.2-P0-1 方案拆分 Callback Bridge；或将 MCP 最小集降级为"只实现 HTTP 端点 + curl 测试"（不接 Pi extension），Phase 1 验收时成员不通过 Callback Bridge 调 MCP——由平台代调 |

#### P1 建议改项（实施中修复）

| # | 问题 | 章节 | 修复建议 |
|---|------|------|----------|
| V2.2-P1-1 | MCP 服务器传输方式未明确（stdio vs Streamable HTTP） | §9.9.3 | 明确选 Streamable HTTP，Phase 1 Callback Bridge 即其简化版 |
| V2.2-P1-2 | Skills 依赖链检查时机和策略不明（软提示 vs 硬阻塞、循环依赖检测） | §9.9.2 | 明确为两阶段软提示（prompt 补依赖索引 + skill_read 返回依赖提示），SkillsLoader 加拓扑排序检测循环 |
| V2.2-P1-3 | phase_advance 返回值未定义（缺 suggested_skills、gate_warnings、current_phase） | §9.9.3 工具 8 | 补充返回值结构（见 §10.1.3） |
| V2.2-P1-4 | A2A `failed` 状态映射不准确（blocked 是可恢复的，failed 是终态） | §9.9.4 Phase 1 | 修正：A2A `failed` → WorkCard `archived`；`blocked` → A2A `input-required` |
| V2.2-P1-5 | §5.3 正文未提 create_submember，与 §9.9.6 衔接表不一致 | §5.3 / §9.9.6 | §5.3 第 4 步补充 create_submember 调用说明，流程图增加"分配子任务"步骤 |
| V2.2-P1-6 | briefing_retain 缺 source_mission/source_ledger_seq 自动填充说明 | §9.9.3 工具 2 | 明确平台从成员 session 上下文自动填充 phase、source_mission |
| V2.2-P1-7 | escalate 工具应自动触发 card_update 标阻塞，减少成员调用步骤 | §9.9.3 工具 5 | escalate 内部自动调 card_update(status: blocked)，Skill playbook 中不再要求成员手动标阻塞 |
| V2.2-P1-8 | member_message 的角色名→session 路由机制未描述 | §9.9.3 工具 6 | 补充：mission 启动时记录角色→session 映射表，member_message 查表路由 |
| V2.2-P1-9 | A2A `rejected` 状态 myteams 无映射 | §9.9.4 Phase 1 | 补充说明：Phase 1 不支持成员拒绝任务，Phase 2 评估 |
| V2.2-P1-10 | Phase 2 A2A HTTP 端点路由未设计 | §9.9.4 Phase 2 | 补充 `GET /.well-known/agent.json`、`POST /agents/:team/:role/tasks/send`、`GET /tasks/:id/status` 端点设计 |
| V2.2-P1-11 | SkillsLoader 是否依赖引擎原生 Skills 发现机制未明确 | §9.9.2 | 明确 SkillsLoader 不依赖引擎原生发现，自行扫描三层目录构建 system prompt（方案 A） |

#### P2 可选优化

| # | 问题 | 章节 | 优化建议 |
|---|------|------|----------|
| V2.2-P2-1 | Briefing → Skills 转化方式未明确（自动 vs 人工） | §9.9.1 | 明确 Phase 1 为人工转化（队主 T3 触发时决策），不自动生成 Skill |
| V2.2-P2-2 | Agent Card skills 字段动态刷新的缓存一致性 | §9.9.4 Phase 2 | Phase 2 用半动态方案（静态基础 + 动态补充），Agent Card 响应头加 Cache-Control |
| V2.2-P2-3 | 队级 MCP 实现方式未定 | §9.9.3 | Phase 2 实现时，队级 MCP 工具注册到平台 daemon 统一暴露（方式 B） |
| V2.2-P2-4 | ledger_append type 枚举缺 escalation/phase_change | §9.9.3 工具 4 | 补充枚举值，escalate 和 phase_advance 内部自动写队内动态 |
| V2.2-P2-5 | briefing_retain 写入必须同步（不能异步）以避免 closeout 竞态 | §9.9.5 示例 1 | 文档明确 briefing_retain 同步写入 DB 后返回，不可异步 |
| V2.2-P2-6 | create_submember 应有 timeout 和数量限制 | §9.9.3 工具 7 | 增加可选 timeout 参数（默认 3600s），每队同时活跃子成员 ≤ 5 |

---

### 10.8 v2.2 三层设计 Review 检查清单

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Skills 三层存储加载 | ✅ 合理 | 路径清晰，渐进披露可行 |
| Skills 依赖链 | ⚠️ 需调整 | 检查时机/策略/循环检测需明确 |
| suggested_skill 触发 | ⚠️ 需调整 | 触发链路需补充，phase_advance 返回值需定义 |
| Skills ↔ Briefing 转化 | ✅ 合理 | Phase 1 人工转化需明确 |
| MCP 服务器传输方式 | ⚠️ 需调整 | 应明确选 Streamable HTTP |
| Callback Bridge | ❌ 有问题 | 实现复杂度严重低估，7-12 天工作量 |
| 9 个 MCP 工具接口 | ❌ 有问题 | 5 个工具有参数/返回值缺陷 |
| 队级 MCP | ✅ 合理 | Phase 1 不做，Phase 2 实现方式待定 |
| A2A 状态映射 | ⚠️ 需调整 | failed 映射不准确，rejected 缺失 |
| A2A 代理 + Agent Card | ⚠️ 需调整 | session 生命周期、HTTP 端点路由需补充 |
| Agent Card 动态刷新 | ⚠️ 需调整 | 缓存一致性需注意，建议半动态 |
| 认证方案 | ⚠️ 需调整 | 令牌生命周期/刷新/跨队互信需细化 |
| 三层协同（closeout 示例） | ✅ 合理 | 无死锁，有一致性问题（可补偿） |
| create_submember 时序 | ⚠️ 需调整 | §5.3 正文需补 create_submember |
| W5 过载 | ❌ 有问题 | Callback Bridge 使 W5 不可完成 |
| W6 过载 | ⚠️ 可接受 | 比 W5 可控，SkillsLoader 可独立开发 |
| Callback Bridge 工作量 | ❌ 有问题 | 应提前到 W4 或拆分 |
| 队级 MCP spec 放哪 | ✅ 已确认 | 放模板级 Skill refs/ 下 |
| Agent Card skills 字段 | ✅ 已确认 | Phase 2 半动态方案 |
| Callback Bridge 端口 | ✅ 已确认 | 复用 daemon HTTP，不开独立端口 |

---

*本 v2.2 review 聚焦 A2A/MCP/Skills 三层设计。v2.1 review（§一至§九）中已通过的部分不再重复。三层设计概念正确、借鉴扎实，修复 3 个 P0 项后可进入实施。Callback Bridge 是 Phase 1 最大技术风险，建议提前到 W4 启动。*
