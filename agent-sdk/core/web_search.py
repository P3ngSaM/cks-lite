"""
联网搜索服务
基于 UAPI SDK 实现的网络搜索功能
"""

import os
import json
import asyncio
import logging
import time
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# 尝试导入 UAPI SDK
try:
    from uapi import UapiClient
    import httpx
    UAPI_AVAILABLE = True
except ImportError:
    UAPI_AVAILABLE = False
    logger.warning("uapi-sdk-python 未安装，请运行: pip install uapi-sdk-python")


@dataclass
class SearchResult:
    """搜索结果"""
    title: str
    url: str
    snippet: str
    content: str = ""


@dataclass
class SearchResponse:
    """搜索响应"""
    success: bool
    results: List[SearchResult]
    provider: str
    error: Optional[str] = None


class WebSearchService:
    """联网搜索服务 - 使用 UAPI SDK (免费)"""

    def __init__(self, timeout_ms: int = 60000, max_retries: int = 2):
        """
        初始化搜索服务

        Args:
            timeout_ms: 请求超时时间（毫秒），默认60秒
            max_retries: 最大重试次数
        """
        self.timeout_ms = timeout_ms
        self.max_retries = max_retries
        self._client = None

        if UAPI_AVAILABLE:
            # 创建带有更长超时的 httpx 客户端
            self._http_client = httpx.Client(
                timeout=httpx.Timeout(
                    connect=30.0,  # 连接超时30秒
                    read=60.0,     # 读取超时60秒
                    write=30.0,    # 写入超时30秒
                    pool=30.0      # 连接池超时30秒
                )
            )
            logger.info("联网搜索服务初始化完成 (UAPI 智能搜索 - 免费)")
        else:
            self._http_client = None
            logger.warning("UAPI SDK 未安装，搜索功能不可用")

    def _search_sync(
        self,
        query: str,
        num_results: int = 10,
        site: Optional[str] = None,
        filetype: Optional[str] = None,
        fetch_full: bool = False,
        time_range: Optional[str] = None
    ) -> SearchResponse:
        """同步搜索（在线程池中运行）"""
        if not UAPI_AVAILABLE:
            return SearchResponse(
                success=False,
                results=[],
                provider="UAPI",
                error="UAPI SDK 未安装，请运行: pip install uapi-sdk-python"
            )

        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                # UAPI 是免费的，不需要 API Key
                # 每次创建新客户端，使用自定义的 httpx 客户端配置
                client = UapiClient("https://uapis.cn")

                # 尝试设置更长的超时
                if hasattr(client, '_client') and self._http_client:
                    client._client = self._http_client

                logger.info(f"🔍 执行 UAPI 搜索 (尝试 {attempt + 1}/{self.max_retries + 1}): {query[:50]}...")

                start_time = time.time()

                result = client.zhi_neng_sou_suo.post_search_aggregate(
                    query=query,
                    site=site,
                    filetype=filetype,
                    fetch_full=fetch_full,
                    timeout_ms=self.timeout_ms,
                    time_range=time_range
                )

                elapsed = time.time() - start_time
                logger.info(f"UAPI 搜索耗时: {elapsed:.2f}秒")

                logger.debug(f"UAPI 搜索结果: {str(result)[:500]}...")

                # 解析结果
                results = []

                if hasattr(result, 'results') and result.results:
                    for item in result.results[:num_results]:
                        results.append(SearchResult(
                            title=getattr(item, 'title', ''),
                            url=getattr(item, 'url', ''),
                            snippet=getattr(item, 'snippet', getattr(item, 'content', '')),
                            content=getattr(item, 'content', getattr(item, 'snippet', ''))
                        ))
                elif isinstance(result, dict):
                    results_list = result.get('results', result.get('data', []))
                    if isinstance(results_list, list):
                        for item in results_list[:num_results]:
                            if isinstance(item, dict):
                                results.append(SearchResult(
                                    title=item.get('title', ''),
                                    url=item.get('url', ''),
                                    snippet=item.get('snippet', item.get('content', '')),
                                    content=item.get('content', item.get('snippet', ''))
                                ))

                logger.info(f"✅ 搜索完成，返回 {len(results)} 条结果")

                return SearchResponse(
                    success=True,
                    results=results,
                    provider="UAPI 智能搜索"
                )

            except Exception as e:
                last_error = e
                error_type = type(e).__name__
                logger.warning(f"UAPI 搜索尝试 {attempt + 1} 失败 ({error_type}): {e}")

                # 如果是超时错误，等待一下再重试
                if "timeout" in str(e).lower() or "Timeout" in error_type:
                    if attempt < self.max_retries:
                        wait_time = (attempt + 1) * 2  # 递增等待时间
                        logger.info(f"等待 {wait_time} 秒后重试...")
                        time.sleep(wait_time)
                        continue

                # 其他错误直接返回
                break

        logger.error(f"UAPI 搜索错误: {last_error}", exc_info=True)
        return SearchResponse(
            success=False,
            results=[],
            provider="UAPI",
            error=f"搜索失败: {str(last_error)}"
        )

    async def search(
        self,
        query: str,
        num_results: int = 10,
        site: Optional[str] = None,
        filetype: Optional[str] = None,
        fetch_full: bool = False,
        time_range: Optional[str] = None
    ) -> SearchResponse:
        """
        执行联网搜索

        Args:
            query: 搜索查询
            num_results: 返回结果数量
            site: 限定搜索的网站
            filetype: 限定文件类型
            fetch_full: 是否获取完整内容
            time_range: 时间范围 (day, week, month, year)

        Returns:
            SearchResponse 搜索结果
        """
        if not query or not query.strip():
            return SearchResponse(
                success=False,
                results=[],
                provider="UAPI",
                error="搜索查询不能为空"
            )

        # UAPI SDK 是同步的，在线程池中运行
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: self._search_sync(
                query=query,
                num_results=num_results,
                site=site,
                filetype=filetype,
                fetch_full=fetch_full,
                time_range=time_range
            )
        )

        return result

    def format_for_context(self, response: SearchResponse, max_results: int = 10) -> str:
        """
        将搜索结果格式化为可注入到上下文的文本

        Args:
            response: 搜索响应
            max_results: 最大结果数

        Returns:
            格式化的搜索结果文本
        """
        if not response.success:
            return f"⚠️ 搜索失败: {response.error}"

        if not response.results:
            return "未找到相关搜索结果。"

        lines = [f"🔍 联网搜索结果 (来源: {response.provider}):\n"]

        for i, result in enumerate(response.results[:max_results], 1):
            lines.append(f"**{i}. {result.title}**")
            if result.url:
                lines.append(f"   链接: {result.url}")
            if result.snippet:
                lines.append(f"   摘要: {result.snippet[:300]}...")
            lines.append("")

        return "\n".join(lines)


# 便捷函数
async def quick_search(query: str) -> SearchResponse:
    """快速搜索"""
    service = WebSearchService()
    return await service.search(query)


# 搜索工具定义（用于 Claude Tool Use）
WEB_SEARCH_TOOL = {
    "name": "web_search",
    "description": "联网搜索工具。当需要获取最新信息、新闻、技术文档或任何需要实时查询的内容时使用。",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "搜索查询关键词"
            },
            "num_results": {
                "type": "integer",
                "description": "返回结果数量，默认为 5",
                "default": 5
            },
            "site": {
                "type": "string",
                "description": "限定搜索的网站，如 'zhihu.com'"
            },
            "time_range": {
                "type": "string",
                "description": "时间范围: day, week, month, year",
                "enum": ["day", "week", "month", "year"]
            }
        },
        "required": ["query"]
    }
}
