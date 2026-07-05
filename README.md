# agentTeams

**可养成的专业 Agent 团队协作平台** — 多支长期存在的 Team，各按自己的方式工作，靠 Briefing 自主进化。

> 产品中心是「队」，不是 Harness，也不是全局 Workflow 编辑器。

## 三支样板队

| Team | 领域 | 默认协作模式 |
|------|------|--------------|
| `app-dev` | 应用开发 | hybrid（Thread + Workflow） |
| `short-drama` | 短剧创作 | thread |
| `novel` | 小说创作 | thread |

共性节奏：**头脑风暴 → 确定方案 → 实施**。各队自行定义每阶段发生什么、产出什么。

## 快速开始

```bash
bun install
bun run teams list
bun run teams show app-dev
bun run teams mission create app-dev todo-mvp "待办 MVP" "本地优先待办应用"
bun run teams ledger app-dev todo-mvp
```

## 项目结构

```
packages/
  core/      # Team / Mission / Ledger / Briefing
  harness/   # EngineAdapter（Phase 1: stub，后续接 Pi RPC）
  cli/       # teams-cli
teams/
  app-dev/   # 应用开发队模板
  short-drama/
  novel/
docs/
  agentTeams-实施方案.md   # 完整技术方案
  adr/
CONTEXT.md                 # 领域词汇表
```

## 文档

- [实施方案](docs/agentTeams-实施方案.md)
- [方向稿](docs/myteams-草案.md)
- [领域词汇表](CONTEXT.md)
- [ADR 0001: Team 作为一等对象](docs/adr/0001-team-as-primary-object.md)

## Phase 1 目标

用 **应用开发队** 走完 brainstorm → scheme → delivery，完成 Closeout 写回 Briefing，第二次同类 Mission 能感知团队记忆。

## 设计原则（相对参考项目）

| 借鉴 | 不搬 |
|------|------|
| OpenTeams 双模式 | 单 Session 中心 |
| OpenCrew L0–L3 + Closeout | Slack 外壳 |
| Multica 持久 Member | 完整 PM 产品 |
| Clowder @mention | 球权全状态机 |
| Archon Workflow 步骤 | Workflow 当产品中心 |