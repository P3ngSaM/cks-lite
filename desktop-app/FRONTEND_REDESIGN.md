# CKS Lite - Frontend Design 重构方案

## 🎨 设计概念

### 核心设计方向
**Tone**: Modern Professional + Subtle Futuristic
**Key Feature**: 深色主题 + 青色强调 + 流畅动画
**Differentiation**: 三栏布局 + 独特字体组合 + 优雅的会话管理

---

## 🎯 视觉设计系统

### 字体系统
```css
/* Display/Headings */
font-family: 'Outfit', sans-serif;
font-weight: 700;

/* Body/Text */
font-family: 'Inter', sans-serif;
font-weight: 400-600;
```

### 配色方案
```css
/* 主色调 - 深蓝灰 */
--bg-primary: #0f172a    (slate-900)
--bg-secondary: #1e293b  (slate-800)
--bg-tertiary: #334155   (slate-700)

/* 强调色 - 活力青色 */
--accent: #06b6d4        (cyan-500)
--accent-hover: #0891b2  (cyan-600)

/* 文字 */
--text-primary: #f1f5f9  (slate-100)
--text-secondary: #cbd5e1 (slate-300)
--text-muted: #94a3b8    (slate-400)
```

### 动画效果
- **页面加载**: 从左/右滑入 (0.3s ease-out)
- **消息出现**: 缩放淡入 (0.3s ease-out)
- **会话切换**: 淡入淡出 (0.2s)
- **悬停效果**: 颜色过渡 (0.15s)

---

## 📐 布局结构

### 三栏式布局
```
┌────────────────────────────────────────────────────────┐
│  Sidebar    │    Chat History    │    Main Content    │
│  (80px)     │     (280px)        │      (flex-1)      │
├─────────────┼────────────────────┼────────────────────┤
│             │                    │                    │
│  [工作台]   │  [+ 新建对话]      │   对话消息区域      │
│  [记忆]     │                    │                    │
│  [技能]     │  对话1 (活跃)      │   AI: ...          │
│             │  对话2             │   用户: ...        │
│  [设置]     │  对话3             │                    │
│             │  ...               │   [输入框]         │
│             │                    │                    │
└─────────────┴────────────────────┴────────────────────┘
```

---

## 🎨 组件设计规范

