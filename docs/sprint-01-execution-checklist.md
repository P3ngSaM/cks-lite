# Sprint 01 执行清单（本周开干版）

> 周期：1 周  
> 目标：把「Skills 可执行闭环」和「安全执行底座」打通到可验收状态。

---

## A. 本周目标（Definition of Done）

- [x] 至少 3 个 Skills 可稳定执行（`find-skills`、`openai-docs`、`spreadsheet`）*（openai-docs 为 fallback 可用）*
- [x] `openai-docs` 从“已安装但失败”变成“可运行或可诊断”
- [x] 终端执行策略从黑名单升级为白名单 v1
- [x] 每次工具执行可审计（谁发起、执行什么、结果如何）
- [x] 前端技能页可显示技能运行状态（Ready / Missing / Blocked）

---

## B. 任务拆解

## B1. Skill Readiness 状态体系（后端）

- [x] 新增接口：`GET /skills/readiness`
- [x] 状态枚举：
  - `ready`
  - `missing_dependency`
  - `blocked_by_policy`
  - `runtime_error`
- [x] 对每个 skill 输出：
  - `name`
  - `source`
  - `required_tools`
  - `runtime_checks`
  - `status`
  - `message`

验收：
- [x] API 可返回所有已安装技能状态
- [x] `openai-docs` 可明确显示缺少 MCP 或配置问题

---

## B2. MCP 工具桥接（先支持 openai-docs）

- [x] 盘点 `openai-docs` 需要的工具名（`mcp_openaiDeveloperDocs__*`）
- [x] 在工具执行层增加 MCP 路由（统一入口）
- [x] 增加失败标准化错误：
  - MCP 未配置
  - MCP 连接失败
  - MCP 调用超时

验收：
- [x] 对话中触发 `openai-docs` 时，不再只出现“执行失败”
- [x] 至少能返回可读错误或实际文档结果（本地 bridge fallback）

---

## B3. 终端白名单策略 v1

- [x] 引入白名单策略 v1（代码内置，后续可升级为 `command_policy.json`）
- [x] 默认仅允许：
  - 文件读取类命令
  - 项目目录内脚本执行
  - 明确允许的工具链（如 `python`, `node`, `git` 的受限子集）
- [x] 拒绝策略返回明确原因（便于前端展示）

验收：
- [x] 非白名单命令在后端被拦截
- [x] 前端能看到“被策略阻止”的明确信息（命令返回 stderr 提示）

---

## B4. 审计日志 v1

- [x] 新增 `agent-sdk/data/audit/` 日志目录
- [x] 记录字段：
  - 时间戳
  - 用户ID/会话ID
  - 工具名
  - 输入摘要（脱敏）
  - 执行结果（success/error）
  - 耗时
- [x] 错误日志与执行日志分离

验收：
- [x] 可以按会话回放关键工具调用（JSONL 按 session_id 过滤）

---

## B5. 前端技能状态展示

- [x] 技能卡片新增状态标记（Ready/Missing/Blocked）
- [x] 技能详情弹窗显示“依赖检查结果”
- [x] 一键“运行测试”按钮（调用后端 smoke test）

验收：
- [x] 用户在不进对话前就能知道某 skill 是否可用

---

## C. 测试用例（本周必跑）

## C1. 对话触发
- [x] `请使用 /find-skills，找 5 个写作相关技能`
- [x] `请使用 openai-docs skill，总结 Responses API 和 Chat Completions 的区别`
- [x] `请使用 spreadsheet skill，给季度销售分析表模板`

## C2. 策略与安全
- [x] 高风险命令被拒绝并提示原因
- [x] 审批拒绝后，任务可继续并给出友好反馈
- [x] 重复同参数工具调用不会无限循环

---

## D. 本周输出物

- [x] 可运行代码（后端 + 前端）
- [x] 接口文档更新
- [x] 风险清单更新（追加到总纲）
- [x] 演示脚本（3 条标准对话）

---

## E. 下周预告（Sprint 02）

- 目标管理模型（KPI/OKR/项目/任务）落库与联动
- Agent 执行结果反写目标进度
- 桌面打包链路（exe/dmg）预检查

---

## F. 进度记录

### 2026-02-06（已完成）

- 上线 `GET /skills/readiness` 与 `POST /skills/smoke-test`；
- 技能页接入 readiness 可视化与单技能 smoke test；
- MCP 路由接入并新增本地 `POST /mcp/execute` bridge；
- `openai-docs` 在无完整 MCP runtime 时可 fallback 到开发者文档定向搜索。
- 终端执行策略升级为白名单优先（`CKS_TERMINAL_POLICY=whitelist` 默认，`legacy` 可兼容旧行为）。
- 完成一次全面代码审查并修复高优先级问题：
  - 增加后端 `/health` 兼容路由；
  - 终端白名单增加参数级限制（阻断解释器绕过与链式执行）；
  - `skills/readiness` 增加 MCP bridge 可达性探测，减少“假 Ready”。
- 上线审计日志 v1：`agent-sdk/data/audit/` 下输出 execution/error 分离日志，含脱敏输入摘要与耗时。

## Progress Update 2026-02-06 (Audit + UI)
- Added backend audit query APIs and validated:
  - `GET /audit/executions`
  - `GET /audit/errors`
  - supports `session_id` and `limit`
- Added frontend API bindings:
  - `AgentService.getAuditExecutions(sessionId?, limit?)`
  - `AgentService.getAuditErrors(sessionId?, limit?)`
- Added Skills page "Skill Audit Snapshot" panel:
  - shows recent execution logs
  - shows recent error logs
  - supports manual refresh
- Added shared TypeScript models for audit records.
- Build validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/agent.py agent-sdk/core/audit_logger.py` passed
  - `npm run build` in `desktop-app/` passed
- Added API interface documentation: `docs/agent-sdk-skills-audit-api.md`
- Added conversation test prompts: `docs/skills-test-prompts.md`
## Progress Update 2026-02-06 (Comprehensive Review Fixes Round 2)
- Completed full code review for backend/frontend/tauri terminal execution path.
- Fixed high-risk tar extraction traversal check:
  - replaced fragile `startswith` path guard with `Path.relative_to(...)` containment check.
- Tightened MCP readiness probe signal:
  - only `HTTP 200/400` treated as reachable, avoiding false-ready on 401/403/404.
- Fixed audit schema compatibility:
  - backend query now maps legacy keys (`ts/tool/input`) to new keys (`timestamp/tool_name/tool_input`).
  - audit writer now emits both legacy + new keys for forward/backward compatibility.
- Fixed cross-platform terminal execution path:
  - Windows uses `cmd /S /C`; non-Windows uses `sh -lc`.
- Tightened interpreter command policy:
  - python/node script path restricted to current working directory scope.
  - blocks stdin script mode (`python -` / `node -`) under whitelist policy.
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/skill_installer.py agent-sdk/core/audit_logger.py` passed
  - `npm run build` (desktop-app) passed
  - `cargo check` (desktop-app/src-tauri) passed
## Progress Update 2026-02-06 (Audit Panel Filters)
- Upgraded audit query API to support server-side `tool_name` filter:
  - `GET /audit/executions?tool_name=...`
  - `GET /audit/errors?tool_name=...`
- Upgraded Skills page audit panel to support interactive filters:
  - session_id
  - tool_name
  - limit
  - Apply / Reset controls
- Frontend AgentService audit methods now accept optional `toolName` argument.
- Validation passed:
  - `python -m py_compile agent-sdk/main.py`
  - `npm run build` (desktop-app)
  - `cargo check` (desktop-app/src-tauri)
