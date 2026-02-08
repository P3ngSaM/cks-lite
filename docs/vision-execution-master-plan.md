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
  - Added task-detail drawer + one-click task-audit replay on Goals page, closing the "task -> execution trace" loop for operations.
  - Upgraded goal-task binding to session-scoped persistence (multi-session friendly), avoiding global task binding conflicts.
  - Hardened goal writeback completion gate to avoid false-positive completion on partial-fail tool runs.
  - Added cross-platform desktop bundle CI pipeline (Windows + macOS) to advance exe/dmg delivery path.
  - Added desktop runtime auto-start for bundled Agent SDK to improve out-of-box usability for exe/dmg users.
  - Added startup diagnostics path (python/runtime/resource checks) to reduce desktop deployment troubleshooting cost.
  - Added first-launch health card in Settings for non-technical troubleshooting and one-click backend start.
- Memory system effectiveness upgraded (2026-02-07):
  - Added duplicate-memory guard on save to reduce noise and index bloat.
  - Added importance estimation + metadata override path for stronger long-term memory weighting.
  - Added recency/importance/access-aware reranking in both hybrid and fallback retrieval pipelines.
  - Added memory regression tests for dedup + ranking behavior to keep quality stable in later iterations.
- Memory dedup advanced to near-duplicate matching (2026-02-07):
  - Added configurable threshold `MEMORY_DUPLICATE_THRESHOLD` (default 0.96).
  - Added regression test for punctuation/format variant dedup to prevent memory noise growth.
- Memory UX visibility improved (2026-02-07):
  - Added Chinese-first Memory page rewrite with cleaner operations and readability.
  - Added per-item retrieval explanation panel (hybrid/vector/text/final score + importance/recency factors).
  - Strengthened type contract so score fields are reliably consumable on frontend.
- Memory explainability strengthened (2026-02-07):
  - Added human-readable retrieval reason chips on memory cards, bridging score details to business language.
- Memory operations panel expanded (2026-02-07):
  - Added sorting, source filtering, high-priority-only focus mode, and export (JSON/CSV) on the Memory page.
  - This improves usability for ops review and manager-side memory auditing.
- Memory anti-corrosion foundation delivered (2026-02-07):
  - freshness TTL metadata + stale penalty,
  - factual conflict detection with pending-review state,
  - maintenance compaction API (dedupe + stale-noise pruning),
  - frontend operation entry for one-click anti-corrosion maintenance.
- Memory anti-corrosion operation loop closed (2026-02-07):
  - added conflict resolution API + UI action,
  - added dry-run maintenance preview for safe pruning decisions,
  - expanded test coverage to include conflict-resolution propagation.
- Memory patrol plan advanced (2026-02-07):
  - added maintenance report endpoint and scheduled auto-run mechanism,
  - added conflict queue API and UI focus filter for pending-review items,
  - provides safer long-term memory hygiene with predictable cadence.
- Execution main-chain improved (2026-02-07):
  - Goals page now supports one-click jump into Workbench execution with session-scoped task binding,
  - reducing friction from planning to actual agent action.
- Main chain execution UX improved (2026-02-07):
  - Workbench now reads bound goal task context directly and provides execution quick-prompts + completion status cue.
  - Supports direct task lookup in goals task API via `task_id`, reducing frontend query friction.
- Main chain acceptance loop completed (2026-02-07 17:15):
  - Added goal task human-review API (`accept/reject`) with review metadata persistence.
  - Goals detail drawer now supports one-click `验收通过/驳回返工` and reviewer note input.
  - Completion now explicitly enters `待验收` state before final acceptance, keeping execution and managerial acceptance separated.
  - Added regression tests for review-state transitions and validated backend/frontend build pipelines.
- Main chain operations improved (2026-02-07 17:21):
  - Added `review_status` filter in goals task list API for manager-side triage.
  - Goals page now supports one-click `仅看待验收` quick filter.
  - Added batch task review actions (batch accept/reject + optional note), speeding up manager acceptance flow.
  - Added regression test for task list filtering by review status and completed full build/test verification.
