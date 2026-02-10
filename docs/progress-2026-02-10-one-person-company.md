# Progress Update 2026-02-10 01:30

## 本轮目标
- 补齐“一人公司”核心闭环的自动化回归测试，避免在持续迭代中回归。

## 本轮完成
- 新增 `agent-sdk/tests/test_goal_manager.py` 覆盖：
  - AI 员工 CRUD + 技能预设 CRUD（含组织隔离）；
  - 任务级 Agent 档案快照（task agent profile）写入与读取；
  - 主管调度跳过暂停员工；
  - 主管验收评分报告结构与分值行为。

## 验证结果
- `python -m unittest tests.test_goal_manager tests.test_skills_workbench_flow -v`（workdir: `agent-sdk`）通过。
- `npm run build`（workdir: `desktop-app`）通过。

## 结论
- 当前版本在“员工建模 -> 主管调度 -> 执行回写”关键链路的可回归性明显提升。
- 后续建议继续补一条端到端 UI 冒烟脚本（看板派单到 Workbench 收口）做演示前稳定性兜底。

## Continue 2026-02-10 02:00
- 新增端到端后端闭环测试：`agent-sdk/tests/test_one_person_company_flow.py`
  - 覆盖“主管调度跳过暂停员工 + 执行流状态写入 + 任务级员工档案 + 驳回后转人工 + 最终验收通过”。
- 验证结果：
  - `python -m unittest tests.test_one_person_company_flow tests.test_goal_manager tests.test_skills_workbench_flow -v` 通过。
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 02:30
- 新增一键 Demo 数据注入（后端）：
  - `GoalManager.clear_organization_data`：按组织清理目标链路、执行流、员工与技能预设数据。
  - `GoalManager.bootstrap_one_person_company_demo`：批量生成真实员工/技能预设/KPI-OKR-项目-任务，并预置验收通过+驳回样本。
  - 新增 API：`POST /goals/bootstrap/demo`（支持 `organization_id`、`owner_name`、`reset_existing`）。
- 测试补齐：
  - `tests.test_goal_manager` 新增 bootstrap 两条回归用例（创建校验 + reset 校验）。
- 验证结果：
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` 通过。
  - `python -m unittest tests.test_goal_manager tests.test_one_person_company_flow tests.test_skills_workbench_flow -v` 通过（25 tests）。
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 03:00
- 修复 `GET /goals/tasks` 时间筛选异常：
  - 问题：`from_time` 传入 `...Z`（UTC aware）时，和数据库里无时区时间比较会抛 `can't compare offset-naive and offset-aware datetimes`。
  - 处理：`GoalManager._parse_iso` 统一把时间归一化为“naive UTC”再比较。
- 增加回归测试：
  - `test_list_tasks_time_filter_accepts_utc_z`，覆盖浏览器常见 `ISO8601 + Z` 场景。
- 验证结果：
  - `python -m unittest tests.test_goal_manager -v` 通过（22 tests）。
  - `python -m py_compile agent-sdk/core/goal_manager.py` 通过。

## Continue 2026-02-10 03:15
- 补充跨时区偏移回归：
  - 新增 `test_list_tasks_time_filter_accepts_offset_timezone`，覆盖 `+08:00` 等 offset 输入。
- 验证结果：
  - `python -m unittest tests.test_goal_manager -v` 通过（23 tests）。

## Continue 2026-02-10 03:45
- 结合 OpenClaw 节点化思路，落地 CKS Node Registry 基础能力（P0 第一阶段）：
  - 新增核心模块：`core/node_registry.py`（SQLite 持久化节点注册、能力标签、状态与心跳）。
  - 新增 API：
    - `POST /nodes/register`
    - `GET /nodes`
    - `GET /nodes/{node_id}`
    - `POST /nodes/{node_id}/heartbeat`
    - `POST /nodes/{node_id}/status`
  - 新增请求模型：`NodeRegisterRequest`、`NodeHeartbeatRequest`。
  - 新增测试：`tests/test_node_registry.py`（注册/筛选/心跳更新）。
- 验证结果：
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/node_registry.py agent-sdk/models/request.py` 通过。
  - `python -m unittest tests.test_node_registry tests.test_goal_manager -v` 通过（26 tests）。

## Continue 2026-02-10 04:10
- 节点化执行继续推进（前后端打通第一版）：
  - `desktop-app` 新增节点类型与服务方法（list/register/heartbeat）。
  - Automation 页面新增“执行节点”视图：支持刷新、能力过滤、在线状态展示（online/busy/offline）。
  - 节点列表按组织读取（`cks.organizationId`），与看板组织隔离逻辑对齐。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/node_registry.py agent-sdk/models/request.py` 通过。
  - `python -m unittest tests.test_node_registry tests.test_goal_manager -v` 通过（26 tests）。

## Continue 2026-02-10 04:35
- 节点调度策略第一版：
  - 后端新增 `select_best_node`（按在线状态 + 能力匹配 + OS偏好打分）。
  - 新增 API：`POST /nodes/select`。
  - 新增请求模型：`NodeSelectRequest`。
  - 新增测试：`test_select_best_node_prefers_online_and_capability`。
- 前端 Automation 新增“自动选择节点”交互：
  - 可选择能力（desktop/terminal/vision/all）并自动选出执行节点；
  - 显示当前选中节点，作为后续执行调度目标。
- 验证结果：
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/node_registry.py agent-sdk/models/request.py` 通过。
  - `python -m unittest tests.test_node_registry tests.test_goal_manager -v` 通过（27 tests）。
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 05:00
- 节点执行链路继续打通：
  - `ChannelTaskDispatchRequest` 增加 `node_id`，支持渠道任务按节点提示执行。
  - `_dispatch_channel_task_internal` 支持执行节点提示注入，并将 `execution_node_id` 回写到任务结果。
  - Workbench 增加“执行节点绑定”上下文：从 Automation 写入 `cks.workbench.executionNodeId`，发送时自动注入节点执行提示。
  - Automation 联调派发时会携带选中节点。
- 验证结果：
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/node_registry.py agent-sdk/models/request.py` 通过。
  - `python -m unittest tests.test_node_registry tests.test_goal_manager -v` 通过（27 tests）。
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 05:20
- Board 一键发起执行接入“自动选节点”：
  - 根据员工角色/技能自动推断能力标签（desktop/terminal/vision）；
  - 发起执行前调用节点选择接口，选中后写入 `cks.workbench.executionNodeId`；
  - 同步把“节点上下文”注入任务 seed prompt，确保 Workbench 接棒时保持节点一致。
- 结果：老板看板 -> 数字员工 -> 节点执行 的链路进一步闭环。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 05:40
- Feishu 入站自动派发接入节点自动选择：
  - 新增渠道任务能力推断（desktop/terminal/vision）；
  - 若未显式指定 `node_id`，会根据任务语义 + 组织 + OS偏好自动挑选可用节点；
  - 自动派发与手动派发统一复用该逻辑。
