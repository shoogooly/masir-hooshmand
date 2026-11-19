"""Midnight Tehran report delivery, with persisted per-message deduplication."""
import hashlib
import json
import logging
from datetime import timedelta
import jdatetime
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models import AdvisorAssignment, BaleAccountLink, BaleProcessedUpdate, User, WeeklyPlan, utcnow
from app.study_reporting import IRAN
from app.bale_service import value, send, _daily_report_text


def deliver_due(db, now=None):
    now = (now or utcnow()).astimezone(IRAN)
    if value(db, "enabled", "false") != "true" or not value(db, "bot_token"):
        return
    target = now.date() - timedelta(days=1)
    date = jdatetime.date.fromgregorian(date=target).strftime("%Y/%m/%d")
    assignments = db.scalars(select(AdvisorAssignment).where(
        AdvisorAssignment.active.is_(True), AdvisorAssignment.approval_status == "approved")).all()
    for assignment in assignments:
        advisor = db.get(User, assignment.advisor_id)
        student = db.get(User, assignment.student_id)
        link = db.scalar(select(BaleAccountLink).where(BaleAccountLink.user_id == assignment.advisor_id,
            BaleAccountLink.access_role == "advisor", BaleAccountLink.linked_at.is_not(None)))
        if not link or not student or not advisor or advisor.status != "active":
            continue
        plans = db.scalars(select(WeeklyPlan).where(WeeklyPlan.student_id == student.id,
            WeeklyPlan.status == "published").order_by(WeeklyPlan.published_at.desc())).all()
        selected = None
        for plan in plans:
            for day in json.loads(plan.schedule_days_json or "[]"):
                raw = str(day.get("date", "")).translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
                if raw == date:
                    selected = (plan, day)
                    break
            if selected:
                break
        from app.api.study_reports import snapshot
        has_report = False
        if selected:
            plan, day = selected
            data = snapshot(plan, db)
            has_report = bool(data["days"].get(day["label"])) or any(
                a.day == day["label"] and (data["activities"].get(a.id, {}).get("version", 0) > 0 or a.status != "pending" or a.note or a.actual_minutes or a.test_count)
                for a in plan.activities)
        text = f"👤 {student.full_name} · گزارش روز {date}\n"
        text += _daily_report_text(db, *selected) if has_report else "⚠️ گزارش کار امروز این دانش‌آموز خالی است."
        for index, offset in enumerate(range(0, len(text), 3500)):
            key = "nightly:" + hashlib.sha256(f"{date}:{link.chat_id}:{student.id}:{index}".encode()).hexdigest()
            if db.get(BaleProcessedUpdate, key):
                continue
            db.add(BaleProcessedUpdate(update_id=key))
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                continue
            try:
                send(db, link.chat_id, text[offset:offset+3500])
                db.commit()
            except Exception:
                db.rollback()
                logging.getLogger(__name__).exception("Nightly Bale delivery failed; will retry")


def worker(stop):
    from app.core.config import settings
    from app.db.session import SessionLocal
    # Only the deployed server sends scheduled messages to real linked accounts.
    if settings.env != "production":
        return
    while not stop.is_set():
        try:
            with SessionLocal() as db:
                deliver_due(db)
        except Exception:
            logging.getLogger(__name__).exception("Nightly Bale report scheduler failed")
        stop.wait(30)
