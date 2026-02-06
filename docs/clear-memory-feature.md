# 清空记忆功能 - 实现文档

**功能**: 清空所有记忆（危险操作）
**实现日期**: 2026-02-05
**安全级别**: 🔴 危险操作（多重确认）

---

## 功能概述

允许用户清空所有记忆数据，包括数据库记录、向量索引和 Markdown 文件。此功能具有多重安全保护机制。

---

## 安全机制

### 1. 两步确认流程

**第一步：危险警告**
- 🚨 红色警告图标
- 明确列出将要删除的内容
- 显示记忆数量
- 说明操作不可撤销
- 提示自动备份功能

**第二步：最终确认**
- 🚨 更强烈的警告
- 大字显示将清空的记忆数量
- 再次提醒影响
- 需要点击"确认清空"按钮

### 2. 自动备份

默认启用备份功能（`backup=true`）：
- 在清空前自动导出所有记忆到 JSON
- 备份文件命名：`memory_backup_YYYYMMDD_HHMMSS.json`
- 保存位置：`~/.cks-lite/data/backups/`
- 如果备份失败，清空操作会自动取消

### 3. 日志记录

所有清空操作都会记录详细日志：
```
⚠️ 危险操作: 用户 default-user 请求清空所有记忆 (backup=true)
✅ 备份已保存: /path/to/backup.json
🗑️ 已清空用户 default-user 的所有记忆 (共 123 条)
```

---

## 实现细节

### 后端 API (`agent-sdk/main.py`)

```python
@app.post("/memory/clear-all")
async def clear_all_memories(user_id: str, backup: bool = True):
    """
    清空所有记忆（危险操作）

    步骤：
    1. 统计记忆数量
    2. 创建备份（如果 backup=True）
    3. 清空数据库记忆
    4. 重建 FAISS 索引
    5. 重置 MEMORY.md 文件

    返回:
    {
      "success": true,
      "cleared_count": 123,
      "backup_path": "/path/to/backup.json",
      "message": "已成功清空 123 条记忆，备份已保存"
    }
    """
```

**清空内容：**
1. ✅ 数据库表 `semantic_memories`
2. ✅ 全文搜索表 `semantic_memories_fts`
3. ✅ FAISS 向量索引
4. ✅ MEMORY.md 文件（重置为空模板）
5. ⚠️ 每日日志文件（保留，可选择删除）

### 前端服务 (`desktop-app/src/services/agentService.ts`)

```typescript
static async clearAllMemories(
  userId: string,
  backup: boolean = true
): Promise<{
  success: boolean
  cleared_count?: number
  backup_path?: string
  message?: string
  error?: string
} | null>
```

**特性：**
- ✅ 自动重试机制（最多2次）
- ✅ 超时保护（30秒）
- ✅ 类型安全
- ✅ 错误处理

### 前端 UI (`desktop-app/src/pages/Memory.tsx`)

**新增状态：**
```typescript
const [showClearConfirm, setShowClearConfirm] = useState(false)
const [clearStep, setClearStep] = useState(1) // 1=警告, 2=最终确认
const [isClearing, setIsClearing] = useState(false)
```

**确认对话框设计：**
- 全屏半透明遮罩（`bg-black/80 backdrop-blur-sm`）
- 红色边框警告框
- 两步确认流程
- 加载状态显示

---

## UI 设计

### 清空按钮

位置：Memory 页面右上角

```tsx
<button
  onClick={() => setShowClearConfirm(true)}
  className="p-2 rounded-lg text-neutral-600 hover:text-red-500 hover:bg-red-500/10"
  title="清空所有记忆（危险操作）"
>
  <Trash2 className="h-5 w-5" />
</button>
```

**视觉效果：**
- 默认：灰色图标
- Hover：红色高亮 + 红色背景
- Tooltip：清空所有记忆（危险操作）

### 第一步：危险警告对话框

