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
    fast_mode: bool = Field(default=False, description="Enable low-latency mode with lighter context/tool budget")
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


class GoalDashboardNextTaskRequest(BaseModel):
    organization_id: Optional[str] = Field(default=None, description="Organization ID")
    assignee: str = Field(..., description="Assignee name")
    task_id: int = Field(..., description="Preferred next task id for this assignee")


class GoalTaskHandoffClaimRequest(BaseModel):
    owner: str = Field(default="manager", description="Human owner taking over the rejected task")
    note: str = Field(default="", description="Optional handoff claim note")


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


class FeishuConfigTestRequest(BaseModel):
    send_probe: bool = Field(default=False, description="Whether to send a probe message")
    receive_id: str = Field(default="", description="Target receive id")
    receive_id_type: str = Field(default="chat_id", description="chat_id|open_id|...")
    text: str = Field(default="CKS 飞书连通性测试成功", description="Probe text")
