# 目标管理 API（v1）
更新时间：2026-02-07

用于 KPI / OKR / 项目 / 任务 四层结构管理，以及任务完成后的进度联动。

后端代码位置：
- `agent-sdk/core/goal_manager.py`
- `agent-sdk/main.py`

## 1) 获取目标树
- `GET /goals/tree`

返回：
```json
{
  "success": true,
  "data": {
    "kpis": [],
    "total_kpis": 0
  }
}
```

## 2) 创建 KPI
- `POST /goals/kpi`
```json
{
  "title": "Q1 增长",
  "description": "季度主目标"
}
```

## 3) 创建 OKR
- `POST /goals/okr`
```json
{
  "kpi_id": 1,
  "title": "提升激活率",
  "description": "关键结果与动作"
}
```

## 4) 创建项目
- `POST /goals/project`
```json
{
  "okr_id": 1,
  "title": "注册漏斗优化",
  "description": "项目分解"
}
```

## 5) 创建任务
- `POST /goals/task`
```json
{
  "project_id": 1,
  "title": "补齐埋点",
  "description": "事件字段梳理",
  "assignee": "alice"
}
```

## 6) 完成任务
- `POST /goals/task/{task_id}/complete`

说明：
- 任务完成后自动将任务 `status=done`、`progress=100`
- 自动联动更新所属项目 / OKR / KPI 平均进度

## 7) 任务列表筛选（from/to）
- `GET /goals/tasks`

Query 参数：
- `assignee`（可选）
- `status`（可选，`todo` / `done`）
- `from_time`（可选，ISO8601）
- `to_time`（可选，ISO8601）
- `limit`（可选，默认 200，最大 2000）

返回包含层级信息：
- `kpi_title`
- `okr_title`
- `project_title`
- 任务原始字段（`title/assignee/status/progress/updated_at` 等）

## 8) 对话自动回写（执行 -> 目标）
- `POST /chat` 与 `POST /chat/stream` 支持可选字段：`goal_task_id`
- 在绑定任务且本次对话出现成功工具执行时，流式 `done` 节点会自动回写 `complete_task(goal_task_id)`
- 用于实现“工作台执行成功后自动更新任务进度”
