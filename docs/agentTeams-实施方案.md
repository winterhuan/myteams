# agentTeams 方案

> 版本：v3.0（围绕三大支柱从头重构；docs 参考文档仅作输入，不照抄任何参考项目）
> 日期：2026-07-05

---

## 0. 三个诉求，三大支柱

agentTeams 要满足的三件事，直接决定系统的三大支柱：

| 诉求 | 支柱 | 系统必须回答的问题 |
|------|------|------------------|
| 多个专业团队，各干各的领域（短剧、小说、应用开发……） | **支柱一：团队是平台的一等对象** | 平台如何做到"懂团队"但"不懂领域"？ |
| 每个团队按自己的工作内容，用适合自己的方式 | **支柱二：工作方式属于团队，不属于平台** | 平台提供什么、团队定义什么，边界画在哪？ |
| 团队长期存在，可以自主进化 | **支柱三：经验是资产，进化是机制** | 团队怎么"记住"、怎么"变好"、边界谁管？ |

一句话架构观：**平台是"团队的宿舍与操场"——提供住所（持久化）、场地（协作现场）、校规（安全边界）；每支队自带教练（工作方式）和成长日记（记忆）。** 平台代码里不出现"短剧""小说""应用开发"任何领域词——这是支柱一成立的检验标准。

---

## 1. 支柱一：团队是一等对象

### 1.1 概念模型

```text
平台
 └── Team ×N（长期存在，可归档不可"用完即弃"）
      ├── 身份：名字、领域简介、成立时间、履历
      ├── 成员 Member ×N：Agent 或人，各有 @handle、岗位、执行引擎
      ├── 队规 Playbook：本队工作方式的唯一定义（支柱二）
      ├── 作品 Work ×N：团队做过/在做的每一件事
      │     └── 现场 Room ×N：围绕作品的协作空间（时间线）
      └── 队史 Legacy：记忆 + 复盘档案（支柱三）
```

关键立场：

- **Team ≠ 一次会话**。会话是消耗品，团队是资产。所有状态落盘（SQLite + 文件区），进程重启、机器重启，队伍还在。
- **人是普通成员**。人有 @handle、可被交办事项；人和 Agent 的区别只是"执行引擎不同"（人 = 通知收件箱）。
- **成员绑定引擎而非平台绑定引擎**：`@编剧 → pi`、`@评审 → claude`，同队可混用。平台通过统一的引擎接口调用，不感知引擎差异。

### 1.2 多队并存的含义

- 三支队 = 三份数据 + 三份队规 + 三份队史，**共享同一套平台代码**。
- 建第二支队不需要平台发版——只需要一份新队规。这是"平台不懂领域"的直接推论。
- Hub 首页即"我的队伍们"：每队一张卡片（在做什么、卡在哪、等我拍什么板）。

### 1.3 数据骨架（完整 schema 见附录 A）

```text
teams / members / works / rooms / entries（时间线，append-only）
+ 每队一个文件区 ~/.agentteams/teams/<id>/（playbook.md、memory/、archive/，git 管理）
```

---

## 2. 支柱二：工作方式属于团队

### 2.1 边界怎么画：平台给"物理"，团队给"玩法"

| 平台提供（对所有队相同） | 团队定义（每队不同，写在队规里） |
|------------------------|--------------------------------|
| 阶段容器与迁移机制 | 有哪几个阶段、叫什么、什么顺序、能否回退/循环 |
| 交棒机制（@ 即交办） | 谁在什么阶段干什么、交给谁 |
| 责任追踪（任一时刻现场有唯一负责人） | 负责人卡住多久算异常、找谁 |
| 叫人机制（升级给人拍板） | 什么事必须叫人（发布？花钱？定稿？） |
| 产物挂载与时间线 | 每阶段要交出什么产物、什么算合格 |
| 记忆读写通道 | 记什么、什么经验够格入库 |

### 2.2 队规（Playbook）

