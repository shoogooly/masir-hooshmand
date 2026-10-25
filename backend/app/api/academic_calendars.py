"""Reusable grade calendars with one selected calendar per student."""
import json
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.security import current_user
from app.book_models import BookTopic
from app.db.session import get_db
from app.models import (AcademicCalendar, AcademicCalendarItem, AcademicCalendarNode, Activity,
                        AdvisorAssignment, StudentAcademicCalendar, StudentProfile, User, WeeklyPlan)
from app.services import audit

router = APIRouter()
CREATORS = {"advisor", "expert", "operations_admin", "super_admin",
            "upper_secondary_manager", "lower_secondary_manager"}
ROLE_LABELS = {"advisor": "مشاور", "expert": "کارشناس", "operations_admin": "مدیر عملیات",
               "super_admin": "مدیر سیستم", "upper_secondary_manager": "مدیر متوسطه دوم",
               "lower_secondary_manager": "مدیر متوسطه اول"}


class CalendarItemInput(BaseModel):
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    subject: str = Field(min_length=1, max_length=120)
    topics: str = Field(min_length=1, max_length=4000)

    @field_validator("subject", "topics")
    @classmethod
    def clean(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("این مقدار نمی‌تواند خالی باشد")
        return value

    @model_validator(mode="after")
    def valid_day(self):
        maximum = 31 if self.month <= 6 else 30
        if self.day > maximum:
            raise ValueError("روز انتخاب‌شده برای این ماه معتبر نیست")
        return self


class CalendarInput(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    grade: str | None = Field(default=None, max_length=40)
    major: str | None = Field(default=None, max_length=40)
    student_id: str | None = Field(default=None, max_length=36)
    items: list[CalendarItemInput] = Field(default_factory=list, max_length=250)
    nodes: list["CalendarNodeInput"] = Field(default_factory=list, max_length=1000)

    @field_validator("title")
    @classmethod
    def title_clean(cls, value):
        return value.strip()

    @model_validator(mode="after")
    def has_content(self):
        if not self.items and not self.nodes:
            raise ValueError("حداقل یک درس یا مبحث به تقویم اضافه کنید")
        ids = set()
        depths = {}
        for node in self.nodes:
            if node.id in ids:
                raise ValueError("شناسه مبحث تکراری است")
            if node.parent_id:
                if node.parent_id not in depths or depths[node.parent_id] >= 5:
                    raise ValueError("زیرمجموعه باید پس از والد و حداکثر تا پنج سطح ثبت شود")
                depths[node.id] = depths[node.parent_id] + 1
            else:
                depths[node.id] = 1
            ids.add(node.id)
        return self


class CalendarNodeInput(BaseModel):
    id: str = Field(min_length=36, max_length=36)
    parent_id: str | None = Field(default=None, max_length=36)
    subject: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=180)
    month: int | None = Field(default=None, ge=1, le=12)
    day: int | None = Field(default=None, ge=1, le=31)

    @model_validator(mode="after")
    def valid_date(self):
        if (self.month is None) != (self.day is None):
            raise ValueError("ماه و روز مهلت باید با هم وارد شوند")
        if self.month and self.day and self.day > (31 if self.month <= 6 else 30):
            raise ValueError("روز انتخاب‌شده برای ماه معتبر نیست")
        return self


class CalendarUpdateInput(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    version: int = Field(ge=1)
    nodes: list[CalendarNodeInput] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def valid_tree(self):
        if not self.title.strip():
            raise ValueError("عنوان تقویم را وارد کنید")
        ids = set()
        depths = {}
        for node in self.nodes:
            if node.id in ids or (node.parent_id and node.parent_id not in depths):
                raise ValueError("ساختار درختی تقویم معتبر نیست")
            depths[node.id] = depths.get(node.parent_id, 0) + 1
            if depths[node.id] > 5:
                raise ValueError("تقویم حداکثر پنج سطح دارد")
            ids.add(node.id)
        return self


class StudentCalendarOverrideInput(BaseModel):
    items: list[CalendarItemInput] = Field(default_factory=list, max_length=250)
    nodes: list[CalendarNodeInput] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def valid_tree(self):
        ids = set()
        depths = {}
        for node in self.nodes:
            if node.id in ids or (node.parent_id and node.parent_id not in depths):
                raise ValueError("ساختار درختی تقویم معتبر نیست")
            depths[node.id] = depths.get(node.parent_id, 0) + 1
            if depths[node.id] > 5:
                raise ValueError("تقویم حداکثر پنج سطح دارد")
            ids.add(node.id)
        if not self.items and not self.nodes:
            raise ValueError("تقویم باید حداقل یک درس داشته باشد")
        return self


def assigned(db, advisor_id, student_id):
    return bool(db.scalar(select(AdvisorAssignment.id).where(
        AdvisorAssignment.advisor_id == advisor_id, AdvisorAssignment.student_id == student_id,
        AdvisorAssignment.active.is_(True), AdvisorAssignment.approval_status == "approved")))


def profile_for(db, student_id):
    student = db.get(User, student_id)
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student_id))
    if not student or student.role != "student" or not profile:
        raise HTTPException(404, "دانش‌آموز یافت نشد")
    return student, profile


