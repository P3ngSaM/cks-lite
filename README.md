# CKS Lite - 轻量级桌面 AI 工作台

> 基于 Claude Agent SDK 驱动的桌面通用智能体

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Node.js 18+](https://img.shields.io/badge/node.js-18+-green.svg)](https://nodejs.org/)

## 项目简介

CKS Lite 是一个轻量级的桌面 AI 工作台，专注于：
- 🎯 游戏化目标管理（KPI/OKR/项目/任务）
- 🤖 Claude Agent SDK 驱动的智能助手
- 🧠 长期记忆系统（本地向量搜索）
- 🛠️ 17+ 可扩展 Skills
- 🖥️ Computer Use / Browser Use
- ☁️ 可选云端同步与多人协作

> ⚠️ **项目状态**: 早期开发阶段 (v0.0.1-alpha)
> 目前 Agent SDK 核心已完成，桌面应用正在开发中。欢迎贡献！

## 核心特性

### 1. 轻量级
- 安装包 < 50MB
- 基于 Tauri（Rust 后端）
- 本地 SQLite 数据库
- 启动速度 < 3 秒

### 2. 智能化
- Claude Agent SDK 核心
- 17+ 预制 Skills（PPT、文档、视频下载等）
- Computer Use（文件自动化）
- Browser Use（网页自动化）

### 3. 游戏化
- 像素风可视化看板（我的世界风格）
- KPI/OKR 层级管理
- 任务自动拆解与进度追踪
- Agent 互动动画

### 4. 长记忆
- 本地向量搜索（FAISS）
- 语义记忆检索
- 用户偏好学习
- 上下文自动增强

### 5. 多端协同
- 桌面应用（Windows / macOS）
- 云端看板（Web）
- 手机远程控制（H5）

## 技术栈

### 桌面端
- **框架**: Tauri 2.x（Rust + WebView）
- **前端**: React 19 + TypeScript + Vite
- **样式**: Tailwind CSS + shadcn/ui
- **状态**: Zustand
- **数据库**: SQLite

### Agent SDK
- **语言**: Python 3.10+
- **SDK**: Claude Agent SDK（Anthropic）
- **向量搜索**: FAISS / Chroma
- **嵌入模型**: sentence-transformers（all-MiniLM-L6-v2）
- **Skills**: 17+ 预制技能

### 云端服务（可选）
- **框架**: FastAPI
- **数据库**: PostgreSQL
- **实时通信**: WebSocket
- **部署**: Docker

## 项目结构

```
cks-lite/
├── README.md                     # 项目文档
├── docs/                         # 设计文档
│   ├── architecture.md          # 架构设计
│   ├── roadmap.md               # 开发路线图
│   └── memory-system.md         # 长记忆系统设计
│
├── desktop-app/                  # Tauri 桌面应用
│   ├── src/                     # React 前端
│   │   ├── components/          # UI 组件
│   │   ├── pages/               # 页面
│   │   ├── stores/              # Zustand 状态
│   │   ├── services/            # API 服务
│   │   └── App.tsx              # 应用入口
│   ├── src-tauri/               # Rust 后端
│   │   ├── src/                 # Rust 源码
│   │   └── tauri.conf.json      # Tauri 配置
│   ├── package.json
│   └── vite.config.ts
│
├── agent-sdk/                    # Python Agent SDK
│   ├── main.py                  # Agent 入口
│   ├── core/                    # 核心模块
│   │   ├── agent.py             # Agent 核心
│   │   ├── memory.py            # 长记忆系统
│   │   ├── skills_loader.py    # Skills 加载器
│   │   └── tools.py             # 工具函数
│   ├── skills/                  # 技能库（17+ 技能）
│   ├── models/                  # 数据模型
│   ├── requirements.txt
│   └── build/                   # 打包输出
│
├── cloud-service/                # 云端服务（可选）
│   ├── main.py
│   ├── api/                     # API 路由
│   ├── models/                  # 数据模型
│   ├── services/                # 业务逻辑
│   └── requirements.txt
│
├── mobile-app/                   # 手机端 H5（可选）
│   └── src/
│
└── .gitignore
```

## 快速开始

📚 **详细指南**: [QUICK_START.md](./QUICK_START.md)

### 前置要求
- Python 3.10+ （必需）
- Claude API Key （[获取地址](https://console.anthropic.com/)）
- Node.js 18+ （可选，用于桌面应用）
- Rust 1.70+ （可选，用于桌面应用）

### 快速体验（5 分钟）

```bash
# 1. 克隆项目
git clone https://github.com/P3ngSAM/cks-lite.git
cd cks-lite

# 2. 运行初始化脚本
# Windows
init-project.bat
# macOS/Linux
./init-project.sh

# 3. 配置 API Key
# 编辑 agent-sdk/.env，添加: ANTHROPIC_API_KEY=your_key_here

# 4. 启动 Agent SDK
cd agent-sdk
python main.py
# 服务运行在 http://127.0.0.1:7860

# 5. 测试对话
curl -X POST http://127.0.0.1:7860/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","message":"你好","use_memory":true}'
```

### 完整安装指南

详见 [QUICK_START.md](./QUICK_START.md)，包含：
- Agent SDK 安装与测试
- 桌面应用开发环境搭建
- 长记忆系统测试
- Skills 系统测试
- 常见问题解决

## 核心功能

### 目标管理
- **KPI**（顶层）- 关键绩效指标
- **OKR**（中层）- 目标与关键结果
- **项目**（中层）- 具体项目
- **任务**（底层）- 可执行任务

**层级关系**：
```
KPI
├── OKR
│   ├── 项目
│   │   ├── 任务
│   │   └── 任务
│   └── 项目
└── OKR
```

### Agent 工作台
- 多会话管理
- 流式对话输出
- 17+ Skills 触发
- 本地文件访问
- 联网搜索

### 长记忆系统
- **语义记忆**：向量搜索相似内容
- **工作记忆**：当前会话上下文
- **程序记忆**：用户偏好和习惯
- **自动增强**：对话自动检索相关记忆

### Skills 市场
- PPT 生成（pptx）
- Word 文档（docx）
- PDF 处理（pdf）
- Excel 表格（xlsx）
- 视频下载（gooddowner）
- 微信群助手（goodqunbot）
- 公众号发布（wechat-publisher）
- 视频转文字（video-transcribe）
- ... 更多

## 开发路线图

### v0.1.0 - MVP（4 周）
- [x] 项目初始化
- [ ] 基础 UI 框架
- [ ] SQLite 数据库
- [ ] 目标管理 CRUD
- [ ] Agent SDK 集成
- [ ] 长记忆系统
- [ ] Skills 加载器
- [ ] exe/dmg 打包

### v0.2.0 - 云端同步（3 周）
- [ ] 云端 API 服务
- [ ] 多人协作
- [ ] Agent 互联互通
- [ ] 像素风看板

### v0.3.0 - 远程控制（2 周）
- [ ] 手机端 H5
- [ ] 实时通知
- [ ] 任务下发

### v1.0.0 - 完整版（4 周）
- [ ] Computer Use
- [ ] Browser Use
- [ ] AI 应用生成
- [ ] 完整文档

## 长记忆系统架构

### 记忆类型

1. **语义记忆**（Semantic Memory）
   - 存储：向量数据库（FAISS）
   - 检索：余弦相似度搜索
   - 用途：找到相关的历史对话和知识

2. **工作记忆**（Working Memory）
   - 存储：内存（当前会话）
   - 用途：维持对话连贯性

3. **程序记忆**（Procedural Memory）
   - 存储：SQLite（用户偏好表）
   - 用途：记住用户习惯和设置

### 记忆流程

```
用户输入
   ↓
生成嵌入向量（sentence-transformers）
   ↓
向量搜索（FAISS Top-K）
   ↓
检索相关记忆
   ↓
构建增强上下文
   ↓
发送给 Claude Agent
   ↓
生成回复
   ↓
保存为新记忆
```

### 记忆检索策略

- **相似度阈值**: 0.7（余弦相似度）
- **检索数量**: Top 5
- **时间衰减**: 最近的记忆权重更高
- **用户反馈**: 用户可标记有用的记忆

## 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 开发流程
1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/AmazingFeature`）
3. 提交更改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 创建 Pull Request

### 代码规范
- TypeScript: ESLint + Prettier
- Python: Black + isort + mypy
- Rust: rustfmt + clippy

## 许可证

MIT License

## 联系方式

- 项目主页: [GitHub](https://github.com/P3ngSAM/cks-lite)
- 问题反馈: [Issues](https://github.com/P3ngSAM/cks-lite/issues)
- 文档: [Wiki](https://github.com/P3ngSAM/cks-lite/wiki)

## 致谢

- [Tauri](https://tauri.app/) - 轻量级桌面应用框架
- [Anthropic](https://www.anthropic.com/) - Claude API
- [FAISS](https://github.com/facebookresearch/faiss) - 向量搜索引擎
- [sentence-transformers](https://www.sbert.net/) - 嵌入模型

---

**Built with ❤️ by the CKS Team**
