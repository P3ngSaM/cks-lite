# CKS Lite 快速开始指南

## 🚀 当前运行状态

**Agent SDK服务已启动**
- 地址: http://127.0.0.1:7860
- API文档: http://127.0.0.1:7860/docs
- 使用MiniMax API (Claude兼容)

## 📝 快速测试

### 1. 测试对话功能

```bash
cd E:\GalaxyProject\cks-lite\agent-sdk
.\venv\Scripts\activate
python test_api.py
```

### 2. 使用curl测试

```bash
# 健康检查
curl http://127.0.0.1:7860/

# 对话测试
curl -X POST http://127.0.0.1:7860/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"user_id\":\"test\",\"message\":\"你好\"}"

# 查看Skills
curl http://127.0.0.1:7860/skills
```

### 3. Python代码示例

```python
import requests

# 基本对话
response = requests.post("http://127.0.0.1:7860/chat", json={
    "user_id": "my_user",
    "message": "帮我总结这段文字...",
    "use_memory": True
})
print(response.json()["message"])

# 搜索记忆
memories = requests.get("http://127.0.0.1:7860/memory/search", params={
    "user_id": "my_user",
    "query": "项目",
    "top_k": 5
}).json()
print(memories)

# 获取Skills列表
skills = requests.get("http://127.0.0.1:7860/skills").json()
for skill in skills["skills"]:
    print(f"{skill['display_name']}: {skill['description'][:50]}...")
```

## 🎯 核心功能

### 长记忆系统
- 自动记住对话历史
- 支持语义搜索
- 数据存储在: `agent-sdk/data/memories.db`

### 已加载的Skills
1. **docx** - Word文档处理
2. **pdf** - PDF处理
3. **pptx** - PowerPoint生成
4. **xlsx** - Excel表格处理
5. **Good公众号发布** - 微信公众号发布
6. **Good视频转文字** - 视频转录
7. **GoodDowner** - 视频下载器

## 🔧 管理服务

### 启动服务
```bash
cd E:\GalaxyProject\cks-lite\agent-sdk
.\venv\Scripts\activate
python main.py
```

### 停止服务
按 `Ctrl+C` 或关闭终端窗口

### 查看日志
服务日志会实时显示在终端中

## 📊 API接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 健康检查 |
| POST | /chat | 对话(非流式) |
| POST | /chat/stream | 对话(流式SSE) |
| POST | /memory/save | 保存记忆 |
| GET | /memory/search | 搜索记忆 |
| GET | /memory/list | 列出记忆 |
| DELETE | /memory/{id} | 删除记忆 |
| GET | /skills | 列出Skills |
| GET | /skills/{name} | 获取Skill详情 |
| WS | /ws | WebSocket实时对话 |

## 🛠️ 开发调试

### 修改配置
编辑 `agent-sdk/.env` 文件:

```env
# API配置
ANTHROPIC_API_KEY=你的API密钥
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic

# 记忆配置
MEMORY_TOP_K=5
MEMORY_SIMILARITY_THRESHOLD=0.7

# 模型配置
MODEL_NAME=claude-sonnet-4-5-20250929
MAX_TOKENS=4096
TEMPERATURE=1.0
```

### 添加新的Skill
1. 在 `agent-sdk/skills/` 创建新文件夹
2. 添加 `SKILL.md` (AI触发) 或 `template.json` (独立应用)
3. 重启服务自动加载

### 测试记忆系统
```bash
cd agent-sdk
python test_demo.py
```

## 🌟 下一步

1. **开发Tauri桌面应用**: 创建用户界面
2. **完善Skills**: 添加更多技能
3. **目标管理**: 实现KPI/OKR功能
4. **多代理协作**: 像素风格可视化
5. **移动端控制**: 远程任务监控

## 📖 更多文档

- [完整README](README.md)
- [记忆系统设计](docs/memory-system.md)
- [实施路线图](docs/implementation-roadmap.md)
- [Goodable集成](docs/goodable-integration.md)

---

**当前版本**: v0.0.1-alpha
**项目地址**: https://github.com/P3ngSaM/cks-lite
