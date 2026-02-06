# Goodable 功能融合方案

## 1. 融合概述

CKS Lite 将融合 Goodable 的核心能力，同时保持轻量级特性。

### 融合策略

| 模块 | Goodable | CKS Lite | 融合方式 |
|------|----------|----------|---------|
| **桌面框架** | Electron (~200MB) | Tauri (~10MB) | 保持 Tauri |
| **Skills 系统** | 双模式（AI+App） | 单模式（AI） | 融合双模式 |
| **预制应用** | 6+ 应用 | 无 | 复制核心应用 |
| **环境变量** | 中央管理 | 无 | 融合管理系统 |
| **应用生成** | 一键发布 | 无 | 融合生成能力 |
| **运行时** | 内置 Python/Node | 外部依赖 | 可选内置 |

---

## 2. 已融合的功能

### 2.1 Skills 双模式系统

**功能**：Skills 可同时作为 AI 调用和独立应用运行

**实现**：
- `has_skill`：检测 SKILL.md → 可被 AI 触发
- `has_app`：检测 template.json → 可作为应用运行
- `is_hybrid`：两者都有 → 混合模式

**文件**：`agent-sdk/core/skills_loader.py`

```python
class Skill:
    @property
    def is_hybrid(self) -> bool:
        """是否为混合模式（AI + App）"""
        return self.has_skill and self.has_app
```

---

### 2.2 配置管理系统

**功能**：统一的 Skills 配置格式

**格式**：
- `template.json`：Goodable 主配置（应用相关）
- `SKILL.md`：标准 Skill 定义（AI 触发相关）

**优先级**：
1. template.json（应用配置）
2. SKILL.md frontmatter（元数据）
3. SKILL.md body（AI 指令）

---

### 2.3 Skills 加载器

**功能**：自动扫描和加载 Skills

**特性**：
- ✅ 自动检测 Skills 目录
- ✅ 解析 template.json 和 SKILL.md
- ✅ 提取触发关键词
- ✅ 分类管理
- ✅ 搜索和过滤

**API**：
```python
skills_loader = SkillsLoader()

# 获取所有 Skills
skills = skills_loader.skills

# 搜索 Skills
results = skills_loader.search_skills(query="视频", category="工具")

# 根据关键词匹配
skill = skills_loader.get_skill_by_keyword("帮我下载视频")
```

---

## 3. 待融合的功能

### 3.1 优先级 1（核心功能）

#### 应用启动框架（preview.ts）
**功能**：启动和管理独立应用进程

**实现计划**：
```python
# agent-sdk/core/app_runner.py

class AppRunner:
    """应用运行器"""

    async def start_app(self, skill: Skill, port: int = None):
        """启动应用"""
        if skill.project_type == "python-fastapi":
            # 启动 FastAPI 应用
            process = subprocess.Popen([
                "python", "main.py"
            ], cwd=skill.path)

        elif skill.project_type == "nextjs":
            # 启动 Next.js 应用
            process = subprocess.Popen([
                "npm", "run", "dev"
            ], cwd=skill.path)

    async def stop_app(self, skill: Skill):
        """停止应用"""
        # 终止进程

    def get_running_apps(self) -> List[Dict]:
        """获取运行中的应用"""
        # 返回应用列表
```

**预计工作量**：2 天

---

#### 环境变量注入（env.ts）
**功能**：中央配置环境变量，运行时注入

**实现计划**：
```python
# agent-sdk/core/env_manager.py

class EnvManager:
    """环境变量管理器"""

    def __init__(self, config_path: Path):
        self.config = self._load_config(config_path)

    def get_env_for_skill(self, skill: Skill) -> Dict[str, str]:
        """获取 Skill 所需的环境变量"""
        env = {}

        for env_var in skill.env_vars:
            key = env_var["key"]
            value = self.config.get(key)

            if not value and env_var.get("required"):
                raise ValueError(f"缺少必需的环境变量: {key}")

            env[key] = value

        return env

    def inject_env(self, skill: Skill):
        """注入环境变量到 .env 文件"""
        env = self.get_env_for_skill(skill)
        env_file = skill.path / ".env"

        with open(env_file, "w") as f:
            for key, value in env.items():
                f.write(f"{key}={value}\n")
```

**预计工作量**：1 天

---

#### 路径配置管理（paths.ts）
**功能**：单一真实来源的路径管理

**实现计划**：
```python
# agent-sdk/core/paths.py

from pathlib import Path
import os

# 单一真实来源
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
SKILLS_DIR = Path(os.getenv("SKILLS_DIR", "./skills"))
PROJECTS_DIR = Path(os.getenv("PROJECTS_DIR", "./projects"))
TEMPLATES_DIR = Path(os.getenv("TEMPLATES_DIR", "./templates"))

# 确保目录存在
DATA_DIR.mkdir(exist_ok=True)
SKILLS_DIR.mkdir(exist_ok=True)
PROJECTS_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR.mkdir(exist_ok=True)
```

**预计工作量**：0.5 天

---

### 3.2 优先级 2（重要功能）

#### 项目管理（project.ts）
**功能**：管理用户创建的项目

