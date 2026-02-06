# Phase 1: OpenClaw 记忆系统集成 - 任务清单

创建日期：2026-02-05
预计完成：1-2 周
负责人：Claude + User

---

## 📋 任务概览

| 任务 ID | 任务名称 | 优先级 | 预计工时 | 状态 |
|---------|---------|--------|---------|------|
| #7 | 安装和配置 OpenClaw Gateway | P0 | 2h | 🔵 待开始 |
| #8 | 创建 OpenClawClient 服务层 | P0 | 4h | 🔵 待开始 |
| #9 | 修改 Memory 页面使用 OpenClaw 混合搜索 | P0 | 4h | 🔵 待开始 |
| #10 | 实现 MEMORY.md 文件监控和自动索引 | P1 | 6h | 🔵 待开始 |
| #11 | 集成自动记忆刷新到对话流程 | P1 | 4h | 🔵 待开始 |
| #12 | 添加 OpenClaw 记忆配置页面 | P2 | 4h | 🔵 待开始 |
| #13 | 测试记忆检索精度和性能 | P0 | 8h | 🔵 待开始 |
| #14 | 编写 Phase 1 集成文档和用户指南 | P1 | 6h | 🔵 待开始 |
| #15 | 创建 Phase 1 演示和验收测试 | P0 | 4h | 🔵 待开始 |

**总计**：42 小时（约 1-2 周全职工作）

---

## 🎯 关键里程碑

### Milestone 1: 基础设施就绪（Day 1-2）
- ✅ OpenClaw Gateway 安装并运行
- ✅ WebSocket 连接成功建立
- ✅ 基本 API 调用测试通过

**验收标准**：
```bash
curl http://127.0.0.1:18789/health
# 返回：{"status":"ok"}
```

### Milestone 2: 核心功能实现（Day 3-7）
- ✅ OpenClawClient 服务层完成
- ✅ Memory 页面集成混合搜索
- ✅ 文件监控和自动索引工作
- ✅ 自动记忆刷新集成

**验收标准**：
- 搜索返回相关结果
- BM25 和向量搜索都生效
- MEMORY.md 变化时 UI 自动更新

### Milestone 3: 完善和测试（Day 8-10）
- ✅ 配置页面完成
- ✅ 性能测试通过
- ✅ 准确率测试完成
- ✅ 文档编写完成

**验收标准**：
- 搜索延迟 < 500ms
- 混合搜索准确率 > 纯向量搜索 15%+
- 所有文档完整

### Milestone 4: 交付和验收（Day 11-14）
- ✅ 演示准备完成
- ✅ 验收测试通过
- ✅ 用户反馈收集
- ✅ 问题修复和优化

**验收标准**：
- 所有测试用例通过
- 用户满意度 ≥ 8/10
- 无 P0/P1 级别 bug

---

## 🔄 任务依赖关系

```
#7 (安装 OpenClaw)
  ↓
#8 (创建 OpenClawClient)
  ↓
  ├─→ #9 (Memory 页面)
  │     ↓
  │   #10 (文件监控)
  │     ↓
  │   #11 (自动刷新)
  │     ↓
  │   #12 (配置页面)
  │
  └─→ #13 (测试)
        ↓
      #14 (文档)
        ↓
      #15 (演示验收)
```

**关键路径**：#7 → #8 → #9 → #10 → #13 → #15

---

## 📝 详细任务说明

### Task #7: 安装和配置 OpenClaw Gateway

**目标**：在本地环境安装并运行 OpenClaw Gateway。

**步骤**：
1. 检查 Node.js 版本
   ```bash
   node --version  # 需要 ≥22
   ```

2. 安装 OpenClaw
   ```bash
   cd E:\Gitee-Project\openclaw
   pnpm install
   pnpm build
   npm link
   ```

3. 运行初始化向导
   ```bash
   openclaw onboard
   ```

4. 编辑配置文件
   ```bash
   # 编辑 ~/.openclaw/openclaw.json
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
       }
     }
   }
   ```

5. 启动 Gateway
   ```bash
   openclaw gateway
   ```

