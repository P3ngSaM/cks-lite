import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List


class DemoOfficeAssistant:
    """Demo skill tools used by Workbench recording scenarios."""

    _DOC_EXTS = {".txt", ".md", ".csv", ".json", ".log", ".py", ".ts", ".tsx", ".js"}

    @staticmethod
    def _ensure_output_dir(path: str | None) -> Path:
        base = Path(path) if path else Path.cwd() / "demo_outputs"
        base.mkdir(parents=True, exist_ok=True)
        return base

    @staticmethod
    def _now_str() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def prepare_ppt_and_email(params: Dict) -> Dict:
        topic = (params.get("topic") or "AI Workbench Demo").strip()
        audience = (params.get("audience") or "management team").strip()
        recipient = (params.get("recipient") or "team@example.com").strip()
        output_dir = DemoOfficeAssistant._ensure_output_dir(params.get("output_dir"))

        safe_name = "".join(ch for ch in topic if ch.isalnum() or ch in ("-", "_", " ")).strip().replace(" ", "_")
        safe_name = safe_name or "demo_topic"

        ppt_file = output_dir / f"{safe_name}_ppt_outline.md"
        email_file = output_dir / f"{safe_name}_email_draft.md"

        slides = [
            "Cover: Project background and objective",
            "Problem statement and user pain points",
            "Solution architecture and skill workflow",
            "Core demo flow (search -> organize -> summarize -> deliver)",
            "Memory and personalized assistant behavior",
            "Goal management and boss dashboard linkage",
            "Risks, fallback plans, and security controls",
            "Roadmap and next 30-day execution plan",
        ]

        ppt_content = [
            f"# PPT Outline - {topic}",
            f"- Generated at: {DemoOfficeAssistant._now_str()}",
            f"- Audience: {audience}",
            "",
            "## Slide Plan",
        ] + [f"{idx}. {item}" for idx, item in enumerate(slides, 1)]

        email_content = [
            f"# Email Draft - {topic}",
            f"To: {recipient}",
            f"Subject: {topic} - Demo Materials",
            "",
            "Hi team,",
            "",
            f"The PPT outline for '{topic}' is ready. Please review the attached draft and share feedback.",
            "",
            "Best regards,",
            "CKS Workbench Agent",
        ]

        ppt_file.write_text("\n".join(ppt_content), encoding="utf-8")
        email_file.write_text("\n".join(email_content), encoding="utf-8")

        return {
            "success": True,
            "message": "PPT outline and email draft generated.",
            "data": {
                "ppt_outline": str(ppt_file),
                "email_draft": str(email_file),
                "topic": topic,
            },
        }

    @staticmethod
    def organize_files(params: Dict) -> Dict:
        source_dir = Path((params.get("source_dir") or "").strip())
        if not source_dir.exists() or not source_dir.is_dir():
            return {"success": False, "error": f"source_dir not found: {source_dir}"}

        dry_run = bool(params.get("dry_run", True))
        default_report = source_dir / "_organize_report.json"
        report_path = Path(params.get("output_report") or default_report)

        categories = {
            "documents": {".pdf", ".doc", ".docx", ".txt", ".md", ".ppt", ".pptx", ".xls", ".xlsx"},
            "images": {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"},
            "archives": {".zip", ".rar", ".7z", ".tar", ".gz"},
            "code": {".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rs"},
            "media": {".mp4", ".mp3", ".wav", ".mov", ".mkv"},
        }

        actions: List[Dict] = []
        skipped = 0
        for item in source_dir.iterdir():
            if item.is_dir():
                skipped += 1
                continue

            ext = item.suffix.lower()
            category = "others"
            for name, ext_set in categories.items():
                if ext in ext_set:
                    category = name
                    break

            target_dir = source_dir / category
            target_path = target_dir / item.name

            action = {
                "file": str(item),
                "category": category,
                "target": str(target_path),
                "moved": False,
            }

            if not dry_run:
                target_dir.mkdir(parents=True, exist_ok=True)
                if target_path.exists():
                    stem = target_path.stem
                    suffix = target_path.suffix
                    target_path = target_dir / f"{stem}_{int(datetime.now().timestamp())}{suffix}"
                    action["target"] = str(target_path)
                os.replace(item, target_path)
                action["moved"] = True

            actions.append(action)

        report = {
            "generated_at": DemoOfficeAssistant._now_str(),
            "source_dir": str(source_dir),
            "dry_run": dry_run,
            "total_files": len(actions),
            "skipped_dirs": skipped,
            "actions": actions,
        }
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

        return {
            "success": True,
            "message": "File organization plan generated." if dry_run else "Files organized successfully.",
            "data": {
                "report": str(report_path),
                "total_files": len(actions),
                "dry_run": dry_run,
            },
        }

    @staticmethod
    def summarize_folder(params: Dict) -> Dict:
        source_dir = Path((params.get("source_dir") or "").strip())
        if not source_dir.exists() or not source_dir.is_dir():
            return {"success": False, "error": f"source_dir not found: {source_dir}"}

        output_file = Path(params.get("output_file") or (source_dir / "_summary.md"))
        max_chars = int(params.get("max_chars_per_file", 3000))

        summaries = []
        for item in sorted(source_dir.iterdir()):
            if not item.is_file() or item.suffix.lower() not in DemoOfficeAssistant._DOC_EXTS:
                continue
            try:
                content = item.read_text(encoding="utf-8", errors="ignore")[:max_chars].strip()
            except Exception as exc:
                summaries.append(f"## {item.name}\n- Read failed: {exc}\n")
                continue

            if not content:
                summaries.append(f"## {item.name}\n- Empty content\n")
                continue

            line_count = content.count("\n") + 1
            preview = content[:260].replace("\n", " ")
            summaries.append(
                f"## {item.name}\n"
                f"- Characters read: {len(content)}\n"
                f"- Lines: {line_count}\n"
                f"- Preview: {preview}\n"
            )

        if not summaries:
            return {"success": False, "error": "No readable text-like files found in source_dir."}

        doc = [
            f"# Folder Summary\n",
            f"- Generated at: {DemoOfficeAssistant._now_str()}\n",
            f"- Source: {source_dir}\n",
            "\n",
            *summaries,
        ]
        output_file.write_text("\n".join(doc), encoding="utf-8")

        return {
            "success": True,
            "message": "Folder summary generated.",
            "data": {
                "output_file": str(output_file),
                "files_summarized": len(summaries),
            },
        }
