# OpenClaw 与 CKS Lite 集成分析报告

生成日期：2026-02-05
分析师：Claude (CKS Agent)

---

## 执行摘要

OpenClaw 是一个功能强大的开源 AI 助手框架，具有**文件优先的记忆系统**、**多智能体路由**、**50+ 技能**和**多渠道支持**。通过与 CKS Lite 集成，我们可以大幅提升记忆能力、工具执行和跨会话管理功能。

**核心价值**：
- ✅ **向量记忆系统**：OpenClaw 的混合搜索（BM25 + 向量）远超当前 FAISS 实现
- ✅ **多智能体架构**：支持任务分发、专用代理、跨会话通信
- ✅ **50+ 技能库**：浏览器自动化、Canvas、文件操作、消息路由等
- ✅ **WebSocket Gateway**：实时事件流、统一控制平面
- ✅ **插件系统**：可扩展的钩子机制

---

## 1. OpenClaw 项目概述

### 1.1 基本信息

| 属性 | 值 |
|------|-----|
| **项目名称** | OpenClaw |
| **版本** | 2026.2.4 |
| **许可证** | MIT |
| **技术栈** | TypeScript (ESM), Node.js ≥22 |
| **代码规模** | ~2,580 个 TypeScript 文件 |
| **包管理** | pnpm/npm/bun |
| **核心依赖** | pi-agent-core, Baileys, grammY, Playwright, SQLite |

### 1.2 核心模块

```
src/
├── gateway/          # WebSocket 控制平面
├── agents/           # 智能体管理
├── sessions/         # 会话管理和路由
├── memory/           # 记忆系统（核心）
├── channels/         # 多渠道支持
├── routing/          # 多智能体路由
├── plugins/          # 插件系统
├── canvas-host/      # A2UI 画布主机
├── browser/          # 浏览器自动化
├── media/            # 媒体管道
├── cron/             # 定时任务
├── commands/         # CLI 命令
├── config/           # 配置管理
└── providers/        # 模型提供商集成
```

---

## 2. 记忆系统深度分析

### 2.1 OpenClaw 记忆架构

#### 设计哲学：**文件优先**

OpenClaw 采用 Markdown 文件作为记忆的主要存储格式，易于人工审查和编辑。

```
记忆层次结构：
~/.openclaw/workspace/
├── MEMORY.md                  # 长期记忆（核心知识库）
│   ├── 仅在主私有会话中加载
│   ├── 保存决定、偏好、持久事实
│   └── 示例：用户喜欢简洁的代码风格、项目架构决策
│
└── memory/                    # 日志记忆（时间序列）
    ├── 2026-02-05.md          # 今日日志（追加模式）
    ├── 2026-02-04.md          # 昨日日志（读取）
    └── 2026-02-03.md          # 历史日志（不自动加载）
```

**关键特性**：
- **自动压缩前刷新**：当会话接近令牌限制时，触发无声代理转换，提醒模型写入持久记忆
- **文件监控**：chokidar 实时监控记忆文件变更，自动重新索引
- **人工友好**：所有记忆都是可读可编辑的 Markdown 文件

#### 2.2 混合搜索实现（Hybrid Search）

OpenClaw 结合 **BM25 关键字检索** 和 **向量语义搜索**，提供精准的记忆检索。

```
搜索流程：
1. 向量检索
   └─ 使用 OpenAI/Gemini/本地嵌入
   └─ 得到 maxResults × candidateMultiplier 的候选
   └─ 计算余弦相似度 → vectorScore (0..1)

2. BM25 检索
   └─ 分词、计算词频和文档频率
   └─ 得到 maxResults × candidateMultiplier 的候选
   └─ 归一化分数 → textScore (0..1)

3. 加权融合
   └─ finalScore = vectorWeight × vectorScore + textWeight × textScore
   └─ 默认权重：vectorWeight=0.7, textWeight=0.3
   └─ 按 finalScore 排序，返回 top maxResults
```

**优势对比**：

