import json
import re
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.core.security import roles
from app.db.session import get_db
from app.models import Activity, Notification, StudyReport, User, WeeklyPlan
from app.schemas import PlanCreate
from app.services import audit
from app.api.exam_files import assigned_student

router = APIRouter()


class DraftInput(BaseModel):
    student_id: str
    title: str = Field(min_length=1, max_length=160)
    week_label: str = Field(default="پیش‌نویس", max_length=60)
    plan_mode: Literal["timed", "volume"] = "timed"
    draft_state: dict

    @field_validator("draft_state")
    @classmethod
    def bounded_state(cls, value):
        if len(json.dumps(value, ensure_ascii=False)) > 200000:
            raise ValueError("حجم پیش‌نویس بیش از حد مجاز است")
        return value


def editable(db, plan_id, user):
    plan = db.scalar(select(WeeklyPlan).where(WeeklyPlan.id == plan_id).with_for_update())
    if not plan or (user.role == "advisor" and plan.advisor_id != user.id):
        raise HTTPException(404, "برنامه یافت نشد")
    if plan.status != "draft":
        raise HTTPException(409, "برنامه ارسال‌شده قابل بازنویسی نیست")
    if user.role == "advisor" and not assigned_student(db, user.id, plan.student_id):
        raise HTTPException(403, "دانش‌آموز به شما تخصیص ندارد")
    return plan


def store_draft(db, user, payload, plan=None):
    if user.role == "advisor" and not assigned_student(db, user.id, payload.student_id):
        raise HTTPException(403, "دانش‌آموز به شما تخصیص ندارد")
    student = db.get(User, payload.student_id)
    if not student or student.role != "student":
        raise HTTPException(404, "دانش‌آموز یافت نشد")
    if plan and plan.student_id != payload.student_id:
        raise HTTPException(422, "دانش‌آموز پیش‌نویس قابل تغییر نیست")
    if plan is None:
        previous = db.scalar(select(WeeklyPlan).where(WeeklyPlan.student_id == payload.student_id).order_by(WeeklyPlan.version.desc()))
        plan = WeeklyPlan(student_id=payload.student_id, advisor_id=user.id, version=previous.version + 1 if previous else 1)
        db.add(plan)
    plan.title = payload.title
    plan.week_label = payload.week_label
    plan.plan_mode = payload.plan_mode
    plan.draft_state_json = json.dumps(payload.draft_state, ensure_ascii=False)
    # Incomplete draft ranges are only materialized as activities after validation.
    plan.activities.clear()
    db.flush()
    audit(db, user.id, "plan.draft_saved", "weekly_plan", plan.id)
    db.commit()
    return {"success": True, "data": {"id": plan.id, "status": plan.status}, "meta": {}}


@router.post("/plan-drafts")
def create_draft(payload: DraftInput, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    return store_draft(db, user, payload)


@router.put("/plan-drafts/{plan_id}")
def update_draft(plan_id: str, payload: DraftInput, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    return store_draft(db, user, payload, editable(db, plan_id, user))


@router.put("/plans/{plan_id}")
def complete_draft(plan_id: str, payload: PlanCreate, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    plan = editable(db, plan_id, user)
    if plan.student_id != payload.student_id:
        raise HTTPException(422, "دانش‌آموز برنامه قابل تغییر نیست")
    from app.book_service import validate_allocations
    validate_allocations(db, payload.student_id, payload.activities)
    plan.title, plan.week_label = payload.title, payload.week_label
    plan.weekly_mission, plan.plan_mode = payload.weekly_mission, payload.plan_mode
    plan.day_start_time, plan.day_end_time = payload.day_start_time, payload.day_end_time
    plan.schedule_days_json = json.dumps(payload.days, ensure_ascii=False)
    plan.time_slots_json = json.dumps(payload.time_slots, ensure_ascii=False)
    plan.activities.clear()
    for item in payload.activities:
        color = item.get("color", "")
        if not isinstance(color, str) or (color and not re.fullmatch(r"#[0-9a-fA-F]{6}", color)):
            raise HTTPException(422, "رنگ بازه معتبر نیست")
        start, end = item["start_time"], item["end_time"]
        sh, sm = map(int, start.split(":")); eh, em = map(int, end.split(":"))
        plan.activities.append(Activity(day=item["day"], subject=item.get("subject", "عمومی"), title=item.get("title", ""),
            color=color, start_time=start, end_time=end, planned_minutes=eh*60+em-sh*60-sm,
            book_topic_id=item.get("book_topic_id") or "", book_question_count=item.get("book_question_count", 0)))
    # If publication fails, reopening the draft must show the latest validated edits.
    plan.draft_state_json = "{}"
    audit(db, user.id, "plan.draft_completed", "weekly_plan", plan.id)
    db.commit()
    return {"success": True, "data": {"id": plan.id, "status": plan.status}, "meta": {}}


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: str, confirmed: bool = False, user: User = Depends(roles("super_admin")), db: Session = Depends(get_db)):
    if not confirmed:
        raise HTTPException(422, "حذف قطعی برنامه باید تأیید شود")
    plan = db.get(WeeklyPlan, plan_id)
    if not plan:
        raise HTTPException(404, "برنامه یافت نشد")
    audit(db, user.id, "plan.deleted", "weekly_plan", plan.id, before={"title": plan.title, "student_id": plan.student_id, "advisor_id": plan.advisor_id})
    db.execute(delete(StudyReport).where(StudyReport.plan_id == plan.id))
    db.execute(delete(Notification).where(Notification.related_id == plan.id))
    db.delete(plan)
    db.commit()
    return {"success": True, "data": {"deleted": True}, "meta": {}}