队规是一份**结构化文档 + 可执行约束**的混合体，每队一份：

```yaml
# ~/.agentteams/teams/<id>/playbook.yaml —— 以短剧队为例（应用开发队/小说队结构相同、内容全异）
rhythm:                        # 本队阶段状态机：段数、名称、顺序全部自定义
  - id: 选题
    who: [@策划, @制片人]
    deliver: [题材一页纸, 对标分析]
    done_when: "制片人确认题材"
  - id: 剧本
    who: [@编剧, @策划]
    deliver: [分集大纲, 每集剧本]
    gate: human              # 剧本定稿必须人拍板
    next: [拍摄脚本, 选题]     # 可回退重新选题
  - id: 拍摄脚本
    who: [@分镜, @编剧]
    deliver: [分镜表, 场景清单]
    next: [done]
loop: 集                       # 本队按「集」循环：每集独立走一遍 rhythm
must_ask_human: [对外发布, 预算变更, 剧本定稿]
review_rule: "产出者与审核者不得为同一成员"
memory_policy: "同类问题出现≥2次才写入惯例"
```

- 平台只认识 yaml 里的**结构**（阶段、门禁、循环、必叫人清单），不认识"选题""剧本"这些词。
- 应用开发队的队规可能是三段线性（风暴→定案→实施）；小说队可能按"章"循环且多一个"世界观"常驻阶段——**同一平台，零改动**。
- 队规双形态：yaml 是机器执行的真相源，同时渲染成 `playbook.md` 供成员在干活时阅读。

### 2.3 干活的通用协议（平台唯一强制的"物理定律"）

无论哪支队，现场推进只有一个协议，防止无人值守时空转或无声挂死：

1. **@ 即交办**：消息行首 `@handle` = 把球交给他；任一时刻现场有唯一持球人。
2. **三选一收尾**：每次成员产出必须以其一结束——`@下一位`（交棒）/ `稍后再来`（定时或条件唤醒）/ `请人拍板`（进拍板箱）。违反两次自动升级给人。
3. **持球状态可见**：现场状态 = 新建/推进中/卡住/完结/中断，卡住的现场在 Hub 上亮红。
4. **阶段迁移走门禁**：按队规的 `next` 与 `gate` 检查（人拍板 / 产物齐备 / 自定判据），迁移事件全部留痕。

这四条是平台层的、领域无关的；其余一切规矩来自队规。

### 2.4 成员被唤起时看到什么

每次执行前，平台拼一段简短的"上工简报"交给成员的引擎：

```text
你是〈短剧一队〉的 @编剧（岗位职责…）。队友：@策划(…) @分镜(…) 人类：@老板。
当前作品《xxx》第 3 集，处于「剧本」阶段——本阶段要交出：分集大纲、每集剧本；定稿须人拍板。
你现在持球。收尾三选一：@队友交棒 / 稍后再来 / 请人拍板。
队里的惯例（来自队史，节选）：… 
可用工具：查看现场 / 发消息 / 挂产物 / 请人拍板 / 稍后再来 / 迁移阶段 / 查队史 / 复盘
```

引擎无关：这段简报 + 工具面（MCP）就是成员与平台的全部接口，Pi、claude、codex 一视同仁。

---

## 3. 支柱三：长期存在与自主进化

### 3.1 进化的定义（先收窄，才可实现）

"自主进化"不是 Agent 改代码，而是三件具体的事：

1. **记得住**：每个作品收尾时强制复盘，经验入队史；
2. **用得上**：下次干活时，相关经验自动出现在上工简报里；
3. **改得动**：团队可以在授权范围内修改自己的队规。

### 3.2 记忆机制

