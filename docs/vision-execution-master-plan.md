# CKS Lite 愿景与实施总计划（主文档）

> 创建日期：2026-02-06  
> 适用范围：CKS Lite 全项目（桌面端 + Agent SDK + Skills + 组织协作）

---

## 1. 为什么要做这个项目（初心）

CKS Lite 的核心初心是：

1. **做一个轻量化的桌面 AI 工作台**，而不是笨重复杂的系统。
2. **以本地优先为基础**，打包为 Windows `exe` 和 macOS `dmg`，用户开箱即用。
3. **以 Claude Agent SDK 驱动智能体能力**，让 Agent 真正可执行任务，而不是只聊天。
4. **结合终端能力 + Skills 生态**，让「1 个 Agent + 多个 Skills」覆盖用户日常高频工作。
5. **将游戏化目标管理（KPI/OKR/项目/任务）深度集成**，把“执行结果”自动映射到目标进度。
6. 最终走向 **组织级多 Agent 协作系统**（老板派单、员工 Agent 执行、异常转人工、协同通信）。

---

## 2. 产品终局定义（北极星）

### 2.1 终极目标

构建一个「**桌面通用智能体工作台**」：

- 基于 Claude Agent SDK；
- 通过预制数字员工 + 可扩展 Skills；
- 帮助用户完成本地文件处理、内容创作、自动化执行、AI 应用生成与发布；
- 支持手机远程查看进度、下发指令、验收结果。

### 2.2 目标用户价值

- **个人用户**：减少重复劳动、提升执行效率。
- **团队管理者**：实时掌握任务进度与组织执行状态。
- **业务型用户**：从想法到落地上线（应用/内容）时间大幅缩短。

---

## 3. 三大核心场景（首要落地方向）

### 场景 A：桌面智能自动化（Computer Use）

典型流程：

- 发票/合同/PDF 批量处理；
- 信息提取 -> 结构化输出（Excel/报告）；
- 文件自动重命名、归档与追踪。

核心价值：让重复文件操作“自动化流水线化”。

### 场景 B：浏览器智能自动化（Browser Use）

典型流程：

- 内容创作 -> 配图/排版 -> 平台发布；
- 短视频内容抓取 -> ASR 转文字 -> 文案输出；
- 公开网页数据采集与分析。

核心价值：把内容运营流程串成一键执行任务链。

### 场景 C：一句话生成并发布 AI 应用

典型流程：

- Coze/飞书等资产 -> 应用生成 -> 云端发布；
- 配置 API 与域名，缩短上线路径。

核心价值：从“想法”到“上线”进入分钟级周期。

---

## 4. 系统设计原则（必须遵守）

1. **轻量优先**：先可用、再扩展、后增强。
2. **执行优先**：所有能力都要可验证“执行结果”，不只文本回复。
3. **安全优先**：终端能力默认受控（白名单/审批/沙箱/审计）。
4. **可追踪优先**：每个任务、工具调用、状态变化都可追溯。
5. **分层演进**：先单机闭环，再云端协作，再多 Agent 网络。

---

## 5. 分阶段实施计划（Roadmap）

## Phase 0：范围冻结（1-2 天）

- 冻结 MVP 范围；
- 定义成功标准与验收清单；
- 输出统一术语与数据模型边界。

**产出**：MVP 边界文档、验收标准文档。

## Phase 1：执行底座（第 1-2 周）

- Skills 统一执行协议；
- MCP 依赖技能（如 `openai-docs`）运行时接入；
- 终端执行安全化 v1（白名单、路径限制、超时、审计）；
- 工具循环防重复熔断机制稳定化。

**产出**：Skills 真可执行，不再出现“已安装但不可用”。

## Phase 2：目标管理核心（第 3-4 周）

- 实现 KPI/OKR/项目/任务层级模型；
- 任务完成自动反写项目与 OKR/KPI 进度；
- 工作台与目标管理联动。

**产出**：目标系统从“看板”升级为“执行引擎”。

## Phase 3：桌面产品化与打包（第 5-6 周）

- Workbench 体验稳定；
- Skills 管理页增强（依赖状态、可执行测试）；
- Windows `exe` / macOS `dmg` 打包流程打通。

**产出**：可安装试用版本（内测）。

## Phase 4：组织协作（第 7-10 周）

- 云端任务中心；
- 老板派单 -> 员工 Agent 执行 -> 异常转人工；
- 组织看板（先普通版，再像素风）。

## Phase 5：远控与应用发布（第 11-13 周）

- 手机端远程查看、指令下发、结果验收；
- 一句话生成并发布 AI 应用的流水线能力。

---

## 6. MVP 成功标准（必须量化）

1. 新用户可在 10 分钟内完成首次任务闭环。
2. 至少 5 个核心 Skills 稳定可执行并可验证结果。
3. 终端相关高风险操作具备明确审批与审计记录。
4. KPI/OKR/项目/任务层级管理与任务执行结果实现自动联动。
5. 可成功输出 Windows `exe` 与 macOS `dmg` 安装包。

---

## 7. 风险与应对

