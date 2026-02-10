# Progress Update 2026-02-08 00:20

## 本次目标
- 强化 Skills 在 Workbench 的可控性（严格模式）与可解释性（策略阻断可视化）。
- 增加回归测试，避免后续迭代把严格模式流程改坏。

## 已完成
- 新增后端测试：`agent-sdk/tests/test_skill_strict_mode.py`
  - `strict + 未安装技能`：流式返回 `skill_policy` 错误并结束。
  - `strict + 已安装技能`：`force_only` 仅保留用户指定技能。
- Workbench 增加技能策略阻断提示条：
  - 当收到 `skill_policy` 且失败时，顶部出现中文告警。
  - 支持“一键关闭严格模式”和“收起提示”。
  - 流式状态文案同步更新为“技能策略阻断，等待调整”。

## 验证结果
- `python -m unittest agent-sdk.tests.test_skill_strict_mode -v` ✅
- `python -m unittest agent-sdk.tests.test_agent_guards agent-sdk.tests.test_skills_workbench_flow -v` ✅
- `npm run build`（`desktop-app`）✅

## 下一步建议
- 扩展 Skills 页“示例任务”模板覆盖更多热门技能（安装后可一键演示）。
- Workbench 增加“本轮技能决策说明”（为何命中/为何降级）小面板，提升演示说服力。

## 继续推进（2026-02-08 00:45）
- Skills 页“示例任务”已扩展为“精确映射 + 关键词兜底”两级策略：
  - 精确映射：`demo-office-assistant`、`find-skills`、`openai-docs`、`security-best-practices`、`playwright`、`screenshot`、`github` 等。
  - 关键词兜底：browser/playwright、excel/sheet、email/mail、pdf/doc、terminal/shell、image/vision、search/web/crawl。
- Workbench 新增“本轮技能决策说明”信息条：
  - 自动解释是否指定技能、是否开启严格模式、命中技能、失败次数、降级次数与策略拦截提示。
  - 目标是让演示时观众能直接看懂“为什么调这个技能、为什么降级”。

## 继续推进（2026-02-08 01:10）
- 目标管理与老板看板开始对齐“每人 KPI/OKR 可见性”：
  - 后端 `get_dashboard_data` 现在按负责人聚合并返回 `kpi_titles` / `okr_titles`。
  - 看板表格模式新增 `KPI / OKR` 列，可快速看每位负责人的目标归属。
  - 看板游戏模式与负责人详情新增 KPI/OKR 展示，支持演示“组织视角追踪”。
- 对应测试已补充：
  - `test_dashboard_data_summary_and_owner_rows` 新增 KPI/OKR 断言，防止回归。

## 继续推进（2026-02-08 01:35）
- 老板看板（Board）完成一轮“像素风游戏化”视觉改造（演示优先）：
  - 默认进入游戏模式（负责人像素小人视图优先）；
  - 页面背景升级为像素网格底纹；
  - 卡片/面板/按钮/输入框统一改为像素块风格（方角 + 粗边框 + 像素阴影）；
  - 表格模式与负责人详情面板同步套用像素化视觉语言，整体风格更统一。
- 验证：
  - `npm run build`（desktop-app）通过；
  - `python -m unittest agent-sdk.tests.test_goal_manager -v` 通过。

## 继续推进（2026-02-08 02:05）
- 组织级目标隔离（MVP）已打通：
  - 目标数据模型新增 `organization_id`（KPI/OKR/项目/任务）并自动迁移历史数据到 `default-org`。
  - `assignee_next_tasks` 表升级为 `(organization_id, assignee)` 复合主键，避免跨组织负责人任务冲突。
  - API 已支持 `organization_id` 参数：
    - `GET /goals/tree`
    - `GET /goals/tasks`
    - `GET /goals/dashboard`
    - `POST /goals/dashboard/next-task`
    - `POST /goals/kpi`
- 前端 Board 已接入组织视角：
  - 新增“组织ID”输入（自动本地记忆）；
  - 看板、任务列表、派单项目、一键下发“下一任务”都按组织隔离调用。
- 新增测试：
  - `test_dashboard_isolated_by_organization`，验证不同组织数据互不串线。
- 验证：
  - `python -m py_compile agent-sdk/core/goal_manager.py agent-sdk/main.py agent-sdk/models/request.py` 通过；
  - `python -m unittest agent-sdk.tests.test_goal_manager -v` 通过；
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 02:35）
- Goals 页接入组织域：
  - 顶部新增“组织ID”输入（本地记忆）；
  - 树加载、任务筛选、URL 打开任务详情、KPI 创建与演示种子数据均携带 `organizationId`。
- Board 页组织筛选增强：
  - 新增“部门筛选”（基于负责人前缀规则提取）；
  - 新增“最近组织”快捷切换按钮；
  - 表格/游戏视图负责人列表改为 `visibleOwners`（按部门过滤后展示）。
- 新增多组织演示数据脚本：
  - `scripts/seed_multi_org_demo_data.py`
  - 支持一次生成 `acme-cn` / `acme-global` / `acme-labs` 三个组织的数据，方便演示组织隔离。
- 验证：
  - `python -m py_compile agent-sdk/core/goal_manager.py agent-sdk/main.py agent-sdk/models/request.py scripts/seed_multi_org_demo_data.py` 通过；
  - `python -m unittest agent-sdk.tests.test_goal_manager -v` 通过；
  - `npm run build`（desktop-app）通过；
  - `python scripts/seed_multi_org_demo_data.py --data-dir E:\\GalaxyProject\\cks-lite\\data\\multi-org-demo --reset` 通过。

## 继续推进（2026-02-08 03:00）
- 部门维度（MVP）打通：
  - 任务模型新增 `department` 字段（自动迁移）；
  - 创建任务 API 支持 `department`；
  - Board 聚合支持 `departments` / `department`，可直接用于部门筛选与展示。
- 组织筛选体验增强：
  - Board 新增“最近组织”快捷按钮；
  - Board 表格/游戏模式均按 `visibleOwners`（部门筛选后）渲染；
  - Board 派单创建任务时自动写入部门（默认从负责人前缀推断）。
- Goals 页补齐组织与部门录入：
  - 顶部新增组织 ID 输入；
  - 创建任务增加“部门（可选）”输入；
  - 相关查询与详情打开都带 `organizationId`。
- 验证：
  - `python -m py_compile agent-sdk/core/goal_manager.py agent-sdk/main.py agent-sdk/models/request.py scripts/seed_multi_org_demo_data.py` 通过；
  - `python -m unittest agent-sdk.tests.test_goal_manager -v` 通过；
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 03:25）
- 组织管理可视化（MVP）已落地：
  - Board / Goals 顶部从“纯手输组织ID”升级为“组织下拉 + 新增组织”模式；
  - 组织清单本地持久化（catalog），支持快速切换不同组织视角。
- Goals 任务列表补齐部门筛选与展示：
  - 筛选区新增“部门”输入；
  - 表格新增“部门”列；
  - 查询参数支持 `department` 并与 `organization_id` 共同生效。
- 后端任务筛选支持 `department`：
  - `GET /goals/tasks` 新增 `department` 过滤；
  - 任务创建支持 `department` 字段，Board 派单默认写入部门。
- 多组织种子脚本升级：
  - `scripts/seed_multi_org_demo_data.py` 现在会写入部门数据，便于演示部门筛选效果。
- 验证：
  - `python -m py_compile agent-sdk/core/goal_manager.py agent-sdk/main.py agent-sdk/models/request.py scripts/seed_multi_org_demo_data.py` 通过；
  - `python -m unittest agent-sdk.tests.test_goal_manager -v` 通过；
  - `npm run build`（desktop-app）通过；
  - `python scripts/seed_multi_org_demo_data.py --data-dir E:\\GalaxyProject\\cks-lite\\data\\multi-org-demo --reset` 通过。

## 继续推进（2026-02-08 03:50）
- Board 新增“组织管理增强 + 部门热力视图”：
  - 组织切换升级为：组织下拉 + 新组织输入 + 新增/重命名/移除当前；
  - 新增部门热力块（按“待验收+进行中”排序），老板能快速识别压力部门。
- Goals 新增“组织管理增强 + 部门筛选展示”：
  - 顶部组织栏升级为：组织下拉 + 新组织输入 + 新增/重命名/移除当前；
  - 任务筛选区新增“部门”筛选；
  - 任务表格新增“部门”列，便于与看板口径一致。