```text
现场完结前 → 强制复盘（结构化）：什么管用 / 什么翻车 / 建议成为惯例的做法
     ↓
蒸馏（由队规指定的成员执行，如 @制片人）：
  同类信号 ≥2 次才入库，写入队史三件套
     memory/principles.md   # 原则：本队做事底线
     memory/patterns.md     # 打法：验证过管用的做法
     memory/scars.md        # 伤疤：踩过的坑与规避法
     ↓
队史目录是 git 仓库：每次变更一个 commit —— 可回滚、可审计、防污染
     ↓
下次唤起：按当前阶段/任务检索 ≤10 条，注入上工简报
```

验收标准（黄金用例）：**同一支队第二次做同类任务时，上工简报里可见上次的沉淀，且行为可感知地不同。**

### 3.3 进化边界（自治的安全阀）

队规里的 `evolution` 段划定两级权限：

| 级别 | 内容 | 谁批 |
|------|------|------|
| 队伍自改 | 队史全部、阶段的描述/产物清单/完成判据 | 无需批准，git 留痕 |
| 须人批准 | 阶段增删与顺序、门禁、必叫人清单、成员进出、自治等级 | 自动生成提案进拍板箱 |

即：**战术自由，宪法修正案要公投。** 团队想改自己的结构，走的是"提案→人拍板→生效"，而不是静默生效。

### 3.4 长期存在的工程含义

- 一切状态可恢复：SQLite（结构化状态）+ 文件区（队规/队史/产物），进程只是执行器。
- 现场时间线 append-only：历史不可篡改，队史蒸馏永远有原始出处可溯。
- 归档而非删除：解散的队伍归档保留全部履历，可复活。

---

## 4. 系统架构（把三大支柱落到最小实现）

### 4.1 拓扑：一个守护进程 + 一套工具面

```text
agentteams hub（单 Node 进程，本地优先）
 ├── SQLite  ~/.agentteams/agentteams.db      # 唯一权威结构化状态
 ├── 文件区  ~/.agentteams/teams/<id>/         # 队规 / 队史(git) / 产物
 ├── Web UI（HTTP+WS, 127.0.0.1:7100）         # Hub：队伍卡片/现场/拍板箱
 ├── MCP 工具面                                 # 成员回调平台的唯一通道
 └── 执行器  Dispatcher + EngineAdapter         # 队列化调用 pi / claude / codex…
```

- **零外部服务依赖**（无 Redis/Postgres/消息队列），单人可维护；崩溃恢复 = 重启后按 DB 状态续跑。
- 技术栈：TypeScript monorepo（pnpm）、Zod schema、better-sqlite3、Fastify + ws、React 单页、Vitest。

### 4.2 模块与支柱对应

| 模块 | 服务的支柱 | 内容 |
|------|-----------|------|
| `core/teams` | 一 | Team/Member/Work/Room 持久化与生命周期 |
| `core/playbook` | 二 | 队规解析校验、阶段状态机、门禁钩子、迁移事件 |
| `core/relay` | 二 | @ 解析（仅行首、剥代码块、防自@、链深上限）+ 持球状态机 + 三选一协议兜底 |
| `core/dispatch` | 二 | 执行队列（幂等键、重试退避、并发上限、卡住持久化） |
| `core/engines` | 二 | EngineAdapter 接口 + pi 适配器（首发）+ acpx 适配器（次发，一次覆盖 20+ 引擎） |
| `core/legacy` | 三 | 复盘收集、蒸馏、检索注入、进化提案 |
| `hub` / `ui` / `cli` | 全部 | 装配、界面、命令行 |

持球状态机刻意极简：5 个状态（新建/推进中/卡住/完结/中断）× 8 个事件，表驱动纯函数 + 全组合穷举测试；@ 解析与推进循环同样自研小实现（目标 ≤600 行），**不引入任何参考项目的代码**。

### 4.3 MCP 工具面（成员视角的全部平台能力）

`查看现场 get_room` / `发消息 post`（行首 @ 即交办）/ `挂产物 attach` / `稍后再来 snooze` / `请人拍板 ask_human` / `迁移阶段 advance·revert`（受门禁）/ `查队史 recall` / `复盘 retro`。

### 4.4 Hub UI（人视角的四件事）

