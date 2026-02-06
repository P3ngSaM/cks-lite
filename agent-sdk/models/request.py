"""
请求数据模型
"""

from typing import Optional, Dict, List
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """对话请求"""
    user_id: str = Field(..., description="用户 ID")
    message: str = Field(..., description="用户消息")
    session_id: str = Field(default="default", description="会话 ID")
    use_memory: bool = Field(default=True, description="是否使用长记忆")


class MemoryRequest(BaseModel):
    """记忆保存请求"""
    user_id: str = Field(..., description="用户 ID")
    content: str = Field(..., description="记忆内容")
    memory_type: str = Field(default="conversation", description="记忆类型")
    metadata: Optional[Dict] = Field(default=None, description="元数据")


class SkillInstallRequest(BaseModel):
    """技能安装请求"""
    ref: str = Field(..., description="GitHub 引用 (owner/repo 或完整 URL)")
