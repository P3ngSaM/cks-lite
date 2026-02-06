"""
响应数据模型
"""

from typing import List, Dict, Optional
from pydantic import BaseModel, Field


class ChatResponse(BaseModel):
    """对话响应"""
    message: str = Field(..., description="助手回复")
    tool_calls: List[Dict] = Field(default=[], description="工具调用记录")
    memory_used: List[Dict] = Field(default=[], description="使用的记忆")


class MemoryResponse(BaseModel):
    """记忆响应"""
    id: str = Field(..., description="记忆 ID")
    content: str = Field(..., description="记忆内容")
    memory_type: str = Field(..., description="记忆类型")
    similarity: Optional[float] = Field(default=None, description="相似度")
    created_at: str = Field(..., description="创建时间")
