from datetime import timedelta, timezone
import json
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import create_token, current_user, hash_token, new_csrf, new_refresh_token, roles, verify_totp
from app.db.session import get_db
from app.models import Activity, AdvisorAssignment, AuditLog, Exam, ExamAnswer, ExamSession, Insight, Message, Order, Question, RefreshToken, StudentProfile, Subscription, SubscriptionPlan, User, WeeklyPlan, utcnow
from app.schemas import ActivityUpdate, AnswerUpdate, ExamCreate, InsightReview, MessageCreate, OrderCreate, OTPRequest, OTPVerify, PaymentCallback, PlanCreate, ProfileUpdate, QuestionCreate
from app.services import ai_provider, audit, otp_provider, payment_provider


router = APIRouter()


def ok(data=None, meta=None):
    return {"success": True, "data": data, "meta": meta or {}}


def user_dict(user: User):
    return {"id": user.id, "phone": user.phone, "full_name": user.full_name, "role": user.role, "status": user.status}


def activity_dict(item: Activity):
    return {"id": item.id, "day": item.day, "subject": item.subject, "title": item.title,
            "start_time": item.start_time, "end_time": item.end_time, "planned_minutes": item.planned_minutes,
            "actual_minutes": item.actual_minutes, "test_count": item.test_count, "status": item.status, "note": item.note}

DEFAULT_PLAN_DAYS = [{"label": day, "date": ""} for day in ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]]
DEFAULT_TIME_SLOTS = [{"start": start, "end": end} for start, end in [("08:00", "10:00"), ("10:00", "12:00"), ("12:00", "14:00"), ("14:00", "16:00"), ("16:00", "18:00"), ("18:00", "20:00")]]


def plan_dict(plan: WeeklyPlan):
    days = json.loads(plan.schedule_days_json or "[]")
    slots = json.loads(plan.time_slots_json or "[]")
    if not days:
        known = {activity.day for activity in plan.activities}
        days = [item.copy() for item in DEFAULT_PLAN_DAYS]
        days.extend({"label": day, "date": ""} for day in known if day not in {item["label"] for item in days})
    if not slots:
        activity_slots = {(activity.start_time, activity.end_time) for activity in plan.activities}
        slots = [{"start": start, "end": end} for start, end in sorted(activity_slots)] or [item.copy() for item in DEFAULT_TIME_SLOTS]
    return {"id": plan.id, "student_id": plan.student_id, "title": plan.title, "week_label": plan.week_label,
        "version": plan.version, "status": plan.status, "published_at": plan.published_at,
        "day_start_time": plan.day_start_time, "day_end_time": plan.day_end_time,
        "weekly_mission": plan.weekly_mission,
        "days": days, "time_slots": slots, "activities": [activity_dict(activity) for activity in plan.activities]}




def assignment_for(db: Session, advisor_id: str, student_id: str):
    return db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id == advisor_id,
        AdvisorAssignment.student_id == student_id, AdvisorAssignment.active.is_(True)))


def can_communicate(db: Session, sender: User, recipient: User):
    if sender.role == "student" and recipient.role == "advisor":
        return bool(assignment_for(db, recipient.id, sender.id))
    if sender.role == "advisor" and recipient.role == "student":
        return bool(assignment_for(db, sender.id, recipient.id))
    return False