| 特性 | OpenClaw 混合搜索 | CKS Lite FAISS |
|------|------------------|----------------|
| **语义理解** | ✅ 向量嵌入（OpenAI/Gemini/本地） | ✅ FAISS 向量索引 |
| **关键字精准** | ✅ BM25 算法 | ❌ 无关键字检索 |
| **混合策略** | ✅ 可配置权重融合 | ❌ 纯向量检索 |
| **缓存机制** | ✅ 嵌入块缓存 | ❓ 未知 |
| **离线支持** | ✅ node-llama-cpp + GGUF | ❌ 依赖在线 API |
| **索引更新** | ✅ 自动文件监控 | ❓ 手动触发 |

#### 2.3 嵌入提供商

| 提供商 | 模型 | 说明 | 优势 |
|------|------|------|------|
| **OpenAI** | text-embedding-3-small | 默认远程 | 高质量、支持批处理 API |
| **Gemini** | gemini-embedding-001 | Google 原生 | 长上下文支持 |
| **本地** | GGUF 模型 | node-llama-cpp | 完全离线、隐私保护 |

**本地嵌入配置示例**：

```json
{
  "memorySearch": {
    "provider": "local",
    "model": "gguf://~/.openclaw/models/nomic-embed-text-v1.5.Q8_0.gguf",
    "query": {
      "hybrid": {
        "enabled": true,
        "vectorWeight": 0.7,
        "textWeight": 0.3
      }
    }
  }
}
```

#### 2.4 自动记忆刷新（Pre-compaction Memory Flush）

当会话接近压缩阈值时，OpenClaw 自动触发记忆刷新机制：

```typescript
配置参数：
{
  compaction: {
    reserveTokensFloor: 20000,        // 保留令牌数
    memoryFlush: {
      enabled: true,                   // 启用自动刷新
      softThresholdTokens: 4000,       // 触发阈值
      systemPrompt: "Session nearing compaction. Store durable memories now."
    }
  }
}

工作流程：
1. 监测当前会话令牌数
2. 当 tokens > (reserveTokensFloor - softThresholdTokens) 时触发
3. 注入系统提示，提醒模型保存重要记忆
4. 模型决定写入 MEMORY.md 或 memory/YYYY-MM-DD.md
5. 自动触发嵌入重新索引
```

**与 CKS Lite 对比**：

| 特性 | OpenClaw | CKS Lite |
|------|---------|---------|
| **自动保存** | ✅ 压缩前自动提醒 | ❌ 手动保存 |
| **记忆分层** | ✅ 长期 + 日志 | ❓ 单一记忆池 |
| **文件格式** | ✅ Markdown（人工可读） | ❌ SQLite（二进制） |
| **触发机制** | ✅ 令牌阈值自动触发 | ❌ 用户主动调用 |

---

## 3. 核心功能特性

### 3.1 多智能体路由系统

OpenClaw 支持多个独立的智能体（agents），每个智能体可以有自己的工作区、工具配置和记忆。

```
智能体架构：
Agent A (main)               Agent B (coding)            Agent C (support)
├── workspace A              ├── workspace B             ├── workspace C
├── MEMORY.md                ├── MEMORY.md               ├── MEMORY.md
├── skills/                  ├── skills/                 ├── skills/
├── tools: full              ├── tools: coding profile   ├── tools: minimal
└── sessions:                └── sessions:               └── sessions:
    ├── agent:main:main          ├── agent:coding:main       ├── agent:support:main
    ├── agent:main:wa:dm:+123    └── ...                     └── ...
    └── ...
```

**路由解析流程**：

```typescript
输入：{ channel, accountId, peer, guildId, teamId }
  ↓
查询绑定规则（优先级递减）：
  1. binding.peer              # 用户级绑定
  2. binding.peer.parent       # 父级绑定
  3. binding.guild             # 群组绑定
  4. binding.account           # 账户绑定
  5. binding.channel           # 频道默认
  ↓
生成会话键：
  - 格式：agent:agentId:channel:scope:peerId
  - 示例：agent:main:whatsapp:dm:+1234567890
  ↓
返回：{ agentId, sessionKey, mainSessionKey, matchedBy }
```

**会话隔离策略**：

