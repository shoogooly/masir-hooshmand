import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdvisorAssignment, SiteSetting, User


ACCESS_AREAS = {
    "advisors": "مشاوران تحت نظر",
    "students": "پرونده دانش‌آموزان",
    "plans": "برنامه‌های هفتگی",
    "chats": "مشاهده گفت‌وگوها",
    "messages": "ارسال پیام",
    "advisor_reviews": "بررسی عملکرد و مدارک مشاور",
}
ACCESS_LEVELS = {"none": 0, "view": 1, "edit": 2}
DEFAULT_ACCESS = {
    "expert": {
        "advisors": "view", "students": "view", "plans": "view",
        "chats": "view", "messages": "edit", "advisor_reviews": "edit",
    },
    "secretary": {
        "advisors": "view", "students": "view", "plans": "view",
        "chats": "none", "messages": "edit", "advisor_reviews": "none",
    },
}


def _read_json(db: Session, key: str, fallback):
    row = db.get(SiteSetting, key)
    if not row:
        return fallback
    try:
        return json.loads(row.value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _write_json(db: Session, key: str, value, actor_id: str):
    row = db.get(SiteSetting, key)
    encoded = json.dumps(value, ensure_ascii=False)
    if row:
        row.value = encoded
        row.version += 1
        row.updated_by = actor_id
    else:
        db.add(SiteSetting(key=key, value=encoded, updated_by=actor_id))


def access_matrix(db: Session):
    saved = _read_json(db, "staff_access_matrix", {})
    return {
        role: {area: saved.get(role, {}).get(area, level) for area, level in defaults.items()}
        for role, defaults in DEFAULT_ACCESS.items()
    }


def save_access_matrix(db: Session, matrix: dict, actor_id: str):
    clean = {}
    for role in DEFAULT_ACCESS:
        clean[role] = {}
        for area in ACCESS_AREAS:
            value = matrix.get(role, {}).get(area, DEFAULT_ACCESS[role][area])
            if value not in ACCESS_LEVELS:
                raise HTTPException(422, "سطح دسترسی معتبر نیست")
            clean[role][area] = value
    _write_json(db, "staff_access_matrix", clean, actor_id)
    return clean


def access_level(db: Session, user: User, area: str):
    if user.role in {"super_admin", "operations_admin"}:
        return "edit"
    role = "expert" if user.role in {"expert", "upper_secondary_manager", "lower_secondary_manager"} else user.role
    return access_matrix(db).get(role, {}).get(area, "none")


def require_access(db: Session, user: User, area: str, edit: bool = False):
    required = 2 if edit else 1
    if ACCESS_LEVELS.get(access_level(db, user, area), 0) < required:
        raise HTTPException(403, "برای این بخش دسترسی کافی ندارید")


def expert_advisor_ids(db: Session, expert_id: str):
    return set(_read_json(db, f"expert_advisors:{expert_id}", []))


def save_expert_advisors(db: Session, expert_id: str, advisor_ids: list[str], actor_id: str):
    unique = list(dict.fromkeys(advisor_ids))
    valid = set(db.scalars(select(User.id).where(User.role == "advisor", User.id.in_(unique))).all()) if unique else set()
    if len(valid) != len(unique):
        raise HTTPException(422, "یک یا چند مشاور معتبر نیستند")
    _write_json(db, f"expert_advisors:{expert_id}", unique, actor_id)
    return unique


def advisor_for_student(db: Session, student_id: str):
    assignment = db.scalar(select(AdvisorAssignment).where(
        AdvisorAssignment.student_id == student_id,
        AdvisorAssignment.active.is_(True),
    ))
    return assignment.advisor_id if assignment else None


def expert_can_view_advisor(db: Session, user: User, advisor_id: str):
    return user.role != "expert" or advisor_id in expert_advisor_ids(db, user.id)


def expert_can_view_student(db: Session, user: User, student_id: str):
    if user.role != "expert":
        return True
    advisor_id = advisor_for_student(db, student_id)
    return bool(advisor_id and advisor_id in expert_advisor_ids(db, user.id))