def report_data(db: Session, student_id: str):
    plans = db.scalars(select(WeeklyPlan).where(WeeklyPlan.student_id == student_id).order_by(WeeklyPlan.created_at.desc())).all()
    plan_ids = [p.id for p in plans]
    activities = db.scalars(select(Activity).where(Activity.plan_id.in_(plan_ids)).order_by(Activity.created_at)).all() if plan_ids else []
    sessions = db.scalars(select(ExamSession).where(ExamSession.student_id == student_id, ExamSession.status == "submitted").order_by(ExamSession.submitted_at.desc())).all()
    exam_ids = [s.exam_id for s in sessions]
    exams = {x.id: x for x in db.scalars(select(Exam).where(Exam.id.in_(exam_ids))).all()} if exam_ids else {}
    completed = sum(a.status == "completed" for a in activities)
    by_subject: dict[str, dict] = {}
    for a in activities:
        item = by_subject.setdefault(a.subject, {"subject": a.subject, "planned_minutes": 0, "actual_minutes": 0, "tests": 0, "completed": 0, "total": 0})
        item["planned_minutes"] += a.planned_minutes; item["actual_minutes"] += a.actual_minutes
        item["tests"] += a.test_count; item["completed"] += a.status == "completed"; item["total"] += 1
    insights = db.scalars(select(Insight).where(Insight.student_id == student_id, Insight.status == "approved").order_by(Insight.created_at.desc())).all()
    return {"summary": {"progress": round(completed / len(activities) * 100) if activities else 0,
        "planned_minutes": sum(a.planned_minutes for a in activities), "actual_minutes": sum(a.actual_minutes for a in activities),
        "test_count": sum(a.test_count for a in activities), "completed": completed, "total": len(activities)},
        "subjects": list(by_subject.values()), "activities": [activity_dict(a) for a in activities[-50:]],
        "results": [{"id": s.id, "exam_id": s.exam_id, "title": exams[s.exam_id].title if s.exam_id in exams else "آزمون", "score": s.score,
            "correct": s.correct_count, "wrong": s.wrong_count, "unanswered": s.unanswered_count, "submitted_at": s.submitted_at} for s in sessions],
        "insights": [{"id": i.id, "title": i.title, "recommendation": i.recommendation, "confidence": i.confidence} for i in insights]}


@router.post("/auth/request-otp")
def request_otp(payload: OTPRequest):
    code = otp_provider.send(payload.phone)
    return ok({"sent": True, "expires_in": 120, "dev_code": code if settings.env == "development" else None})


@router.post("/auth/verify-otp")
def verify_otp(payload: OTPVerify, response: Response, db: Session = Depends(get_db)):
    if payload.code != "12345" and settings.env == "development":
        raise HTTPException(400, "کد واردشده صحیح نیست")
    allowed = {"student", "advisor", "content_editor", "reviewer", "exam_designer", "support", "finance", "operations_admin", "super_admin"}
    if payload.role not in allowed:
        raise HTTPException(400, "نقش معتبر نیست")
    user = db.scalar(select(User).where(User.phone == payload.phone))
    if not user:
        user = User(phone=payload.phone, role=payload.role, full_name="کاربر جدید مسیر هوشمند")
        db.add(user)
        db.flush()
        if user.role == "student":
            db.add(StudentProfile(user_id=user.id))
    if user.is_admin_mfa_enabled:
        mfa_valid = payload.mfa_code == "654321" if settings.env == "development" else bool(user.totp_secret and payload.mfa_code and verify_totp(user.totp_secret, payload.mfa_code))
        if not mfa_valid:
            raise HTTPException(401, "کد احراز هویت دومرحله‌ای مدیر معتبر نیست")
    csrf = new_csrf()
    raw_refresh = new_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=hash_token(raw_refresh), expires_at=utcnow() + timedelta(days=settings.refresh_token_days)))
    response.set_cookie("access_token", create_token(user, "access"), httponly=True, samesite="lax", secure=settings.env == "production", max_age=settings.access_token_minutes * 60)
    response.set_cookie("refresh_token", raw_refresh, httponly=True, samesite="lax", secure=settings.env == "production", max_age=settings.refresh_token_days * 86400)
    response.set_cookie("csrf_cookie", csrf, httponly=False, samesite="lax", secure=settings.env == "production", max_age=settings.access_token_minutes * 60)
    audit(db, user.id, "auth.login", "user", user.id)
    db.commit()
    return ok({"user": user_dict(user), "csrf_token": csrf})


@router.post("/auth/refresh")
def refresh_session(response: Response, refresh_token: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(401, "نشست قابل تمدید نیست")
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token), RefreshToken.revoked_at.is_(None)))
    if not token:
        raise HTTPException(401, "نشست قابل تمدید نیست")
    expires_at = token.expires_at if token.expires_at.tzinfo else token.expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= utcnow():
        raise HTTPException(401, "نشست منقضی شده است")
    user = db.get(User, token.user_id)
    token.revoked_at = utcnow()
    raw_refresh = new_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=hash_token(raw_refresh), expires_at=utcnow() + timedelta(days=settings.refresh_token_days)))
    csrf = new_csrf()
    response.set_cookie("access_token", create_token(user, "access"), httponly=True, samesite="lax", secure=settings.env == "production", max_age=settings.access_token_minutes * 60)
    response.set_cookie("refresh_token", raw_refresh, httponly=True, samesite="lax", secure=settings.env == "production", max_age=settings.refresh_token_days * 86400)
    response.set_cookie("csrf_cookie", csrf, httponly=False, samesite="lax", secure=settings.env == "production", max_age=settings.access_token_minutes * 60)
    db.commit()
    return ok({"user": user_dict(user), "csrf_token": csrf})


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return ok(user_dict(user))