6. 验证服务
   ```bash
   curl http://127.0.0.1:18789/health
   ```

**交付物**：
- OpenClaw 成功运行
- 配置文件正确
- 健康检查通过

---

### Task #8: 创建 OpenClawClient 服务层

**目标**：实现 WebSocket 客户端连接到 OpenClaw Gateway。

**文件结构**：
```
src/services/
├── openClawClient.ts       # 主客户端类
└── openClawTypes.ts        # 类型定义

src/types/
└── openclaw.ts             # OpenClaw 接口类型
```

**核心代码**：

```typescript
// src/services/openClawClient.ts
import { EventEmitter } from 'events'

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null
  private gatewayUrl = 'ws://127.0.0.1:18789'
  private token = 'cks-lite-secret-token'
  private requestId = 0
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>()

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.gatewayUrl)

      this.ws.onopen = async () => {
        // 发送 connect 请求
        const result = await this.sendRequest('connect', {
          auth: { token: this.token }
        })
        resolve(result)
      }

      this.ws.onerror = (error) => reject(error)

      this.ws.onmessage = (event) => {
        const frame = JSON.parse(event.data)
        this.handleFrame(frame)
      }
    })
  }

  async searchMemory(query: string, maxResults = 5): Promise<Memory[]> {
    const result = await this.sendRequest('tool', {
      agentId: 'main',
      sessionKey: 'agent:main:main',
      tool: 'memory_search',
      params: { query, maxResults }
    })
    return result.memories
  }

  async executeTool(toolName: string, params: any): Promise<any> {
    return this.sendRequest('tool', {
      agentId: 'main',
      sessionKey: 'agent:main:main',
      tool: toolName,
      params
    })
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    const id = `req-${this.requestId++}`

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })

      this.ws!.send(JSON.stringify({
        type: 'req',
        id,
        method,
        params
      }))

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  private handleFrame(frame: any) {
    if (frame.type === 'res') {
      const pending = this.pendingRequests.get(frame.id)
      if (pending) {
        this.pendingRequests.delete(frame.id)
        if (frame.ok) {
          pending.resolve(frame.payload)
        } else {
          pending.reject(new Error(frame.error))
        }
      }
    } else if (frame.type === 'event') {
      this.emit(frame.event, frame.payload)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

// 单例
export const openClawClient = new OpenClawClient()
```

**交付物**：
- OpenClawClient 类实现完成
- 类型定义完整
- 单元测试通过

---

### Task #9: 修改 Memory 页面使用 OpenClaw 混合搜索

**目标**：将 Memory.tsx 从 FAISS 迁移到 OpenClaw。

**修改文件**：
- `src/pages/Memory.tsx`
- `src/components/memory/SearchBar.tsx`
- `src/components/memory/MemoryCard.tsx`

**关键变更**：

```typescript
// src/pages/Memory.tsx
import { openClawClient } from '@/services/openClawClient'

export const Memory = () => {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async (query: string) => {
    setLoading(true)
    try {
      // 使用 OpenClaw 混合搜索
      const results = await openClawClient.searchMemory(query, 10)
      setMemories(results)
    } catch (error) {
      console.error('Memory search failed:', error)
      toast.error('记忆搜索失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      <SearchBar onSearch={handleSearch} />
      {loading ? (
        <LoadingSpinner />
      ) : (
        <MemoryList memories={memories} />
      )}
    </div>
  )
}
```

**UI 改进**：

```typescript
// src/components/memory/MemoryCard.tsx
export const MemoryCard = ({ memory }: { memory: Memory }) => {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-white text-sm">{memory.content}</p>

          {/* 显示搜索分数 */}
          {memory.score && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-neutral-500">
                相关度: {(memory.score * 100).toFixed(1)}%
              </span>
              {memory.vectorScore && (
                <span className="text-xs text-neutral-600">
                  (语义: {(memory.vectorScore * 100).toFixed(0)}%,
                  关键字: {(memory.textScore * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          )}

          {/* 显示记忆来源 */}
          <div className="mt-2">
            <span className={cn(
              "text-xs px-2 py-1 rounded",
              memory.source === 'MEMORY.md'
                ? "bg-blue-500/10 text-blue-400"
                : "bg-neutral-800 text-neutral-500"
            )}>
              {memory.source === 'MEMORY.md' ? '长期记忆' : '日志'}
            </span>
          </div>
        </div>

        {/* 在文件中查看 */}
        <button
          onClick={() => openInEditor(memory.filePath)}
          className="text-neutral-500 hover:text-white"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
```