## Progress Update 2026-02-06 (Comprehensive Review Fixes Round 3)
- Terminal policy parser hardened:
  - replaced whitespace-only token split with quote-aware token parsing;
  - removed forced lowercasing of all tokens (keeps real script paths intact);
  - command/subcommand checks now use case-insensitive comparisons safely.
- Startup dependency install policy changed:
  - default no auto `pip install` on backend startup;
  - missing deps are logged;
  - explicit opt-in via `CKS_AUTO_INSTALL_DEPS=1`.
- CORS policy tightened:
  - removed default wildcard origin;
  - added configurable `CORS_ALLOW_ORIGINS` (comma-separated);
  - auto-disables credentials if wildcard is explicitly configured.
- Audit query performance improved:
  - switched from `readlines()` full-file loading to reverse streaming iterator for JSONL files.
- Validation passed:
  - `python -m py_compile agent-sdk/main.py`
  - `cargo check` (desktop-app/src-tauri)
  - `npm run build` (desktop-app)
## Progress Update 2026-02-06 (Audit UI Visibility)
- Improved Skills page audit section visibility:
  - added active filter summary chips (session/tool/limit) under "Skill Audit Snapshot" title.
- Purpose: make frontend changes immediately observable while testing.
- Validation: `npm run build` (desktop-app) passed.
## Progress Update 2026-02-06 (Skills Page Chinese UI)
- Localized newly-added Skills audit UI to Chinese:
  - "Skill Audit Snapshot" => "技能审计快照"
  - filter labels/placeholders/buttons/status texts converted
  - execution/error list texts converted
- Localized readiness badges to Chinese on skill cards:
  - Ready/Missing/Blocked/Error => 就绪/缺依赖/已拦截/异常
- Localized skill category display labels for common English categories (community/document/productivity/etc.).
- Build validation: `npm run build` passed.
## Progress Update 2026-02-06 (Audit Time Range Filter)
- Added backend audit query time range filters:
  - `from_time` (ISO datetime)
  - `to_time` (ISO datetime)
  - applied to both `/audit/executions` and `/audit/errors`.
- Added frontend Skills audit panel time filter UI:
  - from/to datetime-local inputs
  - filter chips now show active time range.
- AgentService audit APIs now support `fromTime` / `toTime`.
- Updated API doc: `docs/agent-sdk-skills-audit-api.md`.
- Validation passed:
  - `python -m py_compile agent-sdk/main.py`
  - `npm run build` (desktop-app)
## Progress Update 2026-02-06 (Audit Export)
- Added Skills audit panel export actions:
  - `导出JSON`: exports current filtered snapshot + filter metadata
  - `导出CSV`: exports execution/error rows in flat tabular format
- Export respects current filters (session/tool/from/to/limit) since it exports current panel data.
- Validation: `npm run build` (desktop-app) passed.
## Progress Update 2026-02-06 (Chinese UI + Audit Export)
- Skills page language polish for customer-facing Chinese usage:
  - readiness labels/status chips localized
  - audit panel labels/buttons/empty states localized
  - category display mapping for common English category keys
  - skill card badges localized (AI能力/应用/社区)
- Added audit export in Skills page:
  - 导出JSON
  - 导出CSV
- Validation: `npm run build` passed.
## Progress Update 2026-02-06 (Chinese UI Sweep - Navigation + Empty States)
- Rebuilt sidebar navigation text in clean Chinese:
  - 工作台 / 记忆 / 技能 / 设置
  - tooltip titles fully localized.
- Rebuilt SkillsList empty-state copy in clean Chinese and added category label mapping.
- Fixed latent malformed text issue in previous SkillsList rendering branch.
- Validation: `npm run build` (desktop-app) passed.
## Progress Update 2026-02-06 (Chinese UI Sweep - Round 2)
- Rebuilt conversation sidebar (`ChatHistorySidebar`) with clean Chinese copy:
  - 新建对话 / 暂无对话 / 条消息 / 共 X 个对话 / 删除确认文案.
- Rebuilt chat input component (`ChatInput`) with clean Chinese copy:
  - 输入占位、执行中提示、停止、上传文件、发送消息、键盘提示.
- Rebuilt tool status card (`ToolCallCard`) with clean Chinese state labels:
  - 执行中 / 已完成 / 执行失败 / 等待审批 / 已拒绝.
- Rebuilt permission approval dialog (`PermissionApprovalDialog`) with clean Chinese copy and risk labels.
- Localized Settings avatar alt text.
- Validation: `npm run build` (desktop-app) passed.
## Progress Update 2026-02-06 (Task List + Development Continuation)
- Reviewed Sprint-01 task list and identified remaining key items:
  - C1 对话触发用例未正式打勾（find-skills/openai-docs/spreadsheet）
  - C2 安全策略场景回归用例未正式打勾
  - D 输出项中“风险清单更新”和“演示脚本”仍需补齐
- Completed this round development items:
  - Added API smoke test script: `agent-sdk/scripts/sprint1_api_smoke.py`
  - Added dedicated risk register: `docs/risk-register.md`
- Validation:
  - `python -m py_compile agent-sdk/scripts/sprint1_api_smoke.py` passed
## Progress Update 2026-02-06 (Task-driven Development Continuation)
- Reviewed task list and continued implementing remaining Sprint-01 items by testability.
- Added backend unit tests for repetition guard logic:
  - `agent-sdk/tests/test_repetition_guard.py`
  - validates same-parameter repetition counter increment + reset behavior.
- Added Tauri terminal policy unit tests:
  - `desktop-app/src-tauri/src/lib.rs` test module
  - covers dangerous command blocking, git read-only allowlist, git write blocking, python inline blocking, and workdir script-scope enforcement.
- Refactored agent loop repetition-state update into helper for easier regression testing:
  - `update_repetition_state(...)` in `agent-sdk/core/agent.py`
- Marked checklist item updates:
  - 高风险命令被拒绝并提示原因 -> 已完成
  - 重复同参数工具调用不会无限循环 -> 已完成
- Validation:
  - `python -m unittest agent-sdk/tests/test_repetition_guard.py` passed
  - `cargo test --lib` (desktop-app/src-tauri) passed (5 tests)
  - `npm run build` (desktop-app) passed
## Progress Update 2026-02-06 (Acceptance Task Tooling)
- Added dialogue acceptance runner for remaining C1 checklist prompts:
  - `agent-sdk/scripts/sprint1_dialogue_acceptance.py`
  - runs three standard prompts against `/chat` and prints response/tool-call summary.
- Script output also reminds manual verification path for item 109 (审批拒绝后继续任务反馈).
- Validation:
  - `python -m py_compile agent-sdk/scripts/sprint1_dialogue_acceptance.py` passed
- Current remaining unchecked items: 4 (C1 x3 + C2 x1).
- Tried running `sprint1_dialogue_acceptance.py` against `http://127.0.0.1:7860`, but timed out in current environment; keep C1 manual acceptance pending.
## Progress Update 2026-02-07 00:10 (Task List Execution)
- Ran Sprint-01 dialogue acceptance against local backend after starting uvicorn.
- Added stronger dialogue acceptance runner:
  - `agent-sdk/scripts/sprint1_dialogue_acceptance.py`
  - now emits pass/fail summary + JSON report under `data/`.
- Latest run report:
  - `data/sprint1_dialogue_acceptance_20260207_000756.json`
- Checklist updated:
  - C1 三条标准对话全部打勾（find-skills/openai-docs/spreadsheet）。