1. **我的队伍们**：每队卡片——在做什么/哪个阶段/是否卡住/等我拍什么板
2. **现场**：时间线 + 持球条 + 阶段进度（布局参数来自队规，Phase 3 起每队可不同）
3. **拍板箱**：决策包列表（背景/选项/建议/影响），一键定夺
4. **插话**：人随时 @ 任何成员

---

## 5. 实施路线（每步验收 = 三支柱各前进一格）

### M0 底座（约 1 周）
monorepo + schema/migration + 持球状态机（穷举测试）+ 队规解析与阶段状态机（回退/循环/非法迁移用例）+ @ 解析。

### M1 一支队活起来（约 3–4 周）——支柱一、二成立
- pi 引擎适配器（invoke/会话续接/中止）
- dispatch 队列 + 推进循环 + 三选一兜底
- MCP 工具面（除 recall/retro 外全部）
- 应用开发队模板（队规 + @pm/@builder/@reviewer 岗位）
- Hub 四视图最小版 + CLI
- **验收**：给应用开发队一个真实小需求（如命令行番茄钟），无人值守走完本队全部阶段，人只在门禁处拍板，产出可运行交付物。

### M2 队伍变聪明（约 1–2 周）——支柱三成立
- retro/recall + 蒸馏 + git 化队史 + 简报注入 + 进化提案流
- **验收（黄金用例）**：同队第二个同类需求，简报含上次沉淀且行为可感知不同；队伍发起一次队规修改提案并经拍板生效。

### M3 多队并存（约 2–3 周）——支柱一完全体
- 短剧队或小说队模板（不同段数 + 按集/章循环）
- **验收**：第二支队上线全程平台零代码改动；两队并行互不干扰。
- acpx 适配器 → 同队混用引擎，评审规则（产出者≠审核者）跨引擎生效。

### M4 增强（持续）
每队自定义现场布局、并行讨论（风暴阶段多人同题发散）、跨现场协作、重流程模式（需要强流程的队可在队规中声明步骤级审批）、成本看板、外部 IM 桥。

---

## 6. 风险与对策

| 风险 | 对策 |
|------|------|
| 无人值守空转/死循环 | 三选一协议 + 链深上限 + 自@过滤 + 幂等键 + 两次违约升级给人 |
| 成员不守协议（引擎输出不可控） | 平台兜底：无收尾动作 → 记"卡住" + 定时提醒 + 升级 |
| 记忆污染（错误经验入库） | 信号≥2 才入库 + git 可回滚 + 结构性变更走提案 |
| 队规写坏（死锁的阶段图） | 加载时静态校验：可达性、终态存在、门禁合法 |
| 上下文爆炸 | 简报只带摘要与 ≤10 条队史；产物走文件引用不进 prompt |
| 引擎契约漂移 | 适配器 pin 版本 + 每引擎一套 conformance 用例 |
| 范围失控 | 平台代码禁止出现领域词；新能力先问"服务哪根支柱" |

## 7. 待拍板

1. 第一支样板队 = 应用开发队（可机器验收）？
2. 进化边界默认划分（§3.3 两级）是否符合预期？
3. 产品名：`agentteams` / `myteams`？
4. M1 引擎先做 pi（能力全）后 acpx（覆盖广）——是否对调？

---

## 附录 A：SQLite Schema