| 策略 | 会话键格式 | 说明 |
|------|----------|------|
| **main** | `agent:main:main` | 所有 DM 折叠到共享 main 会话 |
| **per-peer** | `agent:main:wa:dm:+123` | 每个用户独立会话 |
| **per-channel-peer** | `agent:main:wa:dm:+123` | 每个频道 + 用户独立 |
| **per-account-channel-peer** | `agent:main:acc1:wa:dm:+123` | 账户 + 频道 + 用户独立 |

**跨智能体通信工具**：

```typescript
// 列出所有智能体
const agents = await tool("agents_list");
// 返回：[{ id: "main", status: "idle" }, { id: "coding", status: "busy" }]

// 发送消息到另一个智能体的会话
const result = await tool("sessions_send", {
  sessionKey: "agent:coding:slack:dm:user123",
  message: "请审查这段代码...",
  timeoutSeconds: 30
});
// 返回：{ response: "代码看起来不错，但建议...", status: "completed" }

// 生成子任务到专用智能体
const result = await tool("sessions_spawn", {
  task: "分析这些数据并生成报告",
  agentId: "analyst",
  label: "数据分析"
});
// 返回：{ sessionKey: "...", status: "accepted" }
```

### 3.2 工具系统（First-Class Tools）

OpenClaw 提供 **50+ 内置工具**，分为多个工具组：

| 工具组 | 包含工具 | 说明 |
|------|--------|------|
| **group:runtime** | exec, bash, process | 命令执行和进程管理 |
| **group:fs** | read, write, edit, apply_patch | 文件系统操作 |
| **group:sessions** | sessions_list, sessions_history, sessions_send | 跨会话通信 |
| **group:memory** | memory_search, memory_get | 记忆检索 |
| **group:web** | web_search, web_fetch | Web 访问 |
| **group:ui** | browser, canvas | UI 自动化和渲染 |
| **group:automation** | cron, gateway | 自动化任务 |
| **group:messaging** | message | 跨频道消息发送 |
| **group:nodes** | nodes | 设备节点操作（iOS/Android） |

**工具配置示例**：

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "profile": "full",       // 基础允许列表：full|coding|minimal|none
          "allow": [               // 额外允许的工具
            "group:fs",
            "browser",
            "memory_search"
          ],
          "deny": [                // 拒绝的工具
            "exec"                 // 禁止命令执行
          ],
          "byProvider": {          // 提供商特定限制
            "google-antigravity": {
              "profile": "minimal"
            }
          }
        }
      }
    ]
  }
}
```

**工具链式执行示例**：

```typescript
// 浏览器自动化工作流
await tool("browser", { action: "start" });
await tool("browser", {
  action: "open",
  url: "https://github.com/trending"
});
await tool("browser", {
  action: "wait",
  selector: ".Box-row"
});
const screenshot = await tool("browser", {
  action: "screenshot",
  fullPage: true
});
await tool("browser", { action: "close" });

// Canvas 渲染工作流
const html = `<div class="chart">...</div>`;
const result = await tool("canvas", {
  action: "render",
  content: html,
  width: 800,
  height: 600
});
// 返回：{ imageUrl: "data:image/png;base64,..." }
```

### 3.3 技能系统（Skills）

OpenClaw 支持 **50+ 内置技能**，用户可以添加自定义技能。

**技能位置优先级**：
1. `<workspace>/skills` (最高优先级)
2. `~/.openclaw/skills` (中等优先级)
3. 捆绑技能 (bundled)
4. 插件技能 (plugin skills)

**技能格式**（AgentSkills 兼容）：

```markdown
---
name: skill-name
description: Skill description
metadata:
  {
    "openclaw": {
      "requires": {
        "bins": ["ffmpeg"],           # 需要的二进制工具
        "env": ["OPENAI_API_KEY"],    # 需要的环境变量
        "config": ["model.provider"]  # 需要的配置项
      },
      "primaryEnv": "OPENAI_API_KEY"
    }
  }
---

# Skill Instructions

You are a video processing assistant...