- Remaining unchecked item count: 1
  - 审批拒绝后，任务可继续并给出友好反馈（需桌面端人工拒绝验收一次）。
## Progress Update 2026-02-07 00:25 (Final Pending Acceptance Closed)
- Added permission-denial acceptance script:
  - `agent-sdk/scripts/sprint1_permission_denial_acceptance.py`
  - simulates desktop tool deny by posting denied result to `/tools/desktop-result` after receiving `desktop_tool_request` from `/chat/stream`.
- Executed script against local backend and passed:
  - saw_desktop_request=True
  - posted_denial=True
  - saw_done=True
  - friendly_feedback=True
- Checklist update:
  - “审批拒绝后，任务可继续并给出友好反馈” -> 已完成
- Sprint-01 checklist now has 0 unchecked items.
- Validation:
  - `python -m py_compile agent-sdk/scripts/sprint1_permission_denial_acceptance.py` passed
  - script run result: PASS

## Progress Update 2026-02-07 00:55 (Continue Run + Sprint-02 Kickoff)
- Continued development immediately after Sprint-01 closure with goal-management integration.
- Added Goal API SDK client methods in desktop service:
  - `getGoalsTree`, `createKPI`, `createOKR`, `createGoalProject`, `createGoalTask`, `completeGoalTask`.
- Added desktop Goal page and routing:
  - new page `desktop-app/src/pages/Goals.tsx` (KPI/OKR/Project/Task create + progress tree + task completion).
  - route `/goals` and sidebar entry “目标”.
- Added Sprint-02 API acceptance tooling:
  - `agent-sdk/scripts/sprint2_goals_api_smoke.py`
- Added backend unit tests for Goal manager roll-up logic:
  - `agent-sdk/tests/test_goal_manager.py`
- Next validation round (running now in this cycle): backend tests + frontend build + Sprint-02 smoke.
## Progress Update 2026-02-07 01:00 (Validation + Continue Run)
- Validation completed after Sprint-02 kickoff changes:
  - `python -m unittest agent-sdk/tests/test_repetition_guard.py agent-sdk/tests/test_goal_manager.py` passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py agent-sdk/scripts/sprint2_goals_api_smoke.py` passed.
  - `npm run build` (desktop-app) passed.
  - `cargo test --lib` (desktop-app/src-tauri) passed.
- Goals API flow validated with FastAPI TestClient inline run:
  - create KPI -> create OKR -> create project -> create task -> complete task -> read `/goals/tree`.
  - observed successful chain and data return (`GOALS_API_INLINE_PASS`).
- Note:
  - standalone uvicorn startup in this environment can be slow/noisy due model loading; TestClient path used for deterministic API verification in this round.
## Progress Update 2026-02-07 01:15 (继续跑 + 任务关键链路)
- 完成「目标任务自动回写」第一版：
  - `ChatRequest` 新增 `goal_task_id` 绑定字段。
  - `/chat/stream` 在检测到成功 `tool_result` 后、`done` 时自动回写 `goal_manager.complete_task(goal_task_id)`。
  - `/chat` 非流式也增加保底回写逻辑（存在 tool_calls 即触发）。
- 完成任务列表筛选（from/to）与导出：
  - 新增后端接口 `GET /goals/tasks`，支持 `assignee/status/from_time/to_time/limit`。
  - `GoalManager` 新增 `list_tasks(...)` 支持时间范围与负责人过滤。
  - 目标页新增筛选区（负责人/状态/from/to）与 `CSV` 导出。
- 完成目标页与工作台联动：
  - 目标页任务支持“绑定”到工作台（`localStorage: cks.activeGoalTaskId`）。
  - 工作台发送对话时自动携带 `goal_task_id`，并显示当前绑定提示。
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/goal_manager.py agent-sdk/models/request.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed.
  - `npm run build` (desktop-app) passed.
  - TestClient 自动回写验证脚本：`AUTO_WRITEBACK_PASS`。
## Progress Update 2026-02-07 01:35 (目标页任务详情抽屉 + 一键回放)
- Goals 页面新增“任务详情抽屉”：
  - 在任务筛选列表中新增“详情/回放”按钮，点击打开右侧抽屉。
  - 抽屉展示任务基础信息（负责人/状态/进度/层级）与日志区块。
- 完成“一键回放该任务相关审计日志”链路：
  - 审计日志新增 `goal_task_id` 字段写入（execution/error）。
  - `/audit/executions` 与 `/audit/errors` 新增 `goal_task_id` 过滤参数。
  - 前端回放按钮按 `goal_task_id + from/to` 联动查询并展示执行/错误日志。
- 兼容性：
  - 保持 Skills 页面原有审计筛选调用兼容（参数顺序未破坏）。
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/agent.py agent-sdk/core/goal_manager.py agent-sdk/core/audit_logger.py agent-sdk/models/request.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed.
  - `npm run build` (desktop-app) passed.
  - 审计过滤验证：`AUDIT_GOAL_FILTER_OK`.
## Progress Update 2026-02-07 01:45 (继续开发：按会话持久绑定任务)
- 将“工作台绑定任务”从 `localStorage` 单键模式升级为“按会话持久绑定”：
  - `chatStore` 新增 `sessionGoalTaskMap`；
  - 新增操作：`setSessionGoalTask / clearSessionGoalTask / getSessionGoalTask`；
  - 删除会话时同步清理绑定关系。
- Goals 页面绑定按钮改为写入当前会话映射（而非全局键）。
- Workbench 读取当前 `currentSessionId` 对应绑定任务并自动透传 `goal_task_id`，多会话切换时自动切换绑定任务。
- Validation:
  - `npm run build` (desktop-app) passed.
## Progress Update 2026-02-07 10:25 (评审修复 + 新功能继续)
- 评审后先修复高风险回写逻辑：
  - 删除 `/chat` 非流式“只要有 tool_calls 就完成任务”的误判逻辑；
  - `/chat/stream` 回写条件升级为：存在成功工具调用，且不存在失败工具调用，且流中无 error 事件。
- 新功能继续开发（任务详情抽屉增强）：
  - 新增“导出该任务审计 JSON”按钮；
  - 新增“关联会话 ID”聚合展示；
  - 执行/错误日志支持查看输入输出详情（折叠展开）。
- Validation:
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/agent.py agent-sdk/core/audit_logger.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed.
  - `npm run build` (desktop-app) passed.
  - 回写防误判验证：`COMPLETION_GUARD_OK`.
## Progress Update 2026-02-07 10:40 (主链路优先：桌面打包流水线)
- 根据“避免过度打磨单模块”的反馈，优先推进全局主链路能力：跨平台打包。
- 新增 GitHub Actions 桌面打包流水线：
  - `.github/workflows/desktop-bundle.yml`
  - 支持 `windows-latest` / `macos-latest` 双平台产物上传（exe / dmg 相关 bundle）。
- 对齐 Tauri 构建命令，降低环境依赖耦合：
  - `desktop-app/src-tauri/tauri.conf.json` 中 `beforeDevCommand`/`beforeBuildCommand` 统一为 `npm run ...`。
- 新增文档：
  - `docs/desktop-release-pipeline.md`（本地打包命令 + CI 触发与产物路径）。
- Validation:
  - `npm run build` (desktop-app) passed.
## Progress Update 2026-02-07 11:00 (继续开发：桌面端后端自启动 + 打包资源)
- 增加桌面端 Agent SDK 自启动能力（主链路优先）：
  - Tauri 新增 `start_agent_service` 命令；
  - 启动时自动探测并尝试拉起本地 Agent SDK（优先检查 health，避免重复启动）；
  - 支持从环境变量、资源目录、常见开发目录自动定位 `agent-sdk/main.py`。
- 桌面打包资源补齐：
  - `tauri.conf.json` 的 bundle resources 新增 `../../agent-sdk`，确保打包产物内包含后端代码资源。
- 前端接入：
  - App 启动时（Tauri 环境）自动调用 `startAgentService`，提高开箱即用性。
- Validation:
  - `cargo test --lib` (desktop-app/src-tauri) passed.
  - `npm run build` (desktop-app) passed.
  - `npm run tauri:build -- --bundles msi` 在当前环境超时（>240s），已确认命令可执行，后续在 CI 完整验证。
## Progress Update 2026-02-07 11:15 (继续开发：启动前自检能力)
- 新增 Agent SDK 启动前自检命令：
  - Tauri 命令 `get_agent_startup_diagnostics`，返回：
    - 是否已运行
    - 可用 agent-sdk 路径
    - Python 启动器可用性
    - 启动可行性与修复建议 hints
- 强化 `start_agent_service`：
  - 启动前先检查 python/py 可用，避免静默失败。
- 前端接入：
  - 启动失败时自动读取 diagnostics 并输出结构化日志（便于定位安装环境问题）。
- Validation:
  - `cargo test --lib` (desktop-app/src-tauri) passed.
  - `npm run build` (desktop-app) passed.
## Progress Update 2026-02-07 11:30 (继续开发：首启健康卡)
- 在设置页新增“Agent 启动健康”卡片（Tauri 环境可见）：
  - 展示：运行状态、可启动性、Python 启动器、SDK 路径；
  - 支持：刷新诊断、一键启动后端；
  - 启动失败时展示 hints，便于非技术用户定位问题。
- 对接命令：
  - `get_agent_startup_diagnostics`
  - `start_agent_service`
- Validation:
  - `npm run build` (desktop-app) passed.
  - `cargo test --lib` (desktop-app/src-tauri) passed.
## Progress Update 2026-02-07 11:45 (前端可视化优先：设置页重构)
- 根据“先看前端效果”的需求，重构 Settings 页面为可展示版本（中文统一 + 功能可点）：
  - 账号信息、助手名称/头像、密码区、退出登录；
  - 桌面环境下保留 Agent 启动健康卡（刷新诊断/一键启动）；
  - 修复此前页面文案乱码与可读性问题。
- Validation:
  - `npm run build` (desktop-app) passed.
## Progress Update 2026-02-07 12:00 (前端可视化继续：工作台重构)
- Workbench 页面完成可展示版本重构（中文文案 + 绑定状态 + 审批交互保持可用）：
  - 修复此前页面文案乱码；
  - 保留桌面工具审批流、搜索结果流、任务绑定回写参数透传；
  - 头部状态对“已绑定任务”展示更清晰。
- Validation:
  - `npm run build` (desktop-app) passed.
## Progress Update 2026-02-07 12:25 (Memory System Optimization Round 1)
- Completed memory quality upgrade focused on practical retrieval effect (not over-polishing UI):
  - `save_memory` now performs normalized duplicate detection (same user + type + normalized content).
  - Duplicate hit no longer creates a new row/index entry; it merges metadata and refreshes importance/access timestamps.
  - New memories now write `importance` explicitly (estimated by memory type + keyword heuristics + metadata override).
- Retrieval quality improved:
  - Added unified reranking with combined score = retrieval score + importance boost + recency boost + light access-count boost.
  - Applied reranking to both hybrid retrieval path and legacy fallback path.
  - Search outputs now carry `importance`/`access_count` consistently so ranking has stable signals.
- Added regression tests:
  - `agent-sdk/tests/test_memory_manager.py`
  - verifies duplicate deduplication and ranking preference for high-importance memories.
- Validation:
  - `python -m py_compile agent-sdk/core/memory.py agent-sdk/core/agent.py agent-sdk/core/audit_logger.py agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed.