```
┌─────────────────────────────────────┐
│  ⚠️ 危险操作警告                     │
│  你即将清空所有记忆数据               │
│                                      │
│  此操作将会：                         │
│  • 删除数据库中的所有记忆 (123 条)    │
│  • 清空向量索引（FAISS）              │
│  • 重置 MEMORY.md 文件                │
│  • 此操作不可撤销                     │
│                                      │
│  ✅ 系统会自动创建备份文件            │
│                                      │
│  [ 取消 ]  [ 我了解风险，继续 ]      │
└─────────────────────────────────────┘
```

**颜色方案：**
- 背景：`bg-neutral-900`
- 边框：`border-2 border-red-500/50`
- 警告图标：`text-red-500` + `bg-red-500/20`
- 警告框：`bg-red-500/10 border-red-500/30`
- 按钮：红色半透明（`bg-red-500/20 text-red-400`）

### 第二步：最终确认对话框

```
┌─────────────────────────────────────┐
│  🚨 最后确认                         │
│  请再次确认你的操作                   │
│                                      │
│  即将清空：                           │
│          123 条记忆                  │
│                                      │
│  清空后，AI 将无法记住任何历史对话    │
│  和用户信息。你确定要继续吗？         │
│                                      │
│  [ 返回 ]  [ 确认清空 ]              │
└─────────────────────────────────────┘
```

**关键元素：**
- 记忆数量：`text-2xl font-bold text-red-400`
- 确认按钮：`bg-red-600 text-white font-bold`
- 加载状态：`disabled:opacity-50` + "清空中..."

---

## 使用流程

### 用户操作流程

```
1. 点击垃圾桶图标
   ↓
2. 看到第一次警告 (Step 1)
   - 了解将要删除的内容
   - 知道有自动备份
   ↓
3. 点击"我了解风险，继续"
   ↓
4. 看到最终确认 (Step 2)
   - 再次确认记忆数量
   - 理解后果
   ↓
5. 点击"确认清空"
   ↓
6. 显示加载状态 "清空中..."
   ↓
7. 清空完成
   - 显示成功消息
   - 记忆列表变空
   - 备份文件路径
```

### 取消操作

用户可以在任何步骤取消：
- Step 1: 点击"取消"
- Step 2: 点击"返回"（回到 Step 1）或"取消"
- 关闭对话框：点击遮罩外部区域（可选实现）

---

## 备份文件格式

```json
{
  "version": "1.0",
  "export_time": "2026-02-05T20:30:00",
  "memories": [
    {
      "id": "mem_xxx",
      "type": "preference",
      "timestamp": "2026-02-05 10:00:00",
      "content": "用户喜欢使用 Python",
      "tags": ["Python", "编程语言"]
    }
  ],
  "recent_logs": [
    {
      "date": "2026-02-05",
      "path": "/path/to/2026-02-05.md",
      "size": 1234
    }
  ]
}
```

**恢复方法：**
用户可以使用备份文件手动恢复记忆：
1. 找到备份文件（`~/.cks-lite/data/backups/`）
2. 使用 Markdown 导入功能（未来实现）
3. 或手动编辑 MEMORY.md 文件

---

## 安全考虑

### 防止误操作

1. ✅ **两步确认** - 需要点击 3 次按钮
2. ✅ **清晰警告** - 红色配色 + 危险图标
3. ✅ **信息透明** - 明确显示将删除多少记忆
4. ✅ **自动备份** - 默认启用，失败则取消操作
5. ✅ **日志记录** - 所有操作可追溯

### 数据保护

1. ✅ **备份优先** - 先备份再清空
2. ✅ **原子操作** - 备份失败则不清空
3. ✅ **保留日志** - 每日日志文件默认保留
4. ✅ **可恢复** - 备份文件可用于恢复

### 权限控制

- 当前实现：所有用户都可以清空自己的记忆
- 未来增强：可添加密码确认或管理员权限

---

## 测试场景

### 场景 1: 正常清空流程

```
1. 用户有 50 条记忆
2. 点击清空按钮
3. 确认两次
4. 系统自动备份
5. 清空成功
6. 显示 "已成功清空 50 条记忆，备份已保存至 xxx"
7. 记忆列表为空
```

