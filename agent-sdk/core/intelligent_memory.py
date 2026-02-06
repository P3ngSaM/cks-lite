"""
智能记忆提取器
基于 Claude 的理解能力，从对话中自动提取结构化信息
"""

import json
import logging
from typing import List, Dict, Optional
from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)


class IntelligentMemoryExtractor:
    """智能记忆提取器"""

    # 记忆类型定义
    MEMORY_TYPES = {
        "personal": "个人信息（姓名、年龄、职位、公司等）",
        "skill": "技能和专长（编程语言、工具、领域知识等）",
        "project": "项目信息（项目名称、状态、技术栈、目标等）",
        "preference": "偏好和习惯（工作方式、喜好、习惯等）",
        "task": "任务和待办（需要完成的事情、截止时间等）"
    }

    def __init__(self, claude_client: AsyncAnthropic):
        self.client = claude_client

    async def extract_memories(
        self,
        user_message: str,
        conversation_context: str = ""
    ) -> List[Dict]:
        """
        从用户消息中提取结构化记忆

        Args:
            user_message: 用户的消息
            conversation_context: 对话上下文（可选）

        Returns:
            提取的记忆列表，每条记忆包含:
            - content: 记忆内容
            - memory_type: 记忆类型
            - importance: 重要性 (1-10)
        """

        # 构建提取提示词
        extraction_prompt = self._build_extraction_prompt(user_message, conversation_context)

        try:
            # 调用 Claude 进行信息提取（禁用 thinking 功能，直接返回 JSON）
            response = await self.client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=500,
                temperature=0.3,  # 较低温度，更稳定的输出
                thinking={
                    "type": "disabled",
                    "budget_tokens": 0
                },
                messages=[
                    {"role": "user", "content": extraction_prompt}
                ]
            )

            # 解析返回的 JSON（跳过 thinking blocks，只取 text blocks）
            result_text = ""
            for content_block in response.content:
                if hasattr(content_block, 'text'):
                    result_text = content_block.text
                    break

            if not result_text:
                logger.warning("未找到文本内容，只有 thinking blocks")
                return []

            memories = self._parse_extraction_result(result_text)

            logger.info(f"提取到 {len(memories)} 条记忆")
            return memories

        except Exception as e:
            logger.error(f"记忆提取失败: {e}")
            return []

    def _build_extraction_prompt(self, user_message: str, context: str = "") -> str:
        """构建记忆提取提示词"""

        types_desc = "\n".join([f"- {k}: {v}" for k, v in self.MEMORY_TYPES.items()])

        prompt = f"""你是一个非常谨慎的智能记忆提取器。只从用户的**明确自我陈述**中提取信息。

**记忆类型定义**:
{types_desc}

**用户消息**:
{user_message}

**任务**:
分析用户消息，**只有当用户明确介绍自己时**才提取信息。

**输出格式** (JSON):
```json
[
  {{
    "content": "用户名叫 Sam",
    "memory_type": "personal",
    "importance": 8
  }}
]
```

**非常严格的规则 - 必须遵守**:

1. **只提取用户的自我介绍**：
   - ✅ "我叫Sam" → 提取 "用户名叫 Sam"
   - ✅ "我是程序员" → 提取 "用户是程序员"
   - ❌ "记得我吗alex" → 不提取（这是问题，不是自我介绍）
   - ❌ "你叫什么" → 不提取（这是问AI的问题）
   - ❌ "帮我查一下xxx" → 不提取（这是请求）

2. **问句和请求一律不提取**：
   - 任何以"？"结尾的句子
   - 任何包含"帮我"、"查一下"、"记得吗"的句子
   - 任何询问AI的句子

3. **名字必须是明确的自我介绍**：
   - ✅ "我叫Alex" / "我是Alex" / "叫我Alex"
   - ❌ "记得我吗alex"（问句中的名字不算）
   - ❌ "alex你好"（称呼别人的名字不算）

4. **如果不确定，返回空数组 []**

请直接输出 JSON，不要其他解释。如果没有明确的自我介绍信息，返回 []。"""

        return prompt

    def _parse_extraction_result(self, result_text: str) -> List[Dict]:
        """解析提取结果"""
        try:
            # 尝试提取 JSON 部分
            result_text = result_text.strip()

            # 如果包含 ```json 标记，提取内容
            if "```json" in result_text:
                start = result_text.find("```json") + 7
                end = result_text.find("```", start)
                result_text = result_text[start:end].strip()
            elif "```" in result_text:
                start = result_text.find("```") + 3
                end = result_text.find("```", start)
                result_text = result_text[start:end].strip()

            # 解析 JSON
            memories = json.loads(result_text)

            # 验证格式
            if not isinstance(memories, list):
                logger.warning("提取结果不是列表格式")
                return []

            # 验证每条记忆的格式
            validated_memories = []
            for mem in memories:
                if isinstance(mem, dict) and all(k in mem for k in ["content", "memory_type", "importance"]):
                    # 确保类型有效
                    if mem["memory_type"] in self.MEMORY_TYPES:
                        validated_memories.append(mem)
                    else:
                        logger.warning(f"无效的记忆类型: {mem.get('memory_type')}")

            return validated_memories

        except json.JSONDecodeError as e:
            logger.error(f"JSON 解析失败: {e}\n原始文本: {result_text}")
            return []
        except Exception as e:
            logger.error(f"解析提取结果失败: {e}")
            return []

    def should_extract(self, user_message: str) -> bool:
        """
        判断是否需要提取记忆
        对于简单问候、确认、问句等消息，不需要提取
        """
        msg = user_message.strip()
        msg_lower = msg.lower()

        # 简单回复不提取
        simple_messages = [
            "好", "嗯", "ok", "是的", "不是", "谢谢", "再见",
            "你好", "hi", "hello", "thanks", "bye", "好的", "行"
        ]

        # 如果消息太短或是简单回复，不提取
        if len(msg_lower) < 5 or msg_lower in simple_messages:
            return False

        # 问句不提取（以问号结尾或包含疑问词）
        question_indicators = ["?", "？", "吗", "呢", "吧", "记得", "知道", "什么", "怎么", "为什么", "哪", "多少"]
        for indicator in question_indicators:
            if indicator in msg:
                logger.debug(f"跳过问句: {msg[:30]}...")
                return False

        # 请求不提取
        request_indicators = ["帮我", "帮忙", "查一下", "搜索", "搜一下", "找一下", "告诉我"]
        for indicator in request_indicators:
            if indicator in msg:
                logger.debug(f"跳过请求: {msg[:30]}...")
                return False

        # 只有包含自我介绍关键词才提取
        intro_indicators = ["我叫", "我是", "叫我", "我的名字", "我在", "我做", "我喜欢", "我想"]
        has_intro = any(indicator in msg for indicator in intro_indicators)

        if not has_intro:
            logger.debug(f"没有自我介绍，跳过: {msg[:30]}...")
            return False

        return True
