# 04 · 团队自主进化机制 与 看板可见机制

> 作者：evo-explorer  
> 日期：2026-07-06  
> 范围：聚焦 myteams v1.2 中两个最难做好的机制——「团队自主进化」与「看板可见」  
> 立场：不复述参考项目，只提炼机制层面的可借鉴做法，并给出可落地的数据结构与流程

---

## 引言：两个机制的共同难点

进化与看板表面是两件事，但共享同一个根问题：**如何让委托人「不用读全部细节，就能判断队的状态是否健康」**。

- 进化是「纵向时间维度」的可见——队跨 Mission 越做越好，且不失控
- 看板是「横向工作维度」的可见——当前 Mission 卡在哪、谁在干、何时完

两者必须共用同一套**信号源**（Ledger + Briefing + WorkCard 状态），否则会出现「看板显示一切正常，但队其实已经学坏了」的撕裂。

---

# 第一部分：团队自主进化机制

## 1.1 进化闭环设计

### 1.1.1 现有闭环的完整性诊断

v1.2 方案的闭环是：

```
Engagement 执行（带 Briefing 上下文）
  → Closeout（什么管用 / 什么翻车）
  → Briefing 更新（principles / patterns / scars）
  → Charter / 工作方式微调
  → 下次执行自动带上
```

**诊断结论：骨架完整，但缺三个关键环节。**

| 缺失环节 | 症状 | 参考项目的做法 |
|----------|------|----------------|
| **信号筛选** | 每次 Closeout 都写 Briefing → 记忆膨胀、噪声压过信号 | OpenCrew `signal≥2` 才入库；Agno `LearningMachine` 有 `Curator` 做维护 |
| **回流注入的精确性** | Briefing 整段塞进 prompt → 污染上下文、token 浪费 | Clowder `SystemPromptBuilder` 片段化 + 条件注入；按 `InvocationContext` 选片段 |
| **进化效果的可验证性** | 改了 Briefing 但不知道「改了之后更好还是更坏」 | Clowder P5「可验证才算完成」；Agno `decision_log` 可追溯 |

### 1.1.2 进化的触发器：三档触发，不是「Mission 结束」一刀切

现有方案隐含「Mission/Phase 结束 → Closeout → Briefing 更新」单一触发器。参考项目揭示了**三档触发器**更合理：

| 触发档 | 时机 | 写入目标 | 重量级 |
|--------|------|----------|--------|
| **T1 即时** | Member 执行中遇到明显翻车/顿悟 | `scars.md`（草稿区，signal=1） | 轻量，Agent 自助 |
| **T2 阶段** | Phase 结束的 Closeout | `patterns.md` / `scars.md`（signal≥2 晋升） | 中量，队内 KO 角色整理 |
| **T3 战略** | Mission 结束 + 委托人验收 | `principles.md` / Charter 微调提案 | 重量，需人批 |

**关键设计**：T1 是 v1.2 缺失的。OpenCrew 的 `#know` 频道允许任意时刻沉淀；Clowder 的 `retain_memory` MCP 工具让 Agent 在执行中就能「记一笔」。myteams 应允许 Member 在 Engagement 中随时写一条 scar 草稿（signal=1），而不是必须等到 Phase 结束。

### 1.1.3 进化结果如何回流到下次执行

v1.2 说「下次自动带上这些惯例」但没说**怎么带**。直接把 `briefing/*.md` 全文塞 prompt 是反模式（参考 Clowder 的教训：150-200 token 身份注入 + 按需检索，而非全量）。

**推荐的回流注入三层模型**（借鉴 Clowder `SystemPromptBuilder` + Agno `ContextProvider`）：

```
注入层 1：常驻段（永远带，~200 token）
  └── principles.md 的 Top-3 条（按 hit_count 排序）

注入层 2：按 Phase 条件注入（按当前阶段选）
  └── brainstorm 阶段 → 注入"发散/收敛"相关 patterns
  └── delivery 阶段  → 注入"实现/测试"相关 patterns

注入层 3：按需检索（Agent 主动查）
  └── Member 遇到相似场景 → 调用 briefing_search(query) 检索 scars
```

**数据结构支撑**（这是 v1.2 缺失的）：每条 Briefing 条目必须有**激活条件**字段，否则无法条件注入：

