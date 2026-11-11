from __future__ import annotations

import argparse
import json
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal
from app.models import AcademicCalendar, AcademicCalendarNode, User


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = PROJECT_ROOT / "data" / "darschin-curriculum-10-12.json"
CALENDAR_TITLE = "سرفصل‌های کامل {grade} {major} — درس‌چین"
IMPORT_NAMESPACE = uuid.UUID("6c88e3e5-bb89-4b50-81c4-9d8c0aa2ed1c")
TARGETS = (
    ("دهم", "تجربی"),
    ("دهم", "ریاضی"),
    ("یازدهم", "تجربی"),
    ("یازدهم", "ریاضی"),
    ("دوازدهم", "تجربی"),
    ("دوازدهم", "ریاضی"),
)


@dataclass(frozen=True)
class NodeSpec:
    id: str
    parent_id: str | None
    subject: str
    title: str
    depth: int
    sort_order: int


def stable_id(*parts: object) -> str:
    return str(uuid.uuid5(IMPORT_NAMESPACE, "\x1f".join(str(part) for part in parts)))


def load_source(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not data:
        raise ValueError("فایل استخراج‌شده خالی یا نامعتبر است")
    subjects = [str(row.get("subject", "")).strip() for row in data]
    if any(not subject for subject in subjects) or len(subjects) != len(set(subjects)):
        raise ValueError("نام درس خالی یا تکراری در فایل استخراج‌شده وجود دارد")
    return data


def build_nodes(data: list[dict], grade: str, major: str) -> list[NodeSpec]:
    label = f"{grade} / {major}"
    nodes: list[NodeSpec] = []
    sort_order = 0
    for subject_row in data:
        subject = subject_row["subject"].strip()
        curriculum = next(
            (row for row in subject_row.get("curricula", []) if row.get("grade_field", "").strip() == label),
            None,
        )
        if curriculum is None:
            continue
        subject_id = stable_id(grade, major, subject, "subject")
        nodes.append(NodeSpec(subject_id, None, subject, subject, 1, sort_order))
        sort_order += 1
        for chapter_index, chapter in enumerate(curriculum.get("chapters", []), start=1):
            chapter_title = str(chapter.get("title", "")).strip()
            if not chapter_title:
                continue
            chapter_id = stable_id(grade, major, subject, "chapter", chapter_index, chapter_title)
            nodes.append(NodeSpec(chapter_id, subject_id, subject, chapter_title, 2, sort_order))
            sort_order += 1
            for topic_index, topic in enumerate(chapter.get("subchapters", []), start=1):
                topic_title = str(topic).strip()
                if not topic_title:
                    continue
                topic_id = stable_id(
                    grade, major, subject, "chapter", chapter_index, chapter_title,
                    "topic", topic_index, topic_title,
                )
                nodes.append(NodeSpec(topic_id, chapter_id, subject, topic_title, 3, sort_order))
                sort_order += 1
    return nodes


def validate_catalog(catalog: dict[tuple[str, str], list[NodeSpec]]) -> None:
    for target, nodes in catalog.items():
        if not nodes:
            raise ValueError(f"برای {target[0]} {target[1]} هیچ داده‌ای استخراج نشده است")
        ids = {node.id for node in nodes}
        if len(ids) != len(nodes):
            raise ValueError(f"شناسه تکراری در {target[0]} {target[1]} ایجاد شده است")
        seen: set[str] = set()
        for node in nodes:
            if node.parent_id and node.parent_id not in seen:
                raise ValueError(f"والد مبحث «{node.title}» پیش از آن ثبت نشده است")
            seen.add(node.id)


def summarize(catalog: dict[tuple[str, str], list[NodeSpec]]) -> list[dict]:
    result = []
    for (grade, major), nodes in catalog.items():
        result.append({
            "grade": grade,
            "major": major,
            "subjects": sum(node.depth == 1 for node in nodes),
            "chapters": sum(node.depth == 2 for node in nodes),
            "topics": sum(node.depth == 3 for node in nodes),
            "total_nodes": len(nodes),
        })
    return result


def upsert_calendar(db, admin: User, grade: str, major: str, nodes: list[NodeSpec]) -> tuple[str, str]:
    title = CALENDAR_TITLE.format(grade=grade, major=major)
    calendar = db.scalar(select(AcademicCalendar).where(
        AcademicCalendar.grade == grade,
        AcademicCalendar.major == major,
        AcademicCalendar.title == title,
        AcademicCalendar.designer_id == admin.id,
    ))
    action = "updated" if calendar else "created"
    if calendar is None:
        calendar = AcademicCalendar(
            grade=grade,
            major=major,
            title=title,
            designer_id=admin.id,
            designer_name=admin.full_name,
            designer_role=admin.role,
        )
        db.add(calendar)
        db.flush()
    else:
        calendar.designer_name = admin.full_name
        calendar.designer_role = admin.role
        calendar.version += 1

    existing = {node.id: node for node in calendar.nodes}
    desired_ids = {node.id for node in nodes}
    for spec in nodes:
        node = existing.get(spec.id)
        if node is None:
            node = AcademicCalendarNode(id=spec.id, calendar_id=calendar.id)
            db.add(node)
        node.parent_id = spec.parent_id
        node.subject = spec.subject
        node.title = spec.title
        node.depth = spec.depth
        node.sort_order = spec.sort_order
        node.month = None
        node.day = None
    for stale_id, stale_node in existing.items():
        if stale_id not in desired_ids:
            db.delete(stale_node)
    for item in list(calendar.items):
        db.delete(item)
    return calendar.id, action


def main() -> None:
    parser = argparse.ArgumentParser(description="ورود کنترل‌شده سرفصل‌های درس‌چین به تقویم آموزشی مهیاد")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--admin-phone", help="شماره مدیر ثبت‌کننده؛ فقط همراه --apply لازم است")
    parser.add_argument("--apply", action="store_true", help="ثبت تغییرات؛ بدون این گزینه فقط پیش‌نمایش نمایش داده می‌شود")
    args = parser.parse_args()

    data = load_source(args.source.resolve())
    catalog = {target: build_nodes(data, *target) for target in TARGETS}
    validate_catalog(catalog)
    report = {"mode": "apply" if args.apply else "dry-run", "source": str(args.source.resolve()), "calendars": summarize(catalog)}

    if not args.apply:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    if not args.admin_phone:
        parser.error("برای ثبت نهایی، --admin-phone الزامی است")

    with SessionLocal() as db:
        admin = db.scalar(select(User).where(User.phone == args.admin_phone, User.status == "active"))
        if admin is None or admin.role not in {"super_admin", "operations_admin", "upper_secondary_manager"}:
            raise ValueError("مدیر فعال و مجاز برای ثبت تقویم پیدا نشد")
        changes = []
        for (grade, major), nodes in catalog.items():
            calendar_id, action = upsert_calendar(db, admin, grade, major, nodes)
            changes.append({"grade": grade, "major": major, "calendar_id": calendar_id, "action": action})
        db.commit()
        report["changes"] = changes
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