@router.post("/auth/logout")
def logout(response: Response, refresh_token: str | None = Cookie(default=None), user: User = Depends(current_user), db: Session = Depends(get_db)):
    response.delete_cookie("access_token")
    response.delete_cookie("csrf_cookie")
    response.delete_cookie("refresh_token")
    if refresh_token:
        token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token), RefreshToken.revoked_at.is_(None)))
        if token:
            token.revoked_at = utcnow()
    audit(db, user.id, "auth.logout", "user", user.id)
    db.commit()
    return ok({"logged_out": True})


@router.get("/students/dashboard")
def student_dashboard(user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    plan = db.scalar(select(WeeklyPlan).where(WeeklyPlan.student_id == user.id).order_by(WeeklyPlan.created_at.desc()))
    activities = db.scalars(select(Activity).where(Activity.plan_id == plan.id).order_by(Activity.created_at) if plan else select(Activity).where(False)).all()
    exams = db.scalars(select(Exam).where(Exam.status == "published").limit(5)).all()
    insights = db.scalars(select(Insight).where(Insight.student_id == user.id).order_by(Insight.created_at.desc())).all()
    completed = sum(1 for item in activities if item.status == "completed")
    progress = round(completed / len(activities) * 100) if activities else 0
    return ok({
        "user": user_dict(user),
        "profile": {"grade": profile.grade, "major": profile.major, "goal": profile.goal} if profile else {},
        "progress": progress,
        "study_minutes": sum(item.actual_minutes for item in activities),
        "activities": [activity_dict(x) for x in activities],
        "exams": [{"id": x.id, "title": x.title, "duration_minutes": x.duration_minutes} for x in exams],
        "insights": [{"id": x.id, "kind": x.kind, "title": x.title, "evidence": x.evidence, "recommendation": x.recommendation, "confidence": x.confidence, "status": x.status} for x in insights if x.status == "approved"],
    })


@router.get("/advisors/dashboard")
def advisor_dashboard(user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    assignments = db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id == user.id, AdvisorAssignment.active.is_(True))).all() if user.role == "advisor" else db.scalars(select(AdvisorAssignment)).all()
    student_ids = [a.student_id for a in assignments]
    students = db.scalars(select(User).where(User.id.in_(student_ids))).all() if student_ids else []
    pending = db.scalar(select(func.count(Insight.id)).where(Insight.student_id.in_(student_ids), Insight.status == "pending_review")) if student_ids else 0
    student_rows = []
    for x in students:
        report = report_data(db, x.id)
        last_activity = report["activities"][-1] if report["activities"] else None
        last_message = db.scalar(select(Message).where(or_(Message.sender_id == x.id, Message.recipient_id == x.id)).order_by(Message.created_at.desc()))
        progress = report["summary"]["progress"]
        student_rows.append(user_dict(x) | {"risk": "بالا" if progress < 50 else "عادی", "progress": progress,
            "last_activity": last_activity["title"] if last_activity else None,
            "last_message": last_message.body if last_message else None, "last_message_at": last_message.created_at if last_message else None})
    return ok({"user": user_dict(user), "students": student_rows, "pending_insights": pending or 0,
        "alerts": sum(x["risk"] == "بالا" for x in student_rows), "weekly_plans": len(student_ids)})


@router.get("/profile")
def get_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id)) if user.role == "student" else None
    return ok(user_dict(user) | ({"grade": profile.grade, "major": profile.major, "school": profile.school, "goal": profile.goal} if profile else {}))


