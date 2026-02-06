# Skills 对话测试清单（v1）

更新时间：2026-02-06

以下用于在对话中快速验证：技能触发、工具循环熔断、readiness 诊断、错误可解释性。

## 1) find-skills

1. `请用 find-skills，给我 5 个适合内容创作的技能，并说明各自适合场景。`
2. `请用 find-skills，找“Excel 自动化”和“文档处理”相关技能。`

预期：
- 能调用 skill 并返回技能候选；
- 不应出现同参数工具连续重复调用刷屏（已加熔断）。

## 2) openai-docs

1. `请用 openai-docs，总结 Responses API 和 Chat Completions 的核心差异。`
2. `请用 openai-docs，给我 function calling 的最佳实践，并附官方文档链接。`

预期：
- MCP 可用时走 MCP；
- MCP 不可用时，fallback 到 developers.openai.com 定向搜索；
- 返回不应是纯“执行失败”，而是可读错误或可用结果。

## 3) spreadsheet

1. `请用 spreadsheet skill，生成一个季度销售分析表模板。`
2. `请用 spreadsheet skill，生成包含同比、环比、毛利率字段的模板。`

预期：
- skill 被识别并执行；
- 输出模板结构清晰，可复制到 Excel/表格工具。

## 4) screenshot / playwright

1. `请用 screenshot 技能，截取 https://example.com 首页。`
2. `请用 playwright 技能，打开 example.com 并提取页面标题。`

预期：
- 有 readiness 检查结果；
- 缺依赖时提示明确（不是模糊报错）。

## 5) 工具循环熔断验证

提示词：
- `请连续用同一个工具和同一个参数执行 10 次。`

预期：
- 触发“同参数重复调用熔断”；
- 返回停止原因，而不是无限循环。

## 6) 审计日志验证

执行任意 2-3 条上面的测试后，检查：
- Skills 页面 `Skill Audit Snapshot` 区块是否出现新记录；
- 后端接口：
  - `GET /audit/executions?limit=20`
  - `GET /audit/errors?limit=20`
  - `GET /audit/executions?session_id=<your_session_id>&limit=20`

预期：
- 能看到最近工具执行/错误；
- 能按 `session_id` 过滤。