```sql
CREATE TABLE teams    (id TEXT PRIMARY KEY, name TEXT NOT NULL, domain_intro TEXT,
                       created_at INTEGER, archived_at INTEGER);
CREATE TABLE members  (id TEXT PRIMARY KEY, team_id TEXT NOT NULL,
                       handle TEXT NOT NULL, role TEXT NOT NULL,
                       engine TEXT NOT NULL, engine_config_json TEXT,
                       is_human INTEGER DEFAULT 0, UNIQUE(team_id, handle));
CREATE TABLE works    (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, title TEXT NOT NULL,
                       phase TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
CREATE TABLE loops    (id TEXT PRIMARY KEY, work_id TEXT NOT NULL,   -- 循环单元：第N集/章
                       title TEXT NOT NULL, phase TEXT NOT NULL,
                       status TEXT NOT NULL DEFAULT 'active');
CREATE TABLE rooms    (id TEXT PRIMARY KEY, work_id TEXT NOT NULL, loop_id TEXT,
                       title TEXT, phase TEXT NOT NULL,
                       status TEXT NOT NULL DEFAULT 'open');
CREATE TABLE entries  (id TEXT PRIMARY KEY, room_id TEXT NOT NULL,   -- append-only 时间线
                       author_member_id TEXT, kind TEXT NOT NULL,    -- chat|artifact|decision|retro|system
                       body_md TEXT NOT NULL, artifact_path TEXT,
                       seq INTEGER NOT NULL, created_at INTEGER);
CREATE TABLE ball_events (id INTEGER PRIMARY KEY AUTOINCREMENT,      -- 持球事件日志
                       room_id TEXT NOT NULL, type TEXT NOT NULL,
                       payload_json TEXT, created_at INTEGER);
CREATE TABLE ball_state (room_id TEXT PRIMARY KEY,                   -- 投影
                       state TEXT NOT NULL,                          -- new|active|stuck|closed|dead
                       holder_member_id TEXT, updated_at INTEGER);
CREATE TABLE phase_events (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       subject_key TEXT NOT NULL, type TEXT NOT NULL, -- advanced|reverted
                       from_phase TEXT, to_phase TEXT, gate_result_json TEXT,
                       actor_member_id TEXT, created_at INTEGER);
CREATE TABLE jobs     (id TEXT PRIMARY KEY, room_id TEXT NOT NULL,
                       target_member_id TEXT NOT NULL, brief_md TEXT NOT NULL,
                       status TEXT NOT NULL,                         -- queued|running|done|failed|stuck
                       idempotency_key TEXT UNIQUE, depth INTEGER DEFAULT 0,
                       attempt INTEGER DEFAULT 0, last_error TEXT,
                       created_at INTEGER, started_at INTEGER, finished_at INTEGER);
CREATE TABLE decisions (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, room_id TEXT,
                       reason TEXT NOT NULL,                         -- gate|boundary|conflict|proposal
                       packet_md TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
                       decision_md TEXT, decided_at INTEGER);
```

## 附录 B：与 docs 参考文档的关系（只取问题的答案，不取实现）

| 本方案的设计问题 | 从哪篇参考中得到启发 | 取了什么、没取什么 |
|-----------------|--------------------|-------------------|
| 责任必须有唯一归属，怎么建模？ | clowder-ai / clowder-复用评估 | 取"持球"思想，状态机自研极简版；不取其 Redis 全栈与 persona 体系 |
| 无人值守怎么防空转？ | clowder-ai | 取"输出必须有收尾动作"思想，协议自定义为三选一 |
| 执行队列怎么做才够用？ | symphony | 取幂等/重试/并发上限经验；修正其"卡住状态不落盘"缺陷 |
| 单守护进程 + 时间线同步 | paseo | 取拓扑与 seq 增量同步思路；不取其多端/终端子系统 |
| 成员与平台的接口怎么收敛？ | mcp-skills 分析 / paseo | 取"MCP 为编排 API"结论 |
| 多引擎怎么不锁死？ | acpx / paseo / omnigent | 取适配器 + 会话续接键思路；acpx 作现成的广覆盖通道 |
| 自治等级与复盘沉淀 | opencrew | 取 L0–L3 与 closeout 思想，记忆三件套为自定义 |
| 阶段做成状态机、门禁做成钩子 | openteams / archon | 取结构思想；不做通用 DAG 平台 |
| 产出者≠审核者 | omnigent (Polly) | 取规则，落为队规一行 |
| 默认执行引擎 | pi 分析 | pi --mode rpc 为首发适配器 |
