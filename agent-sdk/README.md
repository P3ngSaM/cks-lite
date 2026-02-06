# CKS Lite - Agent SDK

Python Agent SDK 服务，基于 Claude Agent SDK 构建。

## 功能特性

- 🤖 Claude Agent 核心（支持流式输出）
- 🧠 长记忆系统（FAISS 向量搜索 + SQLite）
- 🛠️ Skills 加载器（支持 Goodable 双模式）
- 📦 7+ 预制应用

## 目录结构

```
agent-sdk/
├── main.py                  # 服务入口
├── core/                    # 核心模块
│   ├── agent.py             # Claude Agent
│   ├── memory.py            # 长记忆系统
│   └── skills_loader.py     # Skills 加载器
├── models/                  # 数据模型
│   ├── request.py           # 请求模型
│   └── response.py          # 响应模型
├── skills/                  # Skills 库
│   ├── gooddowner/          # 视频下载器
│   ├── good-mp-post/        # 公众号发布
│   ├── good-TTvideo2text/   # 视频转文字
│   ├── pptx/                # PPT 生成
│   ├── docx/                # Word 文档
│   ├── pdf/                 # PDF 处理
│   └── xlsx/                # Excel 表格
├── data/                    # 数据目录（自动创建）
│   ├── memories.db          # 记忆数据库
│   └── memory_index.faiss   # FAISS 索引
├── requirements.txt         # Python 依赖
└── .env                     # 环境配置

## 快速开始

### 1. 安装依赖

```bash
cd agent-sdk

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：
```env
ANTHROPIC_API_KEY=your_claude_api_key_here
```

### 3. 启动服务

```bash
python main.py
```

服务将在 `http://127.0.0.1:7860` 启动。

## API 文档

### 健康检查

```bash
GET /
```

### 对话接口（非流式）

```bash
POST /chat
Content-Type: application/json

{
  "user_id": "user_001",
  "message": "你好",
  "session_id": "default",
  "use_memory": true
}
```

### 对话接口（流式）

```bash
POST /chat/stream
Content-Type: application/json

{
  "user_id": "user_001",
  "message": "你好",
  "session_id": "default",
  "use_memory": true
}
```

### 保存记忆

```bash
POST /memory/save
Content-Type: application/json

{
  "user_id": "user_001",
  "content": "用户的公司名称是 ABC 科技",
  "memory_type": "conversation",
  "metadata": {}
}
```

### 搜索记忆

```bash
GET /memory/search?user_id=user_001&query=公司名称&top_k=5
```

### 列出记忆

```bash
GET /memory/list?user_id=user_001&memory_type=conversation&limit=50
```

### 删除记忆

```bash
DELETE /memory/{memory_id}
```

### 列出 Skills

```bash
GET /skills
```

### 获取 Skill 详情

```bash
GET /skills/{skill_name}
```

### WebSocket 连接

```bash
WS /ws
```

连接后发送 JSON 消息：
```json
{
  "user_id": "user_001",
  "message": "你好",
  "session_id": "default"
}
```

## 长记忆系统

### 记忆类型

1. **语义记忆**（Semantic Memory）
   - 向量搜索（FAISS）
   - 混合检索（向量 70% + 关键词 30%）

2. **工作记忆**（Working Memory）
   - 当前会话上下文（最近 20 轮）

3. **程序记忆**（Procedural Memory）
   - 用户偏好（SQLite）

### 使用示例

```python
from core.memory import MemoryManager

memory_manager = MemoryManager(data_dir=Path("./data"))

# 保存记忆
memory_id = await memory_manager.save_memory(
    user_id="user_001",
    content="用户偏好使用深色主题",
    memory_type="preference"
)

# 搜索记忆
memories = await memory_manager.search_memories(
    user_id="user_001",
    query="用户偏好",
    top_k=5
)
```

## Skills 系统

### Skills 结构

每个 Skill 可以是：
- **AI 触发模式**：有 `SKILL.md` → 可被 AI 调用
- **独立应用模式**：有 `template.json` → 可作为应用运行
- **混合模式**：两者都有

### Skill 配置

#### SKILL.md（AI 触发）
```markdown
---
title: 视频下载器
category: 工具
---

# 视频下载器

## 触发关键词
- "下载视频"
- "/download"

## 功能描述
支持下载 1000+ 视频网站的视频。

## 使用示例
用户: 帮我下载这个视频
助手: [调用 gooddowner 技能]
```

#### template.json（应用配置）
```json
{
  "displayName": "视频下载器",
  "description": "支持 1000+ 视频网站",
  "category": "工具",
  "tags": ["视频", "下载"],
  "projectType": "python-fastapi",
  "envVars": [
    {
      "key": "API_KEY",
      "label": "API 密钥",
      "required": true,
      "secret": true
    }
  ]
}
```

### 已集成 Skills

| Skill | 类型 | 功能 |
|-------|------|------|
| **gooddowner** | 混合 | 视频下载器（1000+ 网站） |
| **good-mp-post** | 混合 | 微信公众号发布 |
| **good-TTvideo2text** | 混合 | 视频转文字（ASR） |
| **pptx** | AI | PPT 生成 |
| **docx** | AI | Word 文档处理 |
| **pdf** | AI | PDF 处理 |
| **xlsx** | AI | Excel 表格处理 |

## 开发指南

### 添加新 Skill

1. 在 `skills/` 目录创建新文件夹
2. 创建 `SKILL.md`（AI 触发）
3. 可选创建 `template.json`（独立应用）
4. 重启服务，自动加载

### 调试模式

```bash
# 启用 DEBUG 日志
export LOG_LEVEL=DEBUG
python main.py
```

### 运行测试

```bash
pytest tests/
```

## 性能指标

- 启动速度：< 3 秒
- 内存占用：< 500MB（10 万条记忆）
- 记忆保存：< 100ms / 条
- 记忆检索：< 200ms（1 万条数据）

## 故障排除

### FAISS 安装失败

```bash
# 使用 CPU 版本
pip install faiss-cpu==1.9.0

# 或使用 GPU 版本
pip install faiss-gpu==1.9.0
```

### sentence-transformers 下载慢

使用镜像源：
```bash
pip install sentence-transformers -i https://pypi.tuna.tsinghua.edu.cn/simple
```

## 许可证

MIT License