## Available Tools
- ffmpeg: video conversion
- ffprobe: metadata extraction
```

**内置技能示例**：

| 类别 | 技能名称 | 说明 |
|------|---------|------|
| **笔记** | apple-notes, bear-notes, notion | 笔记应用集成 |
| **任务管理** | apple-reminders, todoist | 任务和提醒 |
| **开发工具** | github, git, npm | 代码和包管理 |
| **浏览器** | browser, web-scraping | 自动化和爬取 |
| **媒体** | ffmpeg, image-processing | 音视频处理 |
| **通信** | discord, slack, email | 跨频道消息 |
| **数据** | spreadsheet, database | 数据操作 |
| **AI** | llm-task, vision | LLM 子任务和视觉 |

### 3.4 多渠道支持

**原生集成频道**（在 `src/` 中）：
- WhatsApp (Baileys Web)
- Telegram (grammY)
- Slack (Bolt)
- Discord (discord.js)
- Signal (signal-cli)
- iMessage (BlueBubbles/legacy)
- WebChat (Web UI)

**扩展频道插件**（在 `extensions/` 中）：
- Matrix, Microsoft Teams, Google Chat
- Line, Mattermost, Feishu (飞书)
- Zalo, Nextcloud Talk, Nostr, Twitch, Tlon

**频道配置示例**：

```json
{
  "channels": {
    "whatsapp": {
      "allowFrom": ["+1234567890"],   // 白名单
      "groups": {
        "*": { "requireMention": true } // 群组需要 @mention
      }
    },
    "telegram": {
      "botToken": "123:ABC...",
      "allowFrom": ["@username"]
    },
    "discord": {
      "token": "...",
      "guilds": {
        "123456789": {                // guild ID
          "channels": {
            "*": { "requireMention": false }
          }
        }
      }
    }
  }
}
```

### 3.5 WebSocket Gateway

OpenClaw 提供 **WebSocket 控制平面**，用于客户端实时通信。

**连接流程**：

```
Client                        Gateway
  |                              |
  |-------- req:connect -------->|
  |<--------- res (ok) ----------|  payload: { hello-ok, snapshot }
  |                              |
  |<-------- event:presence -----|  (在线状态变更)
  |<-------- event:tick ---------|  (心跳)
  |                              |
  |-------- req:agent ---------->|  (发起 LLM 请求)
  |<--------- res:agent ---------|  ack: { runId, status:"accepted" }
  |<-------- event:agent --------|  (流式响应)
  |<--------- res:agent ---------|  (最终结果)
```

**帧格式**：

```typescript
// 请求帧
{
  "type": "req",
  "id": "unique-id",
  "method": "agent|health|status|send",
  "params": {
    "agentId": "main",
    "sessionKey": "agent:main:main",
    "userMessage": "你好"
  }
}

// 响应帧
{
  "type": "res",
  "id": "unique-id",
  "ok": true,
  "payload": { ... }
  // 或
  "ok": false,
  "error": "Error message"
}

// 事件帧
{
  "type": "event",
  "event": "agent|presence|tick|health",
  "payload": { ... },
  "seq": 123,
  "stateVersion": 1
}
```

**认证模式**：

```json
{
  "gateway": {
    "auth": {
      "mode": "token",              // 或 "password"
      "token": "your-secret-token"  // 或 "password": "xxx"
    }
  }
}
```

---

## 4. 与 CKS Lite 的集成方案

### 4.1 架构设计

```
┌─────────────────────────────────────────┐
│       CKS Lite Desktop App              │
│       (Tauri + React)                   │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │  Chat UI    │  │  Memory UI      │  │
│  └──────┬──────┘  └────────┬────────┘  │
│         │                  │            │
│  ┌──────▼──────────────────▼────────┐  │
│  │  CKS Service Layer               │  │
│  │  - AgentService (HTTP)           │  │
│  │  - OpenClawClient (WebSocket)    │  │
│  └──────┬───────────────────────────┘  │
└─────────┼───────────────────────────────┘
          │
          │ HTTP + WebSocket
          │