## Progress Update 2026-02-07 12:40 (Memory Optimization Round 2: Near-Duplicate)
- Upgraded memory dedup from exact-only to near-duplicate aware:
  - `agent-sdk/core/memory.py`
  - added `_text_similarity(...)` using normalized text + `SequenceMatcher`.
  - `_find_duplicate_memory(...)` now supports configurable near-duplicate threshold via env:
    - `MEMORY_DUPLICATE_THRESHOLD` (default `0.96`).
  - invalid env values auto-fallback to safe default.
- Added test coverage for near-duplicate behavior:
  - `agent-sdk/tests/test_memory_manager.py`
  - new test: same semantic sentence with punctuation/date format variation dedups under threshold.
- Validation:
  - `python -m py_compile agent-sdk/core/memory.py agent-sdk/core/agent.py agent-sdk/core/audit_logger.py agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed (8 tests).
  - `npm run build` (desktop-app) passed.
## Progress Update 2026-02-07 13:00 (Memory UX Round 3: 命中解释可视化)
- Completed Memory page visual + readability upgrade (Chinese UI cleanup):
  - Rewrote `desktop-app/src/pages/Memory.tsx` with clean Chinese copy and stable controls.
  - Rewrote memory components:
    - `desktop-app/src/components/memory/MemoryCard.tsx`
    - `desktop-app/src/components/memory/MemoryList.tsx`
    - `desktop-app/src/components/memory/SearchBar.tsx`
- Added “命中解释” visualization in search results:
  - Displays `综合分 / 检索分 / 向量分 / 关键词分 / 重要度加分 / 时效加分` per memory card.
  - Supports one-click toggle for score explanation visibility in the Memory header.
  - Keeps search mode toggle (`混合检索` vs `向量检索`) and aligns copy with Chinese users.
- Type contract extended for frontend memory rendering:
  - `desktop-app/src/types/agent.ts` adds optional `final_score/score/vector_score/text_score/source` on `Memory`.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed.
## Progress Update 2026-02-07 13:10 (Memory UX Round 4: 命中原因标签)
- Continued memory explainability upgrade for business readability:
  - `desktop-app/src/components/memory/MemoryCard.tsx`
  - Added “命中原因标签” in explanation panel (e.g. `关键词直匹配` / `语义向量召回` / `高重要度` / `高频访问` / `近期记忆`).
  - Reason chips are inferred from retrieval source + importance + access count + recency signals.
- This round reduces cognitive load for non-technical users: they can see *why* a memory surfaced before reading raw scores.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed.
## Progress Update 2026-02-07 13:30 (Memory UX Round 5: 排序/筛选/导出增强)
- Continued with higher delivery density on Memory module (functional-first):
  - `desktop-app/src/pages/Memory.tsx`
  - Added multi-mode sorting:
    - `按综合分排序`
    - `按时间排序`
    - `按重要度排序`
  - Added source filtering (`全部来源 / 关键词直匹配 / 语义向量 / 关键词检索`).
  - Added one-click focus filter `仅看高优先级` (importance >= 8).
  - Added export of current filtered view:
    - `导出 JSON`
    - `导出 CSV`
  - Added “可解释命中”统计，便于评估检索解释覆盖率。
- Kept existing explainability path intact (reason chips + score breakdown), and integrated with new sorting/filtering pipeline.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed.
## Progress Update 2026-02-07 14:00 (Memory Anti-Corrosion Round 1)
- Backend anti-corrosion capability delivered in `agent-sdk/core/memory.py`:
  - Added freshness metadata on save (`ttl_days` / `verified_at` / `expires_at`) by memory type.
  - Added conflict detection for factual memories (e.g. same key with different email/phone/fact value), marking `conflict_status=pending_review` and cross-linking conflict ids.
  - Added stale/conflict-aware reranking penalties to reduce outdated/conflicting memories being surfaced.
  - Search/list payload now carries `metadata`, `stale`, `conflict_status` for frontend explainability.
  - Added maintenance compaction API logic (`compact_memories`): near-duplicate cleanup + stale low-value noise pruning.
- Backend API exposed:
  - `POST /memory/maintenance/compact`
  - params: `user_id`, `dedupe_threshold`, `stale_days`, `dry_run`.
- Frontend memory page enhanced:
  - Added one-click `抗腐蚀维护` action (calls compact API) and result feedback banner.
  - Memory card now highlights `已过期待确认` / `存在冲突待确认`.
  - Memory export now includes `stale` and `conflict_status` fields.
- Added/updated tests:
  - `agent-sdk/tests/test_memory_manager.py` now covers:
    - freshness metadata injection,
    - factual conflict tagging,
    - compaction stale pruning,
    - existing dedupe/rerank tests.
- Validation:
  - `python -m py_compile agent-sdk/core/memory.py agent-sdk/main.py agent-sdk/core/agent.py agent-sdk/core/audit_logger.py` passed.
  - `python -m unittest agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed (11 tests).
  - `npm run build` (desktop-app) passed.