```yaml
# briefing/patterns.md 的 frontmatter 化条目
- id: P-007
  text: "短剧第三集必须有反转钩子"
  phase: [scheme]              # 在哪些阶段注入
  triggers: [反转, 钩子, 第三集]  # 检索关键词
  hit_count: 5                 # 被引用次数
  signal: 3                    # 信号强度（≥2 才晋升）
  source_missions: [drama-s1]  # 来源 Mission
  last_used: 2026-06-12
  status: active               # active | decayed | archived
```

## 1.2 进化不失控的护栏

### 1.2.1 L0-L3 自治等级的真正落地

v1.2 把 L0-L3 写在文档里，但**执行时谁来检查**是空白。参考项目有两种做法：

| 做法 | 来源 | 机制 |
|------|------|------|
| **Prompt 声明 + 人审** | OpenCrew | 写在 `SOUL.md`，靠 Agent 自觉 + 委托人抽查 |
| **代码强校验 + Predicate** | Clowder | `sop-definitions/*.yaml` 带 `git_state_predicate` 等机器可检查类型 |

**推荐：双层校验**（不能只靠 prompt，也不能纯代码）：

```
Layer A：平台 Policy 硬校验（不可被队修改）
  └── Charter 变更 → 必须人批（L3 硬规则，平台拦截）
  └── 对外发布成品 → 必须人批（L3 硬规则）
  └── Briefing 条目数 > 阈值 → 触发 Curator 清理

Layer B：队宪 Charter 软校验（队可在边界内微调）
  └── Member persona 修改 → L2，需队内评审
  └── 阶段产物清单变更 → L2，需队内评审
  └── 新增 pattern/scar → L1，Agent 可自助
```

**关键**：Layer A 是 v1.2 必须补的——平台有一份**不可被队修改的元 Charter**（`teams/<id>/meta-charter.yaml`，对应 Clowder 的 `guardrails/` Pack），队自己的 `charter.md` 只能在其边界内微调。

### 1.2.2 Briefing 污染/膨胀的防护

这是 v1.2 风险表已列出但未给方案的问题。参考项目给出了三种手段：

| 手段 | 来源 | 机制 |
|------|------|------|
| **信号阈值晋升** | OpenCrew | signal≥2 才从草稿区晋升到正式 Briefing |
| **Curator 角色定期维护** | Agno | `LearningMachine.Curator` 做衰减、合并、归档 |
| **hit_count 衰减** | Clowder Convention Graph | 长期不被引用的条目自动降权 |

**推荐的 Briefing 生命周期**（三阶段）：

```
草稿区（signal=1）
  │  T1 即时写入
  │  ↓ T2 Closeout 时被另一 Mission 佐证 → signal+1
  ▼
正式区（signal≥2, status=active）
  │  注入 prompt、被检索
  │  ↓ hit_count 长期为 0（如 60 天未引用）
  ▼
归档区（status=archived）
  │  不再注入，但可被检索
  │  ↓ 委托人可删除
  ▼
删除（需人批，L3）
```

**Curator 机制**：myteams 应有一个**队内 KO 角色**（借鉴 OpenCrew），或一个**平台级后台任务**（更轻），定期：
1. 合并语义重复的 scars
2. 标记冲突的 patterns（如「快优先」vs「稳优先」）→ 升级为 L3 让委托人裁决
3. 衰减长期未引用的条目

### 1.2.3 Charter 微调的「边界之边界」

v1.2 说「队可在边界内微调 Charter，L3 变更需人批」，但**谁来定义「边界」本身**？如果队能改「什么是 L3」，就能把任何变更降级为 L2 自行通过。

**参考 Clowder 的 `guardrails/` vs `defaults/` Pack 分层**：

```yaml
# teams/<id>/meta-charter.yaml  —— 不可被队修改（平台层定义）
immutable_rules:
  - id: IM-01
    rule: "对外发布成品必须经委托人批准"
    scope: L3
    owner: platform
  - id: IM-02
    rule: "修改本 meta-charter 必须经委托人批准"
    scope: L3
    owner: platform
  - id: IM-03
    rule: "Briefing 条目总数不超过 200 条"
    scope: platform_policy
    owner: platform

boundary:
  team_can_modify:
    - phases/*.yaml 的产物清单（L2）
    - members/*.md 的 persona（L2）
    - board.yaml 的列定义（L1）
    - briefing/patterns.md、briefing/scars.md（L1）
  team_cannot_modify:
    - meta-charter.yaml 本身
    - principles.md（需 L3 人批）
    - 对外发布动作
```

