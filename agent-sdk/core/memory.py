"""
长记忆系统 - Memory Manager
支持语义记忆（向量搜索）、工作记忆和程序记忆
增强版：集成 OpenClaw 风格的混合搜索 (BM25 + 向量)
"""

import os
import json
import sqlite3
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
import logging
import sys

# 添加 services 目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "services"))

try:
    from hybrid_search import HybridSearchService
    HYBRID_SEARCH_AVAILABLE = True
except ImportError:
    HYBRID_SEARCH_AVAILABLE = False
    logging.warning("混合搜索服务不可用")

try:
    from markdown_memory import MarkdownMemory
    MARKDOWN_MEMORY_AVAILABLE = True
except ImportError:
    MARKDOWN_MEMORY_AVAILABLE = False
    logging.warning("Markdown 记忆系统不可用")

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False
    logging.warning("FAISS 未安装，向量搜索功能将不可用")

try:
    from sentence_transformers import SentenceTransformer
    EMBEDDING_AVAILABLE = True
except ImportError:
    EMBEDDING_AVAILABLE = False
    logging.warning("sentence-transformers 未安装，嵌入生成功能将不可用")

logger = logging.getLogger(__name__)


class MemoryManager:
    """长记忆管理器"""

    def __init__(self, data_dir: Path, embedding_model: str = "all-MiniLM-L6-v2"):
        self.data_dir = data_dir
        self.db_path = data_dir / "memories.db"
        self.index_path = data_dir / "memory_index.faiss"

        # 初始化数据库
        self._init_database()

        # 初始化嵌入模型
        self.embedding_model = None
        self.embedding_dim = 384  # default for all-MiniLM-L6-v2
        if EMBEDDING_AVAILABLE:
            try:
                logger.info(f"加载嵌入模型: {embedding_model}")
                self.embedding_model = SentenceTransformer(embedding_model)
                self.embedding_dim = self.embedding_model.get_sentence_embedding_dimension()
                logger.info(f"嵌入维度: {self.embedding_dim}")
            except Exception as e:
                logger.error(f"加载嵌入模型失败: {e}")

        # 初始化 FAISS 索引
        self.index = None
        if FAISS_AVAILABLE and self.embedding_model:
            self._init_faiss_index()

        # 初始化混合搜索服务
        self.hybrid_search = None
        if HYBRID_SEARCH_AVAILABLE:
            try:
                vector_weight = float(os.getenv("VECTOR_WEIGHT", 0.7))
                text_weight = float(os.getenv("TEXT_WEIGHT", 0.3))
                self.hybrid_search = HybridSearchService(
                    vector_weight=vector_weight,
                    text_weight=text_weight
                )
                logger.info(f"混合搜索服务初始化: vector={vector_weight}, text={text_weight}")
            except Exception as e:
                logger.error(f"混合搜索服务初始化失败: {e}")

        # 初始化 Markdown 记忆系统
        self.markdown_memory = None
        if MARKDOWN_MEMORY_AVAILABLE:
            try:
                workspace_dir = data_dir / "workspace"
                self.markdown_memory = MarkdownMemory(workspace_dir)
                logger.info(f"Markdown 记忆系统初始化: {workspace_dir}")
            except Exception as e:
                logger.error(f"Markdown 记忆系统初始化失败: {e}")

    def _init_database(self):
        """初始化数据库"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # 语义记忆表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS semantic_memories (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                embedding_index INTEGER,
                memory_type TEXT DEFAULT 'conversation',
                source TEXT,
                importance INTEGER DEFAULT 5,
                access_count INTEGER DEFAULT 0,
                last_accessed_at TIMESTAMP,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 创建索引
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_memories_user
            ON semantic_memories(user_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_memories_type
            ON semantic_memories(memory_type)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_memories_created
            ON semantic_memories(created_at DESC)
        """)

        # 用户偏好表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                pref_key TEXT NOT NULL,
                pref_value TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, pref_key)
            )
        """)

        # 全文搜索（FTS5）
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS semantic_memories_fts
            USING fts5(
                id UNINDEXED,
                content,
                content='semantic_memories',
                content_rowid='rowid'
            )
        """)

        conn.commit()
        conn.close()

        logger.info(f"数据库初始化完成: {self.db_path}")

    def _init_faiss_index(self):
        """初始化 FAISS 索引"""
        if self.index_path.exists():
            # 加载已有索引
            self.index = faiss.read_index(str(self.index_path))
            logger.info(f"加载 FAISS 索引: {self.index.ntotal} 条记忆")
        else:
            # 创建新索引
            self.index = faiss.IndexFlatL2(self.embedding_dim)
            logger.info("创建新的 FAISS 索引")

    def _get_connection(self):
        """获取数据库连接"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    async def save_memory(
        self,
        user_id: str,
        content: str,
        memory_type: str = "conversation",
        metadata: Optional[Dict] = None
    ) -> str:
        """保存记忆"""
        import uuid

        memory_id = f"mem_{uuid.uuid4().hex[:12]}"

        # 生成嵌入向量
        embedding_index = None
        if self.embedding_model and self.index:
            try:
                embedding = self.embedding_model.encode(content)
                embedding = np.array([embedding]).astype('float32')

                # 添加到 FAISS 索引
                self.index.add(embedding)
                embedding_index = self.index.ntotal - 1

                # 保存索引
                faiss.write_index(self.index, str(self.index_path))
            except Exception as e:
                logger.error(f"生成嵌入向量失败: {e}")

        # 保存到数据库
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO semantic_memories
            (id, user_id, content, embedding_index, memory_type, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            memory_id,
            user_id,
            content,
            embedding_index,
            memory_type,
            json.dumps(metadata) if metadata else None,
            datetime.now().isoformat()
        ))

        # 更新 FTS 索引
        cursor.execute("""
            INSERT INTO semantic_memories_fts(id, content)
            VALUES (?, ?)
        """, (memory_id, content))

        conn.commit()
        conn.close()

        # 同时保存到 Markdown 文件（如果启用）
        if self.markdown_memory:
            try:
                # 判断记忆类型
                if memory_type == "conversation":
                    # 对话记忆保存到每日日志
                    self.markdown_memory.save_daily_log(
                        content=content,
                        log_type="conversation"
                    )
                else:
                    # 其他记忆保存到 MEMORY.md
                    # 提取标签（如果有）
                    tags = []
                    if metadata and "tags" in metadata:
                        tags = metadata["tags"]

                    self.markdown_memory.save_memory(
                        content=content,
                        memory_type=memory_type,
                        tags=tags
                    )
                logger.info(f"记忆已同步到 Markdown 文件")
            except Exception as e:
                logger.error(f"保存到 Markdown 失败: {e}")

        logger.info(f"保存记忆: {memory_id} (用户: {user_id})")
        return memory_id

    async def search_memories(
        self,
        user_id: str,
        query: str,
        top_k: int = 5,
        memory_type: Optional[str] = None,
        similarity_threshold: float = 0.3,  # 降低阈值，提高召回率
        use_hybrid: bool = True
    ) -> List[Dict]:
        """
        搜索记忆（混合检索：向量 + 关键词）

        增强版：使用 OpenClaw 风格的混合搜索

        Args:
            user_id: 用户 ID
            query: 查询文本
            top_k: 返回数量
            memory_type: 记忆类型过滤
            similarity_threshold: 相似度阈值 (仅向量搜索)
            use_hybrid: 是否使用混合搜索 (False 则仅向量搜索)
        """

        # 如果启用了混合搜索服务，使用新的混合搜索
        if use_hybrid and self.hybrid_search and HYBRID_SEARCH_AVAILABLE:
            return await self._hybrid_search_v2(
                user_id, query, top_k, memory_type, similarity_threshold
            )

        # Fallback 到原有实现
        return await self._search_memories_legacy(
            user_id, query, top_k, memory_type, similarity_threshold
        )

    async def _hybrid_search_v2(
        self,
        user_id: str,
        query: str,
        top_k: int,
        memory_type: Optional[str],
        min_score: float
    ) -> List[Dict]:
        """
        混合搜索 V2 - 使用 HybridSearchService
        增加直接内容匹配（LIKE 搜索）作为兜底，确保精确内容不丢失
        """
        # 1. 从数据库加载所有相关记忆
        conn = self._get_connection()
        cursor = conn.cursor()

        sql = "SELECT * FROM semantic_memories WHERE user_id = ?"
        params = [user_id]

        if memory_type:
            sql += " AND memory_type = ?"
            params.append(memory_type)

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        # 1b. 直接内容匹配（兜底：确保包含查询关键词的记忆不会被遗漏）
        # 对于邮箱、电话等精确信息特别有用
        like_sql = "SELECT * FROM semantic_memories WHERE user_id = ? AND content LIKE ?"
        like_params = [user_id, f"%{query}%"]
        if memory_type:
            like_sql += " AND memory_type = ?"
            like_params.append(memory_type)
        like_sql += " LIMIT ?"
        like_params.append(top_k)

        cursor.execute(like_sql, like_params)
        like_rows = cursor.fetchall()
        conn.close()

        if not rows and not like_rows:
            return []

        # 合并行（去重），直接匹配的行优先
        seen_ids = set()
        all_rows = []
        like_ids = set()

        for row in like_rows:
            rid = row['id']
            if rid not in seen_ids:
                seen_ids.add(rid)
                all_rows.append(row)
                like_ids.add(rid)

        for row in rows:
            rid = row['id']
            if rid not in seen_ids:
                seen_ids.add(rid)
                all_rows.append(row)

        # 2. 准备文档和嵌入
        documents = []
        document_embeddings = []

        for row in all_rows:
            documents.append({
                'id': row['id'],
                'content': row['content'],
                'memory_type': row['memory_type'],
                'created_at': row['created_at']
            })

            # 获取嵌入向量
            embedding_index = row['embedding_index']
            if embedding_index is not None and self.index:
                try:
                    embedding = self.index.reconstruct(int(embedding_index))
                    document_embeddings.append(embedding)
                except:
                    document_embeddings.append(np.zeros(self.embedding_dim))
            else:
                document_embeddings.append(np.zeros(self.embedding_dim))

        # 3. 生成查询嵌入
        query_embedding = np.zeros(self.embedding_dim)
        if self.embedding_model:
            try:
                query_embedding = self.embedding_model.encode(query)
            except Exception as e:
                logger.error(f"查询嵌入生成失败: {e}")

        # 4. 构建 BM25 索引
        self.hybrid_search.build_bm25_index(documents)

        # 5. 执行混合搜索
        results = self.hybrid_search.search(
            query=query,
            query_embedding=query_embedding,
            documents=documents,
            document_embeddings=document_embeddings,
            top_k=top_k,
            min_score=min_score,
            use_hybrid=True
        )

        # 6. 转换为返回格式
        output = []
        result_ids = set()
        for result in results:
            output.append({
                'id': result.id,
                'content': result.content,
                'memory_type': result.memory_type,
                'score': result.score,
                'vector_score': result.vector_score,
                'text_score': result.text_score,
                'source': result.source,
                'created_at': result.created_at
            })
            result_ids.add(result.id)

        # 6b. 将直接匹配但不在混合搜索结果中的记忆补充进来（高分兜底）
        for row in like_rows:
            if row['id'] not in result_ids and len(output) < top_k:
                output.append({
                    'id': row['id'],
                    'content': row['content'],
                    'memory_type': row['memory_type'],
                    'score': 0.9,  # 直接内容匹配给高分
                    'vector_score': 0.0,
                    'text_score': 1.0,
                    'source': 'direct_match',
                    'created_at': row['created_at']
                })

        # 7. 更新访问统计
        self._update_access_stats([r['id'] for r in output])

        logger.info(f"混合搜索 V2 完成: 返回 {len(output)} 个结果 (直接匹配: {len(like_ids)})")
        return output

    async def _search_memories_legacy(
        self,
        user_id: str,
        query: str,
        top_k: int,
        memory_type: Optional[str],
        similarity_threshold: float
    ) -> List[Dict]:
        """搜索记忆 - 旧版实现 (保留作为 fallback)"""

        # 1. 向量搜索
        vector_results = []
        if self.embedding_model and self.index and self.index.ntotal > 0:
            try:
                query_embedding = self.embedding_model.encode(query)
                query_embedding = np.array([query_embedding]).astype('float32')

                # FAISS 搜索
                distances, indices = self.index.search(query_embedding, min(top_k * 2, self.index.ntotal))

                # 转换为相似度（L2 距离 → 相似度）
                similarities = 1 / (1 + distances[0])

                conn = self._get_connection()
                cursor = conn.cursor()

                for idx, similarity in zip(indices[0], similarities):
                    if similarity < similarity_threshold:
                        continue

                    # 查询记忆
                    cursor.execute("""
                        SELECT * FROM semantic_memories
                        WHERE user_id = ? AND embedding_index = ?
                    """, (user_id, int(idx)))

                    row = cursor.fetchone()
                    if row:
                        vector_results.append({
                            "id": row["id"],
                            "content": row["content"],
                            "memory_type": row["memory_type"],
                            "similarity": float(similarity),
                            "source": "vector",
                            "created_at": row["created_at"]
                        })

                conn.close()
            except Exception as e:
                logger.error(f"向量搜索失败: {e}")

        # 2. 关键词搜索（FTS5）
        keyword_results = []
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            sql = """
                SELECT m.*, bm25(semantic_memories_fts) as score
                FROM semantic_memories_fts f
                JOIN semantic_memories m ON f.id = m.id
                WHERE f.content MATCH ? AND m.user_id = ?
            """
            params = [query, user_id]

            if memory_type:
                sql += " AND m.memory_type = ?"
                params.append(memory_type)

            sql += " ORDER BY score DESC LIMIT ?"
            params.append(top_k)

            cursor.execute(sql, params)

            for row in cursor.fetchall():
                keyword_results.append({
                    "id": row["id"],
                    "content": row["content"],
                    "memory_type": row["memory_type"],
                    "similarity": float(row["score"]),
                    "source": "keyword",
                    "created_at": row["created_at"]
                })

            conn.close()
        except Exception as e:
            logger.error(f"关键词搜索失败: {e}")

        # 3. 合并结果（向量 70% + 关键词 30%）
        merged_results = {}
        VECTOR_WEIGHT = float(os.getenv("VECTOR_WEIGHT", 0.7))
        KEYWORD_WEIGHT = float(os.getenv("KEYWORD_WEIGHT", 0.3))

        for result in vector_results:
            merged_results[result["id"]] = {
                **result,
                "final_score": result["similarity"] * VECTOR_WEIGHT
            }

        for result in keyword_results:
            if result["id"] in merged_results:
                merged_results[result["id"]]["final_score"] += result["similarity"] * KEYWORD_WEIGHT
            else:
                merged_results[result["id"]] = {
                    **result,
                    "final_score": result["similarity"] * KEYWORD_WEIGHT
                }

        # 排序并返回 Top-K
        final_results = sorted(
            merged_results.values(),
            key=lambda x: x["final_score"],
            reverse=True
        )[:top_k]

        # 更新访问统计
        self._update_access_stats([r["id"] for r in final_results])

        return final_results

    def _update_access_stats(self, memory_ids: List[str]):
        """更新访问统计"""
        if not memory_ids:
            return

        conn = self._get_connection()
        cursor = conn.cursor()

        placeholders = ",".join(["?"] * len(memory_ids))
        cursor.execute(f"""
            UPDATE semantic_memories
            SET access_count = access_count + 1,
                last_accessed_at = ?
            WHERE id IN ({placeholders})
        """, [datetime.now().isoformat()] + memory_ids)

        conn.commit()
        conn.close()

    async def list_memories(
        self,
        user_id: str,
        memory_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict]:
        """列出记忆"""
        conn = self._get_connection()
        cursor = conn.cursor()

        sql = "SELECT * FROM semantic_memories WHERE user_id = ?"
        params = [user_id]

        if memory_type:
            sql += " AND memory_type = ?"
            params.append(memory_type)

        sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(sql, params)

        memories = []
        for row in cursor.fetchall():
            memories.append({
                "id": row["id"],
                "content": row["content"],
                "memory_type": row["memory_type"],
                "importance": row["importance"],
                "access_count": row["access_count"],
                "created_at": row["created_at"],
                "metadata": json.loads(row["metadata"]) if row["metadata"] else None
            })

        conn.close()
        return memories

    async def delete_memory(self, memory_id: str):
        """删除记忆"""
        conn = self._get_connection()
        cursor = conn.cursor()

        # 删除记忆
        cursor.execute("DELETE FROM semantic_memories WHERE id = ?", (memory_id,))
        cursor.execute("DELETE FROM semantic_memories_fts WHERE id = ?", (memory_id,))

        conn.commit()
        conn.close()

        logger.info(f"删除记忆: {memory_id}")

    async def get_user_preference(self, user_id: str, pref_key: str) -> Optional[str]:
        """获取用户偏好"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT pref_value FROM user_preferences
            WHERE user_id = ? AND pref_key = ?
        """, (user_id, pref_key))

        row = cursor.fetchone()
        conn.close()

        return row["pref_value"] if row else None

    async def set_user_preference(self, user_id: str, pref_key: str, pref_value: str):
        """设置用户偏好"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO user_preferences (user_id, pref_key, pref_value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, pref_key) DO UPDATE SET
                pref_value = excluded.pref_value,
                updated_at = excluded.updated_at
        """, (user_id, pref_key, pref_value, datetime.now().isoformat()))

        conn.commit()
        conn.close()

        logger.info(f"设置用户偏好: {user_id}/{pref_key} = {pref_value}")

    def get_stats(self) -> Dict:
        """获取统计信息"""
        conn = self._get_connection()
        cursor = conn.cursor()

        # 总记忆数
        cursor.execute("SELECT COUNT(*) as count FROM semantic_memories")
        total_memories = cursor.fetchone()["count"]

        # 按类型统计
        cursor.execute("""
            SELECT memory_type, COUNT(*) as count
            FROM semantic_memories
            GROUP BY memory_type
        """)
        by_type = {row["memory_type"]: row["count"] for row in cursor.fetchall()}

        # FAISS 索引大小
        index_size = self.index.ntotal if self.index else 0

        conn.close()

        return {
            "total_memories": total_memories,
            "by_type": by_type,
            "index_size": index_size,
            "embedding_model": self.embedding_model.get_sentence_embedding_dimension() if self.embedding_model else None
        }
