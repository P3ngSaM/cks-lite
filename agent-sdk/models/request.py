"""
Request models for Agent SDK API.
"""

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    user_id: str = Field(..., description="User ID")
    message: str = Field(..., description="User message")
    session_id: str = Field(default="default", description="Session ID")
    use_memory: bool = Field(default=True, description="Whether to use memory")
    fast_mode: bool = Field(default=True, description="Enable low-latency mode with lighter context/tool budget")
    response_mode: Optional[str] = Field(default=None, description="Response mode: fast|balanced|deep")
    goal_task_id: Optional[int] = Field(default=None, description="Bound goal task ID for auto writeback")
    preferred_skill: Optional[str] = Field(default=None, description="Preferred skill name for this turn")
    skill_strict: bool = Field(default=False, description="Whether to enforce preferred skill strictly")


class MemoryRequest(BaseModel):
    user_id: str = Field(..., description="User ID")
    content: str = Field(..., description="Memory content")
    memory_type: str = Field(default="conversation", description="Memory type")
    metadata: Optional[Dict] = Field(default=None, description="Memory metadata")


class SkillInstallRequest(BaseModel):
    ref: str = Field(..., description="GitHub ref, owner/repo or URL")


class SkillLocalInstallRequest(BaseModel):
    path: str = Field(..., description="Local directory or zip path for a skill")


class SkillCreateRequest(BaseModel):
    name: str = Field(..., description="Skill name (folder id)")
    display_name: str = Field(..., description="Skill display name")
    description: str = Field(default="", description="Skill description")
    category: str = Field(default="general", description="Skill category")
    trigger_keywords: List[str] = Field(default_factory=list, description="Trigger keywords")
    tags: List[str] = Field(default_factory=list, description="Skill tags")


class SkillExecuteRequest(BaseModel):
    skill_name: Optional[str] = Field(default=None, description="Skill name")
    script_name: Optional[str] = Field(default=None, description="Script name")
    args: List[str] = Field(default_factory=list, description="Script arguments")


class MCPExecuteRequest(BaseModel):
    tool_name: str = Field(..., description="MCP tool name")
    tool_input: Dict = Field(default_factory=dict, description="Tool input parameters")


class GoalKPIRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    title: str = Field(..., description="KPI title")
    description: str = Field(default="", description="KPI description")


class GoalOKRRequest(BaseModel):
    kpi_id: int = Field(..., description="Parent KPI ID")
    title: str = Field(..., description="OKR title")
    description: str = Field(default="", description="OKR description")


class GoalProjectRequest(BaseModel):
    okr_id: int = Field(..., description="Parent OKR ID")
    title: str = Field(..., description="Project title")
    description: str = Field(default="", description="Project description")


class GoalTaskRequest(BaseModel):
    project_id: int = Field(..., description="Parent project ID")
    title: str = Field(..., description="Task title")
    description: str = Field(default="", description="Task description")
    assignee: str = Field(default="", description="Task assignee")
    department: str = Field(default="", description="Task department")


class GoalDemoBootstrapRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    owner_name: str = Field(default="Sam", description="One-person company owner")
    reset_existing: bool = Field(default=False, description="Whether to clear existing organization data first")


class GoalTaskReviewRequest(BaseModel):
    decision: str = Field(..., description="Review decision: accept|reject")
    reason: str = Field(default="", description="Review reason")
    reviewed_by: str = Field(default="manager", description="Reviewer identity")


class GoalTaskExecutionPhaseRequest(BaseModel):
    phase: str = Field(..., description="Execution phase: plan|do|verify")
    status: str = Field(default="active", description="Execution status: idle|active|blocked|done")
    note: str = Field(default="", description="Optional execution note")
    prompt: str = Field(default="", description="Last execution prompt")


class GoalTaskExecutionResumeRequest(BaseModel):
    note: str = Field(default="", description="Optional resume note")


class GoalTaskAgentProfileUpsertRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    assignee: str = Field(default="", description="Assignee name")
    role: str = Field(default="", description="Employee role")
    specialty: str = Field(default="", description="Employee specialty")
    preferred_skill: str = Field(default="", description="Preferred skill name")
    skill_stack: List[str] = Field(default_factory=list, description="Skill stack")
    skill_strict: bool = Field(default=False, description="Whether to enforce strict skill policy")
    seed_prompt: str = Field(default="", description="Optional task seed prompt")


class GoalDashboardNextTaskRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    assignee: str = Field(..., description="Assignee name")
    task_id: int = Field(..., description="Preferred next task id for this assignee")


class GoalSupervisorDispatchRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    objective: str = Field(default="", description="Supervisor objective")
    max_assignees: int = Field(default=8, description="Max assignees to dispatch in one cycle")
    prefer_pending_review: bool = Field(default=True, description="Prefer tasks pending review first")
    supervisor_name: str = Field(default="Supervisor-Agent", description="Supervisor identity")


class GoalSupervisorReviewRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    window_days: int = Field(default=7, description="Review window in days")
    supervisor_name: str = Field(default="Supervisor-Agent", description="Supervisor identity")


class GoalTaskHandoffClaimRequest(BaseModel):
    owner: str = Field(default="manager", description="Human owner taking over the rejected task")
    note: str = Field(default="", description="Optional handoff claim note")


class GoalTaskSubagentSpawnRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    objective: str = Field(default="", description="Execution objective override")
    supervisor_name: str = Field(default="Supervisor-Agent", description="Supervisor identity")
    session_id: str = Field(default="", description="Parent session id")
    node_id: str = Field(default="", description="Optional execution node id")
    auto_complete: bool = Field(default=False, description="Whether to auto-complete the task when run succeeds")


class GoalTaskSubagentControlRequest(BaseModel):
    action: str = Field(default="cancel", description="Supported action: cancel")
    reason: str = Field(default="", description="Optional cancel reason")


class AiEmployeeUpsertRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    name: str = Field(..., description="Employee name")
    role: str = Field(default="", description="Employee role")
    specialty: str = Field(default="", description="Employee specialty")
    primary_skill: str = Field(default="", description="Primary skill")
    skill_stack: List[str] = Field(default_factory=list, description="Skill stack")
    status: str = Field(default="active", description="active|paused")


class AiEmployeeDeleteRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    name: str = Field(..., description="Employee name")


class AiSkillPresetUpsertRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    id: str = Field(..., description="Preset ID")
    name: str = Field(..., description="Preset name")
    primary_skill: str = Field(default="", description="Primary skill")
    skills: List[str] = Field(default_factory=list, description="Skill list")


class AiSkillPresetDeleteRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    id: str = Field(..., description="Preset ID")


class ExecutionApprovalRequest(BaseModel):
    source: str = Field(default="workbench", description="Approval source")
    tool_name: str = Field(..., description="Tool name")
    risk_level: str = Field(default="medium", description="Risk level")
    organization_id: str = Field(default="default-org", description="Organization scope")
    payload: Dict = Field(default_factory=dict, description="Original tool payload")
    ttl_seconds: Optional[int] = Field(default=600, description="TTL seconds for pending approval")


class ExecutionApprovalDecisionRequest(BaseModel):
    decision: str = Field(..., description="approved | denied")
    decided_by: str = Field(default="manager", description="Decision maker")
    note: str = Field(default="", description="Decision note")


class ChannelInboundMessageRequest(BaseModel):
    channel: str = Field(default="feishu", description="Channel name")
    sender_id: str = Field(..., description="Sender identity")
    chat_id: str = Field(..., description="Conversation id")
    message: str = Field(..., description="Inbound message content")
    metadata: Dict = Field(default_factory=dict, description="Optional metadata")
    auto_dispatch: bool = Field(default=False, description="Whether to auto-dispatch immediately")
    user_id: str = Field(default="default-user", description="Agent user id")


class ChannelTaskDispatchRequest(BaseModel):
    user_id: str = Field(default="default-user", description="Agent user id")
    session_id: Optional[str] = Field(default=None, description="Optional session id override")
    use_memory: bool = Field(default=True, description="Use memory for dispatch run")
    node_id: Optional[str] = Field(default=None, description="Optional execution node id hint")


class FeishuOutboundRequest(BaseModel):
    receive_id: str = Field(..., description="Feishu receive_id")
    text: str = Field(..., description="Text content")
    receive_id_type: str = Field(default="open_id", description="open_id|chat_id|union_id|email|user_id")


class FeishuConfigUpdateRequest(BaseModel):
    app_id: str = Field(default="", description="Feishu app id")
    app_secret: str = Field(default="", description="Feishu app secret")
    verification_token: str = Field(default="", description="Verification token")
    encrypt_key: str = Field(default="", description="Encrypt key")
    domain: str = Field(default="feishu", description="feishu|lark")
    auto_dispatch: bool = Field(default=True, description="Auto dispatch inbound tasks")
    enable_approval_card: bool = Field(default=True, description="Enable approval interactive cards")
    allowed_senders: str = Field(default="", description="Comma-separated open_id allowlist")
    signature_tolerance_sec: int = Field(default=300, description="Signature timestamp tolerance")
    replay_cache_size: int = Field(default=2048, description="Replay cache size")


class VisionNextActionRequest(BaseModel):
    image_path: str = Field(..., description="Screenshot path")
    goal: str = Field(..., description="Current execution goal")
    history: str = Field(default="", description="Optional previous attempts context")


class NodeRegisterRequest(BaseModel):
    node_id: str = Field(..., description="Unique node id")
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    display_name: str = Field(default="", description="Node display name")
    host: str = Field(default="", description="Node host")
    os: str = Field(default="", description="windows|macos|linux")
    arch: str = Field(default="", description="x64|arm64|...")
    status: str = Field(default="online", description="online|busy|offline")
    capabilities: List[str] = Field(default_factory=list, description="Capability tags")
    metadata: Dict = Field(default_factory=dict, description="Extra metadata")


class NodeHeartbeatRequest(BaseModel):
    status: str = Field(default="online", description="online|busy|offline")
    metadata: Dict = Field(default_factory=dict, description="Metadata patch")


class NodeSelectRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    capability: str = Field(default="", description="Required capability")
    preferred_os: str = Field(default="", description="Preferred OS")


class FeishuConfigTestRequest(BaseModel):
    send_probe: bool = Field(default=False, description="Whether to send a probe message")
    receive_id: str = Field(default="", description="Target receive id")
    receive_id_type: str = Field(default="chat_id", description="chat_id|open_id|...")
    text: str = Field(default="CKS 飞书连通性测试成功", description="Probe text")
