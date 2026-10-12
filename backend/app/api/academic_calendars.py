"""Reusable grade calendars with one selected calendar per student."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import current_user
from app.db.session import get_db
from app.models import (AcademicCalendar, AcademicCalendarItem, AdvisorAssignment,
                        StudentAcademicCalendar, StudentProfile, User)
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
    items: list[CalendarItemInput] = Field(min_length=1, max_length=250)

    @field_validator("title")
    @classmethod
    def title_clean(cls, value):
        return value.strip()


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


def calendar_dict(row, selected=False):
    return {"id": row.id, "grade": row.grade, "major": row.major, "title": row.title,
            "designer_id": row.designer_id, "designer_name": row.designer_name,
            "designer_role": row.designer_role, "designer_role_label": ROLE_LABELS.get(row.designer_role, row.designer_role),
            "source_student_id": row.source_student_id, "version": row.version,
            "selected": selected, "created_at": row.created_at, "updated_at": row.updated_at,
            "items": [{"id": item.id, "month": item.month, "day": item.day,
                       "subject": item.subject, "topics": item.topics, "sort_order": item.sort_order}
                      for item in row.items]}


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
                "calendars": [calendar_dict(current, True)] if current else []}, "meta": {}}
    rows = db.scalars(select(AcademicCalendar).where(AcademicCalendar.grade == profile.grade,
                      AcademicCalendar.major == profile.major)
                      .order_by(AcademicCalendar.created_at.desc())).all()
    return {"success": True, "data": {"student_id": student_id, "grade": profile.grade, "major": profile.major,
            "selected_id": selection.calendar_id if selection else None,
            "calendars": [calendar_dict(row, bool(selection and selection.calendar_id == row.id)) for row in rows]}, "meta": {}}


@router.get("/academic-calendars")
def list_grade_calendars(grade: str, major: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in CREATORS - {"advisor"}:
        raise HTTPException(403, "دسترسی کافی ندارید")
    rows = db.scalars(select(AcademicCalendar).where(AcademicCalendar.grade == grade, AcademicCalendar.major == major)
                      .order_by(AcademicCalendar.created_at.desc())).all()
    return {"success": True, "data": [calendar_dict(row) for row in rows], "meta": {}}


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
    else:
        selection = StudentAcademicCalendar(student_id=student_id, calendar_id=calendar.id, selected_by=user.id)
        db.add(selection)
    audit(db, user.id, "academic_calendar.selected", "user", student_id, after={"calendar_id": calendar.id})
    db.commit()
    return {"success": True, "data": calendar_dict(calendar, True), "meta": {}}


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
    db.delete(calendar)
    audit(db, user.id, "academic_calendar.deleted", "academic_calendar", calendar_id,
          before={"title": calendar.title, "grade": calendar.grade, "major": calendar.major,
                  "student_selections_removed": selected_count})
    db.commit()
    return {"success": True, "data": {"deleted": True, "student_selections_removed": selected_count}, "meta": {}}