## Progress Update 2026-02-07 14:20 (Memory Anti-Corrosion Round 2: 冲突处理闭环 + 维护预览)
- Completed anti-corrosion operational loop closure:
  - Backend conflict resolution API:
    - `POST /memory/{memory_id}/resolve-conflict?action=accept_current|keep_all`
    - resolves selected memory and propagates linked conflict states (`resolved` / `superseded`).
  - Frontend conflict handling action:
    - Memory card supports one-click conflict confirmation for `pending_review` items.
  - Added maintenance dry-run preview in Memory page:
    - `预览维护` calls compact API with `dry_run=true` and reports would-be dedupe/prune counts.
- Backend structure updates:
  - `MemoryManager.resolve_conflict(...)` added.
  - `list_memories`/search pipeline now consistently surfaces conflict/stale fields for UI and export.
- Frontend UX updates:
  - Memory action bar adds `预览维护` next to `抗腐蚀维护`.
  - Memory list wiring supports conflict resolve callback from page to card.
- Test expansion:
  - Added `resolve_conflict` regression test in `agent-sdk/tests/test_memory_manager.py`.
  - Test suite now covers freshness, conflict detection, conflict resolution, and compaction.
- Validation:
  - `python -m py_compile agent-sdk/core/memory.py agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed (12 tests).
  - `npm run build` (desktop-app) passed.
## Progress Update 2026-02-07 14:40 (Memory Anti-Corrosion Round 3: 巡检计划 + 冲突队列)
- Added scheduled maintenance capability in backend memory service:
  - `run_scheduled_maintenance(...)` with interval gating (`memory_maintenance_last_run`) and optional force run.
  - New APIs:
    - `POST /memory/maintenance/auto-run`
    - `GET /memory/maintenance/report`
    - `GET /memory/conflicts`
- Added report/conflict data capabilities:
  - `list_conflicts(...)` for queue-style conflict triage.
  - `get_maintenance_report(...)` for non-mutating anti-corrosion inspection metrics.
- Frontend Memory page now supports operational巡检 flow:
  - page load triggers scheduled auto-run check (due-based).
  - maintenance report summary cards added (pending conflicts / stale / dedupe candidates / stale prune candidates).
  - added `仅看待处理冲突` quick filter to focus conflict queue in current list.
- Frontend service/types expanded for new maintenance/conflict endpoints and result models.
- Tests expanded:
  - maintenance report counts test,
  - scheduled maintenance due/skip behavior test.
- Validation:
  - `python -m py_compile agent-sdk/core/memory.py agent-sdk/main.py agent-sdk/core/agent.py agent-sdk/core/audit_logger.py` passed.
  - `python -m unittest agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed (14 tests).
  - `npm run build` (desktop-app) passed.
## Progress Update 2026-02-07 15:00 (Main Chain Focus: Goals -> Workbench Execution Jump)
- Shifted focus from deep memory-only work back to core product chain (goal execution loop):
  - `desktop-app/src/pages/Goals.tsx`
  - Added one-click `开始执行` actions in three places:
    - goal tree task row,
    - filtered task list row,
    - task detail drawer.
- New behavior:
  - clicking `开始执行` auto-creates a dedicated chat session for that task,
  - binds `goal_task_id` to the new session,
  - navigates directly to `/workbench` for immediate execution.
- This strengthens your target path:
  - KPI/OKR/项目/任务管理 -> 进入执行 -> Agent处理 -> 回写进度/审计回放.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed.
## Progress Update 2026-02-07 15:20 (Main Chain Focus: Workbench Task Execution Panel)
- Continued shifting from module-deepening to core execution chain delivery.
- Goals/Workbench chain enhancements:
  - Backend goals tasks listing now supports `task_id` filter for direct task lookup (`GoalManager.list_tasks` + `/goals/tasks`).
  - Frontend service `listGoalTasks` now supports `taskId` option.
  - Workbench now renders active task execution panel when session has `goal_task_id`:
    - shows bound task title/status/progress,
    - shows completion writeback badge when task status is `done`,
    - provides quick execution prompts (one-click send) to start agent actions immediately.
- This closes a key experience gap:
  - from Goals page `开始执行` jump -> Workbench sees concrete task context -> one-click structured execution prompts -> execution/writeback loop.
- Added regression test for new `task_id` filter path:
  - `agent-sdk/tests/test_goal_manager.py::test_list_tasks_filter_by_task_id`.