- 后端任务查询补齐 `department` 过滤，形成前后端闭环。
- 测试与验证：
  - `python -m unittest agent-sdk.tests.test_goal_manager -v` 通过（新增部门过滤用例）；
  - `npm run build`（desktop-app）通过；
  - `python scripts/seed_multi_org_demo_data.py --data-dir E:\\GalaxyProject\\cks-lite\\data\\multi-org-demo --reset` 通过。

## 继续推进（2026-02-08 04:10）
- 老板看板（Board）新增“组织配置导入/导出”：
  - 导出当前组织配置（current/catalog/recent）为 JSON；
  - 支持一键导入 JSON 覆盖组织目录并切换当前组织；
  - 适合演示前快速恢复多组织环境。
- 老板看板新增“部门趋势（近7天）”：
  - 基于近 7 天任务数据按部门聚合；
  - 展示待验收、驳回、进行中、已验收，便于管理层观察部门风险趋势。
- 验证：
  - `npm run build`（desktop-app）通过；
  - `python -m unittest agent-sdk.tests.test_goal_manager -v` 通过。

## 继续推进（2026-02-08 09:20）
- Goals 页左侧“新增 KPI/OKR/项目/任务”入口做了简化改版：
  - 从“4段连续表单”改为“分步模式”（KPI/OKR/项目/任务 4个切换按钮）；
  - 当前只显示一个步骤的输入项，减少视觉噪音与误操作；
  - 文案明确“按层级逐步创建”，更适合演示与新用户上手。
- 创建体验优化：
  - 创建 KPI 成功后自动进入 OKR 步骤并选中新建 KPI；
  - 创建 OKR 成功后自动进入项目步骤并选中新建 OKR；
  - 创建项目成功后自动进入任务步骤并选中新建项目。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 09:45）
- Goals 页顶部组织栏进一步简化：
  - 保留“组织选择 + 刷新”主操作；
  - 将“新增/重命名/移除组织”收敛进“组织设置”下拉，减少主界面拥挤。
- Goals 页右侧“结构总览”改为更明确的层级树：
  - 使用可折叠层级按 `KPI → OKR → 项目 → 任务` 展示；
  - 每层支持展开/折叠，并保留进度信息；
  - 空层级增加“暂无 OKR/项目/任务”提示，结构更清晰。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 10:05）
- Goals 页右侧层级树进一步增强可读性：
  - KPI 层显示 `OKR 数量`；
  - OKR 层显示 `项目数量`；
  - 项目层显示 `任务数量`；
  - 任务层展示负责人与部门，并追加状态标签（进行中/已完成）。
- 任务操作区改为两行结构：
  - 第一行聚合任务信息；
  - 第二行保留“绑定 / 开始执行 / 完成”动作，减少横向拥挤。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 10:30）
- Goals 层级树交互收敛：
  - 任务行触发“绑定 / 开始执行 / 完成”时，会同步定位到对应 `KPI/OKR/项目` 路径；
  - 配合已实现的可折叠层级，右侧默认聚焦当前操作路径，避免多分支同时展开造成干扰。
- Workbench 新增“AI总指挥”模式（默认开启）：
  - 开启后系统自动决策技能链路，前端不再强制用户先选技能；
  - 关闭后仍可进入“技能优先 + 严格模式”的专家手动控制。
- Workbench 请求策略同步：
  - 总指挥开启时，发送 `preferred_skill=undefined` 且 `skill_strict=false`；
  - 总指挥关闭时，沿用手动策略参数。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 10:45）
- 按演示真实感要求，移除页面中的“演示快捷入口”显式按钮：
  - Goals 左侧不再展示“一键生成演示数据”区块；
  - 同步删除对应前端触发逻辑，避免留下无用状态与死代码。
- 现状：
  - 页面仅保留真实业务入口（层级创建、绑定执行、任务管理），减少“演示痕迹”。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 11:05）
- Workbench 炸场感增强（总指挥可视化）：
  - 新增“AI 总指挥执行面板”（仅总指挥模式显示）；
  - 提供三段式执行卡：`理解目标 → 自动编排 → 交付结果`，每段显示状态与说明；
  - 新增“结果快照”卡，自动汇总本轮成功工具调用中的关键产出（本地文件路径 / 链接）。
- 总指挥逻辑延续：
  - 默认开启总指挥时，用户无需先选技能；
  - 由系统自动选技能链路并在失败时降级。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 11:20）
- Workbench 新增“交付报告”条（总指挥模式）：

## 继续推进（2026-02-08 14:10）
- Workbench 新增“极速响应”开关（默认开启）：
  - 前端请求新增 `fast_mode` 参数；
  - 极速模式下默认关闭本轮记忆检索（`use_memory=false`），优先缩短首字节与整体等待时长；
  - 同步在“技能决策说明”和导出报告中展示当前响应策略，便于演示时解释“为什么更快”。
- 后端已接入 `fast_mode`：
  - `ChatRequest` 增加 `fast_mode` 字段；
  - `/chat` 与 `/chat/stream` 会根据 `fast_mode` 计算生效参数并传给 Agent；
  - Agent 在极速模式下收敛联网与工具预算（更少自动搜索结果、更低 web_search 次数、重复调用更快熔断）。
- 同步完成“记忆日志归档”落地：
  - `markdown_memory.compress_logs(days=30)` 已实现真实归档（按月份目录 + `index.jsonl`）；
  - 覆盖测试：`agent-sdk/tests/test_markdown_memory.py`。
- 验证：
  - `python3 -m py_compile agent-sdk/models/request.py agent-sdk/main.py agent-sdk/core/agent.py agent-sdk/core/skill_installer.py` 通过；
  - `python3 -m unittest agent-sdk/tests/test_markdown_memory.py -v` 通过；
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 14:35）
- Workbench 响应策略从“二元开关”升级为“三档策略”：
  - `极速`：优先低延迟；
  - `平衡`：速度与质量均衡；
  - `深度`：优先完整性与推理深度。
- 前后端参数统一：
  - 请求模型新增 `response_mode`（`fast|balanced|deep`）；
  - 兼容旧参数 `fast_mode`，未传 `response_mode` 时自动回退旧逻辑。
- Agent 策略差异化已生效：
  - 自动搜索上下文开关与结果规模按策略切换；
  - 工具迭代次数、同参数重复阈值、`web_search` 次数预算按策略切换（深度档允许更高预算）。
- Workbench 显示与导出同步：
  - 头部控件改为“响应策略”下拉；
  - “技能决策说明”与“交付报告”会显示当前策略，便于演示和复盘。
- 验证：
  - `python3 -m py_compile agent-sdk/models/request.py agent-sdk/main.py agent-sdk/core/agent.py` 通过；
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 15:00）
- Workbench 新增“性能可视化指标”（面向演示与真实体验优化）：
  - 流式执行时实时展示：
    - 总耗时；
    - 当前步骤耗时（当前工具从启动到现在）；
    - 首字节耗时（TTFB）；
    - 首次工具触发耗时。
  - 执行完成后在“交付报告”条展示：
    - 首字节耗时；
    - 工具总耗时（累计）。
- 工具调用明细补齐时间戳字段：
  - `ToolCallInfo` 增加 `startedAt / endedAt / durationMs`；
  - 在 `tool_start / tool_result / desktop审批链路` 自动填充，便于后续做耗时排行。
- 交付报告导出增强：
  - 导出的 Markdown 报告新增性能指标（首字节、首次工具、工具总耗时与次数）。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 16:10）
- 渠道中台（飞书方向）新增后端基础能力：
  - 新增执行审批存储 `ExecutionApprovalStore`（SQLite）；
  - 新增渠道任务队列 `ChannelTaskQueue`（SQLite）；
  - 新增审批 API：`/approvals/request`、`/approvals`、`/approvals/{id}/decision`。
- 飞书接入 MVP：
  - 新增 Feishu 适配器 `services/feishu_adapter.py`（token 校验、challenge 处理、文本出站）；
  - 新增事件入口 `POST /channels/feishu/events`（challenge + message 入队）；
  - 新增出站接口 `POST /channels/feishu/outbound`；
  - 渠道任务派发后，若来源为飞书且配置有效，自动回推执行结果。
- 渠道任务执行闭环增强：
  - `POST /channels/feishu/inbound` 支持 `auto_dispatch` 直接调度 Agent；
  - `POST /channels/tasks/{id}/dispatch` 统一复用内部派发逻辑，默认按 `channel:chat_id` 复用会话。
- 新增测试：
  - `agent-sdk/tests/test_channel_and_approval_store.py`
  - `agent-sdk/tests/test_feishu_adapter.py`