1. **风险：技能“已安装但不可执行”**  
   应对：引入 Skill Readiness 状态体系（Installed / Ready / Missing Dependency / Blocked）。

2. **风险：终端执行安全边界不足**  
   应对：黑名单改白名单，配合沙箱、超时、审计与权限分级审批。

3. **风险：过早做多 Agent 造成复杂度爆炸**  
   应对：先做单 Agent 深闭环，再扩展到组织协同。

4. **风险：视觉和功能并行导致交付延期**  
   应对：先功能闭环，像素风可视化作为后置增强。

---

## 8. 当前共识（截至 2026-02-06）

1. 已确认：终端能力 + Skills 是正确方向。
2. 已确认：MCP 技能需要真实运行时接入，不能只停留在文档层。
3. 已确认：工具循环需做重复调用熔断，避免无效刷调用。
4. 已确认：后续优先做“可执行、可控、可追踪”三件事。

---

## 8.1 近期进展快照（2026-02-06）

1. 已完成 Skills readiness 诊断接口：`GET /skills/readiness`。
2. 已完成 Skills smoke test 接口：`POST /skills/smoke-test`（支持单个/全量）。
3. 已完成前端技能页状态可视化（Ready / Missing / Blocked / Error）。
4. 已完成技能卡“一键运行测试”能力，并可展示检查项结果。
5. 已完成 MCP 路由接入与本地 bridge fallback：`POST /mcp/execute`（openai-docs 优先支持）。
6. 已完成终端白名单策略 v1（默认 whitelist，可通过 `CKS_TERMINAL_POLICY=legacy` 临时兼容旧模式）。
7. 已完成高优先级审查修复：健康检查兼容路由、命令参数级限制、MCP bridge 可达性探测。
8. 已完成审计日志 v1：工具执行日志与错误日志分离写入 `agent-sdk/data/audit/`，支持按会话追踪。

---

## 9. 后续维护规则（防止记忆丢失）

本文件作为“项目总纲”，每次重大决策后必须更新以下内容：

- 目标是否变化；
- 当前阶段完成度；
- 新增风险与处理方案；
- 下一步 1-2 周行动项。

建议每周固定更新一次（周报节奏）。

## 10. Latest Increment (2026-02-06)
- Implemented audit-log query APIs for operational traceability:
  - `GET /audit/executions`
  - `GET /audit/errors`
  - query params: `session_id`, `limit`
- Exposed audit visibility in desktop UI (Skills page) via "Skill Audit Snapshot".
- Added frontend service/type support for audit data retrieval and rendering.
- Completed full compile/build verification for backend + frontend after the changes.
- This increment improves the "traceable execution" pillar without increasing runtime complexity.
- Added implementation docs for team handoff: `docs/agent-sdk-skills-audit-api.md`, `docs/skills-test-prompts.md`
- Comprehensive review hardening round completed (2026-02-06):
  - tar extraction path traversal guard upgraded to robust containment check;
  - MCP readiness probe false-positive reduced;
  - audit log schema backward compatibility added;
  - terminal execution made cross-platform (Windows + non-Windows shell path);
  - interpreter script execution scope constrained to working directory.
- Audit observability upgraded:
  - backend audit endpoints now support `tool_name` filtering;
  - Skills page audit panel now supports session/tool/limit filters with apply/reset workflow.
- Comprehensive review hardening round 3 completed:
  - terminal command policy parser made quote-aware and path-safe;
  - backend startup no longer auto-installs pip dependencies by default;
  - CORS default wildcard removed; env-configurable origin policy added;
  - audit JSONL query path optimized to reverse streaming reads.
- Audit panel filtering expanded with time window (`from_time` / `to_time`) across backend and frontend.
- Added audit export capability in Skills panel (JSON/CSV) for filtered snapshot sharing and ops troubleshooting.
- Chinese UI sweep round 2 completed for core chat interaction components and permission flow.
- Task execution continued based on Sprint-01 checklist: added API smoke regression script and formal risk register for release readiness.
- Continued task-driven development: added automated regression tests for terminal safety policy and tool repetition guard, and converted two pending checklist safety items to done based on passing tests.
- Continued task-first execution: completed C1 dialogue acceptance with generated report, leaving only one manual approval-denial acceptance item pending.
- Closed last pending Sprint-01 acceptance item by automated deny-flow verification (`sprint1_permission_denial_acceptance.py`); Sprint-01 checklist now fully checked.
- Sprint-02 kickoff (in progress):
  - Added Goal hierarchy API integration in desktop client service (create/read/complete flow).
  - Added new Goals page (`/goals`) with hierarchical visualization and direct task completion operation.
  - Added Sprint-02 smoke script for goals API and initial backend roll-up unit tests.
  - Completed compile/build/test verification for this increment (backend unit tests + frontend build + tauri lib tests).
  - Added first automatic writeback loop from execution to goal progress:
    - chat requests can bind `goal_task_id`;
    - stream flow auto-completes the bound task after successful tool execution + `done`.
  - Added goals task filtering API (`from/to`, assignee, status) and desktop CSV export for operational review.