**关键**：`meta-charter.yaml` 由平台定义且不可被队修改，它是「边界的边界」。队改 `charter.md` 只能改 `boundary.team_can_modify` 列表内的东西。

## 1.3 进化的可理解性

委托人不读 Briefing 全文，但要能感知「队在进化」。参考三种可见性做法：

| 做法 | 来源 | 适用场景 |
|------|------|----------|
| **进化日志（Changelog）** | v1.2 已有 `briefing/changelog.md` | 记录「改了什么」，但不够直观 |
| **证据库可检索** | Clowder `search_evidence` | 委托人主动查证「这条原则哪来的」 |
| **能力雷达 / 前后对比** | Agno `decision_log` + `learned_knowledge` | 直观看到「队在哪些方面变强了」 |

**推荐的三层可见性设计**：

```
L1 摘要层（委托人 Hub 默认看到）
  └── 进化卡片：「本月新增 3 条 patterns、2 条 scars；2 条 scars 晋升为 pattern」
  └── 能力雷达：5 维（领域知识 / 协作效率 / 产物质量 / 错误减少 / 自治程度）

L2 追溯层（点开进化卡片）
  └── Briefing Changelog：每条变更附 source_mission、signal、hit_count
  └── 可点击回到源 Mission 的 Closeout 记录

L3 证据层（委托人主动查证）
  └── briefing_search(query) → 返回条目 + 源 Engagement 证据链
```

**关键借鉴 Clowder 证据库**：每条 Briefing 条目必须能追溯到源 Engagement 的 Ledger 条目（`source_mission` + `source_ledger_seq`）。这样委托人能验证「这条原则不是 Agent 瞎编的，确实是从 drama-s1 第三集翻车中学的」。

## 1.4 推荐的进化机制设计

综合以上，给出一个可落地的进化机制设计。

### 1.4.1 数据结构

```typescript
// Briefing 条目（统一三桶）
interface BriefingEntry {
  id: string;                    // P-007 / SC-012 / PR-003
  bucket: 'principles' | 'patterns' | 'scars';
  text: string;                  // 条目正文
  phase: PhaseId[];              // 在哪些阶段注入
  triggers: string[];            // 检索关键词
  signal: number;                // 信号强度 1-5
  hit_count: number;             // 被引用次数
  status: 'draft' | 'active' | 'decayed' | 'archived';
  source_missions: string[];     // 来源 Mission
  source_ledger_seq?: number[];  // 源 Ledger 条目序号（证据链）
  created_at: string;
  last_used: string;
  conflicts_with?: string[];     // 与哪些条目冲突（需人裁决）
}

// 进化事件（写入 Ledger）
interface EvolutionEvent {
  type: 'scar_draft' | 'signal_promote' | 'pattern_merge' 
      | 'charter_tweak' | 'curator_decay' | 'conflict_escalate';
  entry_id?: string;
  actor: 'member' | 'ko' | 'curator' | 'human';
  before?: BriefingEntry;
  after?: BriefingEntry;
  reason: string;
  autonomy_level: L0 | L1 | L2 | L3;
  approved_by?: 'human' | 'ko' | 'auto';
}
```

### 1.4.2 触发流程

```
┌─────────────────────────────────────────────────────────┐
│ T1 即时触发（Engagement 执行中）                          │
│  Member 遇到翻车/顿悟                                     │
│   → 写 scar 草稿到 briefing/scars.md（signal=1）          │
│   → Ledger 记录 evolution_event(scar_draft)              │
│   → 不注入 prompt（draft 状态）                           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ T2 阶段触发（Phase Closeout）                              │
│  KO 角色整理本阶段 Closeout                                │
│   → 逐条评估：是否与既有 scars 佐证？                      │
│   → 是 → signal+1，signal≥2 晋升 active                   │
│   → 否 → 保留 draft，等下次 Mission 佐证                   │
│   → 检测冲突：新 scar 与已有 pattern 矛盾？                │
│   → 是 → 标记 conflicts_with，升级 L3 待人裁决             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ T3 战略触发（Mission 结束 + 委托人验收）                    │
│  委托人看到进化卡片（L1 摘要）                              │
│   → 决定：哪些 pattern 晋升为 principle？                  │
│   → 决定：Charter 是否微调（boundary 内）？                │
│   → 决定：冲突条目保留哪一条？                             │
│   → 所有 L3 变更写入 Ledger，附 approved_by=human          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 后台：Curator 定期维护（每周或每 N 个 Mission）             │
│   → 衰减：60 天未引用的 active → decayed                   │
│   → 合并：语义重复的条目合并，hit_count 累加                │
│   → 上报：decayed 数量、冲突未裁决数量 → 进化卡片           │
└─────────────────────────────────────────────────────────┘
```