- 验证：
  - `python3 -m py_compile agent-sdk/services/feishu_adapter.py agent-sdk/core/execution_approval.py agent-sdk/core/channel_task_queue.py agent-sdk/models/request.py agent-sdk/main.py` 通过；
  - `python3 -m unittest agent-sdk/tests/test_channel_and_approval_store.py agent-sdk/tests/test_feishu_adapter.py -v` 通过；
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 16:35）
- 飞书事件安全校验增强：
  - `FeishuAdapter.verify_event` 支持 `FEISHU_ENCRYPT_KEY` 场景下的 header 签名校验（timestamp/nonce/signature）；
  - `/channels/feishu/events` 改为读取原始 body 参与验签，避免仅靠 token 校验。
- 渠道任务与目标管理闭环补齐：
  - 新增 `_try_writeback_goal_task_from_channel_task`，当渠道任务 metadata 携带 `goal_task_id` 时，自动回写 Goals 执行流到 `verify/done`；
  - 在 `auto_dispatch` 和手动 `dispatch` 两条路径都接入回写逻辑。
- 测试补齐：
  - `test_feishu_adapter.py` 增加签名验签用例。
- 验证：
  - `python3 -m py_compile agent-sdk/services/feishu_adapter.py agent-sdk/main.py` 通过；
  - `python3 -m unittest agent-sdk/tests/test_channel_and_approval_store.py agent-sdk/tests/test_feishu_adapter.py -v` 通过；
  - `npm run build`（desktop-app）通过。
  - 在一轮执行结束后自动显示耗时、成功率、调用数、异常数；
  - 提供“生成验收报告 / 继续执行未完成项”两个一键续跑动作，直接进入下一轮执行。
- 状态记录补齐：
  - 新增 `lastRunDurationSec`，用于沉淀上一轮真实执行时长，避免只显示流式进行中的临时秒数。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 11:35）
- Workbench “技术详情”区去干扰优化：
  - 每次用户发起新任务时自动收起技术详情；
  - 总指挥模式下将“执行时间线”文案改为“技术详情（可展开）”，默认只显示摘要卡，不再铺满细节；
  - 技术详情收起时仅显示调用数、技能调用数、当前步骤/完成状态。
- 展开后保留完整排障能力：
  - 仍可查看技能筛选、工具调用明细、输入输出与降级提示。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 11:50）
- Workbench 交付结果改为“可点击直达”：
  - 总指挥面板“结果快照”中的文件/链接由静态文案改为按钮；
  - 点击后通过 Tauri shell 打开目标（文件或 URL）；
  - 链接场景增加浏览器 fallback，提升兼容性；
  - 打开失败时显示明确错误提示，避免“点击无反馈”。
- 技术实现：
  - 引入 `@tauri-apps/plugin-shell` 的 `open`；
  - 结果快照从字符串改为结构化项（type/target/label），并做去重展示。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 12:05）
- Workbench 交付闭环再增强：
  - 交付报告条新增“导出交付报告”按钮；
  - 一键导出 Markdown（含任务目标、耗时、成功率、执行计划、关键产出、下一步建议），便于演示留档和老板复盘。
- 技术细节：
  - 新增本地时间格式化与报告组装逻辑；
  - 文件名自动附带时间戳，避免覆盖历史报告。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 12:25）
- Workbench 与目标任务闭环打通（总指挥回写）：
  - 交付报告条新增“回写任务 #ID”按钮（仅已绑定任务时展示）；
  - 一键将本轮总指挥交付报告（执行计划/关键产出/统计）回写到任务执行状态日志；
  - 回写过程增加状态反馈（回写中 / 成功 / 失败）。
- 稳定性：
  - 每次发起新任务会重置回写状态提示，避免旧结果干扰当前轮次。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 12:45）
- 老板看板顶部控件拥挤问题修复：
  - 将原先一整排按钮改为两层布局，主行保留高频筛选（组织/部门/时间/应用）；
  - 低频操作（新增/重命名/移除/导入/导出组织）收纳进“组织设置”下拉，避免按钮挤压变形。
- 全流程测试（可自动执行部分）：
  - 前端：`npm run build`（desktop-app）通过；
  - 后端目标管理：`python3 -m unittest agent-sdk.tests.test_goal_manager -v` 通过（15/15）；
  - 技能严格模式：`agent-sdk/venv/Scripts/python.exe -m unittest agent-sdk.tests.test_skill_strict_mode -v` 通过（2/2）。

## 继续推进（2026-02-08 13:05）
- Skills 页新增“AI 自动搜索并安装技能”能力：
  - 用户输入目标后，前端优先使用 `find-skills` 进行推荐；
  - 自动解析推荐结果中的 `owner/repo` 并执行安装；
  - 支持一次安装 1~3 个技能，并显示逐条安装结果日志。
- 价值：
  - 用户无需先懂 skill 名称，直接从目标出发完成“发现→安装”闭环。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 13:35）
- 修复“老板看板一键进入 Workbench 后无反应（任务未绑定）”：
  - 原因：Workbench 读取的是本地存储 `cks.activeGoalTaskId`，但看板实际写入的是会话级 `sessionGoalTaskMap`；
  - 处理：Workbench 改为直接从 chat store 的 `sessionGoalTaskMap[currentSessionId]` 读取绑定任务；
  - 结果：从老板看板发起后，工作台会正确显示“已绑定目标任务 #ID”并参与执行回写。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 13:50）
- Skills 自动安装链路补齐“安装后体检”：
  - 自动安装成功后可直接触发 smoke test；
  - 同步拉取 readiness，若非 `ready` 会给出修复建议；
  - 前端新增开关“安装后自动体检并给出修复建议（推荐）”。
- 价值：
  - 从“能装”升级到“装完可用性可评估”，降低演示和生产中的踩坑概率。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 14:05）
- Skills 体检失败后的“可执行修复”补齐：
  - 自动安装体检后若发现异常，会收集为结构化修复项；
  - 每条修复项提供：
    - `复制建议`（一键拷贝）；
    - `发到工作台修复`（将建议带入 Workbench 继续执行）。
- 价值：
  - 从“发现问题”升级到“可直接行动”，减少用户在页面间手工搬运信息。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 14:20）
- 参考 CodePilot 技能来源策略，补齐 CKS 技能目录兼容：
  - 后端 SkillsLoader 除内置目录外，新增自动扫描：
    - `~/.agents/skills`
    - `~/.claude/skills`
  - 支持环境变量 `CKS_EXTRA_SKILL_DIRS`（逗号分隔）追加扫描目录，便于企业私有技能仓接入。
- 价值：
  - 让“外部下载的技能”更容易被 CKS 直接识别和调用，减少手动搬运成本。
- 验证：
  - `python3 -m py_compile agent-sdk/main.py` 通过。

## 继续推进（2026-02-08 14:40）
- 参考 CodePilot 的技能来源透明化思路，完成前端可视化增强：
  - Skill 卡片新增来源标识统一展示（内置/社区安装/插件来源/项目来源等）；
  - Skill 详情中补充“来源类型”字段，便于排障与治理；
  - Skills 页面新增来源分布与可用性概览（可直接运行 / 需修复）。
- 价值：
  - 用户可快速判断“这个技能从哪来、是否马上可用”，减少盲选。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 14:55）
- Skills 页新增“只看可直接运行”筛选开关：
  - 基于 readiness=ready 过滤技能列表；
  - 与分类筛选可叠加使用；
  - 分类计数与全部计数在该模式下同步显示过滤后数量。
- 价值：
  - 演示与生产时可快速聚焦“可立即调用”的技能，减少试错。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 15:10）
- 老板看板新增“老板洞察（自动生成）”模块：
  - 三项高层指标：自动完成率、团队平均完成率、风险任务数；
  - 快捷动作：
    - 拉起高风险负责人执行；
    - 一键生成老板简报（跳转 Workbench 并注入简报提示词）；
    - 打开待验收任务列表（跳转 Goals 带筛选参数）。
- 价值：
  - 从“数据展示”升级为“管理决策 + 一键行动”，更有演示冲击力。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 15:25）
- 老板看板新增“本周最值得老板干预的 3 件事”：
  - 自动基于看板数据生成 3 条优先干预建议（高风险负责人/待验收积压/返工任务）；
  - 每条建议附一键动作（立即拉起、去验收面板、准备接手返工）。
- 价值：
  - 将看板从“报表阅读”提升为“决策执行面板”，更贴近老板视角。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 15:40）
