"""
Skill Installer - 从 GitHub / skills.sh 安装社区技能
支持多种引用格式，自动适配 SKILL.md 标准到 CKS Lite 格式
"""

import json
import shutil
import tarfile
import tempfile
import re
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
import logging
import httpx

logger = logging.getLogger(__name__)


class SkillInstaller:
    """技能安装器 - 从 GitHub 下载并安装社区技能"""

    def __init__(self, skills_dir: Path):
        self.skills_dir = skills_dir
        self.manifest_path = skills_dir / ".installed_skills.json"
        self._manifest = self._load_manifest()

    # ── Manifest 管理 ──────────────────────────────────────────

    def _load_manifest(self) -> Dict:
        if self.manifest_path.exists():
            try:
                with open(self.manifest_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"加载安装清单失败: {e}")
        return {}

    def _save_manifest(self):
        try:
            with open(self.manifest_path, "w", encoding="utf-8") as f:
                json.dump(self._manifest, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"保存安装清单失败: {e}")

    def get_installed_skills(self) -> Dict:
        return dict(self._manifest)

    @staticmethod
    def _normalize_skill_name(name: str) -> str:
        value = re.sub(r"[^a-zA-Z0-9_-]+", "-", (name or "").strip()).strip("-_").lower()
        return value or "custom-skill"

    @staticmethod
    def _find_skill_root(base_dir: Path) -> Optional[Path]:
        if (base_dir / "SKILL.md").exists():
            return base_dir
        for path in base_dir.rglob("SKILL.md"):
            return path.parent
        return None

    # ── 引用解析 ─────────────────────────────────────────────

    @staticmethod
    def parse_github_ref(ref: str) -> Dict:
        """
        解析 GitHub 引用，支持多种格式：
        - owner/repo
        - owner/repo/path/to/skill
        - https://github.com/owner/repo
        - https://github.com/owner/repo/tree/main/skills/my-skill
        - https://github.com/owner/repo --skill skill-name  (skills.sh 格式)
        - npx @anthropic-ai/claude-code --skill https://github.com/owner/repo --skill skill-name
        """
        ref = ref.strip().rstrip("/")
        # 容错：去掉常见前导符号（如“: ref”、“- ref”）
        ref = re.sub(r"^[\s:：>•\-*`]+", "", ref)
        ref = ref.strip().strip("`'\"()[]{}").rstrip("/")

        # 去掉 npx 命令前缀（用户可能直接粘贴 skills.sh 的安装命令）
        npx_match = re.match(r"npx\s+\S+\s+", ref)
        if npx_match:
            ref = ref[npx_match.end():]

        # 提取 --skill 标志（skills.sh 格式）
        # 例如: "https://github.com/vercel-labs/skills --skill find-skills"
        # 或: "--skill https://github.com/owner/repo --skill skill-name"
        skill_name_from_flag = None
        segments = re.split(r"\s+--skill\s+", ref)
        if len(segments) > 1:
            # 第一段是仓库引用（可能为空，如果 ref 以 --skill 开头）
            # 后续段中：URL 类的是仓库引用，非 URL 的是技能名称
            repo_ref = segments[0].strip() if segments[0].strip() else None
            for seg in segments[1:]:
                seg = seg.strip()
                if seg.startswith("http") or "/" in seg:
                    # 这是仓库 URL/引用
                    if not repo_ref:
                        repo_ref = seg
                else:
                    # 这是技能名称
                    skill_name_from_flag = seg
            ref = repo_ref or ref
        ref = ref.strip().rstrip("/")
        # ????????????? ": ref"?"- ref"?"? ref"?
        ref = re.sub(r"^[^A-Za-z0-9h]+", "", ref)
        ref = ref.strip().strip("`'\"()[]{}").rstrip("/")

        # ???????????????? GitHub ??
        if "github.com/" in ref and not ref.startswith("http"):
            m = re.search(r"(https?://github\.com/[^\s]+)", ref)
            if m:
                ref = m.group(1).rstrip("/")
        elif not ref.startswith("http"):
            m = re.search(r"([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[^\s]+)?)", ref)
            if m:
                ref = m.group(1).rstrip("/")

        # URL ???repo ??????
        url_match = re.match(
            r"https?://github\.com/([^/\s]+)/([^/\s]+)(?:/tree/([^/\s]+)(?:/(.+))?)?",
            ref,
        )
        if url_match:
            owner, repo, branch, path = url_match.groups()
            return {
                "owner": owner,
                "repo": repo,
                "path": skill_name_from_flag or path or None,
                "branch": branch or "main",
            }

        # 短引用: owner/repo 或 owner/repo/path/...
        # 先按空格切掉多余内容，只取第一个 token
        ref_token = ref.split()[0] if ref.split() else ref
        parts = ref_token.split("/")
        if len(parts) >= 2:
            owner = parts[0]
            repo = parts[1]
            path = "/".join(parts[2:]) if len(parts) > 2 else None
            return {
                "owner": owner,
                "repo": repo,
                "path": skill_name_from_flag or path or None,
                "branch": "main",
            }

        raise ValueError(f"无法解析 GitHub 引用: {ref}")

    # ── 安装流程 ─────────────────────────────────────────────

    async def install_skill(self, ref: str) -> Dict:
        """
        完整安装流程：
        1. 解析引用 → 2. 下载 → 3. 定位 SKILL.md → 4. 验证 → 5. 自动生成 template.json → 6. 复制 → 7. 记录
        """
        try:
            # 1. 解析
            parsed = self.parse_github_ref(ref)
            logger.info(f"解析引用: {parsed}")

            # 2. 下载到临时目录
            tmp_dir = await self._download_from_github(
                parsed["owner"], parsed["repo"], parsed["path"], parsed["branch"]
            )

            try:
                # 3. 定位 SKILL.md
                skill_root = self._find_skill_root(tmp_dir)
                if not skill_root:
                    return {"success": False, "error": "未找到 SKILL.md 或 template.json"}

                # 4. 验证
                if not self._validate_skill(skill_root):
                    return {"success": False, "error": "技能验证失败: 缺少必要文件"}

                # 5. 自动生成 template.json（如果只有 SKILL.md）
                self._auto_generate_template(skill_root)

                # 6. 确定技能名称并复制
                skill_name = skill_root.name
                target_dir = self.skills_dir / skill_name

                if target_dir.exists():
                    # 已存在同名技能，先删除旧的
                    if skill_name in self._manifest:
                        shutil.rmtree(target_dir)
                        logger.info(f"覆盖已安装技能: {skill_name}")
                    else:
                        return {
                            "success": False,
                            "error": f"技能 '{skill_name}' 已存在（预装技能，不可覆盖）",
                        }

                shutil.copytree(skill_root, target_dir)
                logger.info(f"技能已复制到: {target_dir}")

                # 7. 记录 manifest
                github_url = f"https://github.com/{parsed['owner']}/{parsed['repo']}"
                self._manifest[skill_name] = {
                    "owner": parsed["owner"],
                    "repo": parsed["repo"],
                    "path": parsed["path"],
                    "installed_at": datetime.now().isoformat(),
                    "github_url": github_url,
                }
                self._save_manifest()

                return {"success": True, "skill_name": skill_name}

            finally:
                # 清理临时目录
                shutil.rmtree(tmp_dir, ignore_errors=True)

        except ValueError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"安装技能失败: {e}", exc_info=True)
            return {"success": False, "error": f"安装失败: {str(e)}"}

    # ── 下载 ─────────────────────────────────────────────────

    async def _download_from_github(
        self, owner: str, repo: str, path: Optional[str], branch: str
    ) -> Path:
        """从 GitHub 下载技能文件到临时目录"""
        tmp_dir = Path(tempfile.mkdtemp(prefix="skill_install_"))

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            repo_meta = await self._get_repo_meta(client, owner, repo)
            if not repo_meta:
                raise Exception(
                    f"仓库不存在或无访问权限: {owner}/{repo}（GitHub 返回 404）"
                )
            default_branch = str(repo_meta.get("default_branch") or "main").strip() or "main"
            branch_candidates = []
            for item in [branch, default_branch, "main", "master"]:
                item = (item or "").strip()
                if item and item not in branch_candidates:
                    branch_candidates.append(item)

            if path:
                # 有路径：用 Contents API 递归下载目录
                # 尝试直接路径，若 404 则尝试常见前缀
                resolved_path = None
                resolved_branch = None
                for branch_item in branch_candidates:
                    resolved_path = await self._resolve_skill_path(
                        client, owner, repo, path, branch_item
                    )
                    if resolved_path:
                        resolved_branch = branch_item
                        break
                if not resolved_path:
                    raise Exception(
                        f"在仓库 {owner}/{repo} 中未找到技能 '{path}'，"
                        f"已尝试分支: {', '.join(branch_candidates)}；路径: {path}, skills/{path}"
                    )
                await self._download_directory(
                    client, owner, repo, resolved_path, resolved_branch or branch, tmp_dir
                )
            else:
                # 无路径：下载 tarball 并解压
                await self._download_tarball(client, owner, repo, branch_candidates, tmp_dir)

        return tmp_dir

    async def _get_repo_meta(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
    ) -> Optional[Dict]:
        """读取仓库元信息（用于校验存在性与默认分支）"""
        url = f"https://api.github.com/repos/{owner}/{repo}"
        headers = {"Accept": "application/vnd.github.v3+json"}
        response = await client.get(url, headers=headers)
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise Exception(f"读取仓库信息失败: {response.status_code}")
        return response.json()

    async def _resolve_skill_path(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
        path: str,
        branch: str,
    ) -> Optional[str]:
        """尝试多种路径定位技能目录，返回第一个有效路径"""
        # 候选路径：直接路径 → skills/ 前缀 → packages/ 前缀
        candidates = [path]
        if "/" not in path:
            # 短名称（如 "find-skills"），尝试常见子目录
            candidates.extend([
                f"skills/{path}",
                f"packages/{path}",
                f"src/{path}",
            ])

        headers = {"Accept": "application/vnd.github.v3+json"}
        for candidate in candidates:
            url = f"https://api.github.com/repos/{owner}/{repo}/contents/{candidate}?ref={branch}"
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                logger.info(f"技能路径已解析: {candidate}")
                return candidate
            logger.debug(f"路径不存在: {candidate} ({response.status_code})")

        return None

    async def _download_directory(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
        path: str,
        branch: str,
        dest: Path,
    ):
        """递归下载 GitHub 目录"""
        url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}"
        headers = {"Accept": "application/vnd.github.v3+json"}

        response = await client.get(url, headers=headers)
        if response.status_code != 200:
            raise Exception(f"GitHub API 请求失败: {response.status_code} - {response.text[:200]}")

        items = response.json()
        if not isinstance(items, list):
            # 单个文件
            items = [items]

        # 创建以最后一级路径命名的目录
        dir_name = path.rstrip("/").split("/")[-1]
        target_dir = dest / dir_name
        target_dir.mkdir(parents=True, exist_ok=True)

        for item in items:
            if item["type"] == "file":
                # 下载文件
                file_response = await client.get(item["download_url"])
                file_path = target_dir / item["name"]
                file_path.write_bytes(file_response.content)
                logger.debug(f"下载文件: {item['name']}")
            elif item["type"] == "dir":
                # 递归下载子目录
                await self._download_subdirectory(
                    client, owner, repo, item["path"], branch, target_dir
                )

    async def _download_subdirectory(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
        path: str,
        branch: str,
        parent_dir: Path,
    ):
        """递归下载子目录"""
        url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}"
        headers = {"Accept": "application/vnd.github.v3+json"}

        response = await client.get(url, headers=headers)
        if response.status_code != 200:
            logger.warning(f"下载子目录失败: {path}")
            return

        items = response.json()
        dir_name = path.rstrip("/").split("/")[-1]
        target_dir = parent_dir / dir_name
        target_dir.mkdir(parents=True, exist_ok=True)

        for item in items:
            if item["type"] == "file":
                file_response = await client.get(item["download_url"])
                file_path = target_dir / item["name"]
                file_path.write_bytes(file_response.content)
            elif item["type"] == "dir":
                await self._download_subdirectory(
                    client, owner, repo, item["path"], branch, target_dir
                )

    async def _download_tarball(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
        branch_candidates: List[str],
        dest: Path,
    ):
        """下载仓库 tarball 并解压"""
        headers = {"Accept": "application/vnd.github.v3+json"}
        response = None
        used_branch = None
        for branch in branch_candidates:
            url = f"https://api.github.com/repos/{owner}/{repo}/tarball/{branch}"
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                used_branch = branch
                break
            logger.warning(f"下载 tarball 失败: {owner}/{repo}@{branch} -> {response.status_code}")
        if not response or response.status_code != 200:
            status_code = response.status_code if response else "unknown"
            raise Exception(
                f"下载 tarball 失败: {status_code}（已尝试分支: {', '.join(branch_candidates)}）"
            )
        logger.info(f"下载 tarball 成功: {owner}/{repo}@{used_branch}")

        tar_path = dest / "repo.tar.gz"
        tar_path.write_bytes(response.content)

        with tarfile.open(tar_path, "r:gz") as tar:
            self._safe_extract_tar(tar, dest)

        tar_path.unlink()

        # tarball 解压后会有一层 owner-repo-hash 目录，将内容提升一级
        extracted_dirs = [d for d in dest.iterdir() if d.is_dir()]
        if len(extracted_dirs) == 1:
            extracted = extracted_dirs[0]
            # 将内容移到以 repo 名命名的目录
            repo_dir = dest / repo
            extracted.rename(repo_dir)

    @staticmethod
    def _safe_extract_tar(tar: tarfile.TarFile, dest: Path):
        """
        Safely extract tar members and block path traversal.
        """
        dest_resolved = dest.resolve()
        safe_members = []
        for member in tar.getmembers():
            member_path = dest / member.name
            try:
                member_resolved = member_path.resolve()
            except Exception:
                logger.warning(f"跳过不可解析 tar 条目: {member.name}")
                continue

            try:
                member_resolved.relative_to(dest_resolved)
            except Exception:
                logger.warning(f"跳过潜在路径穿越 tar 条目: {member.name}")
                continue
            safe_members.append(member)

        tar.extractall(path=dest, members=safe_members)

    # ── 技能定位与验证 ────────────────────────────────────────

    def _find_skill_root(self, tmp_dir: Path) -> Optional[Path]:
        """在临时目录中定位 SKILL.md 所在目录"""
        # 先在直接子目录中查找
        for child in tmp_dir.iterdir():
            if child.is_dir():
                if (child / "SKILL.md").exists() or (child / "template.json").exists():
                    return child

        # 再递归查找（最多 3 层）
        for skill_md in tmp_dir.rglob("SKILL.md"):
            depth = len(skill_md.relative_to(tmp_dir).parts)
            if depth <= 4:  # SKILL.md 本身算一层
                return skill_md.parent

        for template_json in tmp_dir.rglob("template.json"):
            depth = len(template_json.relative_to(tmp_dir).parts)
            if depth <= 4:
                return template_json.parent

        return None

    @staticmethod
    def _validate_skill(skill_dir: Path) -> bool:
        """验证技能目录有效性"""
        has_skill_md = (skill_dir / "SKILL.md").exists()
        has_template = (skill_dir / "template.json").exists()
        return has_skill_md or has_template

    # ── 兼容性桥接 ───────────────────────────────────────────

    def _auto_generate_template(self, skill_dir: Path):
        """
        从 SKILL.md frontmatter 自动生成 template.json
        仅在 SKILL.md 存在且 template.json 不存在时执行
        """
        skill_md_path = skill_dir / "SKILL.md"
        template_path = skill_dir / "template.json"

        if not skill_md_path.exists() or template_path.exists():
            return

        try:
            content = skill_md_path.read_text(encoding="utf-8")
            frontmatter = {}
            description = ""

            # 解析 YAML frontmatter
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    for line in parts[1].split("\n"):
                        if ":" in line:
                            key, value = line.split(":", 1)
                            frontmatter[key.strip()] = value.strip()
                    # 从 body 提取第一段作为描述
                    body = parts[2].strip()
                    first_para = body.split("\n\n")[0].strip()
                    # 去除 markdown 标题前缀
                    description = re.sub(r"^#+\s*", "", first_para)

            name = frontmatter.get("name") or frontmatter.get("title") or skill_dir.name
            if not description:
                description = frontmatter.get("description", "")

            keywords = self._extract_keywords(name, description)

            template = {
                "displayName": name,
                "description": description,
                "category": "Community",
                "tags": ["community", "github"],
                "triggerKeywords": keywords,
                "_source": "github",
                "_autoGenerated": True,
            }

            with open(template_path, "w", encoding="utf-8") as f:
                json.dump(template, f, indent=2, ensure_ascii=False)

            logger.info(f"自动生成 template.json: {skill_dir.name} (关键词: {keywords})")

        except Exception as e:
            logger.error(f"自动生成 template.json 失败: {e}")

    @staticmethod
    def _extract_keywords(name: str, description: str) -> list:
        """从名称和描述中提取触发关键词"""
        keywords = set()

        # 从名称提取（按连字符、空格、下划线分词）
        name_words = re.split(r"[-_\s]+", name.lower())
        for word in name_words:
            word = word.strip()
            if word and len(word) > 1:
                keywords.add(word)

        # 技能完整名称
        keywords.add(name.lower().replace("_", "-"))

        # 从描述中提取有意义的词（取前几个关键词）
        if description:
            desc_words = re.split(r"[-_\s,.;:]+", description.lower())
            stop_words = {
                "a", "an", "the", "is", "are", "was", "were", "be", "been",
                "and", "or", "but", "in", "on", "at", "to", "for", "of",
                "with", "by", "from", "this", "that", "it", "as", "do",
                "的", "了", "和", "是", "在", "不", "也", "有", "就",
                "人", "都", "一", "个", "上", "我", "他", "她", "你",
            }
            for word in desc_words[:15]:
                word = word.strip()
                if word and len(word) > 2 and word not in stop_words:
                    keywords.add(word)

        return list(keywords)[:10]

    # ── 搜索社区技能 ──────────────────────────────────────────

    async def search_skills(self, query: str, limit: int = 5) -> list:
        """搜索社区技能（GitHub skills.sh 生态）"""
        results = []
        query_lower = query.lower()
        query_keywords = re.split(r'[-_\s]+', query_lower)

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            headers = {"Accept": "application/vnd.github.v3+json"}

            # 策略1: 搜索 vercel-labs/skills 仓库的 skills/ 目录
            try:
                url = "https://api.github.com/repos/vercel-labs/skills/contents/skills?ref=main"
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    for item in resp.json():
                        if item["type"] == "dir":
                            name = item["name"]
                            name_words = re.split(r'[-_]+', name.lower())
                            if any(kw in name.lower() for kw in query_keywords) or \
                               any(kw in ' '.join(name_words) for kw in query_keywords):
                                results.append({
                                    "name": name,
                                    "description": "skills.sh 社区技能",
                                    "github_ref": f"vercel-labs/skills/skills/{name}",
                                    "github_url": f"https://github.com/vercel-labs/skills/tree/main/skills/{name}",
                                    "source": "skills.sh"
                                })
            except Exception as e:
                logger.warning(f"搜索 vercel-labs/skills 失败: {e}")

            # 策略2: GitHub 代码搜索 SKILL.md 文件
            if len(results) < limit:
                try:
                    search_url = f"https://api.github.com/search/code?q=filename:SKILL.md+{query}&per_page={limit}"
                    resp = await client.get(search_url, headers=headers)
                    if resp.status_code == 200:
                        for item in resp.json().get("items", []):
                            repo = item["repository"]
                            file_path = item["path"]
                            skill_dir = str(Path(file_path).parent)
                            skill_name = Path(file_path).parent.name
                            if any(r["name"] == skill_name for r in results):
                                continue
                            ref = f"{repo['full_name']}/{skill_dir}" if skill_dir != "." else repo['full_name']
                            results.append({
                                "name": skill_name,
                                "description": repo.get("description", "") or f"GitHub: {repo['full_name']}",
                                "github_ref": ref,
                                "github_url": f"https://github.com/{repo['full_name']}/tree/{repo.get('default_branch', 'main')}/{skill_dir}",
                                "source": "github"
                            })
                except Exception as e:
                    logger.warning(f"GitHub 代码搜索失败: {e}")

            # 策略3: 尝试获取 SKILL.md 的 frontmatter 填充描述（仅策略1的结果）
            for r in results:
                if r["description"] == "skills.sh 社区技能" and r["source"] == "skills.sh":
                    try:
                        md_url = f"https://raw.githubusercontent.com/vercel-labs/skills/main/skills/{r['name']}/SKILL.md"
                        resp = await client.get(md_url)
                        if resp.status_code == 200:
                            content = resp.text
                            if content.startswith("---"):
                                parts = content.split("---", 2)
                                if len(parts) >= 3:
                                    for line in parts[1].split("\n"):
                                        if line.strip().startswith("description:"):
                                            r["description"] = line.split(":", 1)[1].strip().strip('"\'')
                                            break
                    except Exception:
                        pass

        return results[:limit]

    # ── 卸载 ─────────────────────────────────────────────────


    async def install_local_skill(self, local_path: str) -> Dict:
        """Install skill from local directory or zip package."""
        try:
            source = Path(local_path).expanduser().resolve()
            if not source.exists():
                return {"success": False, "error": f"Path not found: {local_path}"}

            tmp_dir: Optional[Path] = None
            source_root = source
            if source.is_file():
                if source.suffix.lower() != ".zip":
                    return {"success": False, "error": "Only .zip file is supported for local file install"}
                tmp_dir = Path(tempfile.mkdtemp(prefix="skill_local_install_"))
                with zipfile.ZipFile(source, "r") as zf:
                    zf.extractall(tmp_dir)
                source_root = tmp_dir

            try:
                skill_root = self._find_skill_root(source_root)
                if not skill_root:
                    return {"success": False, "error": "SKILL.md not found in local package"}

                skill_name = self._normalize_skill_name(skill_root.name)
                target_dir = self.skills_dir / skill_name
                if target_dir.exists():
                    shutil.rmtree(target_dir)
                shutil.copytree(skill_root, target_dir)

                self._manifest[skill_name] = {
                    "source": "local",
                    "source_path": str(source),
                    "installed_at": datetime.now().isoformat(),
                }
                self._save_manifest()
                return {"success": True, "skill_name": skill_name}
            finally:
                if tmp_dir:
                    shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception as e:
            logger.error(f"Install local skill failed: {e}", exc_info=True)
            return {"success": False, "error": f"Install local skill failed: {str(e)}"}

    async def create_skill_scaffold(
        self,
        name: str,
        display_name: str,
        description: str = "",
        category: str = "general",
        trigger_keywords: Optional[list] = None,
        tags: Optional[list] = None,
    ) -> Dict:
        """Create a minimal runnable skill scaffold in skills directory."""
        skill_name = self._normalize_skill_name(name)
        skill_dir = self.skills_dir / skill_name
        if skill_dir.exists():
            return {"success": False, "error": f"Skill already exists: {skill_name}"}

        trigger_keywords = trigger_keywords or []
        tags = tags or []
        try:
            (skill_dir / "scripts").mkdir(parents=True, exist_ok=True)
            skill_md = f"""---
name: {skill_name}
display_name: {display_name}
description: {description or "Custom skill"}
category: {category}
trigger_keywords: {json.dumps(trigger_keywords, ensure_ascii=False)}
tags: {json.dumps(tags, ensure_ascii=False)}
---

# {display_name}

??????? Skill ??????? `scripts/main.py` ????????
"""
            template_json = {
                "name": skill_name,
                "display_name": display_name,
                "description": description or "Custom skill",
                "category": category,
                "trigger_keywords": trigger_keywords,
                "tags": tags,
            }
            script_main = """#!/usr/bin/env python3
import json
import sys

if __name__ == "__main__":
    args = sys.argv[1:]
    print(json.dumps({"ok": True, "args": args}, ensure_ascii=False))
"""
            (skill_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")
            (skill_dir / "template.json").write_text(
                json.dumps(template_json, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            (skill_dir / "scripts" / "main.py").write_text(script_main, encoding="utf-8")

            self._manifest[skill_name] = {
                "source": "created",
                "installed_at": datetime.now().isoformat(),
            }
            self._save_manifest()
            return {"success": True, "skill_name": skill_name}
        except Exception as e:
            logger.error(f"Create skill scaffold failed: {e}", exc_info=True)
            return {"success": False, "error": f"Create skill scaffold failed: {str(e)}"}

    async def uninstall_skill(self, skill_name: str) -> Dict:
        """卸载用户安装的技能"""
        if skill_name not in self._manifest:
            return {
                "success": False,
                "error": f"技能 '{skill_name}' 不在安装记录中（仅可卸载用户安装的技能）",
            }

        skill_dir = self.skills_dir / skill_name
        try:
            if skill_dir.exists():
                shutil.rmtree(skill_dir)
                logger.info(f"已删除技能目录: {skill_dir}")

            del self._manifest[skill_name]
            self._save_manifest()

            return {"success": True, "skill_name": skill_name}
        except Exception as e:
            logger.error(f"卸载技能失败: {e}", exc_info=True)
            return {"success": False, "error": f"卸载失败: {str(e)}"}