def calendar_dict(row, selected=False, selection=None):
    result = {"id": row.id, "grade": row.grade, "major": row.major, "title": row.title,
            "designer_id": row.designer_id, "designer_name": row.designer_name,
            "designer_role": row.designer_role, "designer_role_label": ROLE_LABELS.get(row.designer_role, row.designer_role),
            "source_student_id": row.source_student_id, "version": row.version,
            "selected": selected, "created_at": row.created_at, "updated_at": row.updated_at,
            "nodes": [{"id": node.id, "parent_id": node.parent_id, "subject": node.subject,
                       "title": node.title, "depth": node.depth, "sort_order": node.sort_order,
                       "month": node.month, "day": node.day} for node in row.nodes],
            "items": [{"id": item.id, "month": item.month, "day": item.day,
                       "subject": item.subject, "topics": item.topics, "sort_order": item.sort_order}
                      for item in row.items], "customized": False}
    if selected and selection and selection.override_nodes_json is not None:
        result["original_nodes"] = result["nodes"]
        result["original_items"] = result["items"]
        result["nodes"] = json.loads(selection.override_nodes_json)
        result["items"] = json.loads(selection.override_items_json or "[]")
        result["customized"] = True
    return result


def can_manage_student(db, user, student_id):
    if user.role == "student" and user.id == student_id:
        return "student"
    if user.role == "advisor" and assigned(db, user.id, student_id):
        return "advisor"
    if user.role in {"super_admin", "operations_admin", "expert",
                     "upper_secondary_manager", "lower_secondary_manager"}:
        return "staff"
    raise HTTPException(403, "به تقویم آموزشی این دانش‌آموز دسترسی ندارید")