- 老板看板新增“导出老板周报”：
  - 一键导出 Markdown，包含组织核心指标、三条干预建议、负责人 Top 概览；
  - 适用于管理层汇报与周会复盘，不再手动整理看板数据。
- 验证：
  - `npm run build`（desktop-app）通过。

## 继续推进（2026-02-08 16:00）
- 修复 Skills 自动安装时 GitHub 404 易失败问题（后端安装器增强）：
  - 安装前先校验仓库是否存在/可访问（明确区分“仓库不存在”与“分支错误”）；
  - 下载时自动尝试多分支：用户分支、仓库默认分支、`main`、`master`；
  - 404 失败日志补充“已尝试分支”信息，便于快速排障。
- 验证：
  - `python3 -m py_compile agent-sdk/core/skill_installer.py` 通过。

## 继续推进（2026-02-08 13:20）
- 新增标准演示 SOP 文档：
  - `docs/demo-sop.md` 覆盖 5~8 分钟完整链路；
  - 包含：自动装 skill、老板派单、总指挥执行、回写闭环、管理复盘；
  - 附带：演示话术、故障兜底、录屏验收清单。


## ?????2026-02-08 17:35?
- Workbench ??????? + ????????
  - ???????`?????? / ?????? / ??????`????????
  - ??????????????????????????????????
  - ??????????????/?????????????????/?????????
- ?? Workbench ???????????
  - ???????????????
  - ??????/???
  - ???????????????????????????????????
- ?????
  - `desktop-app/src/pages/Workbench.tsx`
  - `desktop-app/src/stores/permissionStore.ts`
  - `docs/implementation-checklist-feishu-computer-use.md`
- ???
  - `npm run build`?desktop-app????
  - `python -m unittest agent-sdk.tests.test_channel_and_approval_store -v` ???


## Continue (2026-02-08 17:45)
- Workbench now has a full approval loop for desktop tools:
  - Added approval policy switch: `medium+high`, `high-only`, `audit-only`.
  - Desktop tool requests now create backend approval records when policy requires it.
  - Decisions made from dialog or panel both sync back to backend and unblock/stop the live execution.
- Added top-level Approval Center panel in Workbench:
  - Polls pending approvals.
  - Supports one-click approve/deny.
  - Linked to in-flight desktop requests via `approval_request_id` mapping.
- Updated files:
  - `desktop-app/src/pages/Workbench.tsx`
  - `desktop-app/src/stores/permissionStore.ts`
  - `docs/implementation-checklist-feishu-computer-use.md`
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m unittest agent-sdk.tests.test_channel_and_approval_store -v` passed.


## Continue (2026-02-08 18:05)
- Added Approval Audit View directly in Workbench Approval Center:
  - Pending approvals and recent approval history are now shown together.
  - History includes tool name, decision status, approver, decision time, and note.
- Backend API reuse:
  - Uses `GET /approvals` (mixed statuses) and splits into pending/history client-side.
  - Keeps polling refresh and manual refresh.
- Updated checklist:
  - Marked "approval audit view" as completed in `docs/implementation-checklist-feishu-computer-use.md`.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 18:30)
- Approval Center upgraded for demo usability:
  - Added per-tool policy overrides (`inherit / medium+high / high-only / audit-only`).
  - Added approval history filters (status/tool/decider) and one-click CSV export.
  - Added current strategy indicator in header row.
- Tool policy behavior:
  - `run_command/write_file/delete_file` default to stricter policy;
  - file read/list/info defaults inherit global policy.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 18:55)
- Boss Board now includes Approval Audit panel:
  - Real-time approval snapshot (pending/approved/denied/expired)
  - Filters by status/tool/decider and list of recent records
  - One-click CSV export for boss review
  - One-click jump to Workbench Approval Center
- Workbench supports deep-link open:
  - `cks.workbench.openApprovalCenter=1` now auto-expands approval panel on entry.
- Updated files:
  - `desktop-app/src/pages/Board.tsx`
  - `desktop-app/src/pages/Workbench.tsx`
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 19:20)
- Session-level organization binding added for Workbench approvals:
  - Chat store now keeps `sessionOrganizationMap`.
  - Sessions created from Goals/Board now bind organization explicitly.
  - Workbench approval create/list now prefer session-bound organization over local fallback.
- Backend approval model upgraded:
  - Added `organization_id` to approval records + schema migration support.
  - `/approvals` now supports `organization_id` filter.
- Security hardening:
  - CSV exports in Board/Workbench now sanitize dangerous formula prefixes (`= + - @`).
- Validation:
  - `python -m py_compile agent-sdk/core/execution_approval.py agent-sdk/main.py agent-sdk/models/request.py` passed.
  - `python -m unittest agent-sdk.tests.test_channel_and_approval_store -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 19:45)
- Approval API and UI now support session-scoped audit:
  - Backend `/approvals` now supports `session_id` filter.
  - Workbench Approval Center added scope switch: `???? / ????`.
- Boss Board approval panel enhanced with demo shortcuts:
  - Added `????` toggle.
  - Added `?24??` toggle.
- Validation:
  - `python -m py_compile agent-sdk/core/execution_approval.py agent-sdk/main.py agent-sdk/models/request.py` passed.
  - `python -m unittest agent-sdk.tests.test_channel_and_approval_store -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 20:05)
- Approval records now support direct replay links:
  - Board approval list adds ???????? action.
  - If `payload.session_id` exists and session is present, jumps directly to that Workbench session.
  - If missing, creates a replay session and injects a recovery prompt.
- Goal linkage in approval records:
  - Workbench now stores `goal_task_id` in approval payload when available.
  - Board approval item can jump to `Goals` task detail via ????????.
- Validation:
  - `python -m unittest agent-sdk.tests.test_channel_and_approval_store -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 20:20)
- Approval-to-execution traceability improved on Boss Board:
  - Added ???????? quick action for each approval record.
  - Added ???????? when `goal_task_id` exists in payload.
  - Added approval snapshot preview + ?????? + ?????? actions.
- Workbench approval payload enriched:
  - Store `goal_task_id` in approval payload for stronger Goal linkage.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 20:45)
- Feishu integration upgraded (inspired by OpenClaw channel robustness patterns):
  - Added replay protection in signature verification (nonce cache + optional timestamp window).
  - Added command parsing in Feishu events: `/cks status`, `approve <id>`, `deny <id>`, `task <id>`, `run ...`, `desktop ...`.
  - Added optional auto-dispatch path for Feishu inbound (`FEISHU_AUTO_DISPATCH`), with completion/failure reply back to chat.
  - Added richer text extraction for Feishu event payload (text + post fallback).
- Desktop automation acceleration:
  - New `desktop ...` Feishu command injects desktop-tool-first prompt for direct execution.
- Validation:
  - `python -m py_compile agent-sdk/services/feishu_adapter.py agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter agent-sdk.tests.test_channel_and_approval_store -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 21:00)
- Feishu command handling further accelerated:
  - Added sender allowlist support via `FEISHU_ALLOWED_SENDERS`.
  - Added execution progress replies to chat (`????` -> `??/??`).
  - Added `computer ...` alias for desktop-tool-first execution (same as `desktop ...`).
- Channel dispatch helper improved:
  - Internal dispatch now supports `message_override` and stores `dispatched_message` in task result.
- Validation:
  - `python -m py_compile agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 21:15)
- Feishu channel UX upgraded with progress-style replies:
  - Added structured status reply template (`/cks status`) with top pending approvals + quick command hints.
  - Added staged execution messages: start / phase-2 running / phase-3 writeback / done-or-failed.
  - Added sender allowlist gate (`FEISHU_ALLOWED_SENDERS`).
  - Added `computer ...` alias (maps to desktop-tool-first execution route).
- Dispatch internals:
  - `_dispatch_channel_task_internal` now supports `message_override` and persists `dispatched_message` for audit traceability.
- Validation:
  - `python -m py_compile agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 21:35)
- Feishu bot integration further aligned to channel-bot best practice:
  - Added `/channels/feishu/commands` endpoint for command discovery.
  - Added approval-card delivery option in status flow (`FEISHU_ENABLE_APPROVAL_CARD`), using interactive messages.
  - Added short approval-id resolution (prefix match in pending approvals) for `approve/deny` convenience.
- Feishu reply templates improved:
  - More structured status/approval/task messages for clearer mobile reading.
- Validation:
  - `python -m py_compile agent-sdk/services/feishu_adapter.py agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 21:55)
