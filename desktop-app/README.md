# CKS Lite - Desktop App

CKS Lite是一个轻量级AI工作台桌面应用，基于Tauri 2.x + React 19构建。

## 前置条件

在开发和构建应用之前，请确保安装以下工具：

### 1. Rust（必需）

Tauri使用Rust构建桌面应用程序。

**安装方式**：
- 访问 [https://rustup.rs/](https://rustup.rs/)
- 下载并运行rustup-init.exe
- 按照提示完成安装

**验证安装**：
```bash
rustc --version
cargo --version
```

### 2. Visual Studio Build Tools（Windows必需）

**安装方式**：
- 下载 [Visual Studio Build Tools](https://aka.ms/vs/17/release/vs_BuildTools.exe)
- 安装时选择 "Desktop development with C++" 工作负载
- 确保包含 MSVC 和 Windows SDK 组件

### 3. Node.js 和 pnpm（已安装）

- Node.js 22.19.0 ✓
- pnpm 10.28.1 ✓

### 4. Agent SDK（后端服务）

确保Agent SDK服务正在运行：
```bash
cd ../agent-sdk
python main.py
```

服务应该运行在 http://127.0.0.1:7860

## 开发

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm tauri dev
```

这将：
1. 启动Vite开发服务器（React前端）
2. 编译Rust后端
3. 启动Tauri应用窗口

### 构建生产版本

```bash
pnpm tauri build
```

生成的安装包位于 `src-tauri/target/release/bundle/`

## 项目结构

```
desktop-app/
├── src/                    # React前端源代码
│   ├── components/         # React组件
│   │   ├── layout/         # 布局组件（Sidebar, Header）
│   │   └── ui/             # UI组件（Toast, Modal）
│   ├── pages/              # 页面组件
│   │   ├── Workbench.tsx   # 工作台（对话）
│   │   ├── Memory.tsx      # 记忆管理
│   │   └── Skills.tsx      # 技能管理
│   ├── services/           # 服务层
│   │   ├── tauriService.ts # Tauri IPC调用
│   │   └── agentService.ts # Agent SDK HTTP客户端
│   ├── stores/             # Zustand状态管理
│   ├── types/              # TypeScript类型定义
│   ├── utils/              # 工具函数
│   ├── App.tsx             # 应用入口
│   ├── main.tsx            # React挂载点
│   └── index.css           # 全局样式
├── src-tauri/              # Tauri后端（Rust）
│   ├── src/
│   │   ├── main.rs         # Rust入口
│   │   └── lib.rs          # Tauri命令处理
│   ├── Cargo.toml          # Rust依赖
│   ├── tauri.conf.json     # Tauri配置
│   └── build.rs            # 构建脚本
├── package.json            # Node依赖
├── vite.config.ts          # Vite配置
├── tailwind.config.js      # Tailwind CSS配置
└── tsconfig.json           # TypeScript配置
```

## 技术栈

### 前端
- **React 19** - UI框架
- **TypeScript 5.9** - 类型安全
- **Vite 7.3** - 构建工具
- **Tailwind CSS 3.4** - 样式框架
- **Zustand 5.0** - 状态管理
- **React Router 7.13** - 路由
- **Lucide React** - 图标库

### 桌面框架
- **Tauri 2.2** - 跨平台桌面框架
- **Rust 1.70+** - 后端语言

### 后端服务
- **Agent SDK** - FastAPI + Claude Agent SDK
- **端口**: 7860

## 功能特性

### MVP版本（当前开发中）
- [x] 基础项目结构
- [x] Tauri后端初始化
- [x] Agent SDK HTTP客户端
- [ ] 工作台对话界面
- [ ] 长记忆管理
- [ ] Skills技能系统
- [ ] 深色模式支持

### 未来版本
- [ ] 系统托盘
- [ ] 本地数据持久化
- [ ] 快捷键支持
- [ ] 多语言支持
- [ ] 目标管理（KPI/OKR）

## 开发指南

### 调用Tauri命令（从React）

```typescript
import { TauriService } from './services/tauriService'

// 检查Agent SDK状态
const status = await TauriService.checkAgentStatus()

// 获取健康信息
const health = await TauriService.getAgentHealth()
```

### 调用Agent SDK API（HTTP）

```typescript
import { AgentService } from './services/agentService'

// 发送对话消息
const response = await AgentService.chat({
  user_id: 'user123',
  message: 'Hello, CKS!',
  use_memory: true
})

// 流式对话
for await (const chunk of AgentService.chatStream(request)) {
  console.log(chunk)
}

// 搜索记忆
const memories = await AgentService.searchMemories('user123', 'query', 5)

// 列出Skills
const skills = await AgentService.listSkills()
```

### 状态管理（Zustand）

```typescript
import { create } from 'zustand'

interface ChatStore {
  messages: Message[]
  addMessage: (message: Message) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
}))
```

## 故障排除

### 1. "rustc: command not found"

安装Rust：https://rustup.rs/

### 2. "Visual Studio Build Tools not found"

安装VS Build Tools：https://aka.ms/vs/17/release/vs_BuildTools.exe

### 3. "Agent SDK连接失败"

确保Agent SDK正在运行：
```bash
cd ../agent-sdk
python main.py
```

### 4. "端口1420已被占用"

修改 `vite.config.ts` 中的端口号，或关闭占用1420端口的程序。

### 5. Tauri开发服务器无法启动

尝试清理并重新构建：
```bash
cd src-tauri
cargo clean
cd ..
pnpm tauri dev
```

## 性能目标

- 应用启动时间: < 3秒
- 内存占用: < 200MB
- 安装包大小: < 50MB（不含Agent SDK）
- 对话响应延迟: < 1秒

## 许可证

Copyright © 2026 CKS Team