@router.get("/students/{student_id}/academic-calendar")
def student_calendar(student_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access = can_manage_student(db, user, student_id)
    _, profile = profile_for(db, student_id)
    selection = db.get(StudentAcademicCalendar, student_id)
    if access == "student":
        current = db.get(AcademicCalendar, selection.calendar_id) if selection else None
        return {"success": True, "data": {"student_id": student_id, "grade": profile.grade, "major": profile.major,
                "selected_id": selection.calendar_id if selection else None,
                "calendars": [calendar_dict(current, True, selection)] if current else []}, "meta": {}}
    rows = db.scalars(select(AcademicCalendar).where(AcademicCalendar.grade == profile.grade,
                      AcademicCalendar.major == profile.major)
                      .order_by(AcademicCalendar.created_at.desc())).all()
    return {"success": True, "data": {"student_id": student_id, "grade": profile.grade, "major": profile.major,
            "selected_id": selection.calendar_id if selection else None,
            "calendars": [calendar_dict(row, bool(selection and selection.calendar_id == row.id), selection) for row in rows]}, "meta": {}}


@router.get("/academic-calendars")
def list_grade_calendars(grade: str, major: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in CREATORS - {"advisor"}:
        raise HTTPException(403, "دسترسی کافی ندارید")
    rows = db.scalars(select(AcademicCalendar).where(AcademicCalendar.grade == grade, AcademicCalendar.major == major)
                      .order_by(AcademicCalendar.created_at.desc())).all()
    return {"success": True, "data": [calendar_dict(row) for row in rows], "meta": {}}


@router.get("/academic-calendar/topics-catalog")
def topics_catalog(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in CREATORS - {"advisor"}:
        raise HTTPException(403, "دسترسی کافی ندارید")
    calendars = db.scalars(select(AcademicCalendar).order_by(AcademicCalendar.created_at.desc())).all()
    result = []
    for calendar in calendars:
        paths = {}
        for node in calendar.nodes:
            paths[node.id] = [*paths.get(node.parent_id, []), node.title]
            result.append({"id": node.id, "subject": node.subject, "title": node.title,
                           "path": " ← ".join(paths[node.id]), "grade": calendar.grade,
                           "major": calendar.major, "calendar_title": calendar.title})
    return {"success": True, "data": result, "meta": {}}


@router.post("/academic-calendars")
def create_calendar(payload: CalendarInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in CREATORS:
        raise HTTPException(403, "دسترسی کافی ندارید")
    grade, major = (payload.grade or "").strip(), (payload.major or "").strip()
    source_student_id = None
    if user.role == "advisor":
        if not payload.student_id or not assigned(db, user.id, payload.student_id):
            raise HTTPException(403, "مشاور فقط برای دانش‌آموزان خودش می‌تواند تقویم طراحی کند")
        _, profile = profile_for(db, payload.student_id)
        grade, major, source_student_id = profile.grade, profile.major, payload.student_id
    elif payload.student_id:
        _, profile = profile_for(db, payload.student_id)
        if grade and grade != profile.grade:
            raise HTTPException(422, "پایه تقویم با پایه دانش‌آموز یکسان نیست")
        grade, major, source_student_id = profile.grade, profile.major, payload.student_id
    if not grade or not major:
        raise HTTPException(422, "پایه و رشته تحصیلی را انتخاب کنید")
    row = AcademicCalendar(grade=grade, major=major, title=payload.title, designer_id=user.id,
        designer_name=user.full_name, designer_role=user.role, source_student_id=source_student_id)
    db.add(row); db.flush()
    for index, item in enumerate(payload.items):
        db.add(AcademicCalendarItem(calendar_id=row.id, sort_order=index, **item.model_dump()))
    depths = {}
    for index, item in enumerate(payload.nodes):
        depth = depths.get(item.parent_id, 0) + 1
        depths[item.id] = depth
        db.add(AcademicCalendarNode(calendar_id=row.id, depth=depth, sort_order=index, **item.model_dump()))
    audit(db, user.id, "academic_calendar.created", "academic_calendar", row.id,
          after={"grade": grade, "major": major, "title": row.title, "items": len(payload.items)})
    db.commit(); db.refresh(row)
    return {"success": True, "data": calendar_dict(row), "meta": {}}


@router.put("/students/{student_id}/academic-calendar/{calendar_id}")
def select_calendar(student_id: str, calendar_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "advisor" or not assigned(db, user.id, student_id):
        raise HTTPException(403, "انتخاب تقویم فقط توسط مشاور دانش‌آموز انجام می‌شود")
    _, profile = profile_for(db, student_id)
    calendar = db.get(AcademicCalendar, calendar_id)
    if not calendar or calendar.grade != profile.grade or calendar.major != profile.major:
        raise HTTPException(422, "این تقویم برای پایه و رشته دانش‌آموز قابل انتخاب نیست")
    selection = db.get(StudentAcademicCalendar, student_id)
    if selection:
        selection.calendar_id, selection.selected_by = calendar.id, user.id
        selection.override_nodes_json = None
        selection.override_items_json = None
    else:
        selection = StudentAcademicCalendar(student_id=student_id, calendar_id=calendar.id, selected_by=user.id)
        db.add(selection)
    audit(db, user.id, "academic_calendar.selected", "user", student_id, after={"calendar_id": calendar.id})
    db.commit()
    return {"success": True, "data": calendar_dict(calendar, True), "meta": {}}


@router.put("/students/{student_id}/academic-calendar/customization/current")
def customize_calendar(student_id: str, payload: StudentCalendarOverrideInput,
                       user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "advisor" or not assigned(db, user.id, student_id):
        raise HTTPException(403, "فقط مشاور دانش‌آموز می‌تواند تقویم اختصاصی او را ویرایش کند")
    selection = db.get(StudentAcademicCalendar, student_id)
    if not selection:
        raise HTTPException(422, "ابتدا یک تقویم آموزشی برای دانش‌آموز انتخاب کنید")
    calendar = db.get(AcademicCalendar, selection.calendar_id)
    if not calendar:
        raise HTTPException(404, "تقویم اصلی یافت نشد")
    original_ids = {node.id for node in calendar.nodes}
    for node in payload.nodes:
        if node.id in original_ids and next(original for original in calendar.nodes if original.id == node.id).subject != node.subject:
            raise HTTPException(422, "درس مبحث اصلی را تغییر ندهید؛ برای درس جدید یک شاخه بسازید")
    depths = {}
    nodes = []
    for index, node in enumerate(payload.nodes):
        depth = depths.get(node.parent_id, 0) + 1
        depths[node.id] = depth
        nodes.append(node.model_dump() | {"depth": depth, "sort_order": index})
    selection.override_nodes_json = json.dumps(nodes, ensure_ascii=False)
    selection.override_items_json = json.dumps([item.model_dump() for item in payload.items], ensure_ascii=False)
    selection.selected_by = user.id
    audit(db, user.id, "academic_calendar.customized", "user", student_id,
          after={"calendar_id": calendar.id, "nodes": len(nodes), "items": len(payload.items)})
    db.commit()
    return {"success": True, "data": calendar_dict(calendar, True, selection), "meta": {}}


@router.delete("/students/{student_id}/academic-calendar/customization/current")
def restore_calendar(student_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "advisor" or not assigned(db, user.id, student_id):
        raise HTTPException(403, "فقط مشاور دانش‌آموز می‌تواند تقویم اصلی او را بازگرداند")
    selection = db.get(StudentAcademicCalendar, student_id)
    if not selection:
        raise HTTPException(404, "تقویم انتخاب‌شده یافت نشد")
    selection.override_nodes_json = None
    selection.override_items_json = None
    audit(db, user.id, "academic_calendar.restored", "user", student_id,
          after={"calendar_id": selection.calendar_id})
    db.commit()
    return {"success": True, "data": calendar_dict(db.get(AcademicCalendar, selection.calendar_id), True), "meta": {}}


@router.put("/academic-calendars/{calendar_id}")
def update_calendar(calendar_id: str, payload: CalendarUpdateInput,
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in {"super_admin", "operations_admin", "upper_secondary_manager", "lower_secondary_manager"}:
        raise HTTPException(403, "ویرایش تقویم آموزشی فقط توسط مدیر انجام می‌شود")
    calendar = db.get(AcademicCalendar, calendar_id)
    if not calendar:
        raise HTTPException(404, "تقویم آموزشی یافت نشد")
    if calendar.version != payload.version:
        raise HTTPException(409, "تقویم توسط شخص دیگری تغییر کرده است؛ صفحه را تازه‌سازی کنید")
    current = {node.id: node for node in calendar.nodes}
    incoming = {node.id for node in payload.nodes}
    for node in payload.nodes:
        if node.id not in current and db.get(AcademicCalendarNode, node.id):
            raise HTTPException(422, "شناسه مبحث در تقویم دیگری استفاده شده است")
    removed = set(current) - incoming
    if removed:
        db.execute(update(BookTopic).where(BookTopic.calendar_topic_id.in_(removed))
                   .values(calendar_topic_id=""))
        db.execute(delete(AcademicCalendarNode).where(AcademicCalendarNode.id.in_(removed)))
    depths = {}
    for index, item in enumerate(payload.nodes):
        depth = depths.get(item.parent_id, 0) + 1
        depths[item.id] = depth
        if item.id in current:
            node = current[item.id]
            for key, value in item.model_dump().items():
                setattr(node, key, value)
            node.depth, node.sort_order = depth, index
        else:
            db.add(AcademicCalendarNode(calendar_id=calendar_id, depth=depth,
                                        sort_order=index, **item.model_dump()))
    db.execute(delete(AcademicCalendarItem).where(AcademicCalendarItem.calendar_id == calendar_id))
    old_title = calendar.title
    calendar.title = payload.title.strip()
    calendar.version += 1
    audit(db, user.id, "academic_calendar.updated", "academic_calendar", calendar_id,
          before={"title": old_title, "version": payload.version},
          after={"title": calendar.title, "version": calendar.version,
                 "nodes": len(payload.nodes), "removed_nodes": len(removed)})
    db.commit()
    db.expire(calendar, ["nodes", "items"])
    return {"success": True, "data": calendar_dict(calendar), "meta": {}}


@router.delete("/academic-calendars/{calendar_id}")
def delete_calendar(calendar_id: str, confirmed: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in {"super_admin", "operations_admin", "upper_secondary_manager", "lower_secondary_manager"}:
        raise HTTPException(403, "حذف تقویم آموزشی فقط توسط مدیر انجام می‌شود")
    if not confirmed:
        raise HTTPException(422, "تأیید قطعی حذف تقویم لازم است")
    calendar = db.get(AcademicCalendar, calendar_id)
    if not calendar:
        raise HTTPException(404, "تقویم آموزشی یافت نشد")
    selected_count = len(db.scalars(select(StudentAcademicCalendar).where(
        StudentAcademicCalendar.calendar_id == calendar_id)).all())
    db.execute(delete(StudentAcademicCalendar).where(StudentAcademicCalendar.calendar_id == calendar_id))
    db.execute(delete(AcademicCalendarItem).where(AcademicCalendarItem.calendar_id == calendar_id))
    db.execute(delete(AcademicCalendarNode).where(AcademicCalendarNode.calendar_id == calendar_id))
    db.delete(calendar)
    audit(db, user.id, "academic_calendar.deleted", "academic_calendar", calendar_id,
          before={"title": calendar.title, "grade": calendar.grade, "major": calendar.major,
                  "student_selections_removed": selected_count})
    db.commit()
    return {"success": True, "data": {"deleted": True, "student_selections_removed": selected_count}, "meta": {}}


@router.get("/students/{student_id}/planner-topics")
def planner_topics(student_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access = can_manage_student(db, user, student_id)
    if access == "student":
        raise HTTPException(403, "فهرست طراحی برنامه فقط برای مشاور در دسترس است")
    _, profile = profile_for(db, student_id)
    lower = ["هفتم", "هشتم", "نهم"]
    upper = ["دهم", "یازدهم", "دوازدهم"]
    if profile.grade in lower:
        grades = [profile.grade] + [grade for grade in lower if grade != profile.grade]
    else:
        grades = (["دوازدهم", "یازدهم", "دهم"] if profile.grade == "پشت کنکوری"
                  else [profile.grade] + [grade for grade in upper if grade != profile.grade])
    major = profile.major
    calendar_filter = (AcademicCalendar.major == major if profile.grade not in lower
                       else AcademicCalendar.grade.in_(lower))
    calendars = db.scalars(select(AcademicCalendar).where(
        AcademicCalendar.grade.in_(grades), calendar_filter)
        .order_by(AcademicCalendar.created_at.desc())).all()
    selected = db.get(StudentAcademicCalendar, student_id)
    plans = db.scalars(select(WeeklyPlan).where(WeeklyPlan.student_id == student_id,
                                                   WeeklyPlan.status == "published")).all()
    counts = Counter()
    for plan in plans:
        for activity in plan.activities:
            for topic_id in json.loads(activity.calendar_topic_ids_json or "[]"):
                counts[topic_id] += 1
    result = []
    for calendar in calendars:
        if calendar.grade == profile.grade and selected and calendar.id != selected.calendar_id:
            continue
        paths = {}
        effective = calendar_dict(calendar, bool(selected and selected.calendar_id == calendar.id), selected)
        parent_ids = {node["parent_id"] for node in effective["nodes"] if node["parent_id"]}
        for node in effective["nodes"]:
            parent_id, node_id = node.get("parent_id"), node["id"]
            paths[node_id] = [*paths.get(parent_id, []), node["title"]]
            result.append({"id": node_id, "subject": node["subject"], "title": node["title"],
                           "path": " ← ".join(paths[node_id]), "grade": calendar.grade,
                           "major": calendar.major, "calendar_title": calendar.title,
                           "depth": node["depth"], "month": node["month"], "day": node["day"],
                           "is_leaf": node_id not in parent_ids,
                           "used_count": counts[node_id]})
    result.sort(key=lambda node: (grades.index(node["grade"]), node["subject"], node["calendar_title"], node["path"]))
    return {"success": True, "data": result, "meta": {}}


def selected_topic_ids(db: Session, student_id: str, activities: list[dict]) -> list[list[str]]:
    """Reject foreign topic IDs and keep the structured selection independent of edited text."""
    requested = []
    for item in activities:
        ids = item.get("calendar_topic_ids", [])
        if not isinstance(ids, list) or len(ids) > 20 or any(not isinstance(value, str) or len(value) != 36 for value in ids):
            raise HTTPException(422, "فهرست مباحث بازه معتبر نیست")
        ids = list(dict.fromkeys(ids))
        if item.get("book_topic_id"):
            book_topic = db.get(BookTopic, item["book_topic_id"])
            if book_topic and book_topic.calendar_topic_id and book_topic.calendar_topic_id not in ids:
                ids.append(book_topic.calendar_topic_id)
        if len(ids) > 20:
            raise HTTPException(422, "برای هر بازه حداکثر ۲۰ مبحث انتخاب کنید")
        requested.append(ids)
    unique_ids = {value for ids in requested for value in ids}
    if unique_ids:
        _, profile = profile_for(db, student_id)
        grades = (["هفتم", "هشتم", "نهم"] if profile.grade in {"هفتم", "هشتم", "نهم"}
                  else ["دهم", "یازدهم", "دوازدهم"])
        rows = db.execute(select(AcademicCalendarNode.id, AcademicCalendar.grade,
                                 AcademicCalendar.major, AcademicCalendar.id)
                          .join(AcademicCalendar, AcademicCalendarNode.calendar_id == AcademicCalendar.id)
                          .where(AcademicCalendarNode.id.in_(unique_ids), AcademicCalendar.grade.in_(grades))).all()
        selected = db.get(StudentAcademicCalendar, student_id)
        allowed = {node_id for node_id, grade, major, calendar_id in rows
                   if (grade in {"هفتم", "هشتم", "نهم"} or major == profile.major)
                   and (grade != profile.grade or selected is None or selected.calendar_id == calendar_id)}
        if selected and selected.override_nodes_json is not None:
            original_selected = {node.id for node in db.get(AcademicCalendar, selected.calendar_id).nodes}
            allowed -= original_selected
            allowed.update(node["id"] for node in json.loads(selected.override_nodes_json))
        if not unique_ids <= allowed:
            raise HTTPException(422, "یک یا چند مبحث برای پایه و رشته دانش‌آموز قابل انتخاب نیست")
    return requested