┌─────────▼───────────────────────────────┐
│     OpenClaw Gateway                    │
│     (ws://127.0.0.1:18789)              │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │  Sessions   │  │  Memory System  │  │
│  │  Routing    │  │  (Hybrid)       │  │
│  └─────────────┘  └─────────────────┘  │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │  Tools      │  │  Skills         │  │
│  │  (50+)      │  │  (50+)          │  │
│  └─────────────┘  └─────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Channels (WhatsApp, Telegram..) │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
          │
          │ HTTP
          │
┌─────────▼───────────────────────────────┐
│     CKS Agent SDK                       │
│     (FastAPI, localhost:7860)           │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │  Chat API   │  │  Skills API     │  │
│  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────┘
```

### 4.2 集成层次

#### Level 1: 最小集成（推荐先实施）

**目标**：用 OpenClaw 的记忆系统替换 CKS Lite 的 FAISS 实现。

**步骤**：
1. 安装 OpenClaw：`npm install -g openclaw`
2. 启动 OpenClaw Gateway：`openclaw gateway`
3. 创建 OpenClawClient 服务层：

```typescript
// src/services/openClawClient.ts
export class OpenClawClient {
  private ws: WebSocket | null = null
  private gatewayUrl = "ws://127.0.0.1:18789"

  async connect() {
    this.ws = new WebSocket(this.gatewayUrl)
    await this.waitForOpen()
    // 发送 req:connect
    await this.sendRequest("connect", {})
  }

  async searchMemory(query: string, maxResults = 5) {
    return this.sendRequest("tool", {
      agentId: "main",
      sessionKey: "agent:main:main",
      tool: "memory_search",
      params: { query, maxResults }
    })
  }

  private async sendRequest(method: string, params: any) {
    const id = generateId()
    return new Promise((resolve, reject) => {
      this.ws!.send(JSON.stringify({
        type: "req",
        id,
        method,
        params
      }))
      // 监听响应...
    })
  }
}
```

4. 修改 Memory.tsx 使用 OpenClawClient：

```typescript
// src/pages/Memory.tsx
const handleSearch = async (query: string) => {
  const openClaw = new OpenClawClient()
  await openClaw.connect()
  const results = await openClaw.searchMemory(query)
  setMemories(results.memories)
}
```

**收益**：
- ✅ 混合搜索（BM25 + 向量）
- ✅ 更准确的记忆检索
- ✅ 自动记忆刷新
- ✅ Markdown 文件可读

#### Level 2: 中级集成

**目标**：使用 OpenClaw 的工具系统增强 CKS Lite 的功能。

**新增功能**：
1. **浏览器自动化**：在 Skills 页面添加 Browser 技能
2. **跨会话通信**：支持多窗口/多用户协作
3. **定时任务**：使用 cron 工具实现提醒和自动化

**实现**：

```typescript
// src/pages/Skills.tsx
const handleExecuteBrowser = async () => {
  const openClaw = new OpenClawClient()
  await openClaw.connect()

  // 启动浏览器
  await openClaw.executeTool("browser", { action: "start" })

  // 打开 URL
  await openClaw.executeTool("browser", {
    action: "open",
    url: "https://github.com/trending"
  })

  // 截图
  const screenshot = await openClaw.executeTool("browser", {
    action: "screenshot"
  })

  // 在 UI 中显示截图
  setScreenshot(screenshot.imageUrl)
}
```

**收益**：
- ✅ 50+ 工具立即可用
- ✅ 浏览器自动化
- ✅ 跨会话协作
- ✅ 定时任务调度

#### Level 3: 深度集成

**目标**：完全采用 OpenClaw 作为后端，CKS Lite 作为前端 UI。

**架构变更**：
- CKS Agent SDK → OpenClaw Gateway（完全替换）
- Tauri Desktop App → OpenClaw Gateway Client
- Memory Page → OpenClaw Memory Viewer
- Skills Page → OpenClaw Skills Manager

**新增功能**：
1. **多智能体管理**：在 UI 中切换不同的智能体
2. **多渠道支持**：在 Desktop App 中管理 WhatsApp/Telegram 等频道
3. **插件市场**：浏览和安装 OpenClaw 插件
4. **Canvas 渲染**：在 UI 中展示 Canvas 渲染结果

**实现**：

```typescript
// src/App.tsx
import { OpenClawProvider } from './contexts/OpenClawContext'

function App() {
  return (
    <OpenClawProvider gatewayUrl="ws://127.0.0.1:18789">
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </OpenClawProvider>
  )
}

// src/pages/Agents.tsx (新页面)
export const Agents = () => {
  const { agentsList, switchAgent } = useOpenClaw()

  return (
    <div>
      <h1>智能体管理</h1>
      {agentsList.map(agent => (
        <AgentCard
          key={agent.id}
          agent={agent}
          onSwitch={() => switchAgent(agent.id)}
        />
      ))}
    </div>
  )
}
```

**收益**：
- ✅ 完整的 OpenClaw 功能
- ✅ 多渠道统一管理
- ✅ 插件生态系统
- ✅ 社区支持和更新

### 4.3 数据同步策略

#### 记忆同步

```typescript
// 实时同步 OpenClaw 记忆到 CKS Lite 本地
class MemorySync {
  private watchFile(filePath: string) {
    const watcher = chokidar.watch(filePath)
    watcher.on('change', async () => {
      // 读取 MEMORY.md
      const content = await fs.readFile(filePath, 'utf-8')

      // 解析 Markdown
      const memories = parseMarkdown(content)

      // 更新 CKS Lite 本地记忆
      memoryStore.setMemories(memories)

      // 触发 UI 更新
      window.dispatchEvent(new CustomEvent('memory-updated'))
    })
  }

  start() {
    this.watchFile('~/.openclaw/workspace/MEMORY.md')
    this.watchFile(`~/.openclaw/workspace/memory/${today()}.md`)
  }
}
```

#### 会话同步

```typescript
// 订阅 OpenClaw 事件流
class SessionSync {
  private subscribeEvents() {
    openClaw.on('event:agent', (event) => {
      // LLM 响应完成
      if (event.payload.type === 'complete') {
        chatStore.addMessage({
          role: 'assistant',
          content: event.payload.message,
          timestamp: Date.now()
        })
      }
    })

    openClaw.on('event:presence', (event) => {
      // 在线状态变更
      uiStore.setAgentStatus(event.payload.status)
    })
  }
}
```

### 4.4 配置管理

```json
// ~/.openclaw/openclaw.json
{
  "gateway": {
    "port": 18789,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "cks-lite-secret-token"
    }
  },

  "agents": {
    "defaults": {
      "workspace": "~/.cks-lite/workspace",
      "model": "anthropic/claude-sonnet-4-5",
      "userTimezone": "Asia/Shanghai",
      "compaction": {
        "reserveTokensFloor": 20000,
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 4000
        }
      },
      "memorySearch": {
        "provider": "openai",
        "model": "text-embedding-3-small",
        "query": {
          "hybrid": {
            "enabled": true,
            "vectorWeight": 0.7,
            "textWeight": 0.3
          }
        }
      }
    },
    "list": [
      {
        "id": "main",
        "workspace": "~/.cks-lite/workspace",
        "tools": {
          "profile": "full",
          "allow": ["*"]
        }
      }
    ]
  },

  "channels": {
    "webchat": {
      "enabled": true,
      "port": 18790
    }
  }
}
```

---

## 5. 实施路线图

### Phase 1: 记忆系统集成（1-2 周）

**目标**：用 OpenClaw 记忆系统替换 FAISS。

**任务清单**：
- [ ] 安装和配置 OpenClaw Gateway
- [ ] 创建 OpenClawClient 服务层
- [ ] 修改 Memory.tsx 使用混合搜索
- [ ] 实现 MEMORY.md 文件监控
- [ ] 测试记忆检索精度

**验收标准**：
- ✅ 记忆搜索返回相关结果
- ✅ BM25 关键字搜索工作正常
- ✅ 向量语义搜索工作正常
- ✅ 记忆自动索引和刷新

### Phase 2: 工具系统集成（2-3 周）

**目标**：集成 OpenClaw 的 50+ 工具。

**任务清单**：
- [ ] 实现工具调用 API
- [ ] 在 Skills 页面展示可用工具
- [ ] 添加浏览器自动化工具
- [ ] 添加 Canvas 渲染工具
- [ ] 添加跨会话通信工具

**验收标准**：
- ✅ 用户可以从 UI 触发工具
- ✅ 工具执行结果正确显示
- ✅ 浏览器自动化可用
- ✅ Canvas 渲染可用

### Phase 3: 多智能体集成（2-3 周）

**目标**：支持多智能体管理和协作。

**任务清单**：
- [ ] 创建 Agents 管理页面
- [ ] 实现智能体切换
- [ ] 支持跨智能体消息发送
- [ ] 实现子任务生成（sessions_spawn）

**验收标准**：
- ✅ 用户可以创建和管理多个智能体
- ✅ 智能体间可以通信
- ✅ 支持任务分发

### Phase 4: 多渠道集成（3-4 周，可选）

**目标**：集成 WhatsApp/Telegram 等多渠道支持。

**任务清单**：
- [ ] 配置 WhatsApp 频道
- [ ] 配置 Telegram 频道
- [ ] 实现频道消息路由
- [ ] 在 UI 中显示多渠道消息

**验收标准**：
- ✅ 用户可以从 Desktop App 管理多个频道
- ✅ 消息正确路由到对应智能体
- ✅ 支持群组和 DM

### Phase 5: 插件生态集成（持续）

**目标**：支持 OpenClaw 插件市场。

**任务清单**：
- [ ] 创建插件浏览页面
- [ ] 实现插件安装
- [ ] 实现插件配置
- [ ] 开发 CKS Lite 专属插件

**验收标准**：
- ✅ 用户可以浏览和安装插件
- ✅ 插件正常工作
- ✅ CKS Lite 插件发布到 OpenClaw 社区

---

## 6. 风险与缓解

### 风险 1: OpenClaw 版本兼容性

**描述**：OpenClaw 更新频繁，API 可能变更。

**缓解措施**：
- 锁定 OpenClaw 版本号（在 package.json 中）
- 定期监控 OpenClaw 更新日志
- 创建抽象层封装 OpenClaw API

### 风险 2: 性能开销

**描述**：OpenClaw Gateway 增加了额外的网络层。

**缓解措施**：
- 使用本地 WebSocket 连接（低延迟）
- 启用嵌入缓存
- 使用本地嵌入模型（如需离线）

### 风险 3: 用户学习曲线

**描述**：OpenClaw 功能复杂，用户可能不熟悉。

**缓解措施**：
- 渐进式集成（先记忆，后工具，再多智能体）
- 提供向导和教程
- 隐藏高级功能，默认简化 UI

---

## 7. 结论与建议

### 核心价值

OpenClaw 提供了 **企业级的记忆系统**、**强大的工具生态** 和 **灵活的多智能体架构**。与 CKS Lite 集成后，可以显著提升用户体验和功能深度。

### 推荐方案

**阶段 1（立即实施）**：
- 集成 OpenClaw 记忆系统（混合搜索）
- 保留 CKS Agent SDK 作为 LLM 推理后端
- 双系统并行，记忆优先使用 OpenClaw

**阶段 2（1-2 月后）**：
- 集成工具系统（浏览器、Canvas）
- 支持跨会话通信
- 添加定时任务

**阶段 3（3-6 月后）**：
- 完全采用 OpenClaw Gateway
- 弃用 CKS Agent SDK
- 开发 CKS Lite 专属插件

### 技术债务

- 需要维护两套记忆系统（OpenClaw + FAISS）直到完全迁移
- WebSocket 连接管理需要额外的错误处理
- 配置文件需要同步（openclaw.json + CKS config）

### 社区贡献机会

- 为 OpenClaw 贡献 CKS Lite 插件
- 分享集成经验到 OpenClaw 社区
- 参与 OpenClaw 功能开发和 bug 修复

---

**附录**：
- OpenClaw GitHub: https://github.com/mario/openclaw (假设)
- OpenClaw 文档: E:\Gitee-Project\openclaw\docs
- CKS Lite 项目: E:\GalaxyProject\cks-lite

**生成时间**：2026-02-05 17:45
**作者**：Claude (CKS Agent)
**版本**：v1.0