### 1.4.3 用户可见性

委托人 Hub 的「队养成」面板：

```
┌─────────────────────────────────────────────┐
│ 应用开发队 · 进化概览                          │
├─────────────────────────────────────────────┤
│ 能力雷达（5 维，对比上个 Mission）              │
│   领域知识    ████████░░ +12%                 │
│   协作效率    ███████░░░ +8%                  │
│   产物质量    █████████░ +15%                 │
│   错误减少    ██████░░░░ 持平                  │
│   自治程度    ███████░░░ +5%                  │
├─────────────────────────────────────────────┤
│ 本 Mission 进化事件                           │
│   ✓ 新增 2 条 scars（draft）                  │
│   ✓ 1 条 scar 晋升 pattern（signal≥2）        │
│   ⚠ 1 条 pattern 冲突待裁决 [去处理]           │
│   ✓ Curator 衰减 3 条过期条目                  │
├─────────────────────────────────────────────┤
│ Briefing 现状                                 │
│   principles: 8 条（active）                  │
│   patterns:   23 条（active）/ 5 条（draft）   │
│   scars:      11 条（active）/ 3 条（decayed） │
│   [查看全部] [查证据库]                        │
└─────────────────────────────────────────────┘
```

### 1.4.4 进化机制的核心建议（一句话）

> **进化的关键不是「写得多」，而是「信号阈值 + 条件注入 + 证据可追溯」——让队在每次 Mission 中沉淀的 scars 必须被独立佐证才能晋升为 patterns，让每条被注入 prompt 的条目都带激活条件，让每条 Briefing 都能回到源 Mission 的 Ledger 证据。**

---

# 第二部分：看板可见机制

## 2.1 看板要回答的用户问题

委托人最常问的 10 个问题，每个必须对应看板的一个可见元素：

| # | 委托人问题 | 看板元素 | 现有 v1.2 是否覆盖 |
|---|-----------|----------|-------------------|
| Q1 | 现在有多少活没做完？ | 各列卡片数 + 顶部「X/Y 完成」进度条 | ✓ 列 + 卡片 |
| Q2 | 卡在哪了？ | `status=blocked` 的卡片 + 红色阻塞标记 + blocker 原因 | ✓ blocker 字段 |
| Q3 | 谁在干啥？ | 卡片上的 assignee 头像 + 「正在干」列 | ✓ assignee |
| Q4 | 还要多久？ | 卡片 `eta` 字段 + Mission 预计完成日 | ✗ 缺失 |
| Q5 | 有没有出问题？ | 顶部「健康度」徽章（绿/黄/红）+ 阻塞数 | ✗ 缺失 |
| Q6 | 上次进展是什么时候？ | 卡片 `last_touched` 时间戳 + 灰显陈旧卡 | ✗ 缺失 |
| Q7 | 下一步该谁动？ | 卡片 `next_action` + 「等待中」列标识 | ✗ 缺失 |
| Q8 | 这个 Mission 推进到哪一段了？ | Phase 指示器（brainstorm/scheme/delivery） | ✓ Phase 关联 |
| Q9 | 我需要拍板什么？ | 「待拍板」列（L3 Escalation） | ✓ escalation |
| Q10 | 这个队整体靠谱吗？ | 进化卡片 + 历史 Mission 完成率 | ✗ 缺失（在进化面板） |

**结论**：v1.2 的看板字段覆盖 Q1/Q2/Q3/Q8/Q9，但缺 Q4/Q5/Q6/Q7。这四个缺失项正是委托人「看不见时的焦虑源」。

## 2.2 看板 vs 时间线 vs 阶段视图

### 2.2.1 三视图是否最优？

v1.2 把三视图并列，委托人默认 landing 看板。参考项目暗示三视图**不应完全平等**：