**交付物**：
- Memory 页面完全迁移到 OpenClaw
- UI 显示混合搜索分数
- 搜索功能正常工作

---

### Task #10: 实现 MEMORY.md 文件监控和自动索引

**目标**：监控工作区文件变化，自动同步到 UI。

**架构**：

```
Rust (Tauri Backend)
  ↓ 文件监控 (notify crate)
  ↓
TypeScript (Frontend)
  ↓ 解析 Markdown
  ↓
memoryStore (Zustand)
  ↓
UI 自动更新
```

**Rust 实现**：

```rust
// src-tauri/src/commands.rs
use notify::{Watcher, RecursiveMode, watcher};
use std::sync::mpsc::channel;
use std::time::Duration;

#[tauri::command]
async fn watch_memory_files(
    app_handle: tauri::AppHandle,
    workspace: String
) -> Result<(), String> {
    let (tx, rx) = channel();

    let mut watcher = watcher(tx, Duration::from_secs(2))
        .map_err(|e| e.to_string())?;

    // 监控 MEMORY.md
    let memory_path = format!("{}/MEMORY.md", workspace);
    watcher.watch(&memory_path, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    // 监控 memory/ 目录
    let memory_dir = format!("{}/memory", workspace);
    watcher.watch(&memory_dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    // 监听文件变化事件
    std::thread::spawn(move || {
        loop {
            match rx.recv() {
                Ok(event) => {
                    // 发送事件到前端
                    app_handle.emit_all("memory-file-changed", event).ok();
                }
                Err(e) => {
                    eprintln!("Watch error: {:?}", e);
                    break;
                }
            }
        }
    });

    Ok(())
}
```

**TypeScript 实现**：

```typescript
// src/services/memorySync.ts
import { listen } from '@tauri-apps/api/event'
import { readTextFile } from '@tauri-apps/api/fs'
import { useMemoryStore } from '@/stores/memoryStore'

export class MemorySync {
  async start(workspace: string) {
    // 监听文件变化事件
    await listen('memory-file-changed', async (event) => {
      console.log('Memory file changed:', event.payload)
      await this.syncMemories(workspace)
    })

    // 启动文件监控
    await invoke('watch_memory_files', { workspace })

    // 初始加载
    await this.syncMemories(workspace)
  }

  private async syncMemories(workspace: string) {
    // 读取 MEMORY.md
    const memoryContent = await readTextFile(`${workspace}/MEMORY.md`)
    const longTermMemories = this.parseMarkdown(memoryContent, 'MEMORY.md')

    // 读取今日日志
    const today = new Date().toISOString().split('T')[0]
    const dailyContent = await readTextFile(`${workspace}/memory/${today}.md`)
    const dailyMemories = this.parseMarkdown(dailyContent, today)

    // 更新 store
    useMemoryStore.getState().setMemories([
      ...longTermMemories,
      ...dailyMemories
    ])
  }

  private parseMarkdown(content: string, source: string): Memory[] {
    // 简单的 Markdown 解析
    // 每个段落视为一条记忆
    const paragraphs = content.split('\n\n').filter(p => p.trim())

    return paragraphs.map((paragraph, index) => ({
      id: `${source}-${index}`,
      content: paragraph.replace(/^#+\s+/, '').trim(),
      source,
      timestamp: Date.now(),
      filePath: `${workspace}/${source === 'MEMORY.md' ? source : `memory/${source}.md`}`
    }))
  }
}

// 单例
export const memorySync = new MemorySync()
```

**交付物**：
- 文件监控工作正常
- Markdown 解析成功
- UI 自动更新

