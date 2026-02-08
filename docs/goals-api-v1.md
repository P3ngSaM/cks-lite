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

## 9) 任务相关审计日志回放
- `GET /audit/executions` 新增可选参数 `goal_task_id`
- `GET /audit/errors` 新增可选参数 `goal_task_id`
- 结合 `from_time/to_time` 可按目标任务重放该任务的执行与错误轨迹

## 10) 任务人工验收
- `POST /goals/task/{task_id}/review`
- 请求体：
  - `decision`: `accept` | `reject`
  - `reason`: 可选，验收备注或驳回原因
  - `reviewed_by`: 可选，默认 `manager`
- 行为：
  - `accept`：任务保持 `status=done`、`progress=100`，并写入 `review_status=accepted`
  - `reject`：任务回退 `status=todo`、`progress=0`，并写入 `review_status=rejected`

## 11) 任务列表新增验收筛选
- `GET /goals/tasks` 新增 query 参数：
  - `review_status`：`pending` | `accepted` | `rejected`

## 12) 任务执行状态机（Plan / Do / Verify）
- `GET /goals/task/{task_id}/execution/state`
  - 获取任务执行阶段状态（phase/status/note/last_prompt/resumed_count）。
- `POST /goals/task/{task_id}/execution/phase`
  - 更新执行阶段：
    - `phase`: `plan` | `do` | `verify`
    - `status`: `idle` | `active` | `blocked` | `done`
    - `note`: 可选备注
    - `prompt`: 可选，记录本次阶段执行提示词
- `POST /goals/task/{task_id}/execution/resume`
  - 基于已保存状态生成恢复提示词，返回 `resume_prompt`，用于“中断恢复执行”。

## 13) 老板看板数据接口
- `GET /goals/dashboard`
- Query 参数：
  - `from_time`（可选，ISO8601）
  - `to_time`（可选，ISO8601）
  - `limit`（可选，默认 2000，最大 10000）
- 返回：
  - `summary`：总任务、待验收、进行中、已验收、驳回返工
  - `owners`：按负责人聚合的任务列表（总任务、进行中、待验收、已验收、驳回、完成率、平均进度、最近更新时间）
  - owner 额外字段：`next_task_id`、`project_titles`

## 14) 设置负责人下一任务（调度优先级）
- `POST /goals/dashboard/next-task`
- 请求体：
  - `assignee`：负责人
  - `task_id`：要设为下一任务的 task id（必须属于该负责人）
- 用途：
  - 支持老板在看板中手动指定“下一条优先执行任务”。

## ����ת�˹���Handoff��

- `POST /goals/task/{task_id}/handoff/claim`
  - ���Ѳ���������Ϊ���˹����ִ����С���
  - Request:
    - `owner` (string, default `manager`)
    - `note` (string, optional)

- `GET /goals/tasks` �������˲�����
  - `handoff_status`��`none|pending|claimed|resolved`
  - `handoff_owner`���������˹���
