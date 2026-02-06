"""
混合搜索服务 - Hybrid Search Service
基于 OpenClaw 实现，结合 BM25 关键字搜索和向量语义搜索

特性:
  - BM25 算法 (rank-bm25)
  - 向量相似度 (余弦距离)
  - 可配置权重融合
  - 中文分词支持 (jieba)
"""

import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

# 尝试导入依赖
try:
    from rank_bm25 import BM25Okapi
    BM25_AVAILABLE = True
except ImportError:
    BM25_AVAILABLE = False
    logger.warning("rank-bm25 未安装，BM25 搜索功能将不可用")

try:
    import jieba
    JIEBA_AVAILABLE = True
except ImportError:
    JIEBA_AVAILABLE = False
    logger.warning("jieba 未安装，中文分词功能将不可用")


@dataclass
class SearchResult:
    """搜索结果数据类"""
    id: str
    content: str
    score: float
    vector_score: float
    text_score: float
    memory_type: str
    created_at: str
    source: str = "hybrid"


class HybridSearchService:
    """
    混合搜索服务

    结合 BM25 关键字搜索和向量语义搜索，通过加权融合提升检索准确率
    """

    def __init__(
        self,
        vector_weight: float = 0.7,
        text_weight: float = 0.3,
        bm25_k1: float = 1.5,
        bm25_b: float = 0.75
    ):
        """
        初始化混合搜索服务

        Args:
            vector_weight: 向量搜索权重 (default: 0.7)
            text_weight: 文本搜索权重 (default: 0.3)
            bm25_k1: BM25 词频饱和参数 (default: 1.5)
            bm25_b: BM25 长度归一化参数 (default: 0.75)
        """
        assert abs(vector_weight + text_weight - 1.0) < 0.001, "权重之和必须为 1"

        self.vector_weight = vector_weight
        self.text_weight = text_weight
        self.bm25_k1 = bm25_k1
        self.bm25_b = bm25_b

        # BM25 索引缓存
        self.bm25_index = None
        self.corpus_documents = []
        self.document_ids = []

        logger.info(f"混合搜索初始化: vector_weight={vector_weight}, text_weight={text_weight}")

    def tokenize(self, text: str) -> List[str]:
        """
        文本分词

        优先使用 jieba 进行中文分词，fallback 到简单分词
        特殊处理：保留邮箱地址、URL 等包含 @/./- 的 token

        Args:
            text: 输入文本

        Returns:
            词元列表
        """
        import re

        # 先提取完整的邮箱地址和 URL，作为独立 token 保留
        special_patterns = re.findall(
            r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',  # email
            text
        )

        if JIEBA_AVAILABLE:
            # 使用 jieba 分词 (支持中文)
            tokens = list(jieba.cut_for_search(text))
        else:
            # 简单分词：保留 @/./- 以支持邮箱和域名
            tokens = re.findall(r'[A-Za-z0-9_.@\-\u4e00-\u9fa5]+', text.lower())

        # 将完整邮箱地址追加到 token 列表（确保完整匹配）
        for pattern in special_patterns:
            lower_pattern = pattern.lower()
            if lower_pattern not in tokens:
                tokens.append(lower_pattern)

        return tokens

    def build_bm25_index(self, documents: List[Dict[str, str]]):
        """
        构建 BM25 索引

        Args:
            documents: 文档列表 [{'id': str, 'content': str}, ...]
        """
        if not BM25_AVAILABLE:
            logger.warning("rank-bm25 不可用，跳过 BM25 索引构建")
            return

        if not documents:
            logger.warning("文档列表为空，无法构建 BM25 索引")
            return

        # 提取文档内容和 ID
        self.corpus_documents = [doc['content'] for doc in documents]
        self.document_ids = [doc['id'] for doc in documents]

        # 分词
        tokenized_corpus = [self.tokenize(doc) for doc in self.corpus_documents]

        # 构建 BM25 索引
        self.bm25_index = BM25Okapi(
            tokenized_corpus,
            k1=self.bm25_k1,
            b=self.bm25_b
        )

        logger.info(f"BM25 索引构建完成: {len(documents)} 个文档")

    def bm25_search(
        self,
        query: str,
        top_k: int = 10
    ) -> List[Tuple[str, float]]:
        """
        BM25 关键字搜索

        Args:
            query: 查询文本
            top_k: 返回前 K 个结果

        Returns:
            [(document_id, score), ...] 按分数降序
        """
        if not BM25_AVAILABLE or not self.bm25_index:
            logger.warning("BM25 索引不可用")
            return []

        # 分词查询
        tokenized_query = self.tokenize(query)

        if not tokenized_query:
            return []

        # 计算 BM25 分数
        scores = self.bm25_index.get_scores(tokenized_query)

        # 归一化到 [0, 1]
        max_score = max(scores) if len(scores) > 0 and max(scores) > 0 else 1.0
        normalized_scores = scores / max_score if max_score > 0 else scores

        # 排序并取 top-k
        top_indices = np.argsort(normalized_scores)[::-1][:top_k]

        results = []
        for idx in top_indices:
            if normalized_scores[idx] > 0:  # 过滤零分
                results.append((self.document_ids[idx], float(normalized_scores[idx])))

        return results

    def cosine_similarity(self, vec_a: np.ndarray, vec_b: np.ndarray) -> float:
        """
        计算余弦相似度

        Args:
            vec_a: 向量 A
            vec_b: 向量 B

        Returns:
            相似度分数 ∈ [-1, 1]
        """
        if len(vec_a) == 0 or len(vec_b) == 0:
            return 0.0

        # 处理维度不匹配
        min_len = min(len(vec_a), len(vec_b))
        vec_a = vec_a[:min_len]
        vec_b = vec_b[:min_len]

        # 计算点积和范数
        dot_product = np.dot(vec_a, vec_b)
        norm_a = np.linalg.norm(vec_a)
        norm_b = np.linalg.norm(vec_b)

        # 处理零向量
        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(dot_product / (norm_a * norm_b))

    def vector_search(
        self,
        query_embedding: np.ndarray,
        document_embeddings: List[Tuple[str, np.ndarray]],
        top_k: int = 10
    ) -> List[Tuple[str, float]]:
        """
        向量语义搜索

        Args:
            query_embedding: 查询向量
            document_embeddings: [(document_id, embedding), ...]
            top_k: 返回前 K 个结果

        Returns:
            [(document_id, score), ...] 按相似度降序
        """
        if len(query_embedding) == 0 or not document_embeddings:
            return []

        # 计算相似度
        similarities = []
        for doc_id, doc_embedding in document_embeddings:
            similarity = self.cosine_similarity(query_embedding, doc_embedding)
            if similarity > 0:
                similarities.append((doc_id, similarity))

        # 排序并取 top-k
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]

    def merge_results(
        self,
        vector_results: List[Tuple[str, float]],
        bm25_results: List[Tuple[str, float]],
        documents: Dict[str, Dict]
    ) -> List[SearchResult]:
        """
        融合向量和 BM25 搜索结果

        Args:
            vector_results: 向量搜索结果 [(id, score), ...]
            bm25_results: BM25 搜索结果 [(id, score), ...]
            documents: 文档字典 {id: {content, memory_type, created_at}, ...}

        Returns:
            融合后的搜索结果列表，按最终分数降序
        """
        # 按 ID 分组
        merged = {}

        # 添加向量结果
        for doc_id, score in vector_results:
            merged[doc_id] = {
                'vector_score': score,
                'text_score': 0.0
            }

        # 合并 BM25 结果
        for doc_id, score in bm25_results:
            if doc_id in merged:
                merged[doc_id]['text_score'] = score
            else:
                merged[doc_id] = {
                    'vector_score': 0.0,
                    'text_score': score
                }

        # 计算融合分数
        results = []
        for doc_id, scores in merged.items():
            if doc_id not in documents:
                continue

            doc = documents[doc_id]
            final_score = (
                self.vector_weight * scores['vector_score'] +
                self.text_weight * scores['text_score']
            )

            results.append(SearchResult(
                id=doc_id,
                content=doc['content'],
                score=final_score,
                vector_score=scores['vector_score'],
                text_score=scores['text_score'],
                memory_type=doc.get('memory_type', 'unknown'),
                created_at=doc.get('created_at', ''),
                source='hybrid'
            ))

        # 按最终分数降序排序
        results.sort(key=lambda x: x.score, reverse=True)

        return results

    def search(
        self,
        query: str,
        query_embedding: np.ndarray,
        documents: List[Dict],
        document_embeddings: List[np.ndarray],
        top_k: int = 10,
        min_score: float = 0.0,
        use_hybrid: bool = True
    ) -> List[SearchResult]:
        """
        混合搜索主函数

        Args:
            query: 查询文本
            query_embedding: 查询向量
            documents: 文档列表 [{'id', 'content', 'memory_type', 'created_at'}, ...]
            document_embeddings: 文档向量列表
            top_k: 返回前 K 个结果
            min_score: 最小分数阈值
            use_hybrid: 是否使用混合搜索 (False 则仅向量搜索)

        Returns:
            搜索结果列表
        """
        if not query.strip():
            return []

        # 构建文档字典
        docs_dict = {doc['id']: doc for doc in documents}
        doc_embeddings_with_id = [(doc['id'], emb) for doc, emb in zip(documents, document_embeddings)]

        # 1. 向量搜索
        vector_results = self.vector_search(
            query_embedding,
            doc_embeddings_with_id,
            top_k=top_k * 2  # 候选倍数
        )

        # 如果不使用混合搜索，直接返回向量结果
        if not use_hybrid:
            results = []
            for doc_id, score in vector_results:
                if doc_id in docs_dict and score >= min_score:
                    doc = docs_dict[doc_id]
                    results.append(SearchResult(
                        id=doc_id,
                        content=doc['content'],
                        score=score,
                        vector_score=score,
                        text_score=0.0,
                        memory_type=doc.get('memory_type', 'unknown'),
                        created_at=doc.get('created_at', ''),
                        source='vector'
                    ))
            return results[:top_k]

        # 2. BM25 搜索 (如果可用)
        bm25_results = []
        if BM25_AVAILABLE and self.bm25_index:
            bm25_results = self.bm25_search(query, top_k=top_k * 2)

        # 3. 融合结果
        merged_results = self.merge_results(
            vector_results,
            bm25_results,
            docs_dict
        )

        # 4. 过滤和截断
        final_results = [r for r in merged_results if r.score >= min_score][:top_k]

        logger.info(
            f"混合搜索完成: query='{query[:30]}...', "
            f"vector={len(vector_results)}, bm25={len(bm25_results)}, "
            f"final={len(final_results)}"
        )

        return final_results


# Utility Functions

def bm25_rank_to_score(rank: float) -> float:
    """
    SQLite BM25 排名转换为分数

    SQLite FTS5 的 bm25() 函数返回负数，此函数归一化到 [0, 1]

    Args:
        rank: SQLite BM25 排名值 (通常是负数)

    Returns:
        分数 ∈ [0, 1]
    """
    # 处理非法值
    if not np.isfinite(rank):
        normalized = 999
    else:
        normalized = max(0, -rank)  # 取绝对值

    # 转换: score = 1 / (1 + rank)
    return 1.0 / (1.0 + normalized)


def build_fts_query(raw: str) -> Optional[str]:
    """
    构建 FTS5 查询

    从原始文本提取词元，使用 AND 组合
    保留邮箱地址等特殊 token

    Args:
        raw: 原始查询文本

    Returns:
        FTS5 查询字符串，如果无有效词元则返回 None

    Examples:
        >>> build_fts_query("hello world")
        '"hello" AND "world"'
        >>> build_fts_query("user@example.com")
        '"user@example.com"'
    """
    import re

    # 先提取完整邮箱地址
    emails = re.findall(
        r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
        raw
    )

    # 从原始文本中移除已提取的邮箱，再提取普通词元
    remaining = raw
    for email in emails:
        remaining = remaining.replace(email, ' ')

    # 提取普通词元 (字母数字、下划线、中文)
    tokens = re.findall(r'[A-Za-z0-9_\u4e00-\u9fa5]+', remaining)

    # 合并：邮箱 + 普通词元
    all_tokens = emails + tokens

    if not all_tokens:
        return None

    # 清理和引用
    quoted = ['"{}"'.format(token.replace('"', '')) for token in all_tokens]

    # 使用 AND 连接 (严格匹配)
    return " AND ".join(quoted)