---

### Task #11: 集成自动记忆刷新到对话流程

**目标**：在对话接近令牌限制时自动保存记忆。

**实现**：

```typescript
// src/pages/Workbench.tsx
import { openClawClient } from '@/services/openClawClient'

export const Workbench = () => {
  const [tokenCount, setTokenCount] = useState(0)
  const RESERVE_TOKENS = 20000
  const SOFT_THRESHOLD = 4000

  const handleSendMessage = async (content: string) => {
    // ... 发送消息逻辑 ...

    // 估算当前令牌数（简化计算：1 token ≈ 4 chars）
    const estimatedTokens = messages.reduce(
      (sum, msg) => sum + Math.ceil(msg.content.length / 4),
      0
    )
    setTokenCount(estimatedTokens)

    // 检查是否需要刷新记忆
    if (estimatedTokens > (RESERVE_TOKENS - SOFT_THRESHOLD)) {
      await triggerMemoryFlush()
    }
  }

  const triggerMemoryFlush = async () => {
    // 注入系统提示
    const systemPrompt = `
Session nearing compaction. Current token count: ${tokenCount}.
Please review our conversation and save any important information to long-term memory now.
Focus on: user preferences, decisions made, key facts, and context that should persist.
    `.trim()

    // 发送特殊消息触发记忆保存
    const response = await AgentService.chat({
      user_id: 'default-user',
      message: systemPrompt,
      use_memory: true,
      system_override: true
    })

    // AI 会自动将重要信息写入 MEMORY.md
    console.log('Memory flush triggered:', response)
  }

  return (
    // ... UI ...
  )
}
```

**验证**：
```typescript
// 测试自动刷新
const testMemoryFlush = async () => {
  // 1. 模拟长对话
  for (let i = 0; i < 50; i++) {
    await handleSendMessage(`测试消息 ${i}`)
  }

  // 2. 验证令牌数超过阈值
  expect(tokenCount).toBeGreaterThan(RESERVE_TOKENS - SOFT_THRESHOLD)

  // 3. 验证 MEMORY.md 更新
  const memory = await readTextFile('~/.cks-lite/workspace/MEMORY.md')
  expect(memory).toContain('测试消息')
}
```

**交付物**：
- 令牌监控实现
- 自动刷新触发
- MEMORY.md 正确更新

---

### Task #12-15: 后续任务

（完整实施计划见任务描述）

---

## ⚠️ 风险与依赖

### 关键依赖

1. **OpenClaw 安装**
   - 需要 Node.js ≥22
   - 需要 pnpm
   - 可能需要配置环境变量

2. **WebSocket 连接**
   - 防火墙可能阻止本地连接
   - 需要处理断线重连

3. **文件系统访问**
   - Tauri 权限配置
   - Windows/Mac/Linux 路径差异

### 已知风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| OpenClaw 版本不兼容 | 高 | 中 | 锁定版本号，测试兼容性 |
| WebSocket 连接不稳定 | 中 | 低 | 实现重连机制 |
| 文件监控性能问题 | 中 | 低 | 限制监控频率，优化解析 |
| MEMORY.md 格式解析失败 | 低 | 中 | 增强错误处理，提供回退方案 |

---

## 📊 进度跟踪

使用 `/tasks` 命令查看实时进度：

```bash
# 查看所有任务
/tasks

# 更新任务状态
# 开始任务
claude code: "开始 Task #7"

# 完成任务
claude code: "完成 Task #7"
```

---

## 🎓 学习资源

- [OpenClaw 官方文档](E:\Gitee-Project\openclaw\docs)
- [OpenClaw 记忆系统](E:\Gitee-Project\openclaw\docs\concepts\memory.md)
- [OpenClaw 集成分析](E:\GalaxyProject\cks-lite\docs\openclaw-integration-analysis.md)
- [WebSocket 协议规范](E:\Gitee-Project\openclaw\docs\gateway\websocket-protocol.md)

---

**最后更新**：2026-02-05 18:00
**下一步**：开始 Task #7 - 安装和配置 OpenClaw Gateway