### 场景 2: 备份失败

```
1. 用户有 50 条记忆
2. 点击清空按钮
3. 确认两次
4. 备份过程失败（磁盘满、权限问题）
5. 显示 "备份失败: xxx，为了安全，清空操作已取消"
6. 记忆保持不变
```

### 场景 3: 中途取消

```
1. 点击清空按钮
2. 在 Step 1 点击"取消"
   → 对话框关闭，无任何操作
3. 或在 Step 2 点击"返回"
   → 回到 Step 1
```

### 场景 4: 清空后再添加

```
1. 清空所有记忆
2. 添加新记忆 "测试记忆"
3. 创建新对话
4. AI 只能看到新添加的记忆
5. 历史记忆不可访问（除非从备份恢复）
```

---

## 文件清单

**修改的文件：**

```
agent-sdk/
└── main.py                          (+80 行, 新增 /memory/clear-all 端点)

desktop-app/src/
├── services/
│   └── agentService.ts              (+30 行, 新增 clearAllMemories 方法)
└── pages/
    └── Memory.tsx                   (+150 行, 新增清空功能 UI)
```

**生成的文件：**

```
~/.cks-lite/data/
└── backups/
    ├── memory_backup_20260205_203045.json
    ├── memory_backup_20260205_203120.json
    └── ...
```

---

## API 文档

### POST /memory/clear-all

清空用户的所有记忆数据。

**请求参数:**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| user_id | string | 是 | - | 用户ID |
| backup | boolean | 否 | true | 是否在清空前备份 |

**请求示例:**

```bash
curl -X POST "http://127.0.0.1:7860/memory/clear-all?user_id=default-user&backup=true"
```

**成功响应:**

```json
{
  "success": true,
  "cleared_count": 123,
  "backup_path": "/path/to/memory_backup_20260205_203045.json",
  "message": "已成功清空 123 条记忆，备份已保存至 /path/to/backup.json"
}
```

**错误响应:**

```json
{
  "success": false,
  "error": "备份失败: 磁盘空间不足",
  "message": "为了安全，清空操作已取消"
}
```

---

## 未来增强

### 短期优化

1. **部分清空** - 允许按类型清空（如只清空 conversation 类型）
2. **时间范围** - 清空指定日期范围的记忆
3. **选择性备份** - 让用户选择是否备份
4. **导入恢复** - 从备份文件恢复记忆

### 中期优化

5. **密码确认** - 添加密码二次验证
6. **回收站** - 软删除，30天后永久删除
7. **定时清理** - 自动清理超过 N 天的旧记忆
8. **统计信息** - 清空前显示详细统计

### 长期优化

9. **选择性清空** - 多选记忆批量删除
10. **智能保留** - 保留重要记忆，清空不重要的
11. **多用户管理** - 管理员可清空任意用户记忆
12. **审计日志** - 详细记录谁在何时清空了多少记忆

---

## 常见问题

### Q: 清空后可以恢复吗？

A: 可以。系统会自动创建备份文件（JSON 格式），保存在 `~/.cks-lite/data/backups/` 目录。未来会添加一键恢复功能。目前可以手动导入备份文件。

### Q: 如果备份失败会怎样？

A: 为了数据安全，如果备份失败，清空操作会自动取消，所有记忆保持不变。系统会显示错误信息。

### Q: 每日日志也会被清空吗？

A: 当前实现中，每日日志文件会保留。只有 MEMORY.md 会被重置为空模板。未来可以添加选项让用户选择是否清空日志。

### Q: 清空需要多长时间？

A: 通常几秒钟。时间取决于记忆数量和备份文件大小。清空过程中会显示"清空中..."状态。

### Q: 可以清空其他用户的记忆吗？

A: 当前实现中，每个用户只能清空自己的记忆。未来可以添加管理员权限。

---

**文档创建时间**: 2026-02-05 20:35
**创建者**: Claude (Sonnet 4.5)
