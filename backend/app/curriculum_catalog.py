from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import AcademicCalendar, AcademicCalendarNode, User


DEFAULT_SOURCE = Path(__file__).resolve().parent / "data" / "darschin-curriculum-10-12.json"
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


def load_source(path: Path = DEFAULT_SOURCE) -> list[dict]:
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


def build_catalog(path: Path = DEFAULT_SOURCE) -> dict[tuple[str, str], list[NodeSpec]]:
    data = load_source(path)
    catalog = {target: build_nodes(data, *target) for target in TARGETS}
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
    return catalog


def summarize(catalog: dict[tuple[str, str], list[NodeSpec]]) -> list[dict]:
    return [{
        "grade": grade,
        "major": major,
        "subjects": sum(node.depth == 1 for node in nodes),
        "chapters": sum(node.depth == 2 for node in nodes),
        "topics": sum(node.depth == 3 for node in nodes),
        "total_nodes": len(nodes),
    } for (grade, major), nodes in catalog.items()]


def _sync_calendar(
    db: Session, admin: User, grade: str, major: str, nodes: list[NodeSpec],
) -> tuple[str, str]:
    title = CALENDAR_TITLE.format(grade=grade, major=major)
    calendar = db.scalar(select(AcademicCalendar).where(
        AcademicCalendar.grade == grade,
        AcademicCalendar.major == major,
        AcademicCalendar.title == title,
    ))
    created = calendar is None
    changed = created
    if created:
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
        for field, value in (
            ("designer_id", admin.id),
            ("designer_name", admin.full_name),
            ("designer_role", admin.role),
        ):
            if getattr(calendar, field) != value:
                setattr(calendar, field, value)
                changed = True

    existing = {node.id: node for node in calendar.nodes}
    desired_ids = {node.id for node in nodes}
    for spec in nodes:
        node = existing.get(spec.id)
        if node is None:
            node = AcademicCalendarNode(id=spec.id, calendar_id=calendar.id)
            db.add(node)
            changed = True
        values = {
            "parent_id": spec.parent_id,
            "subject": spec.subject,
            "title": spec.title,
            "depth": spec.depth,
            "sort_order": spec.sort_order,
            "month": None,
            "day": None,
        }
        for field, value in values.items():
            if getattr(node, field, None) != value:
                setattr(node, field, value)
                changed = True
    for stale_id, stale_node in existing.items():
        if stale_id not in desired_ids:
            db.delete(stale_node)
            changed = True
    for item in list(calendar.items):
        db.delete(item)
        changed = True
    if changed and not created:
        calendar.version += 1
    return calendar.id, "created" if created else "updated" if changed else "unchanged"


def ensure_curriculum_catalog(
    db: Session, admin: User, path: Path = DEFAULT_SOURCE,
) -> list[dict]:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(73110420261111)"))
    catalog = build_catalog(path)
    changes = []
    for (grade, major), nodes in catalog.items():
        calendar_id, action = _sync_calendar(db, admin, grade, major, nodes)
        changes.append({
            "grade": grade,
            "major": major,
            "calendar_id": calendar_id,
            "action": action,
        })
    db.commit()
    return changes