- Main chain jump-to-review improved (2026-02-07 17:23):
  - Workbench now shows a pending-review reminder card when task writeback is complete but acceptance is pending.
  - Added one-click navigation from Workbench to Goals with `task_id` deep-link.
  - Goals page now auto-opens the corresponding task detail and audit replay context from query parameter.
  - This closes the execution-to-acceptance handoff gap for manager workflows.
- Main chain review round-trip completed (2026-02-07 17:26):
  - Added source-aware jump (`from=workbench`) from Workbench to Goals review page.
  - On manual review success, Goals now auto-returns to Workbench with review result params.
  - Workbench now renders transient accept/reject result feedback after return, completing end-to-end execution-review loop UX.
- Main chain post-review execution improved (2026-02-07 17:28):
  - Added one-click rework shortcuts after reject (generate rework plan / start first fix step).
  - Added one-click next-stage planning shortcut after accept.
  - Keeps users inside one session and turns review result into immediate executable follow-up.
- Main chain execution planner delivered (2026-02-07 17:33):
  - Added Plan/Do/Verify execution cockpit in Workbench.
  - Added session-level interruption recovery state (phase + note + task binding) with persistence.
  - Added one-click phase resume and phase switching to reduce long-task context loss.
  - Integrated review result feedback into phase state transitions (`reject -> do`, `accept -> verify`).
- Lightweight desktop optimization advanced (2026-02-07 17:50):
  - Switched core routes to lazy loading (Workbench/Memory/Skills/Goals/Settings).
  - Added route-level suspense fallback for smoother perceived loading.
  - Build no longer reports oversized monolithic entry chunk; page chunks are now split by route.
- Demo readiness improved (2026-02-07 17:53):
  - Goals page added one-click demo data seeding for fast live setup.
  - Added `docs/demo-runbook.md` with a 10-minute deterministic demo path and troubleshooting cues.
- Execution engine v1 landed (2026-02-07 18:01):
  - Added backend persisted phase-state machine for task execution (`plan/do/verify`).
  - Added execution state APIs (read/update/resume) and frontend integration in Workbench.
  - Resume now uses backend-generated prompts, reducing front-end-only recovery fragility.
  - Added unit-test coverage for execution-state transitions and resume behavior.
- Manager visibility MVP landed (2026-02-07 18:10):
  - Added first `老板看板` page with 4 KPI cards and owner-level task table.
  - Added backend dashboard API (`/goals/dashboard`) for summary and assignee aggregation.
  - Added sidebar navigation entry for manager quick access.
  - Memory page core Chinese text mojibake fixed for on-stage demo readability.
- Manager action loop improved (2026-02-07 18:22):
  - Board now supports one-click drill-down to Goals with assignee/review filters.
  - Goals page now auto-parses URL filters and applies list filtering on load.
  - This closes board insight -> task action handoff for demo and daily operations.
- Manager demo expressiveness improved (2026-02-07 18:28):
  - Board now supports a game-style view with pixel avatars for assignees.
  - Clicking an avatar opens owner detail with project list and execution status summary.
  - Added one-click launch from board to Workbench with auto task binding for that assignee.
- Demo data realism improved (2026-02-07 18:34):
  - Added `seed_realistic_demo_data.py` to generate a richer multi-owner dataset.
  - Dataset includes mixed review/execution states to better stress-test board and workbench flows.
  - Seed-and-verify loop now documented for repeatable pre-demo setup.
- Board game-mode expressiveness improved (2026-02-07 18:42):
  - Added status-driven avatar animation cues (pending/rework pulse, in-progress bounce).
  - Normalized board Chinese UI labels for demo consistency.
  - Re-ran realistic data seeding to expand sample volume for on-stage stress demo.
- Board scheduling control improved (2026-02-07 18:56):
  - Added manager-side “set as next task” override for each assignee.
  - Board now supports task-bubble selection -> assign next task -> immediate one-click execution.
  - This strengthens the “老板调度 -> 数字员工执行” narrative for live demos.

- Manager handoff workflow improved (2026-02-07 20:12):
  - Added explicit rejected-task handoff claim API (`POST /goals/task/{task_id}/handoff/claim`).
  - Introduced task-level handoff state (`pending/claimed/resolved`) with owner and timestamps.
  - Board now has a "ת�˹�������" queue with one-click "���ֲ����� Workbench".
  - Added 7-day trend cards (rejected / pending review / claimed) to improve manager visibility.