- Validation:
  - `python -m py_compile agent-sdk/core/goal_manager.py agent-sdk/main.py agent-sdk/core/memory.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (15 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 17:15 (Main Chain: Task Review Acceptance/Rejection)
- Completed goal-task human review loop for the execution main chain.
- Backend:
  - added `GoalTaskReviewRequest` model and `/goals/task/{task_id}/review` API.
  - `GoalManager.review_task(...)` now supports `accept/reject`, writes review metadata, and updates progress roll-up.
  - completion path now sets `review_status=pending` to make post-execution acceptance explicit.
- Frontend:
  - Goals detail drawer now includes `人工验收` panel with `验收通过/驳回返工` actions and reviewer notes.
  - task list and detail both display localized review status (`待验收/已验收/已驳回`).
  - review metadata (`reviewed_by/reviewed_at/review_note`) is visible in task details.
- Tests and validation:
  - added goal manager tests for accept/reject transitions and invalid decision handling.
  - `python -m py_compile agent-sdk/core/goal_manager.py agent-sdk/main.py agent-sdk/core/memory.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (17 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 17:21 (Main Chain: 待验收筛选 + 批量验收)
- Continued main-chain delivery on Goals operations instead of deep single-module polishing.
- Backend:
  - goals task listing now supports `review_status` filter (pending/accepted/rejected).
  - `GET /goals/tasks` accepts `review_status` query param and passes through to goal manager.
- Frontend:
  - Goals task filters now include review-status selector.
  - Added one-click `仅看待验收` quick filter.
  - Added batch review operation area:
    - visible-task checkbox selection,
    - `批量验收通过` / `批量驳回返工`,
    - optional batch review note.
- Tests and validation:
  - Added `GoalManager` test for `review_status` filtering behavior.
  - `python -m py_compile agent-sdk/core/goal_manager.py agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (18 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 17:23 (Main Chain: Workbench 待验收提醒跳转)
- Implemented workbench-to-review reminder bridge after execution writeback:
  - Workbench now detects bound task with `status=done` and `review_status=pending`.
  - Shows clear reminder card with `前往任务验收` and `暂不处理` actions.
- Added direct jump path:
  - clicking `前往任务验收` navigates to Goals page with `task_id` query.
  - Goals page auto-opens that task detail drawer and triggers audit replay loading for immediate review context.
- This shortens the manager loop:
  - 执行成功 -> 回写完成 -> 待验收提醒 -> 一键跳转验收。
- Validation:
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 17:26 (Main Chain: 验收后自动回跳 Workbench + 结果提示)
- Added round-trip review flow between Workbench and Goals:
  - Workbench jump now carries source marker: `/goals?task_id=...&from=workbench`.
  - Goals review success (accept/reject) now auto-navigates back to Workbench with result query.
- Added review-result feedback in Workbench:
  - Workbench reads `review_task_id` + `review_result` query and shows localized result toast.
  - feedback auto-clears after 8 seconds to avoid persistent visual noise.
- User flow now:
  - Workbench execution -> pending reminder -> jump to review -> approve/reject -> auto-return Workbench with result status.
- Validation:
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 17:28 (Main Chain: 驳回返工快捷执行)
- Improved post-review actionability in Workbench feedback area:
  - after reject return, Workbench now shows one-click actions:
    - `一键生成返工计划`
    - `开始返工第一步`
  - after accept return, Workbench now shows one-click action:
    - `规划下一阶段任务`
- All actions directly send structured prompts in current session, reducing manager-to-execution handoff friction.
- Validation:
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 17:33 (Main Chain: Plan/Do/Verify 执行器 + 可中断恢复)
- Added session-level execution flow state persistence in chat store:
  - new `sessionExecutionFlowMap` persisted with session data.
  - tracks `taskId`, `phase(plan/do/verify)`, `note`, `updatedAt`.
- Workbench now has a task execution cockpit:
  - `Plan：生成计划` / `Do：开始执行` / `Verify：验证交付`
  - `恢复当前阶段` to continue interrupted runs
  - `恢复备注` save/load for interruption context
  - `重置流程` for clean restart.
- Review linkage integration:
  - on reject return, flow auto-switches to `do` stage.
  - on accept return, flow auto-switches to `verify` stage.
- Validation:
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 17:50 (Lightweight Target: Route-Level Lazy Loading)
- Implemented page-level code splitting in app router:
  - Workbench / Memory / Skills / Goals / Settings now loaded via `React.lazy`.
  - Added page-level `Suspense` fallback (`页面加载中...`).
- Outcome:
  - removed large single-chunk warning and significantly reduced initial bundle size.
  - current build output now shows per-page chunks (e.g., `Goals-*.js`, `Workbench-*.js`) instead of one oversized entry chunk.
- Validation:
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 17:53 (Demo Readiness: 一键演示数据 + 演示脚本)
- Added `一键生成演示数据` in Goals page:
  - auto-creates a demo KPI / OKR / project / 3 tasks for quick live demo setup.
  - auto-selects created hierarchy and refreshes tree/list data.
- Added demo operation playbook:
  - `docs/demo-runbook.md` covers 10-minute speaking + click path.
  - includes fallback handling for common on-stage issues.
- Validation:
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 18:01 (Execution Engine v1: 后端任务阶段状态机落地)
- Backend added persisted task execution state model (GoalManager):
  - new tables: `task_execution_flows`, `task_execution_events`.
  - supports state read/update/resume for phases `plan/do/verify`.
- Added Goal APIs:
  - `GET /goals/task/{task_id}/execution/state`
  - `POST /goals/task/{task_id}/execution/phase`
  - `POST /goals/task/{task_id}/execution/resume`
- Frontend Workbench now uses backend execution-state APIs:
  - phase switch persists to backend.
  - resume button uses backend-generated `resume_prompt`.
  - notes/reset now sync backend state, not only local memory.
- Testing and validation:
  - added GoalManager unit tests for phase update/readback/resume/invalid input.
  - `python -m py_compile agent-sdk/core/goal_manager.py agent-sdk/main.py agent-sdk/models/request.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (21 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 18:10 (Manager MVP: 老板看板 + 记忆页乱码修复)
- Fixed Memory page Chinese mojibake for demo readability:
  - restored key UI labels/buttons/filter texts and maintenance notices to proper Chinese.
- Added manager dashboard MVP backend:
  - `GET /goals/dashboard` with optional `from_time/to_time/limit`.
  - returns summary cards + owner aggregate rows.
- Added manager dashboard MVP frontend:
  - new page `/board` with 4 key cards:
    - 待验收 / 进行中 / 已验收 / 驳回返工
  - owner task table with completion rate, avg progress, latest update.
  - sidebar entry `看板` added.
- Testing and validation:
  - added GoalManager test for dashboard summary/owner aggregation.
  - `python -m py_compile agent-sdk/core/goal_manager.py agent-sdk/main.py agent-sdk/models/request.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (22 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 18:22 (Manager UX: 看板到目标页联动筛选)
- Added board-to-goals deep-link actions per assignee row:
  - `查看任务` -> `/goals?assignee=...`
  - `待验收` -> `/goals?assignee=...&review_status=pending`
- Goals page now parses query filters and auto-applies:
  - `assignee`, `status`, `review_status`, `from_time`, `to_time`
  - enabling manager click-through from board to actionable task list.
- Validation:
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 18:28 (Manager Demo UX: 游戏风看板 + 一键发起执行)
- Enhanced board visualization for demo storytelling:
  - added `表格 / 游戏风` toggle mode.
  - game mode shows pixel-style mini avatars per assignee (click to open owner detail panel).
- Added assignee detail panel in board:
  - shows owner projects, completion rate, avg progress, latest update.
- Added one-click execution launch from board:
  - resolves owner next task (`next_task_id` / pending-review fallback / todo fallback),
  - auto-creates Workbench session, binds `goal_task_id`, and navigates to `/workbench`.
- Backend dashboard aggregation enriched:
  - owner rows now include `project_titles` and `next_task_id`.
- Validation:
  - `python -m unittest agent-sdk/tests/test_goal_manager.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (22 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 18:34 (Testing + Realistic Data Injection)
- Added reusable realistic data seed script:
  - `scripts/seed_realistic_demo_data.py`
  - injects multi-KPI/OKR/project/task dataset with mixed states:
    - todo / done-pending-review / accepted / rejected
    - plus execution phase states and resume records.
- Executed seed with reset for immediate demo dataset:
  - `python scripts/seed_realistic_demo_data.py --reset`
  - seeded 14 tasks; summary:
    - total 14 / pending_review 3 / in_progress 5 / accepted 6 / rejected 2.
- Regression validation rerun after seeding:
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (22 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 18:42 (Board Polish: 游戏风状态动画 + 再次压测数据)
- Board game-style view upgraded:
  - avatar now has status-driven visual cues:
    - 待验收 / 返工：脉冲提示
    - 执行中：跳动提示
    - 状态良好：静态
  - added per-owner status badge for faster manager scan.
- Improved board readability:
  - fully normalized Chinese labels in board page (header/cards/table/actions).
- Expanded demo data volume by running seed script again:
  - `python scripts/seed_realistic_demo_data.py`
  - current sample summary: total 28 / pending_review 6 / in_progress 10 / accepted 12 / rejected 4.
- Validation:
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (22 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 18:46 (Demo Data Consistency Fix)
- Found data-path mismatch during board demo:
  - desktop runtime may read `agent-sdk/data/goals.db`, while previous seed used `./data/goals.db`.
- Updated seed utility:
  - `scripts/seed_realistic_demo_data.py` now supports `--all-targets`
  - one command seeds both `./data` and `./agent-sdk/data`.
- Executed:
  - `python scripts/seed_realistic_demo_data.py --all-targets --reset`
  - both data paths now show identical summary:
    - total 14 / pending_review 3 / in_progress 5 / accepted 6 / rejected 2.
- Validation:
  - `python -m unittest agent-sdk/tests/test_goal_manager.py` passed.

## Progress Update 2026-02-07 18:52 (Board Interaction: 任务气泡 + 指定任务发起)
- Added owner-level task bubble area in board detail panel:
  - loads assignee task list and renders status-colored task bubbles.
  - bubble click now launches Workbench session bound to that specific task id.
- Improved game-mode card readability:
  - shows `下一任务 #id` hint directly on each assignee card.
- Re-seeded both data paths for immediate visual verification:
  - `python scripts/seed_realistic_demo_data.py --all-targets --reset`
  - summary remains: total 14 / pending_review 3 / in_progress 5 / accepted 6 / rejected 2.
- Validation:
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 18:48 (Board UX: 任务气泡二段操作)
- Refined owner task bubbles to avoid accidental execution on single click:
  - bubble click now selects task and opens action panel.
  - action panel supports:
    - `发起此任务执行`
    - `查看任务详情` (jump to Goals task drawer by `task_id`).
- This improves demo controllability:
  - managers can preview selected task status before starting execution.
- Validation:
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 18:56 (Board Scheduling: 设为下一任务)
- Added manager scheduling override for next task:
  - backend table `assignee_next_tasks` stores per-assignee preferred next task.
  - new API `POST /goals/dashboard/next-task` to set override.
  - dashboard owner rows now honor this override via `next_task_id`.
- Frontend board integration:
  - selected task panel now supports `设为下一任务`.
  - header shows current `next_task_id`, so manager sees scheduling effect immediately.
- Tests and validation:
  - added GoalManager test for next-task override path.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py` passed (12 tests).
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (23 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 19:18 (Demo Data Rename + Encoding Repair Tool)
- Updated demo assignee names (removed placeholders like ����/����):
  - now uses: `Ava Chen`, `Leo Wang`, `Iris Zhou`, `Noah Xu`.
  - file: `scripts/seed_realistic_demo_data.py`.
- Added historical text-repair script for local demo DBs:
  - new file: `scripts/repair_demo_text.py`
  - supports repairing potential mojibake records in:
    - `goals.db` task/flow/event text fields
    - `memories.db` semantic memory and preference text fields.
- Re-seeded both runtime data paths:
  - `python scripts/seed_realistic_demo_data.py --all-targets --reset`
  - summary: total 14 / pending_review 3 / in_progress 5 / accepted 6 / rejected 2.
- Executed encoding repair pass:
  - `python scripts/repair_demo_text.py`
  - result: no remaining broken rows in current demo DBs.
- Validation:
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (23 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 19:42 (Board: Boss Dispatch Center MVP)
- Added a new ���ϰ��ɵ����ġ� block on board page (`/board`):
  - select project from goals tree
  - fill task title / assignee / due time / reviewer / requirement
  - one-click create task from board
- Dispatch flow integration:
  - optionally auto-set the newly created task as assignee ��next task��
  - optionally auto-jump to Workbench and bind the new task for immediate execution
- Added assignee quick suggestions in dispatch form from current dashboard owner list.
- Kept it lightweight by reusing existing task schema:
  - dispatch metadata (due/reviewer/requirement) stored in task description with structured header `[�ɵ���Ϣ]`.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py` passed (12 tests).

## Progress Update 2026-02-07 19:56 (Board: ת�˹������� + һ���������)
- �ڿ���������ת�˹������ء�ģ�飺
  - ������Դ��`review_status = rejected` �����б���֧�� from/to ʱ��ɸѡ����
  - ������ʾ��Agent �޷���� -> ת�˹����֡�����С�ջ���
- ÿ��ת�˹�����֧�����ද����
  - `���� Workbench �޸�`���Զ��󶨸����񲢽���ִ�лỰ��
  - `�鿴��������`����ת Goals ����鿴�����ģ�
- ��������߼��Ż���
  - �Ǳ��̾ۺ�������ת�˹������б����м��أ����ٵȴ��С�
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py` passed (12 tests).

## Progress Update 2026-02-07 20:12 (Handoff Workflow: Claim + 7d Trend)
- Added rejected-task handoff claim API and persistence:
  - new endpoint: `POST /goals/task/{task_id}/handoff/claim`
  - task now records handoff metadata:
    - `handoff_status` (`none|pending|claimed|resolved`)
    - `handoff_owner`, `handoff_note`, `handoff_at`, `handoff_resolved_at`
  - reject review now marks task as `handoff_status=pending`; accept review resolves claimed handoff.
- Extended task list filters for handoff dimensions:
  - backend `/goals/tasks` now supports `handoff_status` and `handoff_owner`.
  - frontend `AgentService.listGoalTasks` now supports these params.
- Board handoff pool upgraded:
  - ��ת�˹������ء� now defaults to rejected + `handoff_status=pending` queue.
  - added �����ֲ����� Workbench�� action (claim + bind task + jump).
  - added 7-day trend cards for:
    - rejected count
    - pending-review count
    - claimed-handoff count
- Added backend unit test coverage:
  - `test_claim_handoff_and_filter` in `agent-sdk/tests/test_goal_manager.py`.
- Re-seeded demo data for both runtime paths:
  - `python scripts/seed_realistic_demo_data.py --all-targets --reset`.
- Validation:
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_memory_manager.py agent-sdk/tests/test_repetition_guard.py` passed (24 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 20:24 (Handoff Pool: SLA + Assignee Filter + Notify)
- Upgraded board handoff pool UX for demo operations:
  - Added assignee filter (all / by owner) in handoff queue.
  - Added wait-time calculation and 24h SLA timeout highlighting per handoff task.
  - Added one-click "֪ͨ������ִ��" action:
    - sets task as assignee next-task
    - directly launches bound Workbench session for the task.
- Kept existing "���ֲ����� Workbench" claim action for manager takeover.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py` passed (13 tests).

## Progress Update 2026-02-07 20:33 (Handoff Pool: Batch Actions)
- Added batch operations for handoff queue in board page:
  - select per-task checkbox
  - select-all for current filtered list
  - batch notify assignees (set next-task in bulk)
  - batch claim handoff (manager bulk takeover)
- This improves manager-side dispatch speed during demos and real operations.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py` passed (13 tests).

## Progress Update 2026-02-07 20:52 (Workbench Speed Pass v1)
- Focused on workbench response latency (dialog + agent + skill path) by tuning agent defaults:
  - Auto web search now conservative by default:
    - only explicit search intent triggers network search
    - weak intent keywords (`����/����/�ȵ�...`) only trigger when `AUTO_WEB_SEARCH=true`
  - Memory retrieval load reduced:
    - `MEMORY_TOP_K` default changed `5 -> 3`
    - important memory per type now controlled by `MEMORY_IMPORTANT_PER_TYPE` (default `2`)
  - Web search result size reduced:
    - auto-search results now controlled by `AUTO_SEARCH_NUM_RESULTS` (default `5`, previously hardcoded `10`)
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py` passed.
  - `python -m unittest agent-sdk/tests/test_repetition_guard.py agent-sdk/tests/test_goal_manager.py` passed (15 tests).

## Progress Update 2026-02-07 21:10 (Skills Compatibility: Local Upload + Create Scaffold)
- Extended skill lifecycle to cover all three user paths:
  - GitHub install (existing)
  - Local install (new): folder/zip path with `SKILL.md`
  - Skill creation (new): scaffold generator for custom skills
- Backend APIs added:
  - `POST /skills/install/local` (request: `path`)
  - `POST /skills/create` (request: `name/display_name/description/category/trigger_keywords/tags`)
- Installer enhancements:
  - local package detection and copy
  - scaffold generation (`SKILL.md`, `template.json`, `scripts/main.py`)
  - manifest tracking for `local` / `created` sources
- Frontend Skills dialog upgraded:
  - mode switch tabs: `GitHub ����` / `�����ϴ�` / `���� Skill`
  - wired to new agent service methods and backend endpoints
- Validation:
  - `python -m py_compile agent-sdk/core/skill_installer.py agent-sdk/main.py agent-sdk/models/request.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed (15 tests).
  - `npm run build` (desktop-app) passed.

## Progress Update 2026-02-07 21:32 (Workbench Tool Feedback UI hardening)
- Improved chat rendering reliability and tool-call visibility for demo flows:
  - Reworked `Message` component text cleanup + Chinese UI copy fixes.
  - Enhanced `ToolCallCard` with tool kind badges (`Skill/内置/桌面/MCP`), safer detail rendering, and clearer statuses.
  - Extended chat type model with `ToolCallInfo.kind` to support richer tool UX.
- Note:
  - During this round, `Workbench.tsx` had transient corruption while patching and was restored to the previous stable version to keep build green.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m py_compile agent-sdk/main.py agent-sdk/core/skill_installer.py agent-sdk/models/request.py agent-sdk/core/agent.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py agent-sdk/tests/test_memory_manager.py` passed (24 tests).

## Progress Update 2026-02-07 21:48 (Workbench streaming UX + skill tool visibility)
- Continued Workbench delivery for demo-critical UX:
  - Added immediate first-response placeholder (`Working on it...`) to reduce perceived latency.
  - Added tool kind tagging in stream handling (`skill/system/desktop/mcp/other`) so Tool cards can show call type.
  - Desktop permission flow tool cards now explicitly tagged as `desktop`.
  - Improved tool result matching to prefer the latest running call (avoid mismatching same tool name in multi-step loops).
  - Search start now updates assistant text immediately when content is still empty.
  - Stream fallback handling now appends `chunk.message` (instead of overwriting accumulated content).
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_repetition_guard.py` passed.

## Progress Update 2026-02-07 21:58 (Workbench tool timeline strip)
- Added a lightweight execution timeline strip in Workbench, right below the header:
  - shows live `Searching` state
  - shows current tool calls as chips with `[kind] tool · status`
  - kinds include `Skill/System/Desktop/MCP/Tool`
- This improves demo readability for “boss assigns -> agent executes skill/tool” flow without adding heavy UI complexity.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed (15 tests).

## Progress Update 2026-02-07 22:08 (Workbench timeline drill-down)
- Upgraded Workbench timeline chips from passive labels to interactive controls:
  - each chip is now clickable and highlights the selected tool call
  - selected call shows a compact detail panel (tool, status, input, message, data)
- Added safe formatter for timeline payloads to avoid render/runtime errors when tool data is nested.
- UX effect: demo users can now see not only “which skill/tool was called” but also “what was passed in and returned” directly in Workbench.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m unittest agent-sdk/tests/test_repetition_guard.py` passed.

## Progress Update 2026-02-07 22:26 (Recording-ready demo flow package)
- Added Workbench recording shortcuts for end-to-end demo flow:
  - top quick-nav buttons to `Skills / Goals / Board`
  - one-click scenario prompts for:
    - search + PPT/email draft
    - add/test skill in Workbench
    - desktop file organize + summary
    - memory recall (who am I)
- Added a new built-in skill: `demo-office-assistant`
  - tools:
    - `demo_prepare_ppt_and_email`
    - `demo_organize_files`
    - `demo_summarize_folder`
  - includes local output files and safe `dry_run` support for organize flow.
- Added a dedicated recording checklist document:
  - `docs/recording-demo-checklist.md`
- Validation:
  - `npm run build` (desktop-app) passed.
  - `python -m py_compile agent-sdk/skills/demo-office-assistant/app/main.py agent-sdk/core/agent.py agent-sdk/core/skills_loader.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed (15 tests).
  - skill loader check: `demo-office-assistant` loaded with 3 tools.

## Progress Update 2026-02-07 22:34 (Hotfix: goal_task_id stream compatibility)
- Fixed backend stream crash when Workbench sends `goal_task_id`:
  - `ClaudeAgent.chat_stream` now accepts optional `goal_task_id` parameter for compatibility with `/chat/stream` caller.
- Root cause:
  - `main.py` passed `goal_task_id`, but `core/agent.py::chat_stream` signature did not include it.
- Validation:
  - `python -m py_compile agent-sdk/core/agent.py agent-sdk/main.py` passed.
  - `python -m unittest agent-sdk/tests/test_goal_manager.py agent-sdk/tests/test_repetition_guard.py` passed (15 tests).

## Progress Update 2026-02-07 22:52 (Workbench UX hotfix: scroll + collapsible panels + live status)
- Addressed recording-time UX issues reported by user:
  - Fixed message area usability by changing auto-scroll behavior:
    - only auto-scroll when user is near bottom
    - preserves manual scrolling during long responses/streaming
  - Added collapsible controls for non-core panels:
    - execution timeline panel can collapse/expand
    - demo shortcut panel can collapse/expand
  - Added live stream status strip:
    - shows elapsed seconds while streaming
    - shows current running/pending tool status when available
- Validation:
  - `npm run build` (desktop-app) passed.
- Runtime guard tweak for demo responsiveness:
  - tool-iteration cap is now env-configurable via `MAX_TOOL_ITERATIONS` (default `16`, previously fixed `50`).
  - helps avoid very long tool loops in Workbench recording scenarios.
- Follow-up UI polish per user feedback:
  - timeline and demo panels are now collapsed by default.
  - replaced mojibake placeholders (`????`) in Workbench top panels with stable labels.
  - compacted timeline detail message area with max height + scroll.

## Progress Update 2026-02-07 23:35 (Workbench Chinese cleanup + permission path hardening)
- Removed Workbench demo shortcuts panel from the UI to reduce top-area clutter.
- Fixed chat session naming behavior:
  - new session default title is now `�¶Ի�`
  - first user message auto-updates session title (trimmed)
- Reworked key Workbench/chat UI text to avoid garbled characters:
  - `ChatHistorySidebar`, `PermissionApprovalDialog`, `ToolCallCard`, and Workbench timeline/status labels are now clean Chinese copy.
- Hardened desktop permission flow for deletion scenarios:
  - added run-command delete intent fallback in desktop bridge (auto-route delete-like commands to `delete_file`)
  - reduced terminal policy conflict reports during file deletion demos.
- Updated agent tool guidance:
  - `run_command` description now explicitly tells the model to use `delete_file` for deletion.
- Validation:
  - `npm run build` (desktop-app) passed.
  - `cargo check` (desktop-app/src-tauri) passed.
  - `python -m py_compile agent-sdk/core/agent.py` passed.
