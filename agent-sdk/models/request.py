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
    goal_task_id: Optional[int] = Field(default=None, description="Bound goal task ID for auto writeback")


class MemoryRequest(BaseModel):
    user_id: str = Field(..., description="User ID")
    content: str = Field(..., description="Memory content")
    memory_type: str = Field(default="conversation", description="Memory type")
    metadata: Optional[Dict] = Field(default=None, description="Memory metadata")


class SkillInstallRequest(BaseModel):
    ref: str = Field(..., description="GitHub ref, owner/repo or URL")


class SkillExecuteRequest(BaseModel):
    skill_name: Optional[str] = Field(default=None, description="Skill name")
    script_name: Optional[str] = Field(default=None, description="Script name")
    args: List[str] = Field(default_factory=list, description="Script arguments")


class MCPExecuteRequest(BaseModel):
    tool_name: str = Field(..., description="MCP tool name")
    tool_input: Dict = Field(default_factory=dict, description="Tool input parameters")


class GoalKPIRequest(BaseModel):
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
