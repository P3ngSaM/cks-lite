"""
长记忆系统 - Memory Manager
支持语义记忆（向量搜索）、工作记忆和程序记忆
增强版：集成 OpenClaw 风格的混合搜索 (BM25 + 向量)
"""

import os
import json
import sqlite3
import numpy as np
import re
from threading import Lock
from difflib import SequenceMatcher
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Tuple
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
        self.embedding_model_name = embedding_model
        self.lazy_embedding_load = os.getenv("MEMORY_LAZY_EMBEDDING_LOAD", "1").strip().lower() in {"1", "true", "yes", "on"}
        self._embedding_lock = Lock()

        # 初始化数据库
        self._init_database()

        # 初始化嵌入模型
        self.embedding_model = None
        self.embedding_dim = 384  # default for all-MiniLM-L6-v2
        if EMBEDDING_AVAILABLE and not self.lazy_embedding_load:
            try:
                logger.info(f"加载嵌入模型: {embedding_model}")
                self.embedding_model = SentenceTransformer(embedding_model)
                self.embedding_dim = self.embedding_model.get_sentence_embedding_dimension()
                logger.info(f"嵌入维度: {self.embedding_dim}")
            except Exception as e:
                logger.error(f"加载嵌入模型失败: {e}")
        elif self.lazy_embedding_load and EMBEDDING_AVAILABLE:
            logger.info("嵌入模型将按需懒加载，优先提升后端启动速度")

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

    def _ensure_embedding_ready(self):
        if not EMBEDDING_AVAILABLE or self.embedding_model is not None:
            return
        with self._embedding_lock:
            if self.embedding_model is not None:
                return
            try:
                logger.info(f"懒加载嵌入模型: {self.embedding_model_name}")
                self.embedding_model = SentenceTransformer(self.embedding_model_name)
                self.embedding_dim = self.embedding_model.get_sentence_embedding_dimension()
                if FAISS_AVAILABLE and self.index is None:
                    self._init_faiss_index()
                logger.info(f"嵌入模型准备完成，维度: {self.embedding_dim}")
            except Exception as e:
                logger.error(f"懒加载嵌入模型失败: {e}")

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

    @staticmethod
    def _normalize_text(text: str) -> str:
        if not text:
            return ""
        return re.sub(r"\s+", " ", text.lower().strip())

    @staticmethod
    def _text_similarity(left: str, right: str) -> float:
        """Return a conservative text similarity score for near-duplicate detection."""
        left_norm = MemoryManager._normalize_text(left)
        right_norm = MemoryManager._normalize_text(right)
        if not left_norm or not right_norm:
            return 0.0
        if left_norm == right_norm:
            return 1.0
        return float(SequenceMatcher(None, left_norm, right_norm).ratio())

    @staticmethod
    def _estimate_importance(memory_type: str, content: str, metadata: Optional[Dict]) -> int:
        """Estimate memory importance on save (1-10)."""
        memory_type = (memory_type or "").lower()
        base = {
            "user_config": 9,
            "user_info": 8,
            "personal": 8,
            "user_preference": 7,
            "preference": 7,
            "important_info": 8,
            "task": 7,
            "project": 6,
            "conversation": 5,
        }.get(memory_type, 5)

        content_norm = (content or "").lower()
        important_keywords = [
            "@",
            "email",
            "phone",
            "api",
            "token",
            "password",
            "deadline",
            "kpi",
            "okr",
        ]
        if any(k in content_norm for k in important_keywords):
            base = max(base, 8)
        if len(content_norm) <= 20:
            base = max(4, base - 1)

        if metadata and isinstance(metadata, dict):
            explicit = metadata.get("importance")
            if isinstance(explicit, (int, float)):
                base = int(explicit)

        return max(1, min(10, int(base)))

    @staticmethod
    def _recency_score(created_at: Optional[str]) -> float:
        if not created_at:
            return 0.0
        try:
            dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
            age_days = max(0.0, (datetime.now(dt.tzinfo) - dt).total_seconds() / 86400.0)
            return float(1.0 / (1.0 + age_days / 30.0))
        except Exception:
            return 0.0

    @staticmethod
    def _parse_metadata(raw_metadata) -> Dict:
        if isinstance(raw_metadata, dict):
            return raw_metadata
        if not raw_metadata:
            return {}
        try:
            parsed = json.loads(raw_metadata)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _ttl_days_for_type(memory_type: str) -> int:
        return {
            "user_info": 180,
            "user_preference": 180,
            "preference": 180,
            "project": 90,
            "task": 45,
            "manual": 120,
            "conversation": 30,
        }.get((memory_type or "").lower(), 120)

    @staticmethod
    def _extract_fact_signature(content: str) -> Optional[Tuple[str, str]]:
        text = (content or "").strip()
        if not text:
            return None

        email_match = re.search(r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})", text)
        if email_match:
            prefix = text[:email_match.start()].strip().lower()
            key = f"email::{prefix or 'unknown'}"
            return key, email_match.group(1).lower()

        phone_match = re.search(r"(\+?\d[\d\-\s]{6,}\d)", text)
        if phone_match:
            prefix = text[:phone_match.start()].strip().lower()
            digits = re.sub(r"\D", "", phone_match.group(1))
            key = f"phone::{prefix or 'unknown'}"
            return key, digits

        pair_match = re.search(r"^\s*([\w\u4e00-\u9fff\s]{2,40})\s*(?:is|=|:|是)\s*(.+)\s*$", text, re.IGNORECASE)
        if pair_match:
            key = self_key = MemoryManager._normalize_text(pair_match.group(1))
            value = MemoryManager._normalize_text(pair_match.group(2))
            if len(self_key) >= 2 and value:
                return f"fact::{self_key}", value
        return None

    @staticmethod
    def _apply_freshness_metadata(memory_type: str, metadata: Dict, now: datetime) -> Dict:
        merged = dict(metadata) if isinstance(metadata, dict) else {}
        freshness = merged.get("freshness")
        if not isinstance(freshness, dict):
            freshness = {}

        ttl_days = int(freshness.get("ttl_days") or MemoryManager._ttl_days_for_type(memory_type))
        verified_at = freshness.get("verified_at") or now.isoformat()
        expires_at = freshness.get("expires_at")
        if not expires_at:
            expires_at = datetime.fromtimestamp(now.timestamp() + ttl_days * 86400).isoformat()

        freshness["ttl_days"] = ttl_days
        freshness["verified_at"] = verified_at
        freshness["expires_at"] = expires_at
        freshness["status"] = freshness.get("status") or "active"
        merged["freshness"] = freshness
        return merged

    @staticmethod
    def _memory_staleness(memory_type: str, created_at: Optional[str], metadata: Optional[Dict]) -> Tuple[bool, float]:
        metadata = metadata or {}
        freshness = metadata.get("freshness")
        now = datetime.now()

        if isinstance(freshness, dict):
            expires_at = freshness.get("expires_at")
            if expires_at:
                try:
                    expires_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                    if now > expires_dt.replace(tzinfo=None) if expires_dt.tzinfo else now > expires_dt:
                        return True, 0.22
                except Exception:
                    pass

        ttl_days = MemoryManager._ttl_days_for_type(memory_type)
        if created_at:
            try:
                created_dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
                created_naive = created_dt.replace(tzinfo=None) if created_dt.tzinfo else created_dt
                age_days = max(0.0, (now - created_naive).total_seconds() / 86400.0)
                if age_days > ttl_days:
                    return True, 0.15
            except Exception:
                pass

        return False, 0.0

    def _find_conflicting_memory(
        self, user_id: str, content: str, memory_type: str
    ) -> Optional[Tuple[str, Dict, str]]:
        signature = self._extract_fact_signature(content)
        if not signature:
            return None
        fact_key, fact_value = signature

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, content, metadata
            FROM semantic_memories
            WHERE user_id = ? AND memory_type = ?
            ORDER BY created_at DESC
            LIMIT 200
            """,
            (user_id, memory_type),
        )
        rows = cursor.fetchall()
        conn.close()

        for row in rows:
            other_signature = self._extract_fact_signature(row["content"] or "")
            if not other_signature:
                continue
            other_key, other_value = other_signature
            if other_key == fact_key and other_value != fact_value:
                return row["id"], self._parse_metadata(row["metadata"]), row["content"]
        return None

    def _find_duplicate_memory(self, user_id: str, content: str, memory_type: str) -> Optional[Tuple[str, str]]:
        norm = self._normalize_text(content)
        if not norm:
            return None
        try:
            duplicate_threshold = float(os.getenv("MEMORY_DUPLICATE_THRESHOLD", "0.96"))
        except ValueError:
            duplicate_threshold = 0.96

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, content, metadata
            FROM semantic_memories
            WHERE user_id = ? AND memory_type = ?
            ORDER BY created_at DESC
            LIMIT 200
            """,
            (user_id, memory_type),
        )
        rows = cursor.fetchall()
        conn.close()

        for row in rows:
            existing_content = row["content"] or ""
            similarity = self._text_similarity(existing_content, content)
            if similarity >= duplicate_threshold:
                return row["id"], row["metadata"]
        return None

    @staticmethod
    def _rerank_results(results: List[Dict], top_k: int) -> List[Dict]:
        reranked = []
        for row in results:
            base = float(row.get("final_score") or row.get("score") or row.get("similarity") or 0.0)
            try:
                importance = max(1, min(10, int(row.get("importance", 5))))
            except Exception:
                importance = 5
            try:
                access_count = max(0, int(row.get("access_count", 0)))
            except Exception:
                access_count = 0
            metadata = MemoryManager._parse_metadata(row.get("metadata"))
            stale, stale_penalty = MemoryManager._memory_staleness(
                row.get("memory_type", ""), row.get("created_at"), metadata
            )
            conflict_penalty = 0.12 if metadata.get("conflict_status") == "pending_review" else 0.0

            importance_boost = (importance / 10.0) * 0.15
            recency_boost = MemoryManager._recency_score(row.get("created_at")) * 0.15
            access_boost = min(0.05, np.log1p(access_count) * 0.01)
            row["stale"] = stale
            row["conflict_status"] = metadata.get("conflict_status")
            row["final_score"] = base + importance_boost + recency_boost + access_boost - stale_penalty - conflict_penalty
            reranked.append(row)

        reranked.sort(key=lambda x: x.get("final_score", 0.0), reverse=True)
        return reranked[:top_k]

    async def save_memory(
        self,
        user_id: str,
        content: str,
        memory_type: str = "conversation",
        metadata: Optional[Dict] = None
    ) -> str:
        """Save a memory with deduplication and importance scoring."""
        import uuid
        self._ensure_embedding_ready()

        now_dt = datetime.now()
        metadata = metadata if isinstance(metadata, dict) else {}
        metadata = self._apply_freshness_metadata(memory_type, metadata, now_dt)

        duplicate = self._find_duplicate_memory(user_id, content, memory_type)
        if duplicate:
            memory_id, existing_meta_raw = duplicate
            merged_meta = self._parse_metadata(existing_meta_raw)
            merged_meta.update(metadata)
            merged_meta = self._apply_freshness_metadata(memory_type, merged_meta, now_dt)
            merged_meta["last_seen_at"] = now_dt.isoformat()
            merged_meta["duplicate_hits"] = int(merged_meta.get("duplicate_hits", 0)) + 1

            importance = self._estimate_importance(memory_type, content, merged_meta)
            now = now_dt.isoformat()

            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE semantic_memories
                SET metadata = ?,
                    importance = ?,
                    last_accessed_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(merged_meta) if merged_meta else None, importance, now, now, memory_id),
            )
            conn.commit()
            conn.close()

            logger.info(f"Duplicate memory hit; updated existing record: {memory_id} (user: {user_id})")
            return memory_id

        memory_id = f"mem_{uuid.uuid4().hex[:12]}"
        conflict = self._find_conflicting_memory(user_id, content, memory_type)
        if conflict:
            conflict_id, existing_conflict_meta, _ = conflict
            metadata["conflict_status"] = "pending_review"
            metadata["conflict_with"] = sorted(
                set(list(metadata.get("conflict_with", [])) + [conflict_id])
            )
            signature = self._extract_fact_signature(content)
            if signature:
                metadata["conflict_key"] = signature[0]

            existing_conflict_meta = dict(existing_conflict_meta or {})
            existing_conflict_meta["conflict_status"] = "pending_review"
            linked = set(existing_conflict_meta.get("conflict_with", []))
            linked.add(memory_id)
            existing_conflict_meta["conflict_with"] = sorted(linked)
            existing_conflict_meta = self._apply_freshness_metadata(
                memory_type, existing_conflict_meta, now_dt
            )

            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE semantic_memories
                SET metadata = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(existing_conflict_meta), now_dt.isoformat(), conflict_id),
            )
            conn.commit()
            conn.close()

        importance = self._estimate_importance(memory_type, content, metadata)

        embedding_index = None
        if self.embedding_model and self.index:
            try:
                embedding = self.embedding_model.encode(content)
                embedding = np.array([embedding]).astype('float32')
                self.index.add(embedding)
                embedding_index = self.index.ntotal - 1
                faiss.write_index(self.index, str(self.index_path))
            except Exception as e:
                logger.error(f"Failed to generate embedding vector: {e}")

        now = now_dt.isoformat()
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO semantic_memories
            (id, user_id, content, embedding_index, memory_type, importance, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            memory_id,
            user_id,
            content,
            embedding_index,
            memory_type,
            importance,
            json.dumps(metadata) if metadata else None,
            now,
            now,
        ))

        cursor.execute("""
            INSERT INTO semantic_memories_fts(id, content)
            VALUES (?, ?)
        """, (memory_id, content))

        conn.commit()
        conn.close()

        if self.markdown_memory:
            try:
                if memory_type == "conversation":
                    self.markdown_memory.save_daily_log(
                        content=content,
                        log_type="conversation"
                    )
                else:
                    tags = []
                    if metadata and "tags" in metadata:
                        tags = metadata["tags"]
                    self.markdown_memory.save_memory(
                        content=content,
                        memory_type=memory_type,
                        tags=tags
                    )
                logger.info("Memory synchronized to Markdown files")
            except Exception as e:
                logger.error(f"Failed to save Markdown memory: {e}")

        logger.info(f"Saved memory: {memory_id} (user: {user_id})")
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
        self._ensure_embedding_ready()

        # 如果启用了混合搜索服务，使用新的混合搜索
        if use_hybrid and self.hybrid_search and HYBRID_SEARCH_AVAILABLE:
            return await self._hybrid_search_v2(
                user_id, query, top_k, memory_type, similarity_threshold
            )

        # Fallback 到原有实现
        return await self._search_memories_legacy(
            user_id, query, top_k, memory_type, similarity_threshold
        )

    async def search_memory_snippets(
        self,
        user_id: str,
        query: str,
        top_k: int = 5,
        memory_type: Optional[str] = None,
        use_hybrid: bool = True
    ) -> List[Dict]:
        """
        Two-stage memory recall - stage 1 (search):
        Return compact snippets and ids; full content should be fetched via get_memory_detail.
        """
        results = await self.search_memories(
            user_id=user_id,
            query=query,
            top_k=top_k,
            memory_type=memory_type,
            use_hybrid=use_hybrid,
        )
        snippets: List[Dict] = []
        for row in results:
            text = (row.get("content") or "").strip()
            preview = text[:220] + ("..." if len(text) > 220 else "")
            snippets.append({
                "id": row.get("id"),
                "memory_type": row.get("memory_type"),
                "preview": preview,
                "score": row.get("final_score", row.get("score", row.get("similarity", 0.0))),
                "source": row.get("source", "memory"),
                "created_at": row.get("created_at"),
            })
        return snippets

    async def get_memory_detail(
        self,
        user_id: str,
        memory_id: str,
    ) -> Optional[Dict]:
        """
        Two-stage memory recall - stage 2 (get):
        Fetch full memory detail by id.
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM semantic_memories WHERE id = ? AND user_id = ? LIMIT 1",
            (memory_id, user_id),
        )
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        metadata = self._parse_metadata(row["metadata"])
        return {
            "id": row["id"],
            "content": row["content"],
            "memory_type": row["memory_type"],
            "importance": row["importance"],
            "access_count": row["access_count"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "metadata": metadata,
        }

    async def _hybrid_search_v2(
        self,
        user_id: str,
        query: str,
        top_k: int,
        memory_type: Optional[str],
        min_score: float
    ) -> List[Dict]:
        """Hybrid search with LIKE fallback and reranking."""
        conn = self._get_connection()
        cursor = conn.cursor()

        sql = "SELECT * FROM semantic_memories WHERE user_id = ?"
        params = [user_id]
        if memory_type:
            sql += " AND memory_type = ?"
            params.append(memory_type)

        cursor.execute(sql, params)
        rows = cursor.fetchall()

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

        seen_ids = set()
        all_rows = []
        like_ids = set()
        row_map = {}

        for row in like_rows:
            rid = row["id"]
            row_map[rid] = row
            if rid not in seen_ids:
                seen_ids.add(rid)
                all_rows.append(row)
                like_ids.add(rid)

        for row in rows:
            rid = row["id"]
            row_map[rid] = row
            if rid not in seen_ids:
                seen_ids.add(rid)
                all_rows.append(row)

        documents = []
        document_embeddings = []
        for row in all_rows:
            documents.append({
                "id": row["id"],
                "content": row["content"],
                "memory_type": row["memory_type"],
                "created_at": row["created_at"],
            })

            embedding_index = row["embedding_index"]
            if embedding_index is not None and self.index:
                try:
                    embedding = self.index.reconstruct(int(embedding_index))
                    document_embeddings.append(embedding)
                except Exception:
                    document_embeddings.append(np.zeros(self.embedding_dim))
            else:
                document_embeddings.append(np.zeros(self.embedding_dim))

        query_embedding = np.zeros(self.embedding_dim)
        if self.embedding_model:
            try:
                query_embedding = self.embedding_model.encode(query)
            except Exception as e:
                logger.error(f"Failed to build query embedding: {e}")

        self.hybrid_search.build_bm25_index(documents)
        results = self.hybrid_search.search(
            query=query,
            query_embedding=query_embedding,
            documents=documents,
            document_embeddings=document_embeddings,
            top_k=top_k,
            min_score=min_score,
            use_hybrid=True,
        )

        output = []
        result_ids = set()
        for result in results:
            db_row = row_map.get(result.id)
            metadata = self._parse_metadata(db_row["metadata"]) if db_row else {}
            output.append({
                "id": result.id,
                "content": result.content,
                "memory_type": result.memory_type,
                "score": result.score,
                "vector_score": result.vector_score,
                "text_score": result.text_score,
                "source": result.source,
                "created_at": result.created_at,
                "importance": db_row["importance"] if db_row else 5,
                "access_count": db_row["access_count"] if db_row else 0,
                "metadata": metadata,
            })
            result_ids.add(result.id)

        for row in like_rows:
            if row["id"] not in result_ids and len(output) < top_k:
                output.append({
                    "id": row["id"],
                    "content": row["content"],
                    "memory_type": row["memory_type"],
                    "score": 0.9,
                    "vector_score": 0.0,
                    "text_score": 1.0,
                    "source": "direct_match",
                    "created_at": row["created_at"],
                    "importance": row["importance"],
                    "access_count": row["access_count"],
                    "metadata": self._parse_metadata(row["metadata"]),
                })

        output = self._rerank_results(output, top_k)
        self._update_access_stats([r["id"] for r in output])

        logger.info(
            f"Hybrid search V2 finished: {len(output)} results (direct matches: {len(like_ids)})"
        )
        return output


    async def _search_memories_legacy(
        self,
        user_id: str,
        query: str,
        top_k: int,
        memory_type: Optional[str],
        similarity_threshold: float
    ) -> List[Dict]:
        """Legacy memory search implementation kept as fallback."""

        vector_results = []
        if self.embedding_model and self.index and self.index.ntotal > 0:
            try:
                query_embedding = self.embedding_model.encode(query)
                query_embedding = np.array([query_embedding]).astype('float32')

                distances, indices = self.index.search(query_embedding, min(top_k * 2, self.index.ntotal))
                similarities = 1 / (1 + distances[0])

                conn = self._get_connection()
                cursor = conn.cursor()

                for idx, similarity in zip(indices[0], similarities):
                    if similarity < similarity_threshold:
                        continue

                    cursor.execute(
                        """
                        SELECT * FROM semantic_memories
                        WHERE user_id = ? AND embedding_index = ?
                        """,
                        (user_id, int(idx)),
                    )

                    row = cursor.fetchone()
                    if row:
                        vector_results.append({
                            "id": row["id"],
                            "content": row["content"],
                            "memory_type": row["memory_type"],
                            "similarity": float(similarity),
                            "source": "vector",
                            "created_at": row["created_at"],
                            "importance": row["importance"],
                            "access_count": row["access_count"],
                            "metadata": self._parse_metadata(row["metadata"]),
                        })

                conn.close()
            except Exception as e:
                logger.error(f"Vector search failed: {e}")

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
                    "created_at": row["created_at"],
                    "importance": row["importance"],
                    "access_count": row["access_count"],
                    "metadata": self._parse_metadata(row["metadata"]),
                })

            conn.close()
        except Exception as e:
            logger.error(f"Keyword search failed: {e}")

        merged_results = {}
        vector_weight = float(os.getenv("VECTOR_WEIGHT", 0.7))
        keyword_weight = float(os.getenv("KEYWORD_WEIGHT", 0.3))

        for result in vector_results:
            merged_results[result["id"]] = {
                **result,
                "final_score": result["similarity"] * vector_weight,
            }

        for result in keyword_results:
            if result["id"] in merged_results:
                merged_results[result["id"]]["final_score"] += result["similarity"] * keyword_weight
            else:
                merged_results[result["id"]] = {
                    **result,
                    "final_score": result["similarity"] * keyword_weight,
                }

        final_results = self._rerank_results(list(merged_results.values()), top_k)
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

    async def compact_memories(
        self,
        user_id: str,
        dedupe_threshold: float = 0.985,
        stale_days: int = 120,
        dry_run: bool = False,
    ) -> Dict:
        """Compact low-value memories to slow long-term memory corrosion."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, content, memory_type, importance, access_count, metadata, created_at
            FROM semantic_memories
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user_id,),
        )
        rows = cursor.fetchall()

        if not rows:
            conn.close()
            return {
                "total_before": 0,
                "deduplicated": 0,
                "pruned_stale": 0,
                "total_after": 0,
                "dry_run": dry_run,
            }

        dedupe_delete_ids = set()
        stale_delete_ids = set()
        kept_rows: List[sqlite3.Row] = []

        for row in rows:
            row_id = row["id"]
            if row_id in dedupe_delete_ids:
                continue

            # Prune low-value stale conversational noise first.
            row_meta = self._parse_metadata(row["metadata"])
            stale, _ = self._memory_staleness(row["memory_type"], row["created_at"], row_meta)
            if stale:
                try:
                    created_at = datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
                    created_naive = created_at.replace(tzinfo=None) if created_at.tzinfo else created_at
                    age_days = max(0.0, (datetime.now() - created_naive).total_seconds() / 86400.0)
                except Exception:
                    age_days = float(stale_days) + 1

                low_value = int(row["importance"] or 0) <= 4 and int(row["access_count"] or 0) <= 1
                noisy_type = (row["memory_type"] or "").lower() in {"conversation", "manual"}
                if noisy_type and low_value and age_days >= stale_days:
                    stale_delete_ids.add(row_id)
                    continue

            duplicate_of_kept = False
            for kept in kept_rows:
                if kept["memory_type"] != row["memory_type"]:
                    continue
                similarity = self._text_similarity(kept["content"] or "", row["content"] or "")
                if similarity >= dedupe_threshold:
                    dedupe_delete_ids.add(row_id)
                    duplicate_of_kept = True
                    break
            if not duplicate_of_kept:
                kept_rows.append(row)

        delete_ids = sorted(dedupe_delete_ids | stale_delete_ids)
        if delete_ids and not dry_run:
            placeholders = ",".join(["?"] * len(delete_ids))
            cursor.execute(f"DELETE FROM semantic_memories WHERE id IN ({placeholders})", delete_ids)
            cursor.execute(f"DELETE FROM semantic_memories_fts WHERE id IN ({placeholders})", delete_ids)
            conn.commit()

        cursor.execute("SELECT COUNT(*) as count FROM semantic_memories WHERE user_id = ?", (user_id,))
        total_after = int(cursor.fetchone()["count"])
        conn.close()

        return {
            "total_before": len(rows),
            "deduplicated": len(dedupe_delete_ids),
            "pruned_stale": len(stale_delete_ids),
            "total_after": total_after,
            "dry_run": dry_run,
        }

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
            metadata = json.loads(row["metadata"]) if row["metadata"] else None
            stale, _ = self._memory_staleness(row["memory_type"], row["created_at"], metadata or {})
            memories.append({
                "id": row["id"],
                "content": row["content"],
                "memory_type": row["memory_type"],
                "importance": row["importance"],
                "access_count": row["access_count"],
                "created_at": row["created_at"],
                "metadata": metadata,
                "stale": stale,
                "conflict_status": (metadata or {}).get("conflict_status")
            })

        conn.close()
        return memories

    async def resolve_conflict(self, memory_id: str, action: str = "accept_current") -> Dict:
        """Resolve conflict markers for one memory and its linked conflict set."""
        action = (action or "accept_current").strip().lower()
        if action not in {"accept_current", "keep_all"}:
            raise ValueError("Unsupported conflict action")

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM semantic_memories WHERE id = ?", (memory_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return {"updated": 0, "message": "memory_not_found"}

        now = datetime.now().isoformat()
        metadata = self._parse_metadata(row["metadata"])
        linked_ids = set(metadata.get("conflict_with", []))
        linked_ids.discard(memory_id)

        # Update current memory
        metadata["conflict_status"] = "resolved"
        metadata["resolved_at"] = now
        metadata["conflict_resolution"] = action
        metadata = self._apply_freshness_metadata(row["memory_type"], metadata, datetime.now())
        cursor.execute(
            """
            UPDATE semantic_memories
            SET metadata = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(metadata), now, memory_id),
        )
        updated = 1

        for linked_id in linked_ids:
            cursor.execute("SELECT id, memory_type, metadata FROM semantic_memories WHERE id = ?", (linked_id,))
            linked_row = cursor.fetchone()
            if not linked_row:
                continue
            linked_metadata = self._parse_metadata(linked_row["metadata"])
            if action == "accept_current":
                linked_metadata["conflict_status"] = "superseded"
                linked_metadata["superseded_by"] = memory_id
            else:
                linked_metadata["conflict_status"] = "resolved"
            linked_metadata["resolved_at"] = now
            linked_metadata["conflict_resolution"] = action
            linked_metadata = self._apply_freshness_metadata(
                linked_row["memory_type"], linked_metadata, datetime.now()
            )
            cursor.execute(
                """
                UPDATE semantic_memories
                SET metadata = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(linked_metadata), now, linked_id),
            )
            updated += 1

        conn.commit()
        conn.close()
        return {"updated": updated, "action": action}

    async def list_conflicts(
        self,
        user_id: str,
        status: str = "pending_review",
        limit: int = 100,
    ) -> List[Dict]:
        """List conflict-marked memories for triage."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT *
            FROM semantic_memories
            WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        rows = cursor.fetchall()
        conn.close()

        output = []
        for row in rows:
            metadata = self._parse_metadata(row["metadata"])
            conflict_status = metadata.get("conflict_status")
            if status != "all" and conflict_status != status:
                continue
            stale, _ = self._memory_staleness(row["memory_type"], row["created_at"], metadata)
            output.append(
                {
                    "id": row["id"],
                    "content": row["content"],
                    "memory_type": row["memory_type"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "importance": row["importance"],
                    "conflict_status": conflict_status,
                    "conflict_with": metadata.get("conflict_with", []),
                    "stale": stale,
                    "metadata": metadata,
                }
            )
        return output

    async def get_maintenance_report(
        self,
        user_id: str,
        dedupe_threshold: float = 0.985,
        stale_days: int = 120,
    ) -> Dict:
        """Generate anti-corrosion maintenance report without mutating data."""
        preview = await self.compact_memories(
            user_id=user_id,
            dedupe_threshold=dedupe_threshold,
            stale_days=stale_days,
            dry_run=True,
        )
        conflicts = await self.list_conflicts(user_id=user_id, status="pending_review", limit=500)
        stale_count = 0
        total_count = 0
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, memory_type, created_at, metadata FROM semantic_memories WHERE user_id = ?", (user_id,))
        for row in cursor.fetchall():
            total_count += 1
            metadata = self._parse_metadata(row["metadata"])
            stale, _ = self._memory_staleness(row["memory_type"], row["created_at"], metadata)
            if stale:
                stale_count += 1
        conn.close()

        return {
            "total_memories": total_count,
            "pending_conflicts": len(conflicts),
            "stale_memories": stale_count,
            "dedupe_candidates": preview.get("deduplicated", 0),
            "stale_prune_candidates": preview.get("pruned_stale", 0),
            "dedupe_threshold": dedupe_threshold,
            "stale_days": stale_days,
            "generated_at": datetime.now().isoformat(),
        }

    async def run_scheduled_maintenance(
        self,
        user_id: str,
        interval_hours: int = 24,
        force: bool = False,
        dedupe_threshold: float = 0.985,
        stale_days: int = 120,
    ) -> Dict:
        """Run maintenance when due by schedule, otherwise return skip status."""
        now = datetime.now()
        last_run_raw = await self.get_user_preference(user_id, "memory_maintenance_last_run")
        last_run = None
        if last_run_raw:
            try:
                last_run = datetime.fromisoformat(last_run_raw.replace("Z", "+00:00"))
            except Exception:
                last_run = None

        due = force
        if not due:
            if not last_run:
                due = True
            else:
                last_run_naive = last_run.replace(tzinfo=None) if last_run.tzinfo else last_run
                due = (now - last_run_naive).total_seconds() >= interval_hours * 3600

        if not due:
            next_run = None
            if last_run:
                last_run_naive = last_run.replace(tzinfo=None) if last_run.tzinfo else last_run
                next_run = datetime.fromtimestamp(last_run_naive.timestamp() + interval_hours * 3600).isoformat()
            return {
                "ran": False,
                "reason": "not_due",
                "last_run_at": last_run_raw,
                "next_run_at": next_run,
                "interval_hours": interval_hours,
            }

        result = await self.compact_memories(
            user_id=user_id,
            dedupe_threshold=dedupe_threshold,
            stale_days=stale_days,
            dry_run=False,
        )
        await self.set_user_preference(user_id, "memory_maintenance_last_run", now.isoformat())
        return {
            "ran": True,
            "interval_hours": interval_hours,
            "last_run_at": now.isoformat(),
            **result,
        }

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