- Feishu bot callback path improved for ?????????:
  - Approval cards now include interactive buttons (??/??) with command payload.
  - Event handler now parses card-action payload (`event.action.value`) in addition to text commands.
  - Added short-id resolve for approval command execution remains active.
- New helper endpoint:
  - `GET /channels/feishu/commands` now available for front-end command hints.
- Validation:
  - `python -m py_compile agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 22:10)
- Feishu bot callback loop tightened:
  - `/cks approvals` alias added for approval-focused status queries.
  - Approval action button callbacks now send both text confirmation and interactive result card.
  - Status query and approval query share one structured summary flow + optional cards.
- Validation:
  - `python -m py_compile agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 22:30)
- Feishu approval callback robustness improved:
  - Added graceful conflict handling when approval is already decided.
  - On conflict/failure, bot now sends both text and interactive notice cards.
  - Added `approvals` command alias flow parity with status card dispatch.
- Validation:
  - `python -m py_compile agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 23:10)
- Feishu config module usability fix:
  - Backend now preserves existing secret values when frontend sends redacted placeholders (`abc***yz`) back on save.
  - `/channels/feishu/config` and config update responses now include `configured` flag for UI status display.
  - Settings page now shows a clear `已配置/未配置` badge in 飞书配置卡片.
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/models/request.py agent-sdk/services/feishu_adapter.py agent-sdk/core/skill_installer.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter agent-sdk.tests.test_channel_and_approval_store -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 23:35)
- Feishu config gets “一键诊断” workflow:
  - Added new backend endpoint `GET /channels/feishu/config/diagnose` for health checks + callback URL suggestions.
  - Diagnostic output includes credential readiness, event security, domain, signature tolerance, replay cache, sender allowlist, and optional token probe.
  - Frontend Settings adds `一键诊断` button + visual result panel (阻塞/提示/通过 tags + actionable suggestions).
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/services/feishu_adapter.py agent-sdk/models/request.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter agent-sdk.tests.test_channel_and_approval_store -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-08 23:55)
- Feishu diagnostics UX refinement:
  - Added one-click copy buttons for callback URLs in Settings diagnostics panel.
  - Added copy success feedback (`复制/已复制`) to speed up Feishu console setup.
  - Added E2E smoke script doc for quick “Feishu -> Queue -> Dispatch -> Workbench” verification.
- Validation:
  - `python -m py_compile agent-sdk/main.py` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 00:10)
- Settings adds one-click Feishu end-to-end smoke execution:
  - New `一键联调` button in 飞书配置卡片 triggers:
    - enqueue inbound Feishu task (`/channels/feishu/inbound`)
    - dispatch queued task (`/channels/tasks/{id}/dispatch`)
  - Added result feedback for success/failure to speed up demo checks.
- Frontend service/types expanded for channel-task operations:
  - `enqueueFeishuInboundTask`, `listChannelTasks`, `dispatchChannelTask`
  - `ChannelTask/ChannelTaskResult/ChannelTaskListResult` types.
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/models/request.py agent-sdk/services/feishu_adapter.py` passed.
  - `python -m unittest agent-sdk.tests.test_feishu_adapter agent-sdk.tests.test_channel_and_approval_store -v` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 00:20)
- Smoke flow demo navigation improved in Settings:
  - After `一键联调` succeeds, page now shows quick actions:
    - `打开工作台`
    - `打开老板看板`
  - This reduces demo friction and makes Feishu-to-execution closed loop easier to present live.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 00:35)
- Workbench now supports task-context handoff from Settings smoke flow:
  - Settings `打开工作台` now appends `channel_task_id` query param.
  - Workbench detects this route param, posts a handoff tip, and auto-sends a follow-up command:
    - “接管并继续执行渠道任务 #ID，输出进度摘要与下一步动作”
  - Route param is cleared after one-shot consumption to prevent repeat triggers.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 00:50)
- Board now supports linked smoke-task trace context:
  - Settings `打开老板看板` now carries `channel_task_id` query param.
  - Board detects linked channel task and renders a focused context panel:
    - task id / status / message
    - quick action: `查看执行轨迹` (jump to Workbench with same task context)
    - quick action: `关闭上下文`
  - This closes the demo gap: Settings -> Board -> Workbench trace is now one-click.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 01:05)
- Workbench trace panel now highlights linked channel task steps:
  - Added `linkedChannelTaskId` context from route query (`channel_task_id`).
  - Timeline cards that mention this task id are auto-highlighted (fuchsia).
  - Timeline auto-focuses latest matched step for faster demo storytelling.
  - Collapsed timeline now shows matched-step counter for current linked task.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 01:15)
- Workbench trace panel adds “仅看关联步骤” mode:
  - When `channel_task_id` context exists, timeline now supports one-click linked-only filtering.
  - Linked-only mode keeps active focus on matched steps and avoids unrelated tool-call noise.
  - Empty-state copy differentiates between “no timeline” and “no linked steps”.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 01:40)
- Cross-platform desktop automation foundation (openclaw-style direction) added:
  - New desktop tools wired end-to-end:
    - `get_platform_info`
    - `open_application`
    - `type_text`
    - `press_hotkey`
  - Agent tool schema + desktop bridge + Workbench permission pipeline now support these tools.
  - Tauri backend implements cross-platform execution paths:
    - Windows: PowerShell/WScript automation
    - macOS: AppleScript (`osascript`)
    - Linux: `xdotool` fallback
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.
  - `npm run build` in `desktop-app` passed.
  - `cargo check` in `desktop-app/src-tauri` passed.


## Continue (2026-02-09 02:00)
- Referencing OpenClaw shell strategy for Windows reliability:
  - `execute_command` on Windows switched from `cmd /C` to `powershell -Command` to better capture system utility output.
  - Added safe PowerShell path resolver (`System32\\WindowsPowerShell\\v1.0\\powershell.exe` fallback).
- Desktop automation toolchain hardened:
  - Added Tauri-level commands for app open / text input / hotkey / platform detection.
  - Added Rust unit tests for sendkeys mapping + escape helpers.
  - Fixed an existing policy test to avoid false negatives caused by temp-path allowlist overlap.
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.
  - `npm run build` in `desktop-app` passed.
  - `cargo test` in `desktop-app/src-tauri` passed (7 tests).


## Continue (2026-02-09 02:20)
- Frontend module split done: Feishu + Desktop automation now has dedicated page.
  - Added new route/page: `/automation`.
  - Sidebar added `自动化`入口 for direct access.
  - Module includes:
    - Feishu config/save/test/diagnose/smoke
    - smoke success quick-jump (Workbench / Board with linked task context)
    - cross-platform desktop automation panel (platform detect / open app / type text / hotkey)
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `cargo test` in `desktop-app/src-tauri` passed.


## Continue (2026-02-09 02:40)
- Feishu conversation visibility on desktop implemented in `自动化` module:
  - Added “飞书聊天记录（桌面端同步）” panel.
  - Pulls recent Feishu channel tasks from backend and groups by `chat_id`.
  - Shows user inbound message + CKS reply/status in one timeline view.
  - Auto-refresh every 15s + manual refresh button.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 02:55)
- Feishu chat sync UX upgraded for desktop supervision:
  - Added unread progress badge (`新进展`) per conversation and global counter.
  - Added one-click `回放到工作台` from each Feishu chat thread (opens Workbench with linked `channel_task_id` context).
  - Added manual `标记已读` action and local seen-state persistence.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 03:10)
- Feishu chat panel now supports management filters and board handoff:
  - Added filter by `负责人` (from message metadata.assignee / sender_id).
  - Added filter by latest execution `状态` (pending/running/done/failed).
  - Added one-click `跳转老板看板` from each Feishu conversation.
- Board page now accepts `assignee` route query:
  - Auto-focuses matching owner and switches to table mode for easier review.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 03:25)
- Feishu conversation now shows Goal mapping card (KPI/OKR/Project/Task):
  - Parse `goal_task_id` from metadata/result/message and resolve goal task detail via Goals API.
  - Added inline mapping ribbon: `关联目标任务 #ID · KPI / OKR / Project`.
  - Added one-click `跳转目标任务` action from Feishu chat thread to Goals page.
- Validation:
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 04:05)
- 继续参考 OpenClaw 的“移动端可控命令 + 防重复触发”思路，完成一轮 Feishu 交互加固：
  - Feishu 指令新增：`/cks pause`、`/cks resume`、`/cks cancel`（支持可选 `#任务ID`）。
  - 新增入站防抖：同一会话短时间重复文本会被自动忽略，避免手机端连点触发重复执行。
  - 任务状态新增并统一：`waiting_approval`、`paused`、`canceled`，同时兼容 `done -> completed`。
  - 渠道任务新增控制接口：`POST /channels/tasks/{task_id}/control?action=pause|resume|cancel`。
  - 当任务命中待审批时，渠道任务状态自动写为 `waiting_approval`，并在回执中给出下一步指引。
