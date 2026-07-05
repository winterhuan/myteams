# ADR 0001: Team 作为一等对象

**状态**：已接受  
**日期**：2026-07-06

## 背景

参考项目分属不同层次：有的以 Issue 为中心（Multica、Symphony），有的以 Session 聊天为中心（OpenTeams），有的以岗位频道为中心（OpenCrew）。用户明确要求「多支专业团队长期存在、各干各的领域」。

## 决策

**Team 是 agentTeams 的一等对象**，而非 Workflow、Issue 或 Session。

- Mission 挂在 Team 下，Team 不因 Mission 结束而销毁
- 工作方式（阶段内容、角色、产物）由 Team 自定义
- Briefing 归属 Team，驱动跨 Mission 进化
- Thread / WorkflowRun 是 Team 可选的协作工具，不是产品中心

## 备选方案

1. **Issue 中心**（Multica 式）— 适合 PM，但会把「养队」降格为「派活」
2. **Session 中心**（OpenTeams 式）— 适合单次协作，难以表达「队长期存在」
3. **全局 Workflow 中心**（Archon 式）— 易滑向「一套流程打天下」

## 后果

- 平台 API 以 `teams/:id/...` 为根路径
- Phase 1 先验证 Team + Mission + Ledger + Briefing 闭环
- WorkItem（可选 Issue 层）推迟到 Phase 3，作为入口而非中心