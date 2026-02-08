# CKS Implementation Checklist (Feishu + Computer-Use Control)
Last updated: 2026-02-08

## Phase 1 - Foundation (Done)
- [x] Build unified execution approval queue storage (`pending/approved/denied/expired`)
- [x] Provide approval APIs (create/list/decide)
- [x] Build channel task queue storage (for Feishu and other inbound channels)
- [x] Provide channel APIs (inbound/list/manual-dispatch)
- [x] Add baseline regression tests (approval queue + channel queue)

## Phase 2 - Real Feishu Integration (Done)
- [x] Add Feishu event verification (challenge + header signature)
- [x] Add Feishu outbound message adapter (completion callback)
- [x] Add Feishu chat -> CKS session mapping (reuse by `chat_id`)
- [x] Add closed loop: channel trigger -> execution -> Goals writeback -> board update

## Phase 3 - Controlled Computer Use (In Progress)
- [x] Connect `run_command/read_file/write_file/list_directory` to approval queue (risk-based)
- [x] Add front-end approval center panel (pending list + one-click approve/deny)
- [x] Add approval audit view (who approved what and when)
- [x] Add risk-level strategy (low auto-pass, high mandatory approval, medium configurable)

## Phase 4 - Demo/Production Hardening (Todo)
- [ ] Feishu bot dialogue templates (boss/employee/system roles)
- [ ] Failure fallback (auto handoff to human + owner notification)
- [x] Mobile remote command minimal path (dispatch + acceptance only)
- [x] Mobile task control commands (`pause/resume/cancel`)
- [x] Mobile retry command (`retry`) for failed/canceled tasks
- [x] Duplicate inbound debounce (avoid repeated execution from rapid re-send)
- [x] Persistent event idempotency (`event_id/message_id` -> external_id) to avoid duplicate enqueue across restarts
- [ ] Full-chain stress test and stability report (concurrency/timeout/retry/consistency)

## E2E Smoke Script (Feishu -> Queue -> Dispatch -> Workbench)
Use this script to quickly validate end-to-end behavior in demo/staging.

1) Inject a Feishu inbound task:
```bash
curl -X POST "http://HOST/channels/feishu/inbound" ^
  -H "Content-Type: application/json" ^
  -d "{\"sender_id\":\"ou_demo_manager\",\"chat_id\":\"oc_demo_chat\",\"message\":\"desktop 帮我整理桌面并输出日报\",\"auto_dispatch\":false,\"user_id\":\"default-user\"}"
```

2) Query pending tasks and capture `task_id`:
```bash
curl "http://HOST/channels/tasks?status=pending&channel=feishu&limit=5"
```

3) Dispatch task to Workbench execution:
```bash
curl -X POST "http://HOST/channels/tasks/TASK_ID/dispatch" ^
  -H "Content-Type: application/json" ^
  -d "{\"user_id\":\"default-user\",\"use_memory\":true}"
```

4) Verify approvals + task status:
```bash
curl "http://HOST/approvals?status=pending&limit=10"
curl "http://HOST/channels/tasks?channel=feishu&limit=10"
```