- 渠道任务执行结果继续回写 `execution_node_id`，便于后续审计与看板展示。
- 验证结果：
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/node_registry.py agent-sdk/models/request.py` 通过。
  - `python -m unittest tests.test_node_registry tests.test_goal_manager -v` 通过（27 tests）。
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 06:00
- 节点执行结果可视化补齐（老板演示可见）：
  - Automation 会话卡片新增“节点”标签（取最新执行结果 `execution_node_id`）；
  - Automation 消息明细新增“执行节点”行；
  - Board 联调任务卡片新增“执行节点”展示（有值时显示）。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 06:20
- Workbench 头部信息层级优化：
  - 标题区新增核心上下文徽标（当前任务ID / 当前执行节点）；
  - 新增“清除节点绑定”按钮，避免错误节点上下文残留。
- 目的：减少顶部信息噪音，同时让用户在首屏就看到“当前在执行什么、由哪个节点执行”。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 06:45
- 前端全页面体验优化（第一轮）：
  - Workbench：小屏默认折叠顶部面板；头部改为自适应换行；在折叠态隐藏高级控制项，优先保证对话区高度与可读性。
  - Board：重构顶部操作区，保留“主管一键调度/模式切换/刷新”为主操作；新增“更多操作”折叠区承载主管目标、自动拉起、主管验收，避免按钮挤压。
  - Goals：顶部栏改为自适应布局，组织切换与设置区域支持换行，减轻窄屏拥挤。
  - Skills：页面高度适配父容器；头部改为响应式布局；内容区与容器宽度统一（`max-w-7xl`）。
  - Memory / Settings / Automation：统一主内容区边距与最大宽度（`p-4 md:p-6` + `max-w-6xl/7xl`），提升多页面视觉一致性。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 07:10
- 前端全页面体验优化（第二轮）：
  - Workbench：
    - 审批策略栏在“顶部折叠态”下改为精简模式（仅展示核心策略 + 待审批数量 + 审批中心入口）；
    - 展开态才显示全量策略控件，进一步降低首屏占用与操作噪音。
  - Board：
    - 顶部操作继续收敛为主次分离：保留主操作（主管一键调度），其余操作进入“更多操作”区；
    - 避免老板看板顶部按钮挤压，提升演示观感。
  - Goals：
    - 主体从固定 `12` 栏改为响应式（小屏单列、超宽屏 12 栏），在笔记本上更易读。
  - Automation：
    - 飞书配置区新增“展开配置/收起配置”，默认减少配置表单占屏；
    - 保留状态与刷新入口，降低页面初始复杂度。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 07:30
- 前端全页面体验优化（第三轮）：
  - 新增通用页面头组件 `PageHeader`，并先在 `Automation / Memory / Settings` 落地，统一标题、说明、操作区排版。
  - 新增统一状态元信息工具 `statusMeta`：
    - 任务状态标签与颜色统一（待执行/执行中/待审批/已暂停/已完成/失败/已取消）；
    - 节点状态标签与颜色统一（在线/繁忙/离线）。
  - Automation 页面改造：
    - 会话状态徽章与节点状态徽章改为统一映射，避免多处硬编码样式不一致。
    - 状态文案统一中文输出，降低演示时“风格不一致”的割裂感。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 07:55
- 前端全页面体验优化（第四轮）：
  - 页面头统一继续推进：
    - `Goals / Skills / Board` 头部接入 `PageHeader`，统一标题层级、图标和操作区布局；
    - 保留各页面原有业务操作，但操作组在视觉上更统一。
  - 状态语义统一继续推进：
    - Board 联调任务状态徽章接入 `statusMeta`，统一中文标签与颜色。
  - 组件能力增强：
    - `PageHeader` 支持 `className`，便于在像素风面板与常规面板复用同一结构。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 08:15
- 前端全页面体验优化（第五轮）：
  - 状态语义统一继续推进：
    - `statusMeta` 增加审批状态映射（待审批/已批准/已拒绝/已过期）；
    - Workbench 审批中心与审批历史改为统一状态徽章，不再使用页面内分散文案映射。
    - Board 审批快照与审批列表接入统一审批状态映射。
  - 页面头统一继续推进：
    - `Skills / Goals / Board` 接入 `PageHeader` 后继续细化复用；
    - `PageHeader` 增加 `className` 便于像素风面板复用。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 08:35
- 前端全页面体验优化（第六轮）：
  - Workbench 顶部控制继续“主次分离”：
    - 新增“更多设置”开关，响应策略/技能优先/严格模式移入二级区；
    - 顶部折叠时自动收起高级设置，减少首屏噪音。
  - Workbench 时间线状态统一：
    - 新增工具执行状态映射（执行中/成功/失败/待审批/已拒绝）；
    - 时间线按钮与详情使用统一状态徽章，提升可读性和一致性。
  - 状态工具继续增强：
    - `statusMeta` 补充 `getToolRunStatusMeta`，与任务/节点/审批状态映射形成统一体系。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 08:55
- 前端全页面体验优化（第七轮）：
  - Goals / Board 状态徽章统一：
    - Goals 任务树、任务表、任务详情抽屉接入统一任务状态与验收状态徽章；
    - Board 任务气泡和选中任务详情接入统一状态文案（任务状态 + 验收状态）。
  - 状态工具继续增强：
    - `statusMeta` 新增验收状态映射（待验收/已验收/已驳回）；
    - 任务状态、审批状态、工具执行状态、验收状态已形成统一映射体系。
  - Workbench 顶部“更多设置”模式保持，继续降低首屏控件密度。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 09:15
- 前端全页面体验优化（第八轮）：
  - 按钮密度继续收敛（Goals/Board）：
    - Goals 任务表保留“开始”为主按钮，将“详情回放/删除”收进“更多”菜单；
    - Board 任务气泡保留“发起执行”为主按钮，将“查看详情/设为下一任务”收进“更多”菜单。
  - 目标：减少表格与任务卡片横向按钮挤压，提高笔记本演示时的可读性。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 09:35
- 前端全页面体验优化（第九轮）：
  - 新增可复用 `MoreActions` 组件（统一“更多操作”交互：按钮 + 菜单 + 点击外部关闭）。
  - Goals/Board 接入 `MoreActions`：
    - Goals 任务表“更多”动作改为复用组件；
    - Board 任务气泡“更多”动作改为复用组件（保持像素风菜单样式）。
  - 目标：减少页面内重复交互实现，后续扩展与全站一致化更容易。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 09:55
- 前端全页面体验优化（第十轮）：
  - `Automation` 接入 `MoreActions`：
    - 飞书配置区将“诊断/测试/联调”并入“联调工具”菜单；
    - 保留“保存配置”为主按钮，减少配置区横向按钮拥挤。
  - `MoreActions` 复用范围扩大到 `Goals / Board / Automation`，统一“更多操作”交互与视觉节奏。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 10:15
- 前端全页面体验优化（第十一轮）：
  - Workbench 接入 `MoreActions`：
    - 审批工具栏将“刷新审批数据”收进“更多”菜单；
    - 审批历史筛选区将“导出 CSV”收进“更多”菜单。
  - 目标：继续减少工作台头部/工具栏按钮密度，保持“主操作清晰、次操作收纳”。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 10:35
- 前端全页面体验优化（第十二轮，精品化细节）：
  - 新增 `StatusBadge` 通用组件，统一小型状态徽章的结构与间距。
  - Goals / Board / Workbench 逐步接入：
    - Goals：任务树、任务表、任务详情抽屉的状态与验收标签统一；
    - Board：联调任务状态、审批状态统一；
    - Workbench：审批状态与工具执行状态统一。
  - `MoreActions` 细节增强：
    - 支持 `Esc` 关闭、点击外部关闭、`aria-expanded`/`aria-haspopup`，提升交互品质与可访问性。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 11:00
- 前端全页面体验优化（第十三轮，质量收尾）：
  - 修复 Skills 示例提示词乱码：
    - `handleRunExample` 的示例文案与兜底文案全部改为可读中文，避免工作台种子提示出现 `????`。
  - 新增统一空态/加载组件：
    - `EmptyState`、`SectionLoading` 落地并导出；
    - Goals / Skills 的“暂无数据”“加载中”改为统一组件样式。
  - 目标：提升一致性和成品感，减少“工程态页面”的割裂体验。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 11:25
- 前端全页面体验优化（第十四轮，精品化基线）：
  - 统一视觉 Token（`index.css`）：
    - 新增 `--surface-*` / `--focus-ring` 变量；
    - 新增 `cks-surface` / `cks-surface-subtle` / `cks-focus-ring` 公共样式，统一卡片底层质感与焦点反馈。
  - 组件层精品化：
    - `PageHeader` 统一采用 `cks-surface`；
    - `MoreActions` 增加可访问性与交互细节（Esc 关闭、aria 属性、背景模糊）。
    - 新增 `StatusBadge` 并在 Goals/Board/Workbench 继续落地。
  - 空态/加载态扩展：
    - Workbench 接入 `EmptyState`（审批区、时间线空态），避免“纯文本空态”。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 11:45
- 前端全页面体验优化（第十五轮，品牌质感）：
  - 新增 `StatTile` 统一统计卡组件，并在 Goals / Board 关键统计区落地，统一信息卡层级与排版节奏。
  - Workbench 链路上下文区细节优化：
    - 引入 `SectionLoading` 与状态徽章，减少“纯文本状态提示”。
  - 视觉质感增强：
    - `cks-surface` / `cks-surface-subtle` 增加统一阴影层级，页面卡片更有“成品感”。
  - 继续清理体验风险：
    - Skills 示例提示词已无乱码；Goals/Skills/Workbench 空态与加载态进一步统一。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 12:05
- 前端全页面体验优化（第十六轮，动效与一致性收口）：
  - 新增统一动效工具类（`cks-transition-fast` / `cks-transition-base` / `cks-hover-lift`），减少页面间动效风格差异。
  - 组件层统一过渡：
    - `PageHeader`、`MoreActions`、`StatusBadge`、`StatTile` 接入统一动效与交互反馈；
    - `MoreActions` 菜单展开加入一致过渡与半透明磨砂感。
  - Workbench 细节继续精品化：
    - 链路上下文加载改为 `SectionLoading`；
    - 任务状态与验收状态接入统一徽章映射，减少文本噪音。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 12:25
- 前端全页面体验优化（第十七轮，发布质感冲刺）：
  - 新增排版与按钮规范：
    - `cks-title-lg` / `cks-subtitle` 统一标题层级；
    - `cks-btn` / `cks-btn-secondary` / `cks-btn-primary` / `cks-btn-danger` 统一按钮规范。
  - 页面应用：
    - Goals 顶部“刷新 / 组织设置”接入统一按钮规范；
    - Workbench 顶部关键操作（折叠/设置/清除节点）接入统一按钮规范。
  - 视觉一致性继续加强：
    - 统一卡片/面板在共享 surface token 上过渡，减少“页面拼接感”。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 12:45
- 前端全页面体验优化（第十八轮，规范化完善）：
  - 新增全局规范类并落地：
    - 标题规范：`cks-title-lg` / `cks-subtitle`；
    - 按钮规范：`cks-btn` / `cks-btn-secondary` / `cks-btn-primary` / `cks-btn-danger`。
  - 页面应用：
    - Automation 顶部与飞书配置操作按钮接入统一按钮规范；
    - Skills 头部按钮接入统一按钮规范；
    - Goals / Workbench 顶部关键按钮继续切换到统一规范。
  - 目标：把“主次操作按钮”在视觉尺度、语义颜色、交互反馈上进一步拉齐。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 13:05
- 前端全页面体验优化（第十九轮，交互质感增强）：
  - 聊天体验优化：
    - MessageList 增加“AI 正在思考并执行中”粘性提示；
    - 当用户滚动离开底部时，提供“回到底部”快捷按钮。
  - ChatInput 按钮规范统一：
    - 上传/发送/停止按钮接入统一按钮规范类，交互反馈风格一致。
  - 规范应用扩展：
    - Automation / Skills 头部按钮持续替换到统一按钮体系。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。

## Continue 2026-02-10 13:25
- 前端全页面体验优化（第二十轮，发布前一致性巡检）：
  - 按钮语义规范继续扩展：
    - Automation 会话区/桌面自动化区的关键操作按钮切换到统一规范类；
    - Workbench/Goals/Skills 既有规范继续保持。
  - 聊天体验增强：
    - MessageList 增加“回到底部”与粘性执行提示，降低长对话场景的阅读负担。
  - 目标：发布前消除“局部样式游离”，确保主流程页面视觉语义一致。
- 验证结果：
  - `npm run build`（`desktop-app`）通过。


## Continue 2026-02-10 13:45
- ??????????????????????????????
  - Automation / Workbench / Goals / Board / Settings ????????????? `cks-btn` ??????/???/??????
  - `MoreActions` ???????????????????????????????????????
  - Goals ???????????????????????????????????????????
- ??????????????????????????????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 14:05
- ??????????????????????????
  - Memory ???????????? `cks-btn` ?????/??/??/???????????????
  - Skills ?????????? `cks-btn` ??????????????????????????????
  - ????????`pages/*.tsx` ??? `<button>` ????? `cks-btn` ???0 ??????????
- ??????????????????????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 14:30
- ????????????????????????
  - ???????????`cks-input` / `cks-select` / `cks-textarea`???????????????????
  - Goals / Workbench / Board / Automation / Skills / Memory / Settings ???????????????????
  - ??????????????????????????????????
- ??????? + ???????? UI ???????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 15:00
- ??????????????? -> ?Agent/SubAgent????
  - ??????AI????????`????`??
  - Board ???????????????????Agent ?? + SubAgent ??????
  - ??????????
    - ?Agent?????????
    - SubAgent ???????????????
    - ?????`????` / `???Ta`
  - ???? Agent ??????????? SubAgent??????????????/?????
  - ??????????????????????????????????
- ?????????AI?????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 15:15
- ????????????????????
  - ?????????????????????`pixelButtonClass` ?? `inline-flex + whitespace-nowrap + leading-none`?
  - ??????/?????????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 15:25
- ????????????
  - ??????????????????????`justify-between` ????
  - ?????? `right-0` ????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 16:00
- ?????????????????????
  - ?? `simpleMode`?????????????????????????
    - ?????????????
    - ?Agent??????
    - ??????????ID / SubAgent / ?? / ?????
  - ?????????????
    - ?????? `SubAgent | ???? | ??`??Agent???????
    - ???? Workbench?????????????????
  - ??????????????????????
  - ?????????????????? / ??????????
- UI ???????????????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 16:20
- ????????????????????
  - ??????????????Agent??????????? SubAgent?
  - ?????????????????????? plan ????
  - ????????????????????????????????
  - ?????????????????????? / ??????????????
  - ?????????12???????????????
- ???????????? -> ???? -> ??? -> ??????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 16:35
- ????????????-30%??
  - ?????????? + ???? + ???????
  - ????/????/??SubAgent????????????????????
  - ??????????? 10 ???????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 16:50
- ??????????????
  - ?? SubAgent ??????????????/??/?????????????/???/?????
  - ??????????? X / ?? Y??????????????????
- ?????????????????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 17:05
- ????????????
  - ????????????????????????????????????
  - ??????????????????7??????? `BOSS_MODE` ??????
  - ??????????????????????????????????
  - ???????? `BOSS_MODE` ????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 17:20
- ?????????????????
  - SubAgent ?????????????????
  - ??????????TA???????????????? `??? | ????`?
  - ??????????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 17:35
- ???????????
  - ??????????????/?PPT/???/?????
  - ?????????????? 3 ???????
  - ???????? 5 ?????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 17:50
- ??????????
  - ???????????????????????????????
  - ??????????????? SubAgent ?????????????????
  - ?????????????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 18:05
- ???????????????
  - ?????????????????????
    - ???? 3 ?????? SubAgent???/??/???
    - ??????????????
    - ??????????3???????
  - ???????????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 18:20
- ???????SubAgent????????????
  - ???????????????????????????
  - ???????
    - ?????plan/do/verify??????
    - ?????phase note?
    - ?????????/???
    - ??????????
  - ???????`/audit/executions`?`/audit/errors`?`/goals/task/{id}/execution/state`?
- ??????????? SubAgent ?????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 18:40
- ????????????
  - ???????????????????????? + ?????? SubAgent?
  - ???????????/??/????????????????????
  - ???????????????????????????????
- ?????
  - `npm run build`?`desktop-app`????


## Continue 2026-02-10 18:55
- ????????????????
  - ?? SubAgent ????? AI ???????????????????????
  - ???????????????????
- ?????
  - `npm run build`?`desktop-app`????

## Continue 2026-02-10 19:10
- Board 头像强化（本地 src/img）
  - 老板模式「数字员工沙盘」节点改为头像显示，保留空闲/忙碌/暂停状态徽标
  - 老板模式「SubAgent 状态看板」卡片统一使用本地头像池（按姓名稳定映射）
  - 高级看板员工卡也切换为本地头像，和老板模式视觉一致
- 验证
  - npm run build（desktop-app）通过

## Continue 2026-02-10 19:25
- 一人公司演示员工改为中文名字
  - 演示注入员工从英文名改为：苏知然、顾临川、林知夏
  - 保持角色/技能不变，便于中文场景录屏
- 验证
  - npm run build（desktop-app）通过

## Continue 2026-02-10 19:40
- 演示数据清理增强
  - 一键准备演示前，自动清理历史英文演示员工（Emma/Ryan/Olivia/Iris/Noah/Leo/Ava）
  - 再注入中文员工，避免页面中英文混杂
- 验证
  - npm run build（desktop-app）通过

## Continue 2026-02-10 20:00
- 清理一人公司演示数据并重置为中文员工
  - 删除当前 SubAgent（ai_employees）并清理历史老板模式测试任务（含 BOSS_MODE 与英文 assignee 残留）
  - 同步清理关联执行状态表：task_execution_events / task_execution_flows / task_agent_profiles / assignee_next_tasks
  - 注入 7 名中文 SubAgent：苏知然、顾临川、林知夏、周远航、许安然、王泽宇、陈语桐
- 验证
  - goals.db 校验：ai_employees=7、tasks=0（default-org）

## Continue 2026-02-10 20:20
- 修复老板模式“执行日志为空”的核心问题
  - 后端新增 ，读取 （phase/update/resume）
  - 前端日志弹层改为“审计日志 + 执行事件”合并展示，避免仅依赖 audit 文件导致空白
- 增加老板模式可见结果回流
  - 派发后自动推进计划（plan -> do -> verify -> done），并写入每阶段说明
  - 任务会自动进入“待验收”，可直接点击“验收通过/驳回返工”
- 验证
  - （desktop-app）通过
  -  通过

## Continue 2026-02-10 20:40
- �ϰ�ģʽ�������ӻ��޸�
  - ���� `resolveQuickJobStatuses`��������������������״̬���㣬���ٳ�ʱ����ʾ���Ŷ��С�
  - ��ʷ�������ʱҲִ��״̬���㣬���Ȿ�ػ���״̬����
  - ���鿴�������Ϊ�ڵ�ǰҳ��չ����־������������ת Goals ҳ��
- ��֤
  - `npm run build`��desktop-app��ͨ��

## Continue 2026-02-10 20:55
- ��������ť�������������
  - ȫ�ְ�ť��ʽ�� `white-space: nowrap`�����⡰�鿴���/����ͨ��/���ط��������ֻ���
  - �ϰ巴��״̬ͬ��ʱ����������ɾ�����Զ����б��Ƴ����������������
  - ������ǰ BOSS_MODE �������������ִ�м�¼
- ��֤
  - npm run build��desktop-app��ͨ��
  - goals.db У�飺deleted_boss_mode_tasks=6��remaining_tasks=0

## Continue 2026-02-10 21:10
- ����������Ӿ��Ż������˻���
  - ���ӡ�����Ӵ�Ա��С���֡�ͷ���뻰���������ϰ�ֱ���´�����
  - ��������Ϊ�ֲ㿨Ƭ��ģ���� + ���������Ķ���¼����������
  - ������ʾ��Ϊ����ʵսʾ����������������
- ��֤
  - npm run build��desktop-app��ͨ��

## Continue 2026-02-10 21:25
- ������������Ϊ������Ƭ��ģ�ͣ�ȥ�� textarea��
  - ÿ�ſ�ֱ����д��Ա���� / ������� / ���Ҫ��
  - ֧��������ɾ�����񿨣����Ա�����ɸ�TA�����Զ�������Ӧ��Ƭ
  - �ɷ��߼���Ϊ��ȡ�������ݲ���������
- ��֤
  - npm run build��desktop-app��ͨ��

## Continue 2026-02-09 20:45
- Skills ��װ
  - ��װ `tavily-search`����Դ `clawdbot/skills/skills/arun-8687/tavily-search`��
  - ��װ `proactive-agent-1-2-4`����Դ `clawdbot/skills/skills/bodii88/proactive-agent-1-2-4`��
  - ���� `agent-sdk/skills/.installed_skills.json`
- ��֤
  - `SkillsLoader` ɨ��ͨ�������� skill ����ʶ��

## Continue 2026-02-09 21:40
- ��������
  - ������ʷռλԱ���� `ǰ�˹���ʦAgent`
  - ������������Ա���أ�7�ˣ�������ʾ

## Continue 2026-02-09 21:55
- �ϰ�ģʽ�����Ż�
  - ������ť�����Ϊ�����в�֧�ֺ�����������ⰴť��ѹ����
  - ���鿴������������������չʾ�������/������/״̬/ִ��Ҫ��/ʵ��������
  - �����Դ�ں�ִ����־��׶�˵��������ֻ��ת�б�ҳ
- ��֤
  - npm run build��desktop-app��ͨ��

## Continue 2026-02-09 22:10
- �����������޸�
  - ״̬/�����и�Ϊ������չʾ�������ǩ����
  - �������������ʵ�ʲ������ݡ����飬��ȡִ�н׶�д��Ľṹ������
  - Boss ģʽ�������ʱ��д����ʵ�����ı�����PPT 8ҳ�ṹ�뽲���ģ�壩
- ��֤
  - npm run build��desktop-app��ͨ��

## 2026-02-09 进度更新（准确性与下载稳定性）
- Workbench/Agent：新增时效问题识别（今天/最新/热点/新闻等），这类问题会强制触发联网搜索。
- Workbench/Agent：对时效问题追加系统约束，要求回答必须带明确日期与至少 3 条来源链接；证据不足时先标注“待核验”。
- Board：修复任务产出下载链路，写文件返回 false 时不再静默成功，自动回退浏览器下载并提示用户。
- 验证：python -m py_compile agent-sdk/core/agent.py 与 
pm run build（desktop-app）均通过。

## 2026-02-09 性能优化（启动与响应提速）
- 默认响应策略提速：后端 ChatRequest 的 ast_mode 默认改为 	rue，未显式指定时统一走 fast。
- 工具预算收紧（减少卡顿长尾）：MAX_TOOL_ITERATIONS 默认 8（原 16），MAX_WEB_SEARCH_CALLS_PER_TASK 默认 1（原 2），AUTO_SEARCH_NUM_RESULTS 默认 3（原 5）。
- 渠道任务执行默认模式改为 ast，支持通过 CHANNEL_TASK_RESPONSE_MODE 覆盖。
- 启动提速：main.py 的 RELOAD 默认改为 0，避免每次启动都走 watchfiles 热重载扫描。
- 记忆系统改为懒加载嵌入模型：新增 MEMORY_LAZY_EMBEDDING_LOAD（默认开启），启动阶段不阻塞加载 embedding，首次记忆写入/检索再加载。
- 兼容性验证：python -m py_compile 通过（main/agent/memory/request）。
- Workbench 对话可读性优化：AI长段落自动分段显示（按句号/问号/感叹号/分号智能断行），避免一坨文字影响演示观感；Markdown结构内容保持原样。
- Workbench 流式体验优化：执行过程中新增“执行进度”分段（最近 5 条），如“开始执行/等待桌面执行/联网搜索完成”等，避免处理中内容挤成一段。
- 完成态收敛：任务结束后消息正文回归最终答案正文，进度提示不干扰最终可复制内容。
- Workbench 顶部区域收纳优化：当“顶部面板折叠”时，隐藏审批条、折叠状态条和技术详情区，仅保留右上角“展开顶部面板”按钮，释放对话可视高度。
- 设置页新增“首次初始化向导”：首次安装用户可按 4 步完成基础配置（后端启动、技能基线、飞书配置、联调冒烟），支持一键准备基础环境。
- 初始化向导可追踪进度并本地持久化（隐藏状态/联调完成状态），减少新用户首次使用成本。
- 后端启动重复初始化优化：main.py 在非 reload 模式下改为 uvicorn.run(app, ...)，避免 main:app 二次导入导致初始化日志与耗时重复。
- 启动性能可观测性增强：后端新增启动阶段耗时剖析（load_dotenv/core stores/skills+agent/deps/helpers 等），启动后输出分段耗时日志。
- 新增调试接口 GET /debug/startup-profile，可查看总耗时与各阶段明细，便于定位启动慢瓶颈。
- 启动提速开关：新增 CKS_DISABLE_EXTERNAL_SKILLS=1，可跳过 ~/.agents/skills 与 ~/.claude/skills 扫描，减少首次/冷启动耗时。
- 依赖检查提速：_check_office_deps 新增缓存与跳过开关。
  - CKS_SKIP_DEPS_CHECK=1 可直接跳过依赖检查。
  - 默认启用缓存（data/startup_deps_cache.json，TTL 默认 24h，可用 CKS_DEPS_CHECK_CACHE_TTL_SEC 调整）。
  - 命中缓存时直接跳过检查，显著降低冷启动时间中的 deps_checked 耗时。
- 设置页 Agent 健康卡新增“启动耗时剖析”可视化：读取 /debug/startup-profile，展示总耗时与最慢 4 个阶段，便于快速定位启动瓶颈。
- Agent 自治性增强（对齐 OpenClaw 方向）：
  - 系统提示词新增“自治执行协议”（先计划、缺信息先澄清、阶段汇报、失败替代方案、可验收交付）。
  - 新增模糊任务识别：当用户输入过短且语义模糊时，Agent 本轮优先输出任务理解 + 关键澄清问题，再进入执行。
- 自治执行第二轮：
  - Agent 增加复杂任务识别（_is_complex_task），复杂任务默认进入“自治模式”输出结构（任务理解/计划/进度/交付/验收）。
  - 流式通道新增 utonomy_status 事件，Workbench 会展示“自治规划中”等主动执行状态，增强“像数字员工在干活”的体感。
- 自治执行第三轮（向 OpenClaw 进一步对齐）：
  - 工具执行链路新增自治阶段事件：execute/verify/deliver，在工具熔断、搜索预算耗尽、搜索完成等关键节点主动汇报。
  - 复杂任务与模糊任务统一变量化（complex_task/clarify_needed），模糊任务默认关闭工具执行，先澄清关键输入再进入执行。
- 自治执行第四轮：
  - 新增可重试工具白名单（web_search/read_file/list_directory/get_file_info/capture_screen/analyze_screen 等），非桌面工具首次失败自动兜底重试一次。
  - 增加 allback 自治阶段事件：工具失败时主动汇报“正在切换替代方案/自动重试”，提升“主动干活”体感。
- 自治状态机落库（对齐 OpenClaw 控制平面思路）：
  - 新增 AutonomyStateStore（SQLite）持久化自治阶段事件（planning/clarify/execute/verify/fallback/deliver）。
  - Agent 的 utonomy_status 事件改为统一写库 + 流式下发。
  - 新增 API：GET /autonomy/events（按 session_id / goal_task_id 查询事件）。
  - 前端 AgentService 增加 listAutonomyEvents，为后续“自治执行回放”UI打基础。
- 自治执行回放前后端联动完成：
  - Workbench 新增自治事件拉取（/autonomy/events），按当前会话/任务展示“自治执行回放”。
  - 对话执行结束后自动刷新自治事件，形成可追踪的 planning→...→deliver 过程视图。
## Continue 2026-02-10 �������� OpenClaw�����λط���ǿ��
- ��������¼���ǿ
  - `ClaudeAgent._autonomy_status_chunk` ���� `seq` / `delta_ms` Ԫ���ݣ���д�� `autonomy.db`
  - ��ʽ `autonomy_status` ͬ������ `seq` / `delta_ms`������ǰ��ʵʱչʾִ�н���
- API ������ǿ
  - `GET /autonomy/events` ���� `stage` ���˲�����session + task + stage ��ϲ�ѯ��
- Workbench �ط�������ǿ
  - ���λط����ӡ�չ��/���𡱣�Ĭ�����𣩣����͹���̨��Ϣ����
  - �ط�չʾ���Ľ׶������滮/����/ִ��/У��/��·/������
  - �ط���չʾ�����׶μ����ʱ���� `#12 �� +840ms`��
  - ������ӳ���е������ı�ͳһ�޸���ϵͳƽ̨��Ϣ����Ӧ�á�������Ϣ�ȣ�
- ��֤
  - `python -m py_compile agent-sdk/core/agent.py agent-sdk/core/autonomy_state.py agent-sdk/main.py` ͨ��
  - `npm run build`��desktop-app��ͨ��
## Continue 2026-02-10 Workbench ���λطſ��ӻ����ڶ��֣�
- Workbench �������İ��޸�
  - �޸����λط����� `????` �İ�������/չ������/ժҪ��ǩ��
  - ͳһ����ʱ����ժҪ�İ�Ϊ���ģ������������μ��ء��������衢����������ǰ���衢���ֽ�����
- ���λط���ǿ
  - ���� `autonomyStageStats` �׶�ͳ�ƣ�fallback/clarify��
  - ժҪ����ʾ����·/���塱������ǿ�� OpenClaw �������ִ�пɹ۲���
  - �ط��б��а��׶���ɫ��fallback=���ꡢclarify=����������=��ɫ
  - �ط�����ʾ `�� #seq �� +delta_ms`�����ڿ����ж�ִ�н���
- ��֤
  - `npm run build`��desktop-app��ͨ��
  - `python -m py_compile agent-sdk/core/agent.py agent-sdk/core/autonomy_state.py agent-sdk/main.py` ͨ��
## Continue 2026-02-10 Workbench ���λطţ������֣�
- �������׶ο�Ƭ�����ӻ�
  - ���λط�չ���󶥲���ʾ 6 �׶μ��������滮/����/ִ��/У��/��·/������
  - �ϰ��һ���жϱ����Ƿ��ȳ��塢��ִ�С���󽻸���
- �������쳣��·��·��
  - ������ fallback �¼�ʱ��չʾ��� 6 ���쳣��·��·��ʱ�� + �İ���
  - ������ʾ Agent ���쳣ʱ�������������Իָ�����
- �ط���ϸǿ��
  - ��������ÿ���¼� `�� #seq �� +delta_ms` ������Ϣ
  - fallback/clarify �׶μ���������ɫ���������ϳɱ�
- ��֤
  - `npm run build`��desktop-app��ͨ��
  - `python -m py_compile agent-sdk/core/agent.py agent-sdk/core/autonomy_state.py agent-sdk/main.py` ͨ��
## Continue 2026-02-10 ���� OpenClaw����Agent����ʱ V1��
- �����������Agent����ʱ������ģ�ͣ�����ֻ��״̬�ֶΣ�
  - goals.db ��������`task_subagent_runs`��`task_subagent_run_events`
  - ֧�� run ��״̬��queued/running/succeeded/failed/cancelled
  - ֧�ֽ׶��¼���planning/clarify/execute/verify/fallback/deliver
- ������Agent����ʱ API
  - `POST /goals/task/{task_id}/subagent-runs/spawn`���첽�������������� run��
  - `GET /goals/task/{task_id}/subagent-runs`������ά�� run �б���
  - `GET /goals/subagent-runs/{run_id}`��run ״̬��
  - `GET /goals/subagent-runs/{run_id}/events`��run �¼��طţ�
  - `POST /goals/subagent-runs/{run_id}/control`����ǰ֧�� cancel��
- ��Agentִ���ںˣ���̨�첽��
  - spawn ��ͨ�� `asyncio.create_task` �����ִ̨�У����� OpenClaw �������ӻỰ˼·��
  - �Զ�д��ִ�н׶κͻط��¼�����ɺ���� result_text��ʧ�ܽ��� fallback �¼�
  - ֧�ֶ�ȡ���� agent profile��preferred_skill/skill_strict/seed_prompt������ִ��
- ǰ�� SDK ����
  - `AgentService` ������Agent run �� spawn/list/get/events/cancel ����
  - `types/agent.ts` ���� `GoalSubagentRun*` ����
- ����
  - ���� `agent-sdk/tests/test_subagent_runs.py` ���� run ��������
  - ��֤ͨ����
    - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py`
    - `python -m unittest agent-sdk/tests/test_subagent_runs.py`
    - `npm run build`��desktop-app��
## Continue 2026-02-10 ���� OpenClaw���ϰ忴�������ʵ��Agent����ʱ��
- Board �ӡ�ģ���������ڡ��л�Ϊ��ʵ�����Agent����
  - һ���ɵ�/��������󣬲��ٱ���α��׶��ƽ�
  - ��Ϊ���� `spawnTaskSubagentRun` ������̨ run���첽��
  - ���񿨱��� `subagentRunId` / `subagentRunStatus`������״̬����
- �ϰ忴��״̬�ж�����
  - `resolveQuickJobStatuses` ���� `listTaskSubagentRuns(taskId, limit=1)`
  - ���Ȱ����� run ״̬���±�ǩ���Ŷ��� / ִ���У�subagent�� / ִ��ʧ�� / ��ȡ��
  - run �ɹ�������չʾ `result_text` ��ΪժҪ
- ��־������ run �¼�
  - `loadQuickJobLogs` ������ȡ���� run + run events
  - �� run events ӳ�䲢�ϲ���ִ����־����`subagent:<stage>`��
  - ������ `result_text` ʱ�Զ�ע�롰ʵ�ʲ�������¼���������н��������ȡ�߼�
  - ��־������ `SubAgent Run: <run_id> (status)` �� `��Agent�쳣` չʾ
- ��֤
  - `npm run build`��desktop-app��ͨ��
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` ͨ��
  - `python -m unittest agent-sdk/tests/test_subagent_runs.py` ͨ��
## Continue 2026-02-10 ������������޸������ı�+Markdown��
- �޸������б����ı���ѹ
  - ��������Ϊ `truncate + title` ��ʾ
  - �ƻ�/��ע/�����Ϣ�������߶���ֲ��������������гű�
- �޸����鿴����������޷�����
  - ������������ `max-h` + `overflow-hidden`
  - ���������� `max-h` + `overflow-y-auto`
- �������֧�� Markdown ��Ⱦ
  - ���� `react-markdown + remark-gfm`
  - ִ��Ҫ��/ʵ��������/ʵ�ʲ������ݸ�Ϊ Markdown ��Ⱦ
  - ���ӱ���/�б�/������ʽӳ�䣨h1/h2/h3/ul/ol/code��
- ��֤
  - `npm run build`��desktop-app��ͨ��
## Continue 2026-02-10 一人公司中区宽度优化
- 简化模式下中区任务编排模块新增内层宽度约束
  - 在老板派单区域新增 `mx-auto w-full max-w-5xl` 容器
  - 项目选择/高级参数/任务接待员/任务输入卡/派发按钮整体收窄，避免占满主区域
- 保持状态沙盘与员工看板全宽展示
  - 上方“数字员工沙盘 + 状态看板”仍保持可视范围，核心操作区居中聚焦
- 验证
  - `npm run build`（desktop-app）通过
- 调整一人公司中区宽度（按你的反馈改大）
  - 将中区约束从 `max-w-5xl` 放宽到 `max-w-7xl`，让任务编排区域占据更大可视宽度
  - 位置：`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- 宽度问题二次修正（这次改外层而非仅中层）
  - 简化模式最外层容器从 `max-w-7xl` 调整为 `max-w-[1560px]`，整体内容区显著变宽
  - 中区任务编排容器改为 `max-w-none`，不再被二次限制
  - 文件：`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- 一人公司老板模式交互重构（按你的新要求）
  - 合并“数字员工沙盘”与“SubAgent状态看板”为单一入口，移除下方独立状态卡片区
  - 沙盘顶部保留空闲筛选与统计，点击小人不再直接加任务，改为打开员工详情弹窗
- 新增员工详情弹窗（沙盘点击触发）
  - 展示：员工头像/状态/角色/主技能/技能栈/特长/任务统计
  - 展示该员工近期任务（状态、验收、更新时间、结果摘要）
  - 提供“派给TA”按钮，一键将任务卡写入派单输入区
  - 文件：`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- 任务分发模块重新设计（简化）
  - 去掉“接待员大段说明 + 重复参数区”，改为单卡片「任务分发中心」
  - 顶部只保留：模板快捷按钮 + 一键填充演示任务
  - 中部仅保留：项目选择 + 高级参数开关（默认折叠）
  - 高级参数折叠后再显示：验收人、统一要求、全员并行
  - 下方保持任务卡列表与并行派发按钮，但层级更清晰、文案更短
  - 文件：`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- SubAgent 通用能力增强（向“真实员工”靠齐）
  - 子Agent Prompt 升级为“通用执行模式”：允许主动使用联网搜索/文件/桌面/技能工具，不够则先 `find_skills` 再 `install_skill` 后继续执行
  - 子Agent 输出结构统一为：执行计划、关键过程、最终交付、验收清单
  - 按任务复杂度自动选择执行强度：`balanced/deep`
  - 当首轮结果过短或为空时自动二次补全（deep 模式继续执行），减少“只给建议不交付”的情况
  - 记录更多运行事件元数据：技能策略、响应模式、补全原因
- Agent 新增内置工具
  - 新增 `install_skill`（模型可在运行中安装技能），安装后自动刷新技能清单与来源标注
  - 文件：`agent-sdk/core/agent.py`、`agent-sdk/main.py`
- 验证
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/agent.py` 通过
  - `python -m unittest agent-sdk/tests/test_subagent_runs.py` 通过
- 分发任务卡交互优化（更贴近真实任务单）
  - 员工名输入改为下拉选择（默认“自动分配员工” + 可选当前激活员工）
  - 任务卡字段改为四段：员工、任务内容详情、输入信息、期望输出
  - 让 Agent 明确知道“给了什么输入、要什么输出”，避免只写标题导致执行偏差
  - 派发时会自动把输入/输出拼装到执行要求中：`输入信息` + `期望输出` + `统一要求`
  - 文件：`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- 继续简化分发区
  - 移除“更多设置”按钮与对应展开面板
  - 分发区保留最小必要项：项目选择 + 任务卡 + 一键执行
  - 文件：`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- 一人公司页面继续减负（按“只有老板+AI员工派单”思路）
  - 移除老板模式页头的“演示按钮/进入高级看板”入口
  - 移除任务分发区的“更多设置”入口与演示填充逻辑
  - 页面仅保留核心路径：选项目 -> 填任务卡 -> 一键执行 -> 查看回流结果
  - 文案改为更拟人表达（你是老板，AI员工执行）
  - 文件：`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- 老板模式补上“新增员工”入口（简单可用）
  - 在沙盘右上角新增“新增员工”按钮
  - 新增模态框：岗位模板、员工姓名、岗位/职责、主技能、技能组合（可下拉选择 skills）
  - 确认后直接调用现有员工创建逻辑，并自动关闭弹窗
  - 文件：`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- 任务卡支持“按任务绑定项目”
  - 每张任务卡新增“项目”下拉，可绑定不同项目
  - 顶部项目选择改为“默认项目（可选）”
  - 派发逻辑：优先使用任务卡项目；未选时回退到默认项目
  - 提示文案同步更新，避免理解偏差
- 任务卡字段现为：项目、员工、任务内容详情、输入信息、期望输出
  - 更符合“在这里创建任务并直接落库”的使用方式
  - 文件：`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- 增加“交付文件保存目录”可配置
  - 设置页新增输入项：交付文件保存目录（支持留空走默认）
  - 保存时写入本地配置键：`cks.settings.deliverableDir`
  - 老板看板下载 Word/PPT/TXT 时优先使用该目录，未配置再回落系统默认目录
  - 文件：`desktop-app/src/pages/Settings.tsx`、`desktop-app/src/pages/Board.tsx`
- 验证
  - `npm run build`（desktop-app）通过
- 对齐 OpenClaw 思路继续推进（执行协议 V2）
  - 子Agent结果新增结构化校验：必须包含“执行计划 / 关键执行过程 / 最终可交付结果 / 验收清单”四段
  - 若首轮结果为空、过短或不结构化，自动触发二次补全（deep 模式）
  - 二次补全事件写入 run events，包含是否具备结构化章节、工具调用数等元数据
  - 文件：`agent-sdk/main.py`
- 验证
  - `python -m py_compile agent-sdk/main.py` 通过
  - `python -m unittest agent-sdk/tests/test_subagent_runs.py` 通过
- 对齐 OpenClaw：补上子Agent风险审批闸门（安全策略化）
  - 新增任务风险评估：low/medium/high（依据任务语义关键词）
  - 默认对 high 风险任务先创建审批单，再执行子Agent
  - 若审批 denied/expired/超时，run 直接取消并写入事件日志，不再盲目执行
  - 审批等待事件会写入 run events（包含 approval_id / risk_reason / timeout）
  - 文件：`agent-sdk/main.py`
- 可配置项（环境变量）
  - `SUBAGENT_APPROVAL_LEVELS`：需要审批的风险级别（默认 `high`）
  - `SUBAGENT_APPROVAL_TIMEOUT_SEC`：审批等待超时（默认 `120`）
  - `SUBAGENT_AUTO_APPROVE`：是否跳过审批（默认 `0`）
- 验证
  - `python -m py_compile agent-sdk/main.py` 通过
  - `python -m unittest agent-sdk/tests/test_subagent_runs.py` 通过
- 对齐 OpenClaw：补上执行重试与降级策略（Retry + Fallback）
  - 子Agent执行新增可配置重试策略：失败自动重试，最后一次自动提升到 deep 模式
  - 每次失败写入 run events（attempt/response_mode/error），便于老板看板追踪“失败后如何恢复”
  - 重试成功后写入恢复事件，增强执行可观测性
  - 新增环境变量：
    - `SUBAGENT_EXEC_MAX_ATTEMPTS`（默认 2）
    - `SUBAGENT_EXEC_BACKOFF_SEC`（默认 1.5）
  - 文件：`agent-sdk/main.py`
- 验证
  - `python -m py_compile agent-sdk/main.py` 通过
  - `python -m unittest agent-sdk/tests/test_subagent_runs.py` 通过
- 对齐 OpenClaw：补上技能工具“自动换路”能力（Auto Route Fallback）
  - 当 skill tool 执行失败时，先做原工具重试；仍失败则自动尝试同技能下的候选工具
  - 若自动换路成功，结果会标注 `policy_fallback_from` / `policy_fallback_tool`
  - 若仍失败，会返回 `fallback_candidates` 供后续继续决策
  - 新增环境变量：`SKILL_TOOL_AUTO_FALLBACK`（默认 1）
  - 文件：`agent-sdk/core/agent.py`
- 对齐 OpenClaw：补上“严格技能约束失败自动降级”
  - 子Agent在 `skill_strict=true` 且指定技能不可用时，自动切换通用模式（deep）继续执行
  - 避免因技能缺失直接终止任务，提升任务收口率
  - 文件：`agent-sdk/main.py`
- 验证
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/agent.py` 通过
  - `python -m unittest agent-sdk/tests/test_subagent_runs.py` 通过
- 对齐 OpenClaw：子Agent交付增加“执行摘要卡”（可观测性标准化）
  - 在最终结果前自动注入“执行摘要卡”：负责人/目标/风险等级/执行模式/重试次数/工具调用数/自动恢复标记
  - 让老板看板看到的不再是纯文本结果，而是可复盘的标准交付结构
  - verify/deliver 事件 payload 追加关键运行指标（attempt/tool_calls/used_repair/strict_downgraded）
  - 文件：`agent-sdk/main.py`
- 验证
  - `python -m py_compile agent-sdk/main.py` 通过
  - `python -m unittest agent-sdk/tests/test_subagent_runs.py` 通过
- 对齐 OpenClaw：新增“软超时预警 + 硬超时中断”执行治理
  - 子Agent调用模型时增加双阈值超时策略：
    - 软超时：仅告警并继续等待（写入 run events）
    - 硬超时：取消本次调用并进入失败恢复
  - 新增环境变量：
    - `SUBAGENT_SOFT_TIMEOUT_SEC`（默认 45）
    - `SUBAGENT_HARD_TIMEOUT_SEC`（默认 120）
  - 文件：`agent-sdk/main.py`
- 对齐 OpenClaw：失败后生成“执行失败恢复卡”
  - run 失败时不只给 error_text，还写入结构化恢复卡（目标/风险/尝试次数/工具调用/下一步建议）
  - 老板看板可直接看到可执行的修复建议，而不是一条报错
  - 文件：`agent-sdk/main.py`
- 验证
  - `python -m py_compile agent-sdk/main.py` 通过
  - `python -m unittest agent-sdk/tests/test_subagent_runs.py` 通过

- OpenClaw alignment: one-person-company board added quick control actions
  - Added quick actions in simple mode control panel: 待审批>0 显示“去审批中心”, 失败任务>0 显示“查看失败任务”
  - Added event badges: 规划 / 执行 / 验收 / 恢复 / 交付 / 审批
  - Combined event feed sources: approvals + task statuses + latest run logs, sorted by time
  - File: `desktop-app/src/pages/Board.tsx`
- Validation
  - `npm run build` (desktop-app) passed

- OpenClaw alignment: simple control feed adds one-click actions
  - Added item-level action buttons in control feed
  - For approval events: one-click go to approval center
  - For task events: one-click view result; fallback events add one-click retry
  - File: `desktop-app/src/pages/Board.tsx`
- Validation
  - `npm run build` (desktop-app) passed