### 1. 左侧导航栏 (Sidebar)
**宽度**: 80px
**背景**: slate-900 (#0f172a)
**布局**: 垂直居中图标

```tsx
// Icon Button样式
className="w-14 h-14 flex items-center justify-center rounded-xl
          text-slate-400 hover:text-cyan-400 hover:bg-slate-800
          transition-all duration-200
          relative group"

// Active State
className="text-cyan-400 bg-slate-800 shadow-lg shadow-cyan-500/20"
```

### 2. 对话历史侧边栏 (ChatHistory)
**宽度**: 280px
**背景**: slate-800 (#1e293b)
**分隔线**: slate-700 (#334155)

**新建对话按钮**:
```tsx
className="w-full px-4 py-3 rounded-xl
          bg-gradient-to-r from-cyan-500 to-cyan-600
          text-white font-semibold text-sm
          hover:from-cyan-600 hover:to-cyan-700
          transition-all duration-200
          shadow-lg shadow-cyan-500/30
          flex items-center justify-center gap-2"
```

**会话列表项**:
```tsx
// 普通状态
className="group px-4 py-3 rounded-lg cursor-pointer
          hover:bg-slate-700/50 transition-all duration-200
          border-l-2 border-transparent"

// 活跃状态
className="bg-slate-700/70 border-l-2 border-cyan-400"
```

### 3. 主对话区 (MainChat)
**背景**: slate-900 (#0f172a)
**最大宽度**: 900px (居中)

**消息气泡 - AI**:
```tsx
className="max-w-[80%] px-5 py-3.5 rounded-2xl rounded-tl-sm
          bg-slate-800 text-slate-100
          border border-slate-700
          shadow-md"
```

**消息气泡 - 用户**:
```tsx
className="max-w-[80%] px-5 py-3.5 rounded-2xl rounded-tr-sm
          bg-gradient-to-r from-cyan-500 to-cyan-600
          text-white
          shadow-lg shadow-cyan-500/30"
```

**输入框**:
```tsx
className="flex-1 px-5 py-3.5 rounded-xl
          bg-slate-800 text-slate-100
          border border-slate-700
          focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20
          placeholder:text-slate-500
          transition-all duration-200"
```

---

## 🎬 动画系统

### CSS Keyframes
```css
@keyframes slideInFromLeft {
  from { transform: translateX(-100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slideInFromRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
```

### 使用场景
- **侧边栏加载**: `animate-slide-in-left`
- **对话历史**: `animate-slide-in-left` + `animation-delay`
- **消息出现**: `animate-scale-in`
- **页面切换**: `animate-fade-in`

---

## 📱 响应式设计

### 断点
- **Desktop**: ≥ 1024px (三栏布局)
- **Tablet**: 768px - 1023px (隐藏对话历史，显示抽屉)
- **Mobile**: < 768px (全屏主内容，侧边栏抽屉)

### 适配策略
```tsx
// 对话历史在小屏隐藏
className="hidden lg:block w-[280px]"

// 移动端汉堡菜单
className="lg:hidden fixed top-4 left-4 z-50"
```

---

## 🎨 特殊效果

### 毛玻璃效果
```css
.glass {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(148, 163, 184, 0.1);
}
```

### 渐变文字
```css
.text-gradient {
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### 发光效果
```css
.glow {
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.3);
}
```

---

## 🔧 实现清单

### Phase 1: 核心布局 ✅
- [x] 更新全局样式（index.css）
- [x] 添加 Google Fonts (Outfit + Inter)
- [x] 创建 CSS 变量系统
- [x] 实现动画 keyframes

### Phase 2: 对话历史功能 (进行中)
- [ ] 创建 `ChatHistorySidebar.tsx` 组件
- [ ] 创建 `SessionList.tsx` 组件
- [ ] 创建 `SessionItem.tsx` 组件
- [ ] 实现新建对话功能
- [ ] 实现会话切换功能
- [ ] 实现会话删除功能

### Phase 3: 主对话区重构
- [ ] 重构 `Workbench.tsx` 三栏布局
- [ ] 重构 `Message.tsx` 新样式
- [ ] 重构 `ChatInput.tsx` 新样式
- [ ] 添加会话标题自动生成

### Phase 4: Memory & Skills 页面
- [ ] 重构 `Memory.tsx` 新配色
- [ ] 重构 `Skills.tsx` 新配色
- [ ] 统一卡片样式
- [ ] 统一按钮样式

### Phase 5: 细节优化
- [ ] 添加加载骨架屏
- [ ] 添加空状态插画
- [ ] 添加页面切换动画
- [ ] 优化移动端适配

---

## 🎯 关键改进点

### 1. 对话历史管理 ✨
**Before**: 单一对话，无历史记录
**After**:
- 左侧对话列表
- 快速切换会话
- 新建/删除对话
- 会话标题自动生成

### 2. 视觉层次 ✨
**Before**: 平面设计，层次不明显
**After**:
- 深色主题 + 青色强调
- 三栏布局清晰分隔
- 毛玻璃效果增加深度
- 渐变按钮吸引注意力

### 3. 交互体验 ✨
**Before**: 静态切换
**After**:
- 流畅的滑入/淡入动画
- 悬停状态反馈
- 加载状态指示
- 视觉焦点引导

### 4. 专业感 ✨
**Before**: 通用 UI
**After**:
- 独特字体组合 (Outfit + Inter)
- 精心设计的配色
- 一致的圆角和间距
- 细腻的阴影和边框

---

## 📦 组件文件结构

```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx           (左侧导航)
│   │   ├── ChatHistorySidebar.tsx (对话历史) NEW
│   │   └── MainLayout.tsx        (主布局)
│   │
│   ├── chat/
│   │   ├── Message.tsx           (消息气泡) UPDATED
│   │   ├── MessageList.tsx       (消息列表) UPDATED
│   │   ├── ChatInput.tsx         (输入框) UPDATED
│   │   ├── SessionList.tsx       (会话列表) NEW
│   │   └── SessionItem.tsx       (会话项) NEW
│   │
│   ├── memory/
│   │   ├── MemoryList.tsx        UPDATED
│   │   └── SearchBar.tsx         UPDATED
│   │
│   └── skills/
│       └── SkillsList.tsx        UPDATED
│
├── pages/
│   ├── Workbench.tsx             UPDATED
│   ├── Memory.tsx                UPDATED
│   └── Skills.tsx                UPDATED
│
└── index.css                     UPDATED
```

---

## 🎨 设计灵感来源

- **Midjourney Discord Bot** - 三栏布局，深色主题
- **Linear App** - 简洁专业，青色强调
- **Notion** - 侧边栏导航，流畅动画
- **ChatGPT** - 对话历史管理

---

## 📝 下一步行动

由于完整重构工作量较大，建议分步实施：

### 立即实施（当前）
1. ✅ 更新全局样式和字体
2. 创建对话历史侧边栏组件
3. 重构 Workbench 页面三栏布局

### 后续优化
4. 统一 Memory 和 Skills 页面配色
5. 添加更多动画效果
6. 优化移动端体验

---

**设计时间**: 2025-02-05
**设计师**: Frontend Design Skill
**主题**: Modern Professional Dark Theme
**主色**: Cyan (#06b6d4) + Slate
**字体**: Outfit + Inter
