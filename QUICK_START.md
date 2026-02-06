# CKS Lite - 快速开始指南

## 🚀 5 分钟快速体验

### 前置要求
- Python 3.10+
- Claude API Key（[获取地址](https://console.anthropic.com/)）

### 1. 克隆项目
```bash
cd E:\GalaxyProject\cks-lite
```

### 2. 运行初始化脚本

#### Windows
```bash
init-project.bat
```

#### macOS/Linux
```bash
chmod +x init-project.sh
./init-project.sh
```

### 3. 配置 API Key

编辑 `agent-sdk/.env` 文件：
```env
ANTHROPIC_API_KEY=sk-ant-xxxx
```

### 4. 启动 Agent SDK

#### Windows
```bash
cd agent-sdk
venv\Scripts\activate
python main.py
```

#### macOS/Linux
```bash
cd agent-sdk
source venv/bin/activate
python main.py
```

服务将在 `http://127.0.0.1:7860` 启动。

### 5. 测试对话功能

打开新终端，运行：
```bash
curl -X POST http://127.0.0.1:7860/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "message": "你好，请介绍一下你的能力",
    "use_memory": true
  }'
```

---

## 🧪 测试长记忆系统

### 保存记忆
```bash
curl -X POST http://127.0.0.1:7860/memory/save \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "content": "用户的公司名称是 ABC 科技，主营业务是 AI 软件开发",
    "memory_type": "company_info"
  }'
```

### 搜索记忆
```bash
curl "http://127.0.0.1:7860/memory/search?user_id=test_user&query=公司名称&top_k=5"
```

### 对话中使用记忆
```bash
curl -X POST http://127.0.0.1:7860/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "message": "我的公司是什么？",
    "use_memory": true
  }'
```

Agent 将自动检索到之前保存的公司信息！

---

## 🛠️ 测试 Skills 系统

### 查看所有 Skills
```bash
curl http://127.0.0.1:7860/skills
```

### 查看某个 Skill 详情
```bash
curl http://127.0.0.1:7860/skills/gooddowner
```

### 通过对话触发 Skill
```bash
curl -X POST http://127.0.0.1:7860/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "message": "帮我下载这个视频",
    "use_memory": true
  }'
```

---

## 📊 查看系统状态

### 健康检查
```bash
curl http://127.0.0.1:7860/
```

### 记忆统计
```bash
curl "http://127.0.0.1:7860/memory/list?user_id=test_user&limit=10"
```

---

## 🎨 Web UI 测试（浏览器）

访问 `http://127.0.0.1:7860/docs` 可以看到自动生成的 API 文档（Swagger UI）。

---

## 🐛 常见问题

### 1. FAISS 安装失败
```bash
# 使用 CPU 版本
pip install faiss-cpu==1.9.0 -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 2. sentence-transformers 下载慢
```bash
# 使用国内镜像
pip install sentence-transformers -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 3. 端口已被占用
修改 `agent-sdk/.env`：
```env
PORT=8080  # 改为其他端口
```

### 4. Claude API 限流
- 检查 API Key 是否正确
- 检查账户余额
- 降低请求频率

---

## 📚 进阶使用

### 流式对话
```bash
curl -X POST http://127.0.0.1:7860/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "message": "写一首诗",
    "use_memory": true
  }'
```

### WebSocket 实时对话
使用 WebSocket 客户端连接 `ws://127.0.0.1:7860/ws`

发送消息：
```json
{
  "user_id": "test_user",
  "message": "你好",
  "session_id": "default"
}
```

### 多会话管理
通过 `session_id` 参数管理多个独立对话：
```bash
# 会话 1
curl -X POST http://127.0.0.1:7860/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "message": "我在学 Python",
    "session_id": "session_1"
  }'

# 会话 2
curl -X POST http://127.0.0.1:7860/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "message": "我在学 Rust",
    "session_id": "session_2"
  }'
```

---

## 🎯 下一步

1. **查看完整文档**: [README.md](README.md)
2. **了解架构设计**: [docs/lightweight-architecture.md](docs/lightweight-architecture.md)
3. **查看开发路线图**: [docs/implementation-roadmap.md](docs/implementation-roadmap.md)
4. **启动桌面应用**: `cd desktop-app && npm run tauri dev`（待实现）

---

## 💬 获取帮助

- 查看 [agent-sdk/README.md](agent-sdk/README.md) 了解 API 详情
- 查看 [docs/memory-system.md](docs/memory-system.md) 了解长记忆系统
- 查看 [docs/goodable-integration.md](docs/goodable-integration.md) 了解 Goodable 融合

---

**享受你的 AI 工作台之旅！** 🎉