| 视图 | 参考项目定位 | myteams 建议定位 |
|------|--------------|------------------|
| 看板 | Multica 主视图、OpenTeams Workflow 图 | **主视图**（默认 landing） |
| 时间线 | Paseo Timeline（主视图）、Clowder Ledger | **下钻视图**（点卡片看细节） |
| 阶段 | OpenTeams 计划图、Archon DAG | **上下文头**（看板顶部的位置指示器，非独立 tab） |

**建议**：把「阶段」从独立 tab 降级为看板顶部的**位置指示器**（类似面包屑），让阶段与看板合一。这样减少委托人的 tab 切换认知负担。

```
┌─────────────────────────────────────────────────┐
│ Mission: 待办应用 MVP                            │
│ ● brainstorm ─── ◉ scheme ─── ○ delivery        │  ← 阶段指示器（可点击切换）
├─────────────────────────────────────────────────┤
│ 待办    │ 进行中   │ 待审    │ 完成              │  ← 看板列
│ [卡]    │ [卡]@架构 │ [卡]⚠   │ [卡][卡]          │
│ [卡]    │ [卡]@构建 │         │ [卡]              │
├─────────────────────────────────────────────────┤
│ 健康度: 🟡 2 张阻塞 · 预计 7/12 完成              │
└─────────────────────────────────────────────────┘
```

### 2.2.2 时间线的角色调整

时间线不应该是并列 tab，而应该是**卡片的下钻视图**。参考 Paseo 的 Timeline epoch 模型：每张卡片的移动、每次 Agent 执行都在时间线上有条目，委托人点卡片即展开该卡的时间线片段。

**建议**：
- 看板是「俯瞰」——回答 Q1/Q2/Q3/Q5
- 时间线是「放大镜」——回答「这张卡发生了什么」（点卡片侧栏展开，非切 tab）
- 全局时间线（整个 Mission）作为次级 tab，给需要追溯全局的委托人

## 2.3 多团队并存的看板

用户养了 3 支队（短剧/小说/应用开发），v1.2 在 Phase 3 才做「跨 Team 委托人仪表盘」。但这是委托人**日常最高频的需求**——「我 3 支队现在都在干啥」，不能推迟到 Phase 3。

### 2.3.1 反模式：缩微看板

错误做法是把 3 支队的看板缩小并排显示。原因：
- 看板缩微后卡片文字不可读，失去信息密度
- 委托人不关心「每张卡」，关心「每支队的整体状态」

### 2.3.2 推荐做法：活态摘要卡

借鉴 Paseo 的 Agent 摘要 + Clowder Mission Hub 的 Feature 状态，设计**每支队一张摘要卡**的跨 Team 总览：

```
┌─────────────────────────────────────────────────┐
│ 我的所有编队                                     │
├──────────────────┬──────────────────────────────┤
│ 短剧创作队       │ 应用开发队                    │
│ Mission: S1E03   │ Mission: 待办 MVP             │
│ ●━◉━━○ delivery  │ ●━●━◉ scheme                 │
│ 进度: 12/15 场   │ 进度: 3/8 功能                │
│ 健康: 🟢 无阻塞   │ 健康: 🟡 2 张阻塞             │
│ 在干: @导演 剪辑  │ 在干: @架构师 设计            │
│ 待拍板: 0         │ 待拍板: 1 (方案审批)          │
│ ETA: 7/09         │ ETA: 7/15                    │
│ [进入看板]        │ [进入看板]                    │
├──────────────────┼──────────────────────────────┤
│ 小说创作队       │                              │
│ Mission: 卷二    │                              │
│ ◉━━○━○ brainstorm │                              │
│ 进度: 0/20 章    │                              │
│ 健康: 🟢         │                              │
│ ...              │                              │
└──────────────────┴──────────────────────────────┘
```

**每张摘要卡的字段**（必须精简到一目了然）：

```typescript
interface TeamSummaryCard {
  team_id: string;
  team_name: string;
  mission_id: string;
  mission_title: string;
  phase: PhaseId;                // 当前阶段
  progress: { done: number; total: number; unit: string }; // 12/15 场
  health: 'green' | 'yellow' | 'red';
  health_reason: string;         // "2 张阻塞" / "无进展 3 天"
  active_members: string[];      // 当前在干的 Member handle
  pending_escalations: number;   // 待拍板数
  eta: string;                   // 预计完成日
  last_activity: string;         // 最近一次活动（相对时间）
}
```