- 自动化页面（Automation）同步增强：
  - 飞书会话筛选支持完整状态（待执行/执行中/待审批/已暂停/已完成/失败/已取消）。
  - 每个会话显示状态中文标签，支持一键暂停/恢复/取消任务。
  - 会话时间线优先展示 `result.reply`，修复“有执行结果但前端不显示回复”的可见性问题。
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/channel_task_queue.py` passed.
  - `python agent-sdk/tests/test_channel_and_approval_store.py` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 04:35)
- 再次对照 OpenClaw 的可借鉴点并落地两项“手机端体验”增强：
  - 借鉴 `commands-registry`：新增 `/cks help`（以及 `/help`、`/cks commands` 别名）快速返回完整指令清单，降低老板手机端学习成本。
  - 借鉴 `chunk.ts`：飞书回执从“硬截断”改为“按段落分块发送”，超长结果不再直接砍掉结尾信息。
- 技术细节：
  - `_try_send_feishu_chat_reply` 支持 `receive_id_type`，可用于 `chat_id/open_id` 两种回执路径。
  - 新增 `_split_feishu_text_chunks` + `_format_feishu_help_text`，统一回执出口逻辑。
- Validation:
  - `python -m py_compile agent-sdk/main.py` passed.
  - `python agent-sdk/tests/test_channel_and_approval_store.py` passed.


## Continue (2026-02-09 05:00)
- 继续按 OpenClaw 的“状态可观测 + 命令闭环”思路，把飞书审批链路再打通一段：
  - `/cks status` 增加“当前会话最近 3 条任务摘要”（任务ID + 状态 + 指令预览），老板手机端看状态更直观。
  - 审批指令后自动联动任务：
    - `approve`：自动定位同会话 `waiting_approval` 任务，恢复为 `pending` 并自动续跑（含回执）。
    - `deny`：自动将关联 `waiting_approval` 任务标记 `failed` 并给出终止说明。
  - 增补状态中文映射，统一文案（待执行/执行中/待审批/已暂停/已完成/失败/已取消）。
- Validation:
  - `python -m py_compile agent-sdk/main.py` passed.
  - `python agent-sdk/tests/test_channel_and_approval_store.py` passed.


## Continue (2026-02-09 05:25)
- 继续借鉴 OpenClaw 的“幂等 + 远程控制可恢复”思路，补齐飞书链路稳定性：
  - 渠道任务队列新增 `external_id`（Feishu `message_id/event_id` 映射），实现持久化去重，防止服务重启后重复入队。
  - 飞书事件入口接入幂等校验：检测到重复事件直接回执已有任务状态，不重复执行。
  - 新增移动端命令 `/cks retry #任务ID`，可重试 `failed/canceled` 任务。
  - `channels/tasks/{task_id}/control` 扩展支持 `retry`，桌面自动化页同步提供“重试任务”按钮。
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/channel_task_queue.py` passed.
  - `python agent-sdk/tests/test_channel_and_approval_store.py` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 06:10)
- 按“可看可说”目标接入视觉能力（MiniMax）并打通桌面动作链路：
  - Agent 新增桌面工具：`capture_screen`、`mouse_click`，并新增视觉工具 `analyze_screen`（调用 MiniMax 视觉模型）。
  - `analyze_screen` 支持传入截图路径 + 问题，自动读取图片(base64)并调用模型返回分析结果。
  - Tauri 新增命令：
    - `capture_screen`：跨平台截图（Windows PowerShell/.NET、macOS screencapture、Linux import/scrot）
    - `mouse_click`：坐标点击（Windows 原生、macOS cliclick、Linux xdotool）
  - Workbench/桥接层同步支持新工具（权限审批、中文标签、执行分发）。
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.
  - `python agent-sdk/tests/test_channel_and_approval_store.py` passed.
  - `npm run build` in `desktop-app` passed.
  - `cargo test` in `desktop-app/src-tauri` passed.


## Continue (2026-02-09 06:35)
- 继续向 OpenClaw 桌面自动化能力靠近，补上“鼠标运动控制”：
  - Agent 新增工具：`mouse_move`、`mouse_scroll`（与 `capture_screen`/`mouse_click` 一起构成视觉操作最小闭环）。
  - Tauri 新增跨平台命令：
    - `mouse_move`：移动鼠标到指定坐标
    - `mouse_scroll`：滚轮滚动（正数上滚、负数下滚）
  - 桥接层/Workbench 同步支持新工具（风险分级、中文标签、策略配置、执行分发）。
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.
  - `npm run build` in `desktop-app` passed.
  - `cargo test` in `desktop-app/src-tauri` passed.


## Continue (2026-02-09 06:55)
- 继续补“视觉循环执行器”关键能力（规划层）：
  - Agent 新增工具 `visual_next_action`：输入截图 + 目标，输出结构化 JSON 下一步动作。
  - 规划输出字段统一为：`action/x/y/button/text/hotkey/reason/confidence`，方便后续自动映射到 `mouse_click/type_text/press_hotkey/mouse_scroll`。
  - 视觉路径抽象为统一图片预处理函数（类型/大小校验 + base64），`analyze_screen` 与 `visual_next_action` 共用。
  - Workbench 工具标签与系统工具识别同步更新。
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 07:15)
- 继续实现视觉闭环“执行层编排 v1”：
  - 新增后端 API：`POST /vision/next-action`，供桌面端直接请求视觉下一步规划。
  - `AgentService` 新增 `visionNextAction` 调用。
  - Automation 页面新增“视觉循环执行器”面板：
    - 输入目标 + 历史上下文 + 最大步数
    - 自动循环：截图 → 视觉规划 → 执行动作（click/type/hotkey/scroll/wait）→ 下一轮
    - 显示逐步执行日志，便于演示与排障。
- Validation:
  - `python -m py_compile agent-sdk/models/request.py agent-sdk/core/agent.py agent-sdk/main.py` passed.
  - `npm run build` in `desktop-app` passed.


## Continue (2026-02-09 07:30)
- 继续优化视觉循环执行器（v2 纠偏）：
  - 对每一步动作增加异常捕获与日志记录，避免单点报错直接“黑盒失败”。
  - 新增点击失败自动纠偏：若 click 执行报错，自动下滚一屏后进入下一轮视觉定位。
  - 将纠偏轨迹写入 history，帮助下一轮视觉规划利用失败上下文。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 08:00)
- Visual loop usability hardening (Workbench handoff oriented):
  - Added **manual stop** for visual loop (`ֹͣѭ��`) to avoid long-running blocked feel.
  - Added **repeated-action breaker**: when planner keeps producing same `click/wait/scroll`, auto-scroll + replan first; after threshold, stop loop and mark for takeover.
  - Added **one-click takeover to Workbench** (`ת������̨�ӹ�����`), auto-seeding prompt with goal + latest visual logs for fast continuation.
  - Added loop-state flags (`visualNeedsTakeover`, stop request ref) so UI can clearly guide user after failure/stall.
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 08:20)
- �Զ���ҳ����ӻ���ǿ��Ϊ��ʾ������׼������
  - �Ӿ�ѭ����־����Ϊ�����迨Ƭ������״̬��ɫ��������/�ɹ�/��ƫ/ʧ�ܣ���
  - ������־ͳ���������ٿ���һ��ִ����ɹ�/��ƫ/ʧ�ֲܷ���
  - ���ӡ�������־����ť�������ִ�й켣��������/����/Ⱥ�
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 08:45)
- �Զ���ҳ��ڶ�����ǿ��������ʾ�����ɲ�������
  - �Ӿ���־�Ӵ��ı�����Ϊ�ṹ����Ŀ��step/level/action/duration����֧�ֶ���ͼ�����ʱչʾ��
  - ���ӡ�ʧ�ܲ���һ�����ԡ���ʧ�ܺ��������������Ӿ�ѭ����
  - ��־���ơ��ӹ���ʾ�������߼�ͳһʹ�ýṹ����־���طŸ��ȶ���
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 09:05)
- ����Ӿ���·�ع��������ʾǰ����嵥��
  - ���� `docs/visual-e2e-regression-checklist.md`�����Զ������ + 5���ֹ����� + Go/No-Go ��׼ + ���˲��ԡ�
  - ��ִ���Զ�����֤��`npm run build`��`cargo test`��`python -m py_compile ...` ��ͨ����

## Continue (2026-02-09 09:20)
- �޸����򿪷���ʧ�ܡ���·����
  - Windows `open_application` ���Ӻ�ѡ����������������ԣ�֧�� Feishu/Lark ������װ·�� + ��������
  - ��ֱ��ʧ���� fallback �� `cmd /C start`�����ڴ�����Ϣ�ﷵ�س��Թ��ĺ�ѡ·�����������ϡ�
- Validation:
  - `cargo test` in `desktop-app/src-tauri` passed.
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 09:35)
- �����޸�������򲻿�������·����
  - ��ǰ���ŽӲ�� `open_application.app` �������һ���������к�������/feishu/lark�����һ�� `feishu`��������ģ�Ͱ����䵱Ӧ������
  - Windows �˺�ѡʶ��ӡ���ȷƥ�䡱��Ϊ������ƥ�䡱��֧�� `����ͻ���` �ȱ��塣
- Validation:
  - `cargo test` in `desktop-app/src-tauri` passed.
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 09:50)
- �������� Windows �����򿪷��顱�����ӹ̣�
  - `open_application` ���� Start �˵��������ף����� `Get-StartApps` �� Name/AppID �������� ����/Feishu/Lark �ؼ��ʣ������к�ͨ�� `shell:AppsFolder` ����Ӧ�á�
  - �ö����ڡ���ѡ·�� + start ���ʧ�ܺ󴥷�������װ�ڷǱ�׼·��ʱ�������ʡ�
- Validation:
  - `cargo test` in `desktop-app/src-tauri` passed.
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 10:10)
- Workbench �����������ʼǱ��Ӵ�����
  - ��������������۵������أ����־û����������ã�Ĭ���۵�����
  - �۵��������һ��״̬����ִ����/����/����������ʾ�����ͷŶԻ����߶ȡ�
- ���鷢�Ͳ���������
  - �� Agent ϵͳ��ʾ�м��롰������Ϣ����ȷ���Կ�ݼ����̣�Ctrl+K������ʧ�������Ӿ���λ�����ʹ��Ӿ�������
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/core/agent.py` passed.

