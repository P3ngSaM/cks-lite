# Agent SDK Skills/Audit API (v1)

更新时间：2026-02-06

## 1) Skill Readiness

- `GET /skills/readiness`
- Query:
  - `skill_name` (optional): 只检查单个 skill

示例返回：

```json
{
  "success": true,
  "readiness": [
    {
      "name": "openai-docs",
      "display_name": "OpenAI Developer Docs",
      "source": "user-installed",
      "status": "ready",
      "message": "Skill is ready",
      "required_tools": ["mcp__openaiDeveloperDocs__search_docs"],
      "runtime_checks": [
        { "name": "mcp_runtime", "ok": true, "detail": "..." }
      ]
    }
  ],
  "total": 1
}
```

状态枚举：
- `ready`
- `missing_dependency`
- `blocked_by_policy`
- `runtime_error`

## 2) Skill Smoke Test

- `POST /skills/smoke-test`
- Query:
  - `skill_name` (optional): 只测单个 skill；不传则全量 smoke test

示例返回：

```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "skill_name": "find-skills",
      "status": "ready",
      "message": "Skill smoke test passed",
      "checks": [
        { "name": "metadata", "ok": true, "detail": "template.json parsed" }
      ]
    }
  ]
}
```

## 3) Skill Execute

- `POST /skills/execute`
- Body:

```json
{
  "skill_name": "find-skills",
  "script_name": "run.py",
  "args": ["--query", "writing"]
}
```

说明：
- 前端与后端已统一为 body 协议；
- 兼容模式仍保留（用于旧调用路径），但新代码应统一使用 body。

## 4) Audit Query APIs

### 4.1 Tool Execution Audit

- `GET /audit/executions`
- Query:
  - `session_id` (optional)
  - `tool_name` (optional)
  - `from_time` (optional, ISO datetime)
  - `to_time` (optional, ISO datetime)
  - `limit` (optional, default `100`, range `1-1000`)

示例返回：

```json
{
  "success": true,
  "records": [
    {
      "timestamp": "2026-02-06T22:30:00Z",
      "session_id": "session_abc",
      "tool_name": "web_search",
      "success": true
    }
  ],
  "total": 1
}
```

### 4.2 Tool Error Audit

- `GET /audit/errors`
- Query:
  - `session_id` (optional)
  - `tool_name` (optional)
  - `from_time` (optional, ISO datetime)
  - `to_time` (optional, ISO datetime)
  - `limit` (optional, default `100`, range `1-1000`)

示例返回：

```json
{
  "success": true,
  "records": [
    {
      "timestamp": "2026-02-06T22:32:00Z",
      "session_id": "session_abc",
      "tool_name": "mcp__openaiDeveloperDocs__search_docs",
      "error": "bridge timeout"
    }
  ],
  "total": 1
}
```

## 5) Frontend Mapping

`desktop-app/src/services/agentService.ts` 新增：
- `getAuditExecutions(sessionId?, limit?)`
- `getAuditErrors(sessionId?, limit?)`

`desktop-app/src/pages/Skills.tsx` 新增：
- “Skill Audit Snapshot” 面板（最近执行 + 最近错误）
- 手动刷新按钮