**健康度算法**（关键，不能瞎拍）：

```
green  = 无阻塞 且 最近活动 < 24h 且 待拍板 = 0
yellow = 有阻塞 但 < 3 张  或  最近活动 1-3 天  或  待拍板 1-2
red    = 阻塞 ≥ 3 张  或  最近活动 > 3 天  或  待拍板 ≥ 3
```

## 2.4 看板与协作模式联动

v1.2 已给出 Thread / WorkflowRun 下看板的角色，但**卡片如何与 Thread/WorkflowRun 双向链接**未细化。

### 2.4.1 Thread 模式下的卡片

参考 Clowder 的「卡片作为上下文锚点」：Thread 讨论可挂在某张卡片上，卡片侧栏显示该卡相关的 Thread 片段。

```
WorkCard
  ├── links.thread_id?: string      // 该卡关联的 Thread
  └── links.ledger_seqs: number[]   // 该卡相关的 Ledger 条目

点击卡片 → 侧栏：
  ┌─ 卡片详情 ──────────────┐
  │ 标题 / 描述 / assignee    │
  │ 阻塞 / 产物链接           │
  ├─ 相关讨论 ──────────────┤
  │ @编剧: 这场戏加个反转      │  ← Thread 片段
  │ @导演: 节奏太赶，否决      │
  │ [查看完整 Thread]         │
  └─────────────────────────┘
```

### 2.4.2 WorkflowRun 模式下的卡片

参考 OpenTeams 的「步骤映射到卡片列移动」：WorkflowRun 的每个 step 对应一张卡或卡的列移动。

```
WorkflowRun step → WorkCard 映射规则：
  step.implement  → 卡片在「进行中」列，assignee = step.member
  step.review     → 卡片移到「待审」列，gate = human_optional
  step.integrate  → 卡片移到「完成」列

step 失败 → 卡片 status=blocked, blocker="review step 失败：原因..."
step 重试 → 卡片回到「进行中」，Ledger 记录 retry
```

**双向链接数据结构**：

```typescript
interface WorkCard {
  // ... 现有字段
  links: {
    thread_id?: string;            // Thread 模式：关联讨论
    workflow_run_id?: string;      // Workflow 模式：关联运行
    workflow_step_id?: string;     // 对应的 step
    ledger_seqs: number[];         // 相关 Ledger 条目
  };
}

// WorkflowRun step 反向引用
interface WorkflowStep {
  // ... 现有字段
  card_id?: string;                // 该 step 操作的卡片
}
```

### 2.4.3 Hybrid 模式（应用开发队）的看板表现

应用开发队 brainstorm/scheme 用 Thread、delivery 用 Workflow。看板应**自适应**：

- brainstorm/scheme 阶段：卡片少（5-10 张），列简单（构思/方案/已定），卡片挂 Thread
- delivery 阶段：卡片暴增（20+ 张），列细化（待办/进行中/待审/完成），卡片挂 WorkflowRun step

**关键**：阶段切换时，看板列模板应自动切换（`teams/<id>/board.yaml` 可按 phase 配置不同列模板）。

```yaml
# teams/app-dev/board.yaml
phase_templates:
  brainstorm:
    columns: [构思池, 待讨论, 已定方向]
  scheme:
    columns: [方案草稿, 评审中, 已定案]
  delivery:
    columns: [待办, 进行中, 待审, 已完成]
```

## 2.5 推荐的看板机制设计

### 2.5.1 视图布局

**三层视图，按使用频率分层**：

```
L1 跨 Team 总览（委托人打开 Hub 首屏）
  └── 每支队一张活态摘要卡（§2.3.2）
  └── 顶部：待拍板总数、阻塞总数、本日 ETA 到期数

L2 单 Mission 看板（点摘要卡进入）
  └── 顶部：阶段指示器 + 健康度徽章 + ETA
  └── 主体：看板列 + 卡片
  └── 侧栏（点卡片）：卡片详情 + 相关讨论 + 产物

L3 时间线下钻（点卡片侧栏的「查看历史」）
  └── 该卡片的 Ledger 条目流
  └── 或切到全局时间线 tab
```

### 2.5.2 卡片字段（补全 v1.2 缺失项）