@router.patch("/profile")
def update_profile(payload: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.full_name = payload.full_name
    if user.role == "student":
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
        if not profile:
            profile = StudentProfile(user_id=user.id); db.add(profile)
        for field in ("grade", "major", "school", "goal"):
            value = getattr(payload, field)
            if value is not None: setattr(profile, field, value)
    audit(db, user.id, "profile.updated", "user", user.id); db.commit()
    return ok({"updated": True})


@router.get("/students/advisor")
def my_advisor(user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    assignment = db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.student_id == user.id, AdvisorAssignment.active.is_(True)))
    advisor = db.get(User, assignment.advisor_id) if assignment else None
    return ok(user_dict(advisor) if advisor else None)


@router.get("/students/report")
def my_report(user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    return ok(report_data(db, user.id))


@router.get("/advisors/students/{student_id}/report")
def advisor_student_report(student_id: str, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    if user.role == "advisor" and not assignment_for(db, user.id, student_id):
        raise HTTPException(403, "دانش‌آموز به شما تخصیص داده نشده است")
    student = db.get(User, student_id)
    if not student or student.role != "student": raise HTTPException(404, "دانش‌آموز یافت نشد")
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student_id))
    return ok({"student": user_dict(student), "profile": {"grade": profile.grade, "major": profile.major, "goal": profile.goal} if profile else {}, **report_data(db, student_id)})


@router.get("/advisors/{advisor_id}/students")
def advisor_students(advisor_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "advisor" and user.id != advisor_id:
        raise HTTPException(403, "دسترسی به دانش‌آموزان مشاور دیگر مجاز نیست")
    assignments = db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id == advisor_id, AdvisorAssignment.active.is_(True))).all()
    students = db.scalars(select(User).where(User.id.in_([a.student_id for a in assignments]))).all() if assignments else []
    return ok([user_dict(x) for x in students])


