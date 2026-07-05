# MCP 与 Skills 在各参考项目中的使用分析

> 对比对象：`references/` 下已拆解项目  
> 更新日期：2026-07-05  
> 关联文档：[横向对比矩阵](./横向对比矩阵.md)

---

## 1. 两个概念在各层的分工

| | **Skills** | **MCP** |
|---|-----------|---------|
| **形态** | `SKILL.md` playbook（[Agent Skills 标准](https://agentskills.io/specification)） | MCP Server 暴露的 tools / resources |
| **加载方式** | 渐进式披露：先 name + description 进 context，按需 `read` 全文 | 会话建立时连接 server，运行时 `tool_call` |
| **典型内容** | 流程、约束、何时 handoff、如何写 PR | `create_agent`、`post-message`、Linear API、GitHub |
| **谁维护** | 团队写 markdown，跟 repo 版本走 | 平台 / 守护进程实现 HTTP / stdio server |
| **跨 Agent** | 同一份 SKILL 可被 Pi / Paseo / Codex 复用（路径互通） | 每个 CLI 的 MCP 配置方式不同 |

```text
用户意图 / 工单
      ↓
┌─────────────┐     「按这个流程做」      ┌─────────────┐
│   Skills    │ ──────────────────────→ │    Agent    │
│  (知识层)    │                         │   (推理层)   │
└─────────────┘                         └──────┬──────┘
                                               │ tool_call
┌─────────────┐     「调这些 API」               ↓
│     MCP     │ ←────────────────────────  执行 / 副作用
│  (工具层)    │
└─────────────┘
```

**核心结论**：Skills 教 Agent「怎么做、何时做」；MCP 给 Agent「能调用什么工具」。两者常成对出现，但职责不同。

---

## 2. 各项目中的用法

### 2.1 Pi（+ pi-orchestrator）

#### Skills：一等公民

- 实现 Agent Skills 标准
- 发现路径：
  - 全局：`~/.pi/agent/skills/`、`~/.agents/skills/`
  - 项目（需 trust）：`.pi/skills/`、`.agents/skills/`（向上至 git root）
  - Packages / `settings.json` `skills` 数组 / CLI `--skill`
- 启动时以 XML 格式把 skill 列表注入 system prompt（仅 name + description）
- 完整内容按需 `read`，或强制 `/skill:name`
- 可指向 Claude / Codex 的 skills 目录：

```json
{
  "skills": ["~/.claude/skills", "~/.codex/skills"]
}
```

- Pi Packages 可打包 skills：`pi install npm:@foo/pi-tools`

参考：`references/pi/packages/coding-agent/docs/skills.md`

#### MCP：刻意不做（内核无）

README 明确：

> **No MCP.** Build CLI tools with READMEs (see Skills), or build an extension that adds MCP support.

- 哲学：Skills + 内置 bash 工具往往够用；要 MCP 就装 extension（如 `pi-mcp-adapter`）
- 扩展能力列表里包含「MCP server integration」，但属于可选扩展，非核心

#### pi-orchestrator

| 能力 | 行为 |
|------|------|
| Skills | 透传子进程 Pi 的配置，无额外 skills 层 |
| MCP | 同左；子进程若装 `pi-mcp-adapter` extension 才有 MCP |

**模式**：Skills = 默认扩展机制；MCP = 可选外挂。

---

### 2.2 acpx

#### Skills：教「怎么用 acpx」

| 位置 | 用途 |
|------|------|
| `skills/acpx/SKILL.md` | 教其他 Agent 使用 `acpx` CLI（sessions、flow、permissions…） |
| `.agents/skills/autoreview` | 仓库开发流程（Codex-first review） |
| `skillflag` | 发布流程相关 |

AGENTS.md 硬性要求：Harness / built-in agent 行为变更必须同步 `skills/acpx/SKILL.md`。

acpx **不是**业务 playbook 引擎；Skills 面向**调用方 Agent**（教人怎么调 acpx）。

#### MCP：会话级注入，经 ACP 传给上游 Agent

- `--mcp-config <json>`：session-scoped，不写项目配置文件
- 解析实现：`src/mcp-servers.ts`
- 作为 `mcpServers` 传入 ACP `session/new`
- Queue owner lease 记录 `mcpConfigPath` + fingerprint，防止并发配置漂移
- 活 session 上改 MCP config 会被拒绝，需新 session

```bash
acpx --mcp-config ./job-mcp.json codex 'fix the flaky test'
```

**模式**：acpx 是 ACP 客户端；MCP 配置给**被调用的 Agent** 挂工具；Skills 给**调用方**写 acpx 用法。

---

### 2.3 Paseo

#### Skills + MCP 形成闭环

| Skill | 路径 | 作用 |
|-------|------|------|
| `paseo` | `skills/paseo/SKILL.md` | `create_agent`、`create_worktree`、`send_agent_prompt` 等 |
| `paseo-handoff` | `skills/paseo-handoff/SKILL.md` | 跨 Provider handoff 的完整 briefing 模板 |
| `paseo-loop` | `skills/paseo-loop/SKILL.md` | Ralph loop 编排 |
| `paseo-committee` | `skills/paseo-committee/SKILL.md` | 委员会式多 Agent |
| `paseo-advisor` | `skills/paseo-advisor/SKILL.md` | 顾问模式 |

安装：`npx skills add getpaseo/paseo`  
Desktop 负责 skills sync（按需安装/更新，不再每次启动静默覆盖）。

`paseo-handoff` 明确要求先读 `paseo` skill，再查 `~/.paseo/orchestration-preferences.json` 选 Provider——**Skill 之间有依赖链**。

#### MCP：Daemon 对外暴露编排 API

- `packages/server/src/server/agent/mcp-server.ts`：`McpServer` 包装 `paseo-tools` 目录
- 工具：`create_agent`、`send_agent_prompt`、`create_worktree`、`schedule` 等
- 挂载：Daemon HTTP（Streamable MCP），`bootstrap.ts` 注册

**注入 Agent 的三条路径**：

| Provider 类型 | 注入方式 |
|---------------|----------|
| 支持 native Paseo tools | 直接读 `launchContext.paseoTools` |
| ACP Provider | `mcpServers` fallback（`/mcp/agents`） |
| Pi | 需 `pi-mcp-adapter` 扩展 + per-agent `--mcp-config` |

部分 ACP adapter 不支持非空 `mcpServers` 时，可设 `supportsMcpServers: false` 禁用注入。

```text
Agent（任意 Provider）
    │ 读 paseo-handoff SKILL → 知道要 handoff
    │ MCP tool_call: create_agent / send_agent_prompt
    ↓
Paseo Daemon MCP Server（agent-mcp）
    ↓
spawn 子 Agent / worktree / schedule
```

**模式**：**MCP = 编排 API；Skills = 编排说明书**。两者成对设计。

---

### 2.4 Omnigent

#### Skills：双层

| 层级 | 位置 | 用途 |
|------|------|------|
| 开发 / 运维 | `.claude/skills/` | `harness-integration-guide`、`pi-native-e2e-dev`、`antigravity-native-e2e-dev` 等 |
| 运行时 | MCP 工具 `load_skill` | Harness 会话内动态加载 skill 内容 |

Harness 集成指南要求子 Agent 必须桥接的内置 MCP 工具包括：`sys_session_*`、`sys_agent_*`、`load_skill`、`web_fetch` 等。

#### MCP：Meta 层中枢

| 类型 | 内容 |
|------|------|
| Agent YAML `mcp_servers` | 给子 Agent 挂业务 MCP（stdio / http） |
| `serve-mcp` relay | `claude_native_bridge serve-mcp` 暴露 Omnigent 内置工具 |
| Native 集成 | Claude / Codex / OpenCode / Pi 各自把 relay 写入 harness MCP 配置 |

OpenCode 路径：`build_opencode_mcp_block(spec.mcp_servers)` 合成 `opencode.json` 的 `mcp` 块。

Polly 等编排 Agent 通过 MCP **spawn 子 Agent、读历史、load_skill**，而非在 prompt 里写死全部流程。

**模式**：MCP 是 Omnigent **控制面的 wire API**；Skills 既可静态维护，也可运行时经 `load_skill` 动态加载。

---

### 2.5 Clowder AI

#### Skills：平台级流程资产

- **48 个** `cat-cafe-skills/`（如 `feat-lifecycle`、`tdd`、`quality-gate`、`request-review`、`merge-gate`、`cross-cat-handoff`）
- `pnpm sync:skills` 链到 `.claude/skills`、`.codex/skills`、`.gemini/skills`（项目级；`--user` 可选 HOME 级）
- SOP YAML `suggested_skill` 字段 + Prompt `d11-skill-trigger.md`：在正确阶段提示加载 skill
- Hub UI「Skills」标签页展示清单
- `SystemPromptBuilder`：`skill:` prompt tag 触发 D11 片段注入

开发 Skill 链示例：

```text
feat-lifecycle → writing-plans → worktree → tdd
  → quality-gate → fresh-context-review → request-review
  → receive-review → merge-gate → feat-lifecycle(completion)
```

#### MCP：三分法

| 路径 | 适用 Agent | 机制 |
|------|-----------|------|
| **原生 MCP** | Claude | `.mcp.json` → `packages/mcp-server` |
| **项目级 MCP 配置** | Codex / Gemini | `.codex/config.toml`、`.gemini/settings.json` |
| **MCP Callback Bridge** | 无原生 MCP 的 CLI | HTTP 回调 + `$CAT_CAFE_INVOCATION_ID` / `$CAT_CAFE_CALLBACK_TOKEN` |

Callback 工具（节选）：`post-message`、`cross-post-message`、`hold_ball`、`create-rich-block`、`search-evidence`、`retain-memory`、`register-pr-tracking`…

`McpPromptInjector` 逻辑：
- Claude 有原生 MCP → 不注入 callback 指令
- Antigravity（持久进程）→ 跳过
- 其他 → 注入 `c1-mcp-callback.md` 片段

**Skills 是 MCP 的文档真相源**：完整 spec 在 `cat-cafe-skills/refs/`（`mcp-callbacks.md`、`rich-blocks.md`）；Prompt 只给最小索引。

**模式**：Skills 绑定 SOP 阶段；MCP（或 Callback）是猫猫与平台的正规通信通道。

---

### 2.6 Symphony

#### Skills：Codex 仓库技能，WORKFLOW 点名

| Skill | 路径 | 场景 |
|-------|------|------|
| `commit` | `.codex/skills/commit/` | 提交规范 |
| `push` / `pull` | `.codex/skills/` | 同步 |
| `land` | `.codex/skills/land/` | `Merging` 状态时合 PR |
| `linear` | `.codex/skills/linear/` | Linear GraphQL 操作 |

`WORKFLOW.md` 按 Linear 状态引用 skill，例如：

- `Merging` → 打开并遵循 `.codex/skills/land/SKILL.md`
- 实现前 → 跑 `pull` skill 并记录 evidence

团队复制 `WORKFLOW.md` + skills 到自己的 repo 即可定制。

#### MCP：Linear 接入 + 阻塞检测

**前置条件**（WORKFLOW.md）：

> Linear MCP **或** Symphony 注入的 `linear_graphql` app-server 工具必须可用。

Symphony 在 Codex app-server 会话中注入 `linear_graphql` 动态工具（`Codex.DynamicTool`），供 `linear` skill 使用。

**阻塞语义**：
- Codex 发 `mcpServer/elicitation/request` → Orchestrator 标 **blocked**
- 工单保持 claimed，Dashboard / JSON API 可见
- blocked 仅内存；重启后清空

**模式**：Skills = 仓库内 Git / PR 流程；MCP = 外部系统（Linear）接口；调度器注入少量动态 tool，不维护 skill 运行时。

---

## 3. 横向对比矩阵

| 项目 | Skills 角色 | MCP 角色 | Skills ↔ MCP 关系 |
|------|------------|----------|-------------------|
| **Pi** | 核心扩展机制 | 非内置（extension） | Skills **替代** MCP 为默认方案 |
| **pi-orchestrator** | 继承 Pi | 继承 Pi | 无独立层 |
| **acpx** | 教人用 acpx | `--mcp-config` → ACP | Skills 面向调用方；MCP 面向被调 Agent |
| **Paseo** | 教人用 Paseo 工具 | Daemon 暴露编排 MCP | **Skill 文档 + MCP 工具成对设计** |
| **Omnigent** | `load_skill` + 开发 skills | relay + YAML `mcp_servers` | MCP 是控制面；skill 可经 MCP 动态加载 |
| **Clowder AI** | 48 技能 + SOP 映射 | Server + Callback 桥 | Callback 完整 spec 在 Skills refs 里 |
| **Symphony** | Codex skills + WORKFLOW 引用 | Linear + `linear_graphql` | WORKFLOW 指向 skill；MCP 接 tracker |

---

## 4. 五种可复用架构模式

### 模式 A：Skills 优先（Pi 哲学）

```text
Agent → read SKILL.md → bash / edit 等内置工具
```

| 优点 | 缺点 |
|------|------|
| 简单、无 MCP 进程、跟 repo 走 | 无强类型 tool schema、跨进程编排弱 |

### 模式 B：MCP 即编排 API（Paseo / Omnigent）

```text
上层 Agent --MCP--> 平台 Server --spawn--> 下层 Agent
```

| 优点 | 缺点 |
|------|------|
| 结构化、可审计、机器可调用 | 要维护 server；每 Provider 注入方式不同 |

### 模式 C：Skill 教 MCP（Paseo / acpx）

```text
SKILL.md 写清 tool 名、参数、顺序
Agent 按 skill 调用 MCP tools
```

**myteams 最实用**：playbook 与 API 分离又对齐。

### 模式 D：MCP Callback 模拟（Clowder）

```text
无 MCP 的 CLI → HTTP 回调代替 tool_call
Prompt 片段 c1-mcp-callback + env 凭证
```

解决 Codex / Gemini 等没有长连 MCP 的问题。

### 模式 E：WORKFLOW 点名 Skills（Symphony）

```text
调度器 prompt 模板 + 状态机 → 「此时打开 land skill」
MCP 只接外部系统（Linear）
```

适合工单驱动、单 Agent 长跑。

---

## 5. 对 myteams 的建议架构

```text
┌─────────────────────────────────────────────────┐
│ L4 策略：Symphony 式 WORKFLOW / Clowder 式 SOP   │
│         → suggested_skill 指向具体 SKILL         │
├─────────────────────────────────────────────────┤
│ L3 Skills：Agent Skills 标准（跟 repo 版本化）    │
│   myteams-handoff / review / worktree / …       │
│   教 Agent：何时 handoff、如何写 acceptance       │
├─────────────────────────────────────────────────┤
│ L2 MCP：编排面（借鉴 Paseo）                      │
│   create_agent / send_prompt / hold_ball …       │
│   Pi 侧：pi-mcp-adapter 或自研 extension         │
├─────────────────────────────────────────────────┤
│ L1 执行：Pi / acpx pi / 其他 ACP agent           │
└─────────────────────────────────────────────────┘
```

### 5.1 决策表

| 决策 | 建议 |
|------|------|
| Pi 要不要 MCP？ | 编排层需程序化 spawn / 发 prompt 时，用 extension（`pi-mcp-adapter` 或自建），不要指望纯 Skills |
| Skills 放哪？ | `.agents/skills/` + 类似 `pnpm sync:skills` 同步到各 CLI skills 目录 |
| 无 MCP 的 CLI？ | 学 Clowder Callback，或统一走 **acpx**（ACP 统一挂 MCP） |
| 工单自动化？ | Symphony：`WORKFLOW.md` 引用 skills；MCP 只接 issue tracker |
| 文档真相源 | 学 Clowder：**Skills `refs/` 写 MCP tool 完整 spec**，Prompt 只留索引 |

### 5.2 两条集成路径

**路径 1（Pi 原生）**

```text
myteams Skills → Agent read → pi-mcp-adapter → myteams MCP tools
```

**路径 2（ACP 统一）**

```text
myteams Skills → 编排 Agent → acpx pi --mcp-config ./orchestration.json
换 Codex：只改 acpx <agent>，Skills 中 Provider 章节可变
```

### 5.3 推荐 Skill 清单（myteams 起步）

| Skill | 借鉴 | 内容 |
|-------|------|------|
| `myteams` | `paseo` | MCP 工具目录：create_agent、send_prompt、list_agents |
| `myteams-handoff` | `paseo-handoff` | 跨 Provider / 跨实例 briefing 模板 |
| `myteams-review` | Clowder `request-review` | 跨 family review 纪律 |
| `myteams-worktree` | `paseo` + Clowder `worktree` | 隔离 workspace 流程 |
| `refs/mcp-tools.md` | Clowder `cat-cafe-skills/refs/` | MCP 工具完整 spec（Prompt 只引用） |

---

## 6. 关键文件索引

| 项目 | Skills | MCP |
|------|--------|-----|
| Pi | `packages/coding-agent/docs/skills.md` | `packages/coding-agent/README.md`（No MCP 哲学） |
| acpx | `skills/acpx/SKILL.md` | `src/mcp-servers.ts`、`docs/agents.md` |
| Paseo | `skills/paseo*/SKILL.md` | `packages/server/src/server/agent/mcp-server.ts` |
| Omnigent | `.claude/skills/` | `omnigent/claude_native_bridge.py`（serve-mcp）、Agent YAML `mcp_servers` |
| Clowder | `cat-cafe-skills/*/SKILL.md` | `packages/mcp-server/`、`assets/prompt-templates/c1-mcp-callback.md` |
| Symphony | `.codex/skills/` | `elixir/lib/symphony_elixir/codex/dynamic_tool.ex`（linear_graphql） |

---

## 7. 一句话总结

- **Skills** 是各项目的**流程与知识版本化载体**（Pi / Clowder / Paseo 最重；Symphony 经 WORKFLOW 引用；acpx 偏工具文档）。
- **MCP** 在需要**跨进程、可审计、平台级工具**时出现（Paseo Daemon、Omnigent relay、Clowder Server / Callback）；Pi 故意留空，把选择权交给扩展。
- **最成熟组合**是 Paseo / Clowder：**Skill 告诉 Agent 怎么用 MCP；MCP 真正执行编排**。myteams 做团队层时，宜复制「Skill 说明书 + MCP API」双轨，而非只堆 prompt 或只堆 MCP。

---

*关联：[pi-分析.md](./pi-分析.md) · [paseo-分析.md](./paseo-分析.md) · [clowder-ai-分析.md](./clowder-ai-分析.md) · [omnigent-分析.md](./omnigent-分析.md) · [symphony-分析.md](./symphony-分析.md) · [acpx-分析.md](./acpx-分析.md)*