```typescript
interface WorkCard {
  // 基础
  id: string;
  title: string;
  description?: string;
  column_id: string;
  
  // 人
  assignee?: string;              // Member id
  assigned_at?: string;
  
  // 阶段
  phase?: PhaseId;
  
  // 状态（补全）
  status: 'open' | 'active' | 'blocked' | 'in_review' | 'done';
  blocker?: {
    reason: string;
    raised_by: string;            // Member id
    raised_at: string;
    suggested_fix?: string;
  };
  
  // 时间（补全 Q4/Q6/Q7）
  created_at: string;
  last_touched: string;           // 最后一次状态变更或 Ledger 写入
  eta?: string;                   // 预计完成（Agent 估或人填）
  next_action?: {
    who: string;                  // 该谁动（Member id 或 'human'）
    what: string;                 // 动什么
  };
  
  // 产物
  artifacts: string[];
  
  // 链接
  links: {
    thread_id?: string;
    workflow_run_id?: string;
    workflow_step_id?: string;
    ledger_seqs: number[];
  };
}
```

### 2.5.3 卡片陈旧度可视化

为回答 Q6（上次进展是什么时候），卡片应按 `last_touched` 显示陈旧度：

| last_touched | 视觉 |
|--------------|------|
| < 6h | 正常 |
| 6-24h | 轻微灰边 |
| 1-3 天 | 黄色「陈旧」徽章 |
| > 3 天 | 红色「停滞」徽章 + 自动加入健康度计算 |

### 2.5.4 跨 Team 总览的数据结构

```typescript
interface CrossTeamOverview {
  teams: TeamSummaryCard[];       // §2.3.2
  top_alerts: {
    pending_escalations: number;  // 待拍板总数
    blocked_cards: number;        // 阻塞卡片总数
    stalled_cards: number;        // 停滞卡片总数
    eta_due_today: number;        // 今日 ETA 到期数
  };
  last_updated: string;
}

// 健康度计算（平台统一，不让队自报）
function calcHealth(mission: Mission): HealthStatus {
  const blocked = mission.cards.filter(c => c.status === 'blocked').length;
  const stalled = mission.cards.filter(c => isStalled(c)).length;
  const pending = mission.escalations.filter(e => !e.resolved).length;
  const lastAct = mission.last_activity_at;
  const hoursSince = hoursSince(lastAct);
  
  if (blocked >= 3 || hoursSince > 72 || pending >= 3) return 'red';
  if (blocked > 0 || hoursSince > 24 || pending > 0) return 'yellow';
  return 'green';
}
```

### 2.5.5 看板机制的核心建议（一句话）

> **看板的关键不是「列多卡片细」，而是「跨 Team 总览用摘要卡而非缩微看板」+「每张卡补齐 ETA/last_touched/next_action 三个字段」+「健康度由平台统一算法计算不让队自报」。委托人最焦虑的不是「有多少卡」，而是「是不是卡住了没人动」——last_touched + next_action 直接回答这个焦虑。**

---

## 附录：与 v1.2 方案的对照清单

| v1.2 现状 | 本文档建议 | 优先级 |
|-----------|-----------|--------|
| Briefing 三桶但无激活条件 | 每条加 phase/triggers/signal/hit_count | P0 |
| Closeout 单一触发器 | T1/T2/T3 三档触发 | P0 |
| L0-L3 写在文档 | 双层校验 + meta-charter.yaml 不可改 | P0 |
| 无 Briefing 衰减机制 | Curator 定期维护 + 60 天衰减 | P1 |
| 进化可见性仅 changelog | 三层可见性 + 能力雷达 + 证据链 | P1 |
| 三视图并列 | 看板主视图 + 阶段降级为指示器 + 时间线下钻 | P0 |
| 无跨 Team 总览（Phase 3 才做） | 活态摘要卡，提前到 Phase 1 | P0 |
| 卡片缺 ETA/last_touched/next_action | 补齐三字段 + 陈旧度可视化 | P0 |
| 健康度无定义 | 平台统一算法（阻塞/停滞/待拍板） | P0 |
| 卡片与 Thread/WorkflowRun 链接未细化 | 双向链接数据结构 + 自适应列模板 | P1 |

---

*本文档聚焦进化与看板两个机制，给出可落地的数据结构与流程设计。与其他 exploration 文档互补，供 team-lead 综合时参考。*