## Continue (2026-02-09 10:35)
- �޸���������˵���Ϣδ�������ĺ������⣺
  - �������湤�� `send_feishu_message(recipient, content)`��ȷ���Ա��ţ����� Tauri ֱ��ִ�й̶��������У�
    �򿪷��� -> ������� -> ѡ����ϵ�� -> ������Ϣ -> Enter/Ctrl(��Cmd)+Enter ���͡�
  - Agent �����ù��߲���ϵͳ��ʾ�����������鷢��Ϣ�����ô˹��ߡ���
  - Workbench/�ŽӲ���������ʶ�𡢷��շּ������ı�ǩ��ִ�зַ���
- Validation:
  - `cargo test` in `desktop-app/src-tauri` passed.
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/core/agent.py` passed.

## Continue (2026-02-09 10:55)
- �����ƽ����� openclaw ˼·����ȷ����ִ�У�
  - ����������ͼ���� `_extract_feishu_send_intent`�����û�����ȡ recipient/content����
  - �� `chat_stream` ��ʶ�𵽸���ͼʱ������ `tool_hint` ����ϵͳ��ʾ׷��ǿԼ�������ȵ��� `send_feishu_message`�������ɶಽ���������
  - Ŀ�꣺���١����߷��سɹ���ҵ��δ��ɡ��ļ����ԡ�
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.

## Continue (2026-02-09 11:20)
- ���� OpenClaw�����ֻ����ڣ�����ִ�в��Ǻ��ġ�˼·����չΪͨ������IMִ�У�
  - ���� Tauri ���� `send_desktop_message(channel, recipient, content)`��֧�� `feishu/wecom/dingtalk` ȷ���Ա��ţ���Ӧ��->������ϵ��->������Ϣ����
  - ���� `send_feishu_message` ����·����ͬʱ��������ͨ��·�ɡ�
  - Windows ��Ӧ�ú�ѡ·��������ҵ΢��/����������װ·����
  - Agent ��������IM��ͼ���� `_extract_desktop_message_intent`��ʶ���ǿԼ������ʹ�� `send_desktop_message`��
  - ǰ���Ž��빤��̨���빤��ע�ᡢ���ղ��ԡ����ı�ǩ��
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.
  - `cargo test` in `desktop-app/src-tauri` passed.
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 11:45)
- ������ʵ�����ֻ����ڣ�����ִ�в��Ǻ��ġ������Ͻ�����飺
  - Agent ��ʾ��ǿ������IM���ͺ���� `capture_screen + analyze_screen` ���к��飬��ֹδ����ֱ�������ѷ��͡�
  - �����Žӷ����İ���Ϊ����ִ�з������̣��������ͼ���飩�������ټ����Խ��ۡ�
  - Tauri ����������������ϵ��ȷ�Ϻ����� `Esc` �����������㣬�����벢������Ϣ������ͣ����������������δ���͵����⡣
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.
  - `cargo test` in `desktop-app/src-tauri` passed.
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 12:05)
- ��������������ִ�бջ����ȶ��ԣ�����ģ�����ɷ��ӣ���
  - �� `chat_stream` ����������IMֱִͨ�з�֧��Ĭ�Ͽ��� `FORCE_DESKTOP_MESSAGE_DIRECT=1`����
    1) ֱ��ִ�� `send_desktop_message`
    2) �Զ� `capture_screen`
    3) �Զ� `analyze_screen` ����
    4) ���ؽṹ�����ۣ�����ִ��+�Ӿ����飩
  - Ŀ�ģ�������볤�������󡰿��Ƴɹ���δ���ҵ�������������
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 12:30)
- �������������ͳɹ������ԡ����⣺
  - ���� `_is_delivery_verified`�����Ӿ��������������жϣ��� `analyze_screen` �ɹ���������Ϣ�ѷ��ͣ���
  - ֱͨ���ͷ�֧������䡰�����ͼ·��������������븴�̡�
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.

## Continue (2026-02-09 13:20)
- 产品定位正式切换到“一人公司运营平台”，新增规划文档：`docs/one-person-company-plan.md`。
- 文档明确了北极星目标、P0/P1/P2 分阶段任务和演示验收标准，后续开发按该计划推进。

## Continue (2026-02-09 14:05)
- 开始落地“一人公司”方向改造（第一批）：
  - 看板标题与核心文案改为“我的AI公司”，突出“你是老板 + 数字员工执行”。
  - 新增 AI员工名册模块：支持角色模板招募、自定义命名、暂停/恢复、解雇、一键指派与一键拉起执行。
  - 员工名册按组织ID本地持久化，并自动吸收已有任务负责人为员工档案。
- 同步更新侧边栏入口文案：`看板 -> AI公司`。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 14:35)
- 继续推进一人公司 P0：
  - 新增“员工卡片一键派发并执行”：直接创建任务 -> 设为该员工下一任务 -> 自动跳转 Workbench 绑定执行。
  - 看板“组织”相关文案统一切换为“公司空间”，减少企业组织语义偏差。
  - 补充多处“负责人”文案为“数字员工/员工”，对齐产品定位。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 15:05)
- 继续对齐“一人公司”核心流程（看板 -> 执行）：
  - 联调入口任务新增“转派数字员工”动作：可直接选择员工并转成目标任务，自动设置下一任务并跳转 Workbench 执行。
  - 返工池新增“一键回放”：自动打开 Workbench 并注入回放提示词（失败点/风险/修复步骤），便于演示“失败回流 -> 复盘 -> 再执行”。
  - 看板文案继续统一（公司空间、员工语义）。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 15:40)
- 看板与工作台联动继续增强：
  - 看板联调任务卡新增“转派成功状态回显”（显示派发员工、目标任务ID、时间）。
  - Workbench 新增任务级 SOP 快捷动作：
    - 回写任务
    - 一键回放审计
    - 转人工到看板（自动标记为 reject 并跳转 AI公司看板）
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 16:05)
- 继续完善“失败回流可见性”：
  - Board 支持 `task_id` 深链定位：从 URL 读取任务ID后自动定位到对应员工与任务气泡，并高亮显示。
  - Workbench“转人工到看板”现在携带 `task_id + assignee + organization_id` 跳转，确保老板落地页就看到被转人工的那条任务。
  - Board 联调卡新增跨空间参数接管（`organization_id`），避免跨空间演示时看错数据。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 16:25)
- 继续增强演示可视化（任务强定位）：
  - Board 增加任务自动滚动定位：带 `task_id` 进入后自动滚动到目标任务区域。
  - 被定位任务增加高亮脉冲效果（返工池卡片 / 员工任务气泡 / 任务详情卡 / 员工总览行）。
  - 目标任务高亮使用 `data-task-id` 与 `data-highlight-task-id` 统一锚点，方便后续扩展定位动画。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 16:50)
- 按“不要再扣细节，聚焦目标链路串联”推进：
  - Workbench 新增“目标链路面板”，实时展示当前任务所属 KPI / OKR / 项目 / 任务。
  - 增加任务动作闭环：标记任务完成、验收通过（回流链路进度）、转人工处理。
  - 保留回写与回放按钮，形成“执行 -> 验收 -> 回流/转人工”完整 SOP。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 17:10)
- 按“任务-项目-OKR-KPI 串联”继续推进（避免继续打磨细枝末节）：
  - Goals 页面新增“目标链路驾驶舱”：按项目聚合展示 KPI/OKR/项目路径、任务总量、待验收、驳回、进行中、验收通过率。
  - 驾驶舱支持“定位层级”与“一键拉起下一任务”，把管理视图直接连接到执行视图（Workbench）。
  - 串联目标：让老板在一个视图中看到“任务状态如何影响项目、OKR、KPI”。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 17:30)
- 继续推进“任务-项目-OKR-KPI 串联”的执行闭环：
  - Goals 目标链路驾驶舱新增“生成今日执行队列”按钮。
  - 逻辑：按风险分从高到低选择项目链路中的下一任务，调用 `setDashboardNextTask` 批量下发给负责人。
  - 下发后展示“今日执行队列”清单，并可一键进入对应 Workbench 执行。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 17:50)
- 继续强化“管理决策 -> 执行落地”速度：
  - Goals 驾驶舱新增“一键批量拉起”：
    - 按员工分组读取今日执行队列
    - 批量创建 Workbench 会话并绑定任务/空间
    - 自动打开第一条会话，进入执行态
  - 目标：让老板在目标页一键把当天任务推进到执行面。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 18:10)
- 对齐“一个Agent + 不同Skill = 不同职能员工”模型：
  - AI员工模板新增 `primarySkill`（主技能）字段，并在员工卡展示 `Agent + Skill` 组合。
  - 看板发起执行（一键拉起、派单后自动进入、返工接手、入口任务转派）统一注入 Workbench 技能预设：
    - 写入 `cks.workbench.preferredSkill`
    - 关闭严格模式（保留补充技能能力）
    - 写入角色化 seedPrompt
  - 目标：让“员工职能差异”由技能策略决定，而不是仅靠文案。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 18:40)
- 按“一个Agent + 不同Skill = 不同职能员工”继续推进员工模型：
  - AI员工模型新增 `skillStack`（技能栈），支持主技能 + 组合技能。
  - 员工模块完成 CRUD：
    - 新增：模板招募 + 自定义岗位/说明/技能组合
    - 查询：员工卡展示角色、主技能、技能栈、任务负载
    - 修改：卡片内编辑角色/说明/主技能/技能栈并保存
    - 删除：解雇员工
  - 员工执行预设升级：启动任务时将主技能 + 技能栈注入 Workbench seedPrompt。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 19:05)
- 继续落实“员工可随意组合”并补齐可运营能力：
  - 新增技能预设管理（按空间持久化）：可创建/删除预设，预设内容为“主技能 + 技能栈”。
  - 招募员工支持套用预设；员工卡新增“套用预设”动作，可批量快速重配职能。
  - 员工编辑能力增强：支持编辑岗位、岗位说明、主技能、技能栈并保存。
- Validation:
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 20:30)
- Board employee + skill preset switched to backend persistence (organization-scoped APIs) instead of localStorage-only.
- Employee CRUD now calls /goals/ai-employees/* and keeps UI in sync after write success.
- Skill preset CRUD now calls /goals/skill-presets/* and keeps UI in sync after write success.
- Validation:
  - python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py passed.
  - 
pm run build in desktop-app passed.


## Continue (2026-02-09 20:55)
- Stabilized Board employee/preset flows with backend-first guards:
  - auto-sync inferred owners to backend employee table (avoid refresh loss),
  - duplicate-name protection for employee recruit and preset create,
  - stronger edit-save normalization (ensure primary skill stays in skill stack).
- Validation:
  - 
pm run build in desktop-app passed.
  - python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py passed.


## Continue (2026-02-09 21:20)
- Added task-level employee skill snapshot APIs and storage (	ask_agent_profiles) to stabilize execution context across page refresh/session switch.
- Board now writes agent profile snapshot when launching task to Workbench (role/specialty/preferred skill/skill stack/seed prompt).
- Workbench now auto-loads bound task's agent profile and applies preferred skill + strict policy + seed prompt tip.
- Backend bound-task context now injects task agent profile to reduce 'unknown task/persona' drift during execution.
- Validation:
  - python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py passed.
  - 
pm run build in desktop-app passed.


## Continue (2026-02-09 21:45)
- Started Supervisor-Agent cluster MVP for one-person company operations.
- Backend:
  - Added /goals/supervisor/dispatch to run one-cycle supervisor dispatch (multi-assignee next-task scheduling).
  - Added un_supervisor_dispatch in goal manager (priority-based task selection + execution phase writeback).
- Frontend:
  - Board added '����һ������' action with optional objective input and result summary.
- Stability:
  - task-level agent profile remains the source of execution policy in Workbench.
- Validation:
  - python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py passed.
  - 
pm run build in desktop-app passed.


## Continue (2026-02-09 22:15)
- Supervisor-Agent cluster MVP expanded:
  - Added supervisor review API (`/goals/supervisor/review`) with assignee scoring and overall score.
  - Board supports supervisor dispatch auto-launch option (batch create Workbench task sessions).
  - Board supports one-click supervisor review feedback panel.
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.
  - `npm run build` in `desktop-app` passed.

## Continue (2026-02-09 22:35)
- Board added Supervisor Review panel (overall score + top risk assignees + one-click remediation launch).
- Supervisor dispatch can optionally auto-launch batch Workbench sessions with task-bound agent profile snapshots.
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.

## Continue (2026-02-09 22:55)
- Added one-click supervisor remediation task generator in Board:
  - create tasks for low-score assignees from supervisor review report,
  - auto-assign next-task pointers for each assignee.
- Added visible remediation trigger inside Supervisor Review panel.
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.

## Continue (2026-02-09 23:10)
- Supervisor remediation upgraded:
  - remediation task description now includes explicit acceptance criteria template,
  - optional auto-launch first remediation task in Workbench with task-bound agent profile snapshot.
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.

## Continue (2026-02-09 23:25)
- Added remediation priority strategy (P0/P1/P2) for supervisor-generated repair tasks.
- Supervisor review panel now shows P0/P1/P2 distribution + per-assignee priority.
- Repair task title/description now include priority for downstream execution and audit readability.
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.

## Continue (2026-02-09 23:45)
- Reliability hardening for digital employees:
  - launch execution now blocks paused employees explicitly,
  - all Board-to-Workbench launch paths now await async launch to avoid race conditions,
  - supervisor dispatch skips paused employees and reports skipped count.
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.

## Continue (2026-02-10 00:05)
- Hardening for employee execution reliability:
  - Added task execution readiness API (`/goals/task/{id}/execution/readiness`) using audit evidence + execution context checks.
  - Workbench now blocks `标记完成/验收通过` when evidence is insufficient.
  - Board launch now blocks paused employees and missing primary skills.
  - Supervisor dispatch now reports skipped paused employees to improve observability.
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.

## Continue (2026-02-10 00:25)
- Workbench now displays task execution readiness (green/yellow/red) with check breakdown before completion/review actions.
- Added readiness backend API and frontend client typing/service methods for stable completion gating.
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.

## Continue (2026-02-10 00:45)
- Added failure-memory reinjection for employee execution:
  - Board loads recent rejected-task lessons per assignee,
  - injects lessons into task seed prompt before Workbench launch.
- Goal: improve first-pass success and reduce repeated mistakes during rapid trial loops.
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.

## Continue (2026-02-10 01:00)
- Failure-memory reinjection upgraded to skill-aware ranking:
  - rejected lessons are now ranked by matching current employee skill hints (primary skill + skill stack),
  - highest-relevance failure cases are injected first into execution seed prompt.
- Validation:
  - `npm run build` in `desktop-app` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.