@router.get("/plans")
def list_plans(user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(WeeklyPlan).order_by(WeeklyPlan.created_at.desc())
    if user.role == "student": stmt = stmt.where(WeeklyPlan.student_id == user.id, WeeklyPlan.status == "published")
    elif user.role == "advisor": stmt = stmt.where(WeeklyPlan.advisor_id == user.id)
    plans = db.scalars(stmt).all()
    return ok([plan_dict(plan) for plan in plans])


@router.get("/plans/{plan_id}")
def get_plan(plan_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    plan = db.get(WeeklyPlan, plan_id)
    if not plan: raise HTTPException(404, "برنامه یافت نشد")
    allowed = (user.role == "student" and plan.student_id == user.id and plan.status == "published") or (user.role == "advisor" and plan.advisor_id == user.id) or user.role == "super_admin"
    if not allowed: raise HTTPException(403, "دسترسی به برنامه مجاز نیست")
    return ok(plan_dict(plan))


@router.post("/plans")
def create_plan(payload: PlanCreate, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    if user.role == "advisor" and not db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id == user.id, AdvisorAssignment.student_id == payload.student_id, AdvisorAssignment.active.is_(True))):
        raise HTTPException(403, "دانش‌آموز به شما تخصیص داده نشده است")
    previous = db.scalar(select(WeeklyPlan).where(WeeklyPlan.student_id == payload.student_id).order_by(WeeklyPlan.version.desc()))
    plan = WeeklyPlan(student_id=payload.student_id, advisor_id=user.id, title=payload.title, week_label=payload.week_label,
        schedule_days_json=json.dumps(payload.days, ensure_ascii=False), time_slots_json=json.dumps(payload.time_slots, ensure_ascii=False),
        day_start_time=payload.day_start_time, day_end_time=payload.day_end_time,
        weekly_mission=payload.weekly_mission,
        version=(previous.version + 1 if previous else 1))
    db.add(plan); db.flush()
    for item in payload.activities:
        start, end = item.get("start_time", "08:00"), item.get("end_time", "09:00")
        sh, sm = map(int, start.split(":")); eh, em = map(int, end.split(":"))
        db.add(Activity(plan_id=plan.id, day=item.get("day", "شنبه"), subject=item.get("subject", "عمومی"), title=item.get("title", "فعالیت"),
            start_time=start, end_time=end, planned_minutes=(eh * 60 + em) - (sh * 60 + sm)))
    audit(db, user.id, "plan.created", "weekly_plan", plan.id, after={"version": plan.version})
    db.commit()
    return ok({"id": plan.id, "version": plan.version, "status": plan.status})


@router.post("/plans/{plan_id}/publish")
def publish_plan(plan_id: str, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    plan = db.get(WeeklyPlan, plan_id)
    if not plan or (user.role == "advisor" and plan.advisor_id != user.id): raise HTTPException(404, "برنامه یافت نشد")
    before = plan.status; plan.status = "published"; plan.published_at = utcnow()
    audit(db, user.id, "plan.published", "weekly_plan", plan.id, before={"status": before}, after={"status": plan.status})
    db.commit(); return ok({"id": plan.id, "status": plan.status})


@router.patch("/activities/{activity_id}")
def update_activity(activity_id: str, payload: ActivityUpdate, user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    activity = db.get(Activity, activity_id)
    if not activity: raise HTTPException(404, "فعالیت یافت نشد")
    plan = db.get(WeeklyPlan, activity.plan_id)
    if not plan or plan.student_id != user.id: raise HTTPException(403, "این فعالیت متعلق به شما نیست")
    duplicate = db.scalar(select(Activity).where(Activity.idempotency_key == payload.idempotency_key))
    if duplicate and duplicate.id != activity.id: return ok({"id": duplicate.id, "duplicate": True})
    activity.status, activity.actual_minutes, activity.test_count, activity.note, activity.idempotency_key = payload.status, payload.actual_minutes, payload.test_count, payload.note, payload.idempotency_key
    db.commit(); return ok({"id": activity.id, "status": activity.status, "synced": True})


@router.get("/messages")
def list_messages(counterpart_id: str, before: str | None = None, limit: int = 50, user: User = Depends(current_user), db: Session = Depends(get_db)):
    counterpart = db.get(User, counterpart_id)
    if not counterpart or not can_communicate(db, user, counterpart):
        raise HTTPException(403, "این گفت‌وگو مجاز نیست")
    stmt = select(Message).where(or_(
        (Message.sender_id == user.id) & (Message.recipient_id == counterpart_id),
        (Message.sender_id == counterpart_id) & (Message.recipient_id == user.id)), Message.internal_note.is_(False))
    if before:
        cursor = db.get(Message, before)
        if cursor: stmt = stmt.where(Message.created_at < cursor.created_at)
    items = list(reversed(db.scalars(stmt.order_by(Message.created_at.desc()).limit(min(max(limit, 1), 100))).all()))
    return ok([{"id": x.id, "sender_id": x.sender_id, "recipient_id": x.recipient_id, "body": x.body,
        "created_at": x.created_at, "read_at": x.read_at} for x in items], {"has_more": len(items) == min(max(limit, 1), 100)})


@router.post("/messages")
def send_message(payload: MessageCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    recipient = db.get(User, payload.recipient_id)
    if not recipient or not can_communicate(db, user, recipient):
        raise HTTPException(403, "ارسال پیام به این کاربر مجاز نیست")
    msg = Message(sender_id=user.id, recipient_id=payload.recipient_id, body=payload.body, internal_note=payload.internal_note and user.role == "advisor")
    db.add(msg); db.commit(); return ok({"id": msg.id, "sent": True, "created_at": msg.created_at})


@router.post("/messages/{counterpart_id}/read")
def read_messages(counterpart_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    counterpart = db.get(User, counterpart_id)
    if not counterpart or not can_communicate(db, user, counterpart): raise HTTPException(403, "این گفت‌وگو مجاز نیست")
    items = db.scalars(select(Message).where(Message.sender_id == counterpart_id, Message.recipient_id == user.id, Message.read_at.is_(None))).all()
    now = utcnow()
    for item in items: item.read_at = now
    db.commit(); return ok({"read": len(items)})


@router.get("/questions")
def list_questions(user: User = Depends(roles("content_editor", "reviewer", "exam_designer", "super_admin")), db: Session = Depends(get_db)):
    items = db.scalars(select(Question).order_by(Question.created_at.desc())).all()
    return ok([{"id": x.id, "text": x.text, "subject": x.subject, "topic": x.topic, "difficulty": x.difficulty, "options": json.loads(x.options_json), "status": x.status, "version": x.version} for x in items])


@router.post("/questions")
def create_question(payload: QuestionCreate, user: User = Depends(roles("content_editor", "super_admin")), db: Session = Depends(get_db)):
    if payload.correct_index >= len(payload.options): raise HTTPException(422, "پاسخ صحیح خارج از محدوده گزینه‌هاست")
    q = Question(author_id=user.id, text=payload.text, subject=payload.subject, topic=payload.topic, difficulty=payload.difficulty, options_json=json.dumps(payload.options, ensure_ascii=False), correct_index=payload.correct_index, explanation=payload.explanation)
    db.add(q); audit(db, user.id, "question.created", "question", q.id); db.commit(); return ok({"id": q.id, "status": q.status, "version": q.version})


@router.post("/questions/{question_id}/approve")
def approve_question(question_id: str, user: User = Depends(roles("reviewer", "super_admin")), db: Session = Depends(get_db)):
    q = db.get(Question, question_id)
    if not q: raise HTTPException(404, "سؤال یافت نشد")
    q.status = "approved"; audit(db, user.id, "question.approved", "question", q.id); db.commit(); return ok({"id": q.id, "status": q.status})


@router.get("/exams")
def list_exams(user: User = Depends(current_user), db: Session = Depends(get_db)):
    exams = db.scalars(select(Exam).where(Exam.status == "published").order_by(Exam.created_at.desc())).all()
    if user.role == "student": exams = [x for x in exams if not json.loads(x.audience_json) or user.id in json.loads(x.audience_json)]
    sessions = db.scalars(select(ExamSession).where(ExamSession.student_id == user.id)).all() if user.role == "student" else []
    session_by_exam = {s.exam_id: s for s in sessions}
    return ok([{"id": x.id, "title": x.title, "duration_minutes": x.duration_minutes, "version": x.version,
        "question_count": len(json.loads(x.question_ids_json)), "session": ({"id": session_by_exam[x.id].id,
        "status": session_by_exam[x.id].status, "score": session_by_exam[x.id].score} if x.id in session_by_exam else None)} for x in exams])


@router.post("/exams")
def create_exam(payload: ExamCreate, user: User = Depends(roles("exam_designer", "super_admin")), db: Session = Depends(get_db)):
    questions = db.scalars(select(Question).where(Question.id.in_(payload.question_ids))).all()
    if len(questions) != len(payload.question_ids) or any(q.status != "approved" for q in questions): raise HTTPException(422, "فقط سؤال‌های تاییدشده قابل انتشارند")
    exam = Exam(title=payload.title, duration_minutes=payload.duration_minutes, question_ids_json=json.dumps(payload.question_ids), audience_json=json.dumps(payload.audience))
    db.add(exam); audit(db, user.id, "exam.created", "exam", exam.id); db.commit(); return ok({"id": exam.id, "status": exam.status})


@router.post("/exam-sessions/{exam_id}/start")
def start_exam(exam_id: str, user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    exam = db.get(Exam, exam_id)
    if not exam or exam.status != "published": raise HTTPException(404, "آزمون فعال نیست")
    audience = json.loads(exam.audience_json)
    if audience and user.id not in audience: raise HTTPException(403, "این آزمون برای شما تعریف نشده است")
    session = db.scalar(select(ExamSession).where(ExamSession.exam_id == exam_id, ExamSession.student_id == user.id, ExamSession.status == "active"))
    if not session: db.add(session := ExamSession(exam_id=exam_id, student_id=user.id)); db.commit()
    questions = db.scalars(select(Question).where(Question.id.in_(json.loads(exam.question_ids_json)))).all()
    return ok({"session_id": session.id, "server_time": utcnow(), "duration_minutes": exam.duration_minutes, "questions": [{"id": q.id, "text": q.text, "options": json.loads(q.options_json)} for q in questions]})


@router.put("/exam-sessions/{session_id}/answers")
def save_answer(session_id: str, payload: AnswerUpdate, user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    session = db.get(ExamSession, session_id)
    if not session or session.student_id != user.id or session.status != "active": raise HTTPException(409, "جلسه آزمون قابل ویرایش نیست")
    duplicate = db.scalar(select(ExamAnswer).where(ExamAnswer.idempotency_key == payload.idempotency_key))
    if duplicate: return ok({"answer_id": duplicate.id, "saved": True, "duplicate": True})
    answer = db.scalar(select(ExamAnswer).where(ExamAnswer.session_id == session_id, ExamAnswer.question_id == payload.question_id))
    if answer and payload.client_version <= answer.client_version: return ok({"answer_id": answer.id, "saved": True, "stale": True})
    if not answer:
        answer = ExamAnswer(session_id=session_id, question_id=payload.question_id, selected_index=payload.selected_index, elapsed_seconds=payload.elapsed_seconds, client_version=payload.client_version, idempotency_key=payload.idempotency_key); db.add(answer)
    else:
        answer.selected_index, answer.elapsed_seconds, answer.client_version, answer.idempotency_key = payload.selected_index, payload.elapsed_seconds, payload.client_version, payload.idempotency_key
    db.commit(); return ok({"answer_id": answer.id, "saved": True, "server_time": utcnow()})


@router.post("/exam-sessions/{session_id}/submit")
def submit_exam(session_id: str, user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    session = db.get(ExamSession, session_id)
    if not session or session.student_id != user.id: raise HTTPException(404, "جلسه یافت نشد")
    if session.status == "submitted": return ok({"session_id": session.id, "score": session.score, "duplicate": True})
    exam = db.get(Exam, session.exam_id); question_ids = json.loads(exam.question_ids_json)
    questions = {q.id: q for q in db.scalars(select(Question).where(Question.id.in_(question_ids))).all()}
    answers = {a.question_id: a for a in db.scalars(select(ExamAnswer).where(ExamAnswer.session_id == session.id)).all()}
    correct = sum(1 for qid, ans in answers.items() if ans.selected_index == questions[qid].correct_index)
    wrong = sum(1 for qid, ans in answers.items() if ans.selected_index is not None and ans.selected_index != questions[qid].correct_index)
    session.correct_count, session.wrong_count, session.unanswered_count = correct, wrong, len(question_ids) - correct - wrong
    session.score = round(correct / len(question_ids) * 100, 2) if question_ids else 0; session.status = "submitted"; session.submitted_at = utcnow()
    db.commit(); return ok({"session_id": session.id, "score": session.score, "correct": correct, "wrong": wrong, "unanswered": session.unanswered_count})


@router.get("/results")
def results(user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(ExamSession).where(ExamSession.status == "submitted").order_by(ExamSession.submitted_at.desc())
    if user.role == "student": stmt = stmt.where(ExamSession.student_id == user.id)
    items = db.scalars(stmt.limit(50)).all()
    return ok([{"id": x.id, "exam_id": x.exam_id, "student_id": x.student_id, "score": x.score, "correct": x.correct_count, "wrong": x.wrong_count, "unanswered": x.unanswered_count} for x in items])


@router.get("/insights")
def insights(user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Insight).order_by(Insight.created_at.desc())
    if user.role == "student": stmt = stmt.where(Insight.student_id == user.id, Insight.status == "approved")
    elif user.role == "advisor":
        ids = db.scalars(select(AdvisorAssignment.student_id).where(AdvisorAssignment.advisor_id == user.id)).all(); stmt = stmt.where(Insight.student_id.in_(ids))
    items = db.scalars(stmt).all()
    return ok([{"id": x.id, "student_id": x.student_id, "kind": x.kind, "title": x.title, "evidence": x.evidence, "recommendation": x.recommendation, "confidence": x.confidence, "status": x.status} for x in items])


@router.post("/ai-suggestions/{student_id}")
def create_suggestion(student_id: str, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    plans = db.scalars(select(WeeklyPlan).where(WeeklyPlan.student_id == student_id)).all(); plan_ids = [p.id for p in plans]
    activities = db.scalars(select(Activity).where(Activity.plan_id.in_(plan_ids))).all() if plan_ids else []
    completion = round(sum(a.status == "completed" for a in activities) / len(activities) * 100) if activities else 0
    generated = ai_provider.suggest({"completion": completion})
    insight = Insight(student_id=student_id, kind="ai_plan", title=generated["title"], evidence=generated["evidence"], recommendation=generated["recommendation"], confidence=generated["confidence"])
    db.add(insight); audit(db, user.id, "ai.generated", "insight", insight.id, after={"provider": generated["provider"]}); db.commit(); return ok({"id": insight.id, **generated, "status": insight.status})


@router.patch("/ai-suggestions/{insight_id}")
def review_suggestion(insight_id: str, payload: InsightReview, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    insight = db.get(Insight, insight_id)
    if not insight: raise HTTPException(404, "پیشنهاد یافت نشد")
    insight.status, insight.reviewer_id, insight.review_reason = payload.status, user.id, payload.reason
    if payload.recommendation: insight.recommendation = payload.recommendation
    audit(db, user.id, "ai.reviewed", "insight", insight.id, after={"status": payload.status}, reason=payload.reason); db.commit(); return ok({"id": insight.id, "status": insight.status})


@router.get("/subscriptions/plans")
def subscription_plans(db: Session = Depends(get_db)):
    items = db.scalars(select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True))).all()
    return ok([{"id": x.id, "name": x.name, "period": x.period, "price": x.price, "features": json.loads(x.features_json)} for x in items])


@router.post("/payments/orders")
def create_order(payload: OrderCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    duplicate = db.scalar(select(Order).where(Order.idempotency_key == payload.idempotency_key))
    if duplicate: return ok({"order_id": duplicate.id, "status": duplicate.status, "duplicate": True})
    plan = db.get(SubscriptionPlan, payload.plan_id)
    if not plan or not plan.active: raise HTTPException(404, "پلن فعال نیست")
    order = Order(user_id=user.id, plan_id=plan.id, amount=plan.price, idempotency_key=payload.idempotency_key)
    db.add(order); db.flush(); payment = payment_provider.create(order.id, order.amount); order.provider_reference = payment["signature"]
    audit(db, user.id, "payment.order_created", "order", order.id, after={"amount": order.amount}); db.commit(); return ok({"order_id": order.id, **payment})


@router.post("/payments/callback")
def payment_callback(payload: PaymentCallback, db: Session = Depends(get_db)):
    order = db.get(Order, payload.order_id)
    if not order: raise HTTPException(404, "سفارش یافت نشد")
    existing = db.scalar(select(Subscription).where(Subscription.order_id == order.id))
    if existing: return ok({"order_id": order.id, "subscription_id": existing.id, "duplicate": True})
    if not payment_provider.verify(order.id, payload.success, payload.signature): order.status = "failed"; db.commit(); raise HTTPException(400, "تایید پرداخت ناموفق بود")
    plan = db.get(SubscriptionPlan, order.plan_id); order.status = "paid"
    days = 365 if plan.period == "yearly" else 30
    sub = Subscription(user_id=order.user_id, plan_id=plan.id, order_id=order.id, starts_at=utcnow(), expires_at=utcnow() + timedelta(days=days))
    db.add(sub); audit(db, order.user_id, "payment.verified", "order", order.id, after={"subscription": sub.id}); db.commit(); return ok({"order_id": order.id, "subscription_id": sub.id, "status": "active"})


@router.get("/admin/dashboard")
def admin_dashboard(user: User = Depends(roles("support", "finance", "operations_admin", "super_admin", "content_editor")), db: Session = Depends(get_db)):
    counts = {"users": db.scalar(select(func.count(User.id))), "students": db.scalar(select(func.count(User.id)).where(User.role == "student")), "questions": db.scalar(select(func.count(Question.id))), "exams": db.scalar(select(func.count(Exam.id))), "orders": db.scalar(select(func.count(Order.id))), "audits": db.scalar(select(func.count(AuditLog.id)))}
    return ok({"user": user_dict(user), "counts": counts, "service": {"status": "سالم", "database": "SQLite WAL", "jobs": "فعال"}})


@router.get("/admin/users")
def admin_users(user: User = Depends(roles("support", "operations_admin", "super_admin")), db: Session = Depends(get_db)):
    items = db.scalars(select(User).order_by(User.created_at.desc()).limit(100)).all(); return ok([user_dict(x) for x in items])


@router.get("/admin/audits")
def audit_logs(user: User = Depends(roles("operations_admin", "super_admin")), db: Session = Depends(get_db)):
    items = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100)).all()
    return ok([{"id": x.id, "actor_id": x.actor_id, "action": x.action, "resource_type": x.resource_type, "resource_id": x.resource_id, "reason": x.reason, "created_at": x.created_at} for x in items])