**实现计划**：
- 项目 CRUD
- 项目状态跟踪
- 项目模板克隆

**预计工作量**：2 天

---

#### 时间线记录（timeline.ts）
**功能**：记录所有操作日志

**实现计划**：
- 操作日志记录（JSON + TXT）
- 时间线查询
- 日志导出

**预计工作量**：1 天

---

### 3.3 优先级 3（可选功能）

#### 数字员工系统（builtin-employees.json）
**功能**：预制角色提示词

**实现计划**：
- 复制 builtin-employees.json
- 集成到 Agent 系统提示词

**预计工作量**：0.5 天

---

#### 一键发布（aliyun.ts）
**功能**：发布应用到阿里云

**实现计划**：
- 阿里云 API 集成
- 自动化部署脚本
- 域名绑定

**预计工作量**：3 天

---

## 4. Skills 复制计划

### 4.1 核心应用（优先级 1）

#### 1. GoodDowner - 视频下载器
**路径**：`E:\Gitee-Project\goodable\apps\gooddowner`

**功能**：
- 支持 1000+ 视频网站
- 多画质选择
- 实时进度显示

**复用方式**：
```bash
# 复制到 cks-lite
cp -r E:/Gitee-Project/goodable/apps/gooddowner E:/GalaxyProject/cks-lite/agent-sdk/skills/

# 修改端口配置（避免冲突）
# gooddowner/main.py: port = 3102
```

**预计工作量**：0.5 天（测试和调整）

---

#### 2. Good 公众号发布
**路径**：`E:\Gitee-Project\goodable\apps\good公众号发布`

**功能**：
- 文章 CRUD
- Markdown 编辑
- 微信 API 集成
- 发布历史

**复用方式**：同上

**预计工作量**：1 天（集成微信 API）

---

#### 3. 视频转文字
**路径**：`E:\Gitee-Project\goodable\apps\抖音短视频转文字`

**功能**：
- 音频提取
- ASR 转写
- 时间戳定位

**复用方式**：同上

**预计工作量**：0.5 天

---

### 4.2 扩展应用（优先级 2）

#### 4. Coze2App
**路径**：`E:\Gitee-Project\goodable\apps\coze2app`

**功能**：
- Coze 工作流转网站
- OAuth 2.0 授权
- AI 对话界面

**复用方式**：同上

**预计工作量**：1 天

---

#### 5. 飞书文档转网站
**路径**：`E:\Gitee-Project\goodable\apps\feishu2app`

**功能**：
- 飞书文档解析
- 格式保留
- 知识库展示

**复用方式**：同上

**预计工作量**：1 天

---

#### 6. 微信群智能助手
**路径**：`E:\Gitee-Project\goodable\apps\goodqunbot`

**功能**：
- 群管理
- 消息记录
- AI 总结

**复用方式**：同上

**预计工作量**：1 天

---

## 5. 融合时间表

### Week 1（优先级 1 - 核心功能）
- [x] Skills 双模式系统
- [x] Skills 加载器
- [ ] 路径配置管理
- [ ] 复制 GoodDowner
- [ ] 复制视频转文字

### Week 2（优先级 2 - 应用管理）
- [ ] 应用启动框架
- [ ] 环境变量注入
- [ ] 复制公众号发布
- [ ] 项目管理

### Week 3（优先级 3 - 扩展功能）
- [ ] 复制 Coze2App
- [ ] 复制飞书转网站
- [ ] 复制微信群助手
- [ ] 时间线记录

### Week 4（测试与优化）
- [ ] 功能测试
- [ ] 性能优化
- [ ] 文档完善
- [ ] 用户测试

---

## 6. 风险与挑战

### 6.1 框架差异
**问题**：Goodable 基于 Electron，CKS Lite 基于 Tauri

**影响**：
- Node.js API 不可用
- 需要改造为 Rust API（Tauri Command）

**解决方案**：
- 创建兼容层
- 重写关键模块

---

### 6.2 包体积
**问题**：Goodable 内置 Python/Node 运行时，体积大

**影响**：
- CKS Lite 目标 < 50MB
- 内置运行时会增加 100MB+

**解决方案**：
- 运行时作为可选组件
- 用户自行安装 Python/Node

---

### 6.3 依赖管理
**问题**：Goodable 的应用依赖复杂

**影响**：
- Skills 需要各自的依赖
- 版本冲突风险

**解决方案**：
- 每个 Skill 独立虚拟环境
- 使用容器化（Docker）

---

## 7. 总结

### 已完成
- ✅ Skills 双模式系统设计
- ✅ Skills 加载器实现
- ✅ 配置管理系统设计

### 进行中
- 🔄 路径配置管理
- 🔄 应用启动框架
- 🔄 环境变量注入

### 待开始
- ⏳ Skills 复制
- ⏳ 项目管理
- ⏳ 一键发布

### 融合收益
- 🎯 获得完整的 Skills 生态
- 🎯 获得 6+ 预制应用
- 🎯 获得应用生成能力
- 🎯 保持 Tauri 轻量级优势

---

**预计总工作量**：15-20 天
**目标发布时间**：4 周后
