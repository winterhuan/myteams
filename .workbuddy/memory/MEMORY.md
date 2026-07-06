# myteams 项目长期记忆

## 项目定位
myteams = 养多支专业 Agent 团队的平台（短剧/小说/应用开发各干各的领域）。核心诉求：用户能看懂能理解、团队长期存在可自主进化、看板掌握进展。

## 当前状态（2026-07-06）
- v2.2 设计方案已完成（v2.1 + A2A/MCP/Skills 三层设计深化）
- 主文档：`docs/myteams-方案-v2.md`（版本头已改 v2.2）
- 探索报告：`docs/exploration/01-05`（05 含 v2.1 + v2.2 两轮架构师 review）
- v1.2 方案（基线）：`docs/myteams-方案.md`
- 参考项目分析：`docs/*-分析.md`（16 份）+ `docs/横向对比矩阵.md` + `docs/mcp-skills-分析.md`
- 架构师 review：v2.1 YES WITH CONDITIONS（4 P0 已修复）+ v2.2 YES WITH CONDITIONS（3 P0 已修复）

## 架构骨架（v1.2 确立，v2.0 保留）
- Team 一等对象（非 Issue/Session/Workflow 中心）
- 两层结构：平台层 / 团队层
- 四层技术分工：L5 协调层 / L4 工作台 / L3 平台核心 / L2 引擎适配 / L1 执行底座
- Harness 中立（EngineAdapter + 能力矩阵声明）
- 双模式协作（Thread 轻量 / WorkflowRun 重，对用户隐藏，模板预置）
- 技术栈：TypeScript + Bun monorepo

## v2.0 关键设计（相对 v1.2 的改变）
- 5 核心概念（团队/作品/看板/团队笔记本/待你拍板）+ 全中文化命名
- 三套官方模板（短剧/小说/开发）+ 微调替代从零自定义
- 进化：T1/T2/T3 三档触发 + 信号阈值晋升（signal≥2）+ 条件注入三层模型 + Curator 衰减 + meta-charter 双层校验
- 看板：跨团队活态摘要卡（Phase 1）+ 卡片补 eta/last_touched/next_action + 平台统一健康度算法
- 意图路由（小修/新作品/探索/继续四档）+ Decision Packet + 工作分解可见
- 团队角色卡（Team as a Character，最大差异化）+ 队成长日志
- A2A + MCP 双栈为通信标准目标（Phase 1 走平台内部调度，Phase 2 落地）

## v2.1 增量修订（队主反馈：阶段不固定）
- 阶段模型从"平台固定三阶段（brainstorm/scheme/delivery）"改为"队完全自定义有序阶段序列"
- 平台只提供"阶段"抽象容器（有序工作段落 + 进度条 + 门禁接口），不规定阶段名/数/语义
- 三套模板各自预置领域阶段序列（建议起点，可改）：短剧5阶段/小说5阶段/开发5阶段
- 意图路由重构：小修跳到队规配的 quick_fix_target_phase，探索走 explore_phases，不再基于三阶段假设
- BriefingEntry.phase / WorkCard.phase 从 PhaseId 枚举改为 string（队自定义阶段 id 引用）
- 看板进度条渲染 N 个圆点（该队实际阶段数），不假设固定 3 个

## v2.2 增量（队主反馈：A2A/MCP/Skills 需深化）
- 新增 §9.9 A2A/MCP/Skills 三层设计（~400 行）
- Skills（方法层）：教"怎么做、何时做"playbook，三层（平台级5个/模板级7个/队级），渐进披露加载；与 Briefing（记忆层）边界：Briefing 动态累积，Skills 相对稳定，patterns 可固化为 Skill
- MCP（工具层）：平台级 9 个工具（briefing_search/briefing_retain/card_update/ledger_append/escalate/member_message/create_submember/phase_advance/skill_read），Callback Bridge 解决 Pi 无原生 MCP（HTTP 端点模拟 tool_call）
- A2A（通信层）：Phase 1 平台内部调度（语义对标 A2A 状态机映射 WorkCard/Engagement/Escalation）→ Phase 2 平台作 A2A 代理 → Phase 3 跨队协作
- 三层成对设计：Skill 教何时调什么 MCP，MCP 执行，A2A 通信
- 架构师 review：YES WITH CONDITIONS，3 个 P0 已修复（Callback Bridge 拆分到 W4/W5、5 个工具接口补全、A2A failed→archived 映射修正）

## 实施路线
- Phase 1（8 周）：同时验证应用开发队 + 短剧队 + 跨团队总览 + 进化最小闭环（W6 拆分）+ 意图路由 + 角色卡 v1 + 成本可见 v1
- Phase 2：小说队 + T3 战略触发 + Curator 衰减 + Decision Packet 完整 + 第二引擎
- Phase 3：模板市场 + Briefing 语义检索 + Desktop Hub + 跨队协作

## 团队协作约定
- 软件开发团队 SOP：主理人(齐活林) → 产品经理(许清楚) → 架构师(高见远) → 工程师(寇豆码) → QA(严过关)
- 探索阶段可用 general-purpose agent 并行（有 WebSearch/WebFetch/Write）
- 主理人必须自己消化探索结果形成判断，再给成员精确指令（Never delegate understanding）
