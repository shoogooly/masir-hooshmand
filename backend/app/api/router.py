from datetime import datetime, timedelta, timezone
import json
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import create_token, current_account, current_user, hash_password, hash_token, new_csrf, new_refresh_token, roles, verify_password, verify_totp
from app.db.session import get_db
from app.models import Activity, AdvisorAssignment, AdvisorProfile, AuditLog, ChatLock, Exam, ExamAnswer, ExamSession, Insight, Message, Notification, Order, Question, RefreshToken, SiteSetting, StudentProfile, Subscription, SubscriptionPlan, User, WeeklyPlan, utcnow
from app.api.accounts_ext import finalize_student_registration
from app.schemas import AccountRegistration, ActivityUpdate, AdvisorAssign, AdvisorOnboardingProfile, AdvisorReferralCreate, AdvisorRegistration, AdvisorReview, AnswerUpdate, AssignmentDecision, ExamCreate, FreeSubscriptionCreate, InsightReview, MessageCreate, OrderCreate, OTPRequest, OTPVerify, PasswordLogin, PasswordReset, PaymentCallback, PlanCreate, ProfileUpdate, QuestionCreate, SCHOOL_DAYS, StaffCreate, StaffOTPVerify, StudentOnboardingProfile, StudentOnboardingSelection, StudentRegistration, SubscriptionPlanUpdate, TermsAccept, TermsUpdate, UserStatusUpdate
from app.services import ai_provider, audit, otp_provider, payment_provider


router = APIRouter()


def ok(data=None, meta=None):
    return {"success": True, "data": data, "meta": meta or {}}

def issue_session(response: Response, user: User, db: Session):
    csrf = new_csrf()
    raw_refresh = new_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=hash_token(raw_refresh),
        expires_at=utcnow() + timedelta(days=settings.refresh_token_days)))
    response.set_cookie("access_token", create_token(user, "access"), httponly=True, samesite="lax",
        secure=settings.env == "production", max_age=settings.access_token_minutes * 60)
    response.set_cookie("refresh_token", raw_refresh, httponly=True, samesite="lax",
        secure=settings.env == "production", max_age=settings.refresh_token_days * 86400)
    response.set_cookie("csrf_cookie", csrf, httponly=False, samesite="lax",
        secure=settings.env == "production", max_age=settings.access_token_minutes * 60)
    return csrf


def user_dict(user: User):
    return {"id": user.id, "phone": user.phone, "full_name": user.full_name, "role": user.role, "status": user.status, "onboarding_step": user.onboarding_step, "referred_by_advisor_id": user.referred_by_advisor_id}

def active_subscription(db: Session, user_id: str):
    now = utcnow()
    items = db.scalars(select(Subscription).where(Subscription.user_id == user_id).order_by(Subscription.expires_at.desc())).all()
    for item in items:
        expires = item.expires_at if item.expires_at.tzinfo else item.expires_at.replace(tzinfo=timezone.utc)
        if item.status == "active" and expires > now:
            return item
    return None

def add_notification(db: Session, user_id: str, kind: str, title: str, body: str = "", link: str = "", actor_id: str | None = None, related_id: str | None = None):
    item = Notification(user_id=user_id, actor_id=actor_id, kind=kind, title=title, body=body, link=link, related_id=related_id)
    db.add(item)
    return item

def json_value(value: str | None, fallback):
    try:
        return json.loads(value or "")
    except (TypeError, json.JSONDecodeError):
        return fallback


def advisor_capacity(db: Session, advisor_id: str):
    profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == advisor_id))
    assigned = db.scalar(select(func.count(AdvisorAssignment.id)).where(
        AdvisorAssignment.advisor_id == advisor_id, AdvisorAssignment.active.is_(True))) or 0
    capacity = profile.support_capacity if profile else 0
    return profile, assigned, max(capacity - assigned, 0)


def student_profile_dict(profile: StudentProfile | None):
    if not profile:
        return {}
    return {
        "grade": profile.grade, "major": profile.major, "school": profile.school, "goal": profile.goal,
        "education_level": profile.education_level,
        "national_code": profile.national_code, "birth_date": profile.birth_date,
        "parent_name": profile.parent_name, "parent_phone": profile.parent_phone, "address": profile.address,
        "average_grade9": profile.average_grade9, "average_grade10": profile.average_grade10,
        "average_grade7": profile.average_grade7, "average_grade8": profile.average_grade8,
        "average_grade11": profile.average_grade11, "average_grade12": profile.average_grade12,
        "school_schedule": json_value(profile.school_schedule_json, {}),
        "extra_classes": json_value(profile.extra_classes_json, {}),
        "advisor_selection_mode": profile.advisor_selection_mode,
        "preferred_advisor_id": profile.preferred_advisor_id,
        "registration_review_status": profile.registration_review_status,
        "registration_review_note": profile.registration_review_note,
        "registration_reviewed_by": profile.registration_reviewed_by,
        "registration_reviewed_at": profile.registration_reviewed_at,
        "correction_return_step": profile.correction_return_step,
        "advisor_approval_status": profile.advisor_approval_status,
        "admin_approval_status": profile.admin_approval_status,
        "approval_note": profile.approval_note,
    }

def advisor_profile_dict(db: Session, profile: AdvisorProfile | None, include_documents: bool = False):
    if not profile:
        return {}
    _, assigned, remaining = advisor_capacity(db, profile.user_id)
    data = {
        "national_code": profile.national_code, "birth_date": profile.birth_date, "address": profile.address,
        "education_degree": profile.education_degree, "education_field": profile.education_field,
        "experience_years": profile.experience_years, "bio": profile.bio,
        "support_capacity": profile.support_capacity, "academic_year": profile.academic_year,
        "education_level": profile.education_level,
        "lead_approval_status": profile.lead_approval_status,
        "admin_approval_status": profile.admin_approval_status,
        "lead_reviewed_by": profile.lead_reviewed_by,
        "admin_reviewed_by": profile.admin_reviewed_by,
        "approval_status": profile.approval_status, "review_note": profile.review_note,
        "reviewed_by": profile.reviewed_by, "reviewed_at": profile.reviewed_at,
        "assigned_students": assigned, "remaining_capacity": remaining, "is_full": remaining <= 0,
        "documents_count": len(json_value(profile.documents_json, [])),
    }
    if include_documents:
        data["documents"] = json_value(profile.documents_json, [])
    return data

def advisor_student_profile_dict(profile: StudentProfile | None):
    if not profile:
        return {}
    return {
        "grade": profile.grade, "major": profile.major, "school": profile.school, "goal": profile.goal,
        "education_level": profile.education_level,
        "national_code": profile.national_code, "birth_date": profile.birth_date,
        "parent_name": profile.parent_name, "parent_phone": profile.parent_phone,
        "address": profile.address,
        "average_grade9": profile.average_grade9, "average_grade10": profile.average_grade10,
        "average_grade7": profile.average_grade7, "average_grade8": profile.average_grade8,
        "average_grade11": profile.average_grade11, "average_grade12": profile.average_grade12,
        "school_schedule": json_value(profile.school_schedule_json, {}),
        "extra_classes": json_value(profile.extra_classes_json, {}),
        "registration_review_status": profile.registration_review_status,
        "registration_review_note": profile.registration_review_note,
    }


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


def user_education_level(db: Session, user: User):
    if user.role == "student":
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    elif user.role == "advisor":
        profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == user.id))
    else:
        return None
    return profile.education_level if profile else None


def manager_level(user: User):
    return "upper_secondary" if user.role == "upper_secondary_manager" else "lower_secondary" if user.role == "lower_secondary_manager" else None


def can_view_student(db: Session, viewer: User, student_id: str):
    if viewer.role in {"super_admin", "operations_admin", "secretary"}:
        return True
    level = manager_level(viewer)
    student = db.get(User, student_id)
    return bool(level and student and student.role == "student" and user_education_level(db, student) == level)


def can_communicate(db: Session, sender: User, recipient: User):
    if sender.role == "super_admin" or recipient.role == "super_admin":
        return True
    if sender.role == "student" and recipient.role == "advisor": return bool(assignment_for(db, recipient.id, sender.id))
    if sender.role == "advisor" and recipient.role == "student": return bool(assignment_for(db, sender.id, recipient.id))
    if sender.role == "secretary": return recipient.role in {"advisor", "super_admin"}
    if recipient.role == "secretary": return sender.role in {"advisor", "super_admin"}
    sender_level, recipient_level = manager_level(sender), manager_level(recipient)
    if sender_level and recipient.role == "advisor": return user_education_level(db, recipient) == sender_level
    if recipient_level and sender.role == "advisor": return user_education_level(db, sender) == recipient_level
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



@router.get("/registrations/options")
def registration_options(db: Session = Depends(get_db)):
    plans = db.scalars(select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True)).order_by(SubscriptionPlan.price)).all()
    advisor_profiles = db.scalars(select(AdvisorProfile).where(AdvisorProfile.approval_status == "approved")).all()
    advisors = []
    for profile in advisor_profiles:
        advisor = db.get(User, profile.user_id)
        if not advisor or advisor.status != "active":
            continue
        advisors.append(user_dict(advisor) | advisor_profile_dict(db, profile))
    return ok({
        "plans": [{"id": item.id, "name": item.name, "period": item.period, "price": item.price,
            "referral_price": item.referral_price or item.price, "features": json_value(item.features_json, [])} for item in plans],
        "advisors": advisors,
        "school_days": SCHOOL_DAYS,
    })


@router.post("/registrations/student")
def register_student(payload: StudentRegistration, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.phone == payload.phone)):
        raise HTTPException(409, "این شماره موبایل قبلاً ثبت شده است")
    if db.scalar(select(StudentProfile).where(StudentProfile.national_code == payload.national_code)):
        raise HTTPException(409, "این کد ملی قبلاً ثبت شده است")
    plan = db.get(SubscriptionPlan, payload.plan_id)
    if not plan or not plan.active:
        raise HTTPException(404, "طرح انتخابی فعال نیست")
    preferred = None
    if payload.advisor_selection_mode == "self":
        preferred = db.get(User, payload.advisor_id)
        profile, _, remaining = advisor_capacity(db, payload.advisor_id or "")
        if not preferred or preferred.role != "advisor" or preferred.status != "active" or not profile or profile.approval_status != "approved":
            raise HTTPException(404, "مشاور انتخابی در دسترس نیست")
        if profile.education_level != ("lower_secondary" if payload.grade in {"هفتم", "هشتم", "نهم"} else "upper_secondary"):
            raise HTTPException(409, "مشاور انتخابی مربوط به مقطع تحصیلی دانش‌آموز نیست")
        if remaining <= 0:
            raise HTTPException(409, "ظرفیت این مشاور تکمیل شده است")
    student = User(phone=payload.phone, full_name=payload.full_name, role="student", status="pending_payment")
    db.add(student)
    db.flush()
    db.add(StudentProfile(
        user_id=student.id, education_level="lower_secondary" if payload.grade in {"هفتم", "هشتم", "نهم"} else "upper_secondary", grade=payload.grade, major=payload.major, school=payload.school, goal=payload.goal,
        national_code=payload.national_code, birth_date=payload.birth_date, parent_name=payload.parent_name,
        parent_phone=payload.parent_phone, address=payload.address, average_grade9=payload.average_grade9,
        average_grade7=payload.average_grade7, average_grade8=payload.average_grade8,
        average_grade10=payload.average_grade10, average_grade11=payload.average_grade11,
        average_grade12=payload.average_grade12,
        school_schedule_json=json.dumps(payload.school_schedule, ensure_ascii=False),
        extra_classes_json=json.dumps(payload.extra_classes, ensure_ascii=False),
        advisor_selection_mode=payload.advisor_selection_mode, preferred_advisor_id=preferred.id if preferred else None,
    ))
    order = Order(user_id=student.id, plan_id=plan.id, amount=plan.price,
        idempotency_key=f"registration:{student.id}:{plan.id}")
    db.add(order)
    db.flush()
    payment = payment_provider.create(order.id, order.amount)
    order.provider_reference = payment["signature"]
    audit(db, student.id, "registration.student_created", "user", student.id,
        after={"plan_id": plan.id, "advisor_mode": payload.advisor_selection_mode})
    db.commit()
    return ok({"user_id": student.id, "status": student.status, "order_id": order.id, **payment})


@router.post("/registrations/advisor")
def register_advisor(payload: AdvisorRegistration, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.phone == payload.phone)):
        raise HTTPException(409, "این شماره موبایل قبلاً ثبت شده است")
    if db.scalar(select(AdvisorProfile).where(AdvisorProfile.national_code == payload.national_code)):
        raise HTTPException(409, "این کد ملی قبلاً ثبت شده است")
    advisor = User(phone=payload.phone, full_name=payload.full_name, role="advisor", status="pending_approval")
    db.add(advisor)
    db.flush()
    profile = AdvisorProfile(
        user_id=advisor.id, national_code=payload.national_code, birth_date=payload.birth_date,
        address=payload.address, education_degree=payload.education_degree,
        education_field=payload.education_field, experience_years=payload.experience_years,
        bio=payload.bio, support_capacity=payload.support_capacity, academic_year=payload.academic_year,
        documents_json=json.dumps([item.model_dump() for item in payload.documents], ensure_ascii=False),
        approval_status="pending",
    )
    db.add(profile)
    audit(db, advisor.id, "registration.advisor_created", "advisor_profile", profile.id,
        after={"capacity": profile.support_capacity, "documents": len(payload.documents)})
    db.commit()
    return ok({"user_id": advisor.id, "status": advisor.status,
        "message": "مدارک ثبت شد و پس از بررسی مدیریت نتیجه اعلام می‌شود."})

@router.post("/auth/register")
def register_account(payload: AccountRegistration, db: Session = Depends(get_db)):
    if payload.sms_code != "123456":
        raise HTTPException(400, "کد پیامکی صحیح نیست؛ کد آزمایشی 123456 است")
    existing = db.scalar(select(User).where(User.phone == payload.phone))
    if existing and not (existing.role == "student" and payload.role == "student" and existing.status == "invited" and not existing.password_hash):
        raise HTTPException(409, "این شماره موبایل قبلاً ثبت شده است")
    user = existing or User(phone=payload.phone, full_name="دانش‌آموز جدید" if payload.role == "student" else "مشاور جدید", role=payload.role)
    user.status = "onboarding_profile"
    user.onboarding_step = "profile"
    user.password_hash = hash_password(payload.password)
    if not existing:
        db.add(user)
    db.flush()
    audit(db, user.id, "auth.account_registered", "user", user.id, after={"role": user.role})
    db.commit()
    return ok({"user": user_dict(user), "message": "حساب ساخته شد؛ اکنون با شماره موبایل و رمز وارد شوید."})


@router.post("/auth/login")
def password_login(payload: PasswordLogin, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.phone == payload.phone))
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "شماره موبایل یا رمز ورود صحیح نیست")
    if user.status == "suspended":
        raise HTTPException(403, "حساب کاربری غیرفعال است")
    csrf = issue_session(response, user, db)
    audit(db, user.id, "auth.password_login", "user", user.id)
    db.commit()
    return ok({"user": user_dict(user), "csrf_token": csrf})

@router.post("/auth/request-otp")
def request_otp(payload: OTPRequest):
    code = otp_provider.send(payload.phone)
    return ok({"sent": True, "expires_in": 120, "dev_code": code if settings.env == "development" else None})


@router.post("/auth/verify-otp")
def verify_otp(payload: OTPVerify, response: Response, db: Session = Depends(get_db)):
    if payload.code != "123456" and settings.env == "development":
        raise HTTPException(400, "کد واردشده صحیح نیست")
    allowed = {"student", "advisor", "content_editor", "reviewer", "exam_designer", "support", "finance", "operations_admin", "super_admin"}
    if payload.role not in allowed:
        raise HTTPException(400, "نقش معتبر نیست")
    user = db.scalar(select(User).where(User.phone == payload.phone))
    if not user:
        raise HTTPException(404, "ابتدا از صفحه ثبت‌نام حساب کاربری خود را تکمیل کنید")
    if user.role != payload.role:
        raise HTTPException(403, "نقش انتخاب‌شده با حساب شما مطابقت ندارد")
    if user.status != "active":
        messages = {"pending_payment": "پرداخت ثبت‌نام هنوز تکمیل نشده است", "pending_approval": "مدارک مشاور هنوز توسط مدیریت تأیید نشده است", "pending_assignment": "ثبت‌نام تکمیل شده و در انتظار تخصیص مشاور است", "suspended": "حساب کاربری غیرفعال است"}
        raise HTTPException(403, messages.get(user.status, "حساب کاربری هنوز فعال نشده است"))
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
def me(user: User = Depends(current_account), db: Session = Depends(get_db)):
    data = user_dict(user)
    if user.role == "student":
        latest = db.scalar(select(Subscription).where(Subscription.user_id == user.id).order_by(Subscription.expires_at.desc()))
        current = active_subscription(db, user.id)
        data["subscription_expired"] = bool(latest and not current)
        data["subscription"] = ({"expires_at": current.expires_at, "status": current.status} if current else None)
    return ok(data)


@router.post("/auth/logout")
def logout(response: Response, refresh_token: str | None = Cookie(default=None), user: User = Depends(current_account), db: Session = Depends(get_db)):
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



@router.get("/onboarding/status")
def onboarding_status(user: User = Depends(current_account), db: Session = Depends(get_db)):
    data = {"user": user_dict(user), "step": user.onboarding_step}
    if user.role == "student":
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
        order = db.scalar(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()))
        data["profile"] = student_profile_dict(profile)
        if user.referred_by_advisor_id:
            referred_advisor = db.get(User, user.referred_by_advisor_id)
            data["referred_advisor"] = user_dict(referred_advisor) if referred_advisor else None
        if order and order.status == "pending":
            data["payment"] = {"order_id": order.id, "amount": order.amount, "signature": order.provider_reference}
    elif user.role == "advisor":
        profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == user.id))
        data["profile"] = advisor_profile_dict(db, profile) if profile else {}
    return ok(data)


@router.post("/onboarding/student/profile")
def onboarding_student_profile(payload: StudentOnboardingProfile,
                               user: User = Depends(current_account), db: Session = Depends(get_db)):
    if user.role != "student":
        raise HTTPException(403, "این مرحله فقط برای دانش‌آموز است")
    duplicate = db.scalar(select(StudentProfile).where(
        StudentProfile.national_code == payload.national_code, StudentProfile.user_id != user.id))
    if duplicate:
        raise HTTPException(409, "این کد ملی قبلاً ثبت شده است")
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    if not profile:
        profile = StudentProfile(user_id=user.id)
        db.add(profile)
    was_correction = profile.registration_review_status == "rejected"
    return_step = profile.correction_return_step if was_correction else "terms"
    user.full_name = payload.full_name
    for field in ("national_code", "birth_date", "parent_name", "parent_phone", "address", "grade",
                  "major", "school", "goal", "average_grade7", "average_grade8", "average_grade9", "average_grade10", "average_grade11", "average_grade12"):
        setattr(profile, field, getattr(payload, field))
    profile.education_level = "lower_secondary" if payload.grade in {"هفتم", "هشتم", "نهم"} else "upper_secondary"
    profile.school_schedule_json = json.dumps(payload.school_schedule, ensure_ascii=False)
    profile.extra_classes_json = json.dumps(payload.extra_classes, ensure_ascii=False)
    profile.registration_review_status = "corrected" if was_correction else profile.registration_review_status
    if was_correction:
        profile.registration_review_note = ""
    user.onboarding_step = return_step
    user.status = "active" if return_step == "completed" else "pending_assignment" if return_step in {"advisor_confirmation", "advisor_assignment"} else "pending_payment" if return_step == "payment" else "onboarding_profile" if return_step == "terms" else "onboarding_selection"
    audit(db, user.id, "onboarding.student_profile_corrected" if was_correction else "onboarding.student_profile_completed", "student_profile", profile.id)
    db.commit()
    return ok({"user": user_dict(user), "next_step": return_step})


@router.post("/onboarding/student/selection")
def onboarding_student_selection(payload: StudentOnboardingSelection,
                                 user: User = Depends(current_account), db: Session = Depends(get_db)):
    if user.role != "student":
        raise HTTPException(403, "این مرحله فقط برای دانش‌آموز است")
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    if not profile:
        raise HTTPException(409, "ابتدا اطلاعات فردی و تحصیلی را تکمیل کنید")
    plan = db.get(SubscriptionPlan, payload.plan_id)
    if not plan or not plan.active:
        raise HTTPException(404, "طرح انتخابی فعال نیست")
    preferred = None
    selection_mode = payload.advisor_selection_mode
    if user.referred_by_advisor_id:
        selection_mode = "self"
        preferred = db.get(User, user.referred_by_advisor_id)
        advisor_profile, _, _ = advisor_capacity(db, user.referred_by_advisor_id)
        if not preferred or preferred.role != "advisor" or preferred.status != "active" or not advisor_profile or advisor_profile.approval_status != "approved":
            raise HTTPException(409, "مشاور معرفی‌کننده در حال حاضر فعال نیست؛ با پشتیبانی تماس بگیرید")
        if advisor_profile.education_level != profile.education_level:
            raise HTTPException(409, "مقطع تحصیلی شما با حوزه فعالیت مشاور معرفی‌کننده سازگار نیست")
    elif selection_mode == "self":
        preferred = db.get(User, payload.advisor_id)
        advisor_profile, _, remaining = advisor_capacity(db, payload.advisor_id or "")
        if not preferred or preferred.role != "advisor" or preferred.status != "active" or not advisor_profile or advisor_profile.approval_status != "approved":
            raise HTTPException(404, "مشاور انتخابی در دسترس نیست")
        if advisor_profile.education_level != profile.education_level:
            raise HTTPException(409, "مشاور انتخابی مربوط به مقطع تحصیلی شما نیست")
        if remaining <= 0:
            raise HTTPException(409, "ظرفیت این مشاور تکمیل شده است")
    profile.advisor_selection_mode = selection_mode
    profile.preferred_advisor_id = preferred.id if preferred else None
    existing = db.scalar(select(Order).where(Order.user_id == user.id, Order.status == "pending").order_by(Order.created_at.desc()))
    if existing:
        existing.plan_id = plan.id
        amount = plan.referral_price if user.referred_by_advisor_id else plan.price
        existing.amount = amount
        payment = payment_provider.create(existing.id, existing.amount)
        existing.provider_reference = payment["signature"]
        order = existing
    else:
        order = Order(user_id=user.id, plan_id=plan.id, amount=plan.referral_price if user.referred_by_advisor_id else plan.price,
            idempotency_key=f"onboarding:{user.id}:{plan.id}:{utcnow().timestamp()}")
        db.add(order)
        db.flush()
        payment = payment_provider.create(order.id, order.amount)
        order.provider_reference = payment["signature"]
    user.status = "pending_payment"
    user.onboarding_step = "payment"
    audit(db, user.id, "onboarding.student_selection_completed", "order", order.id,
        after={"plan_id": plan.id, "advisor_mode": selection_mode, "advisor_id": preferred.id if preferred else None})
    db.commit()
    return ok({"order_id": order.id, "amount": order.amount, **payment})


@router.post("/onboarding/advisor/profile")
def onboarding_advisor_profile(payload: AdvisorOnboardingProfile,
                               user: User = Depends(current_account), db: Session = Depends(get_db)):
    if user.role != "advisor":
        raise HTTPException(403, "این مرحله فقط برای مشاور است")
    duplicate = db.scalar(select(AdvisorProfile).where(
        AdvisorProfile.national_code == payload.national_code, AdvisorProfile.user_id != user.id))
    if duplicate:
        raise HTTPException(409, "این کد ملی قبلاً ثبت شده است")
    profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == user.id))
    if not profile:
        profile = AdvisorProfile(user_id=user.id)
        db.add(profile)
    user.full_name = payload.full_name
    for field in ("national_code", "birth_date", "address", "education_degree", "education_field", "education_level",
                  "experience_years", "bio", "support_capacity", "academic_year"):
        setattr(profile, field, getattr(payload, field))
    profile.documents_json = json.dumps([item.model_dump() for item in payload.documents], ensure_ascii=False)
    profile.approval_status = "pending"
    profile.lead_approval_status = "pending"
    profile.admin_approval_status = "pending"
    profile.review_note = ""
    user.status = "onboarding_profile"
    user.onboarding_step = "terms"
    audit(db, user.id, "onboarding.advisor_profile_submitted", "advisor_profile", profile.id,
        after={"documents": len(payload.documents), "capacity": payload.support_capacity})
    db.commit()
    return ok({"user": user_dict(user), "next_step": "terms"})

@router.get("/profile")
def get_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "student":
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
        return ok(user_dict(user) | student_profile_dict(profile))
    if user.role == "advisor":
        profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == user.id))
        return ok(user_dict(user) | advisor_profile_dict(db, profile))
    return ok(user_dict(user))


@router.patch("/profile")
def update_profile(payload: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.full_name = payload.full_name
    if user.role == "student":
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
        if not profile:
            profile = StudentProfile(user_id=user.id)
            db.add(profile)
        for field in ("grade", "major", "school", "goal", "national_code", "birth_date", "parent_name",
                      "parent_phone", "address", "average_grade7", "average_grade8", "average_grade9", "average_grade10", "average_grade11", "average_grade12"):
            value = getattr(payload, field)
            if value is not None:
                setattr(profile, field, value)
        if payload.school_schedule is not None:
            if profile.grade in {"دهم", "یازدهم", "دوازدهم"} and any(
                len(payload.school_schedule.get(day, [])) != 4 for day in SCHOOL_DAYS):
                raise HTTPException(400, "برای هر روز مدرسه باید چهار زنگ ثبت شود")
            profile.school_schedule_json = json.dumps(payload.school_schedule, ensure_ascii=False)
        if payload.extra_classes is not None:
            profile.extra_classes_json = json.dumps(payload.extra_classes, ensure_ascii=False)
    elif user.role == "advisor":
        profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == user.id))
        if not profile:
            raise HTTPException(404, "پروفایل مشاور یافت نشد")
        _, assigned, _ = advisor_capacity(db, user.id)
        if payload.support_capacity is not None and payload.support_capacity < assigned:
            raise HTTPException(409, "ظرفیت نمی‌تواند از تعداد دانش‌آموزان فعال کمتر باشد")
        for field in ("education_degree", "education_field", "experience_years", "bio", "support_capacity", "academic_year", "address", "birth_date"):
            value = getattr(payload, field)
            if value is not None:
                setattr(profile, field, value)
    audit(db, user.id, "profile.updated", "user", user.id)
    db.commit()
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
    return ok({"student": user_dict(student), "profile": advisor_student_profile_dict(profile), **report_data(db, student_id)})


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
    elif manager_level(user):
        profiles = db.scalars(select(StudentProfile).where(StudentProfile.education_level == manager_level(user))).all()
        stmt = stmt.where(WeeklyPlan.student_id.in_([profile.user_id for profile in profiles]))
    elif user.role not in {"secretary", "super_admin", "operations_admin"}:
        raise HTTPException(403, "دسترسی به برنامه‌ها مجاز نیست")
    plans = db.scalars(stmt).all()
    return ok([plan_dict(plan) for plan in plans])


@router.get("/plans/{plan_id}")
def get_plan(plan_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    plan = db.get(WeeklyPlan, plan_id)
    if not plan: raise HTTPException(404, "برنامه یافت نشد")
    allowed = ((user.role == "student" and plan.student_id == user.id and plan.status == "published") or
        (user.role == "advisor" and plan.advisor_id == user.id) or
        user.role in {"secretary", "super_admin", "operations_admin"} or
        (manager_level(user) is not None and can_view_student(db, user, plan.student_id)))
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
    before = plan.status; now = utcnow(); plan.status = "published"; plan.published_at = now
    plan.ends_at = now + timedelta(days=7)
    plan.student_viewed_at = None
    plan.advisor_expiry_notified_at = None
    add_notification(db, plan.student_id, "plan_published", "برنامه هفتگی جدید", f"برنامه جدید شما توسط {user.full_name} منتشر شد.", "/app/student/plan", user.id, plan.id)
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
    if user.role != "super_admin" and recipient.role == "super_admin":
        locked = db.scalar(select(ChatLock).where(
            ChatLock.admin_id == recipient.id, ChatLock.user_id == user.id, ChatLock.locked.is_(True)))
        if locked:
            raise HTTPException(403, "مدیر این گفت‌وگو را قفل کرده است")
    msg = Message(sender_id=user.id, recipient_id=payload.recipient_id, body=payload.body, internal_note=payload.internal_note and user.role == "advisor")
    db.add(msg); db.flush()
    link = "/app/student/chat" if recipient.role == "student" else "/app/advisor/messages" if recipient.role == "advisor" else "/app/admin/messages" if recipient.role == "super_admin" else "/app/management/messages"
    add_notification(db, recipient.id, "message", "پیام جدید", f"{user.full_name}: {payload.body[:100]}", link, user.id, msg.id)
    db.commit(); return ok({"id": msg.id, "sent": True, "created_at": msg.created_at})


@router.post("/messages/{counterpart_id}/read")
def read_messages(counterpart_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    counterpart = db.get(User, counterpart_id)
    if not counterpart or not can_communicate(db, user, counterpart): raise HTTPException(403, "این گفت‌وگو مجاز نیست")
    items = db.scalars(select(Message).where(Message.sender_id == counterpart_id, Message.recipient_id == user.id, Message.read_at.is_(None))).all()
    now = utcnow()
    for item in items: item.read_at = now
    notes = db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.kind == "message", Notification.actor_id == counterpart_id, Notification.read_at.is_(None))).all()
    for note in notes: note.read_at = now
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
    return ok([{"id": x.id, "name": x.name, "period": x.period, "price": x.price, "referral_price": x.referral_price or x.price, "features": json.loads(x.features_json)} for x in items])


@router.post("/payments/orders")
def create_order(payload: OrderCreate, user: User = Depends(current_account), db: Session = Depends(get_db)):
    duplicate = db.scalar(select(Order).where(Order.idempotency_key == payload.idempotency_key))
    if duplicate: return ok({"order_id": duplicate.id, "status": duplicate.status, "duplicate": True})
    plan = db.get(SubscriptionPlan, payload.plan_id)
    if not plan or not plan.active: raise HTTPException(404, "پلن فعال نیست")
    order = Order(user_id=user.id, plan_id=plan.id, amount=plan.referral_price if user.referred_by_advisor_id else plan.price, idempotency_key=payload.idempotency_key)
    db.add(order); db.flush(); payment = payment_provider.create(order.id, order.amount); order.provider_reference = payment["signature"]
    audit(db, user.id, "payment.order_created", "order", order.id, after={"amount": order.amount}); db.commit(); return ok({"order_id": order.id, **payment})


@router.post("/payments/callback")
def payment_callback(payload: PaymentCallback, db: Session = Depends(get_db)):
    order = db.get(Order, payload.order_id)
    if not order:
        raise HTTPException(404, "سفارش یافت نشد")
    existing = db.scalar(select(Subscription).where(Subscription.order_id == order.id))
    if existing:
        registered_user = db.get(User, order.user_id)
        return ok({"order_id": order.id, "subscription_id": existing.id, "duplicate": True,
            "user_status": registered_user.status if registered_user else None})
    if not payment_provider.verify(order.id, payload.success, payload.signature):
        order.status = "failed"
        db.commit()
        raise HTTPException(400, "تایید پرداخت ناموفق بود")
    plan = db.get(SubscriptionPlan, order.plan_id)
    order.status = "paid"
    days = 365 if plan.period == "yearly" else 90 if plan.period in {"quarterly", "three_months"} else 30
    current_sub = db.scalar(select(Subscription).where(Subscription.user_id == order.user_id).order_by(Subscription.expires_at.desc()))
    current_end = current_sub.expires_at if current_sub else utcnow()
    current_end = current_end if current_end.tzinfo else current_end.replace(tzinfo=timezone.utc)
    starts_from = max(utcnow(), current_end)
    target_expiry = order.custom_expires_at or (starts_from + timedelta(days=days))
    sub = Subscription(user_id=order.user_id, plan_id=plan.id, order_id=order.id,
        starts_at=utcnow(), expires_at=target_expiry)
    registered_user = db.get(User, order.user_id)
    if registered_user and registered_user.role == "student" and registered_user.status != "active":
        sub.status = "pending_activation"
    db.add(sub)
    if registered_user and registered_user.role == "student" and registered_user.status != "active":
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == registered_user.id))
        if profile and profile.preferred_advisor_id:
            advisor_profile, _, remaining = advisor_capacity(db, profile.preferred_advisor_id)
            advisor = db.get(User, profile.preferred_advisor_id)
            if advisor and advisor.status == "active" and advisor_profile and advisor_profile.approval_status == "approved" and remaining > 0:
                existing_assignment = db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id == advisor.id, AdvisorAssignment.student_id == registered_user.id))
                if existing_assignment:
                    existing_assignment.active = False; existing_assignment.approval_status = "pending"
                    existing_assignment.assignment_source = "student"; existing_assignment.assigned_by = registered_user.id
                else:
                    db.add(AdvisorAssignment(advisor_id=advisor.id, student_id=registered_user.id, active=False,
                        approval_status="pending", assignment_source="student", assigned_by=registered_user.id))
                registered_user.onboarding_step = "dual_approval"
            else: registered_user.onboarding_step = "dual_approval"
        else: registered_user.onboarding_step = "dual_approval"
        registered_user.status = "pending_approval"
    audit(db, order.user_id, "payment.verified", "order", order.id,
        after={"subscription": sub.id, "user_status": registered_user.status if registered_user else None})
    db.commit()
    return ok({"order_id": order.id, "subscription_id": sub.id, "status": sub.status,
        "user_status": registered_user.status if registered_user else None})


@router.get("/admin/dashboard")
def admin_dashboard(user: User = Depends(roles("support", "finance", "operations_admin", "super_admin", "content_editor")), db: Session = Depends(get_db)):
    counts = {
        "users": db.scalar(select(func.count(User.id))),
        "students": db.scalar(select(func.count(User.id)).where(User.role == "student")),
        "advisors": db.scalar(select(func.count(User.id)).where(User.role == "advisor")),
        "pending_advisors": db.scalar(select(func.count(AdvisorProfile.id)).where(AdvisorProfile.approval_status == "pending")),
        "pending_assignment": db.scalar(select(func.count(User.id)).where(User.role == "student", User.status == "pending_assignment")),
        "questions": db.scalar(select(func.count(Question.id))),
        "exams": db.scalar(select(func.count(Exam.id))),
        "orders": db.scalar(select(func.count(Order.id))),
        "paid_orders": db.scalar(select(func.count(Order.id)).where(Order.status == "paid")),
        "audits": db.scalar(select(func.count(AuditLog.id))),
    }
    return ok({"user": user_dict(user), "counts": counts,
        "service": {"status": "سالم", "database": "SQLite WAL", "jobs": "فعال"}})


@router.get("/admin/users")
def admin_users(user: User = Depends(roles("operations_admin", "super_admin")), db: Session = Depends(get_db)):
    items = db.scalars(select(User).order_by(User.created_at.desc()).limit(500)).all()
    return ok([user_dict(item) | {"created_at": item.created_at} for item in items])


@router.patch("/admin/users/{user_id}/status")
def admin_update_user_status(user_id: str, payload: UserStatusUpdate,
                             user: User = Depends(roles("super_admin")), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "کاربر یافت نشد")
    if target.role == "student" and target.status == "pending_payment" and payload.status == "active":
        raise HTTPException(409, "دانش‌آموز پیش از فعال‌سازی باید پرداخت را تکمیل کند")
    before = target.status
    target.status = payload.status
    audit(db, user.id, "admin.user_status_updated", "user", target.id,
        before={"status": before}, after={"status": target.status})
    db.commit()
    return ok(user_dict(target))


def admin_student_data(db: Session, student: User):
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
    assignment = db.scalar(select(AdvisorAssignment).where(
        AdvisorAssignment.student_id == student.id, AdvisorAssignment.active.is_(True)))
    advisor = db.get(User, assignment.advisor_id) if assignment else None
    subscription = db.scalar(select(Subscription).where(
        Subscription.user_id == student.id, Subscription.status == "active").order_by(Subscription.created_at.desc()))
    subscription_plan = db.get(SubscriptionPlan, subscription.plan_id) if subscription else None
    return user_dict(student) | {
        "created_at": student.created_at,
        "profile": student_profile_dict(profile),
        "advisor": user_dict(advisor) if advisor else None,
        "subscription": {"id": subscription.id, "plan_name": subscription_plan.name,
            "expires_at": subscription.expires_at, "status": subscription.status} if subscription and subscription_plan else None,
    }


@router.get("/admin/students")
def admin_students(user: User = Depends(roles("operations_admin", "super_admin")), db: Session = Depends(get_db)):
    students = db.scalars(select(User).where(User.role == "student").order_by(User.created_at.desc())).all()
    return ok([admin_student_data(db, item) for item in students])


@router.get("/admin/students/{student_id}")
def admin_student(student_id: str, user: User = Depends(roles("operations_admin", "super_admin")),
                  db: Session = Depends(get_db)):
    student = db.get(User, student_id)
    if not student or student.role != "student":
        raise HTTPException(404, "دانش‌آموز یافت نشد")
    return ok(admin_student_data(db, student) | {"report": report_data(db, student.id)})


@router.get("/admin/advisors")
def admin_advisors(user: User = Depends(roles("operations_admin", "super_admin")), db: Session = Depends(get_db)):
    advisors = db.scalars(select(User).where(User.role == "advisor").order_by(User.created_at.desc())).all()
    return ok([user_dict(item) | {"created_at": item.created_at,
        "profile": advisor_profile_dict(db, db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == item.id)))}
        for item in advisors])


@router.get("/admin/advisors/{advisor_id}")
def admin_advisor(advisor_id: str, user: User = Depends(roles("operations_admin", "super_admin")),
                  db: Session = Depends(get_db)):
    advisor = db.get(User, advisor_id)
    if not advisor or advisor.role != "advisor":
        raise HTTPException(404, "مشاور یافت نشد")
    profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == advisor.id))
    assignments = db.scalars(select(AdvisorAssignment).where(
        AdvisorAssignment.advisor_id == advisor.id, AdvisorAssignment.active.is_(True))).all()
    students = [db.get(User, item.student_id) for item in assignments]
    return ok(user_dict(advisor) | {"profile": advisor_profile_dict(db, profile, include_documents=True),
        "students": [user_dict(item) for item in students if item]})


@router.patch("/admin/advisors/{advisor_id}/review")
def admin_review_advisor(advisor_id: str, payload: AdvisorReview,
                         user: User = Depends(roles("operations_admin", "super_admin")),
                         db: Session = Depends(get_db)):
    advisor = db.get(User, advisor_id)
    profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == advisor_id))
    if not advisor or advisor.role != "advisor" or not profile:
        raise HTTPException(404, "پرونده مشاور یافت نشد")
    if payload.status == "rejected" and not payload.note.strip():
        raise HTTPException(422, "برای رد پرونده وارد کردن دلیل الزامی است")
    before = profile.approval_status
    profile.admin_approval_status = payload.status
    profile.review_note = payload.note
    profile.reviewed_by = user.id
    profile.reviewed_at = utcnow()
    profile.admin_reviewed_by = user.id
    profile.admin_reviewed_at = utcnow()
    if payload.status == "rejected":
        profile.approval_status = "rejected"
        advisor.status = "pending_approval"
        advisor.onboarding_step = "rejected"
    elif profile.lead_approval_status == "approved":
        profile.approval_status = "approved"
        advisor.status = "active"
        advisor.onboarding_step = "completed"
    else:
        profile.approval_status = "pending"
        advisor.status = "pending_approval"
        advisor.onboarding_step = "lead_review"
    audit(db, user.id, "admin.advisor_reviewed", "advisor_profile", profile.id,
        before={"status": before}, after={"status": payload.status}, reason=payload.note)
    db.commit()
    return ok(user_dict(advisor) | {"profile": advisor_profile_dict(db, profile)})


@router.post("/admin/students/{student_id}/assign-advisor")
def admin_assign_advisor(student_id: str, payload: AdvisorAssign,
                         user: User = Depends(roles("operations_admin", "super_admin")),
                         db: Session = Depends(get_db)):
    student = db.get(User, student_id)
    advisor = db.get(User, payload.advisor_id)
    advisor_profile, _, remaining = advisor_capacity(db, payload.advisor_id)
    if not student or student.role != "student":
        raise HTTPException(404, "دانش‌آموز یافت نشد")
    if student.status == "pending_payment":
        raise HTTPException(409, "پرداخت دانش‌آموز هنوز تکمیل نشده است")
    if not advisor or advisor.role != "advisor" or advisor.status != "active" or not advisor_profile or advisor_profile.approval_status != "approved":
        raise HTTPException(404, "مشاور تأییدشده یافت نشد")
    student_profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
    if not student_profile or advisor_profile.education_level != student_profile.education_level:
        raise HTTPException(409, "مشاور و دانش‌آموز باید متعلق به یک مقطع باشند")
    current = db.scalar(select(AdvisorAssignment).where(
        AdvisorAssignment.student_id == student.id, AdvisorAssignment.active.is_(True)))
    if (not current or current.advisor_id != advisor.id) and remaining <= 0:
        raise HTTPException(409, "ظرفیت مشاور تکمیل شده است")
    assignments = db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id)).all()
    for item in assignments:
        item.active = False
    target = next((item for item in assignments if item.advisor_id == advisor.id), None)
    if target:
        target.active = True
        target.approval_status = "approved"
        target.assignment_source = "admin"
        target.assigned_by = user.id
        target.decided_at = utcnow()
    else:
        db.add(AdvisorAssignment(advisor_id=advisor.id, student_id=student.id, active=True,
            approval_status="approved", assignment_source="admin", assigned_by=user.id, decided_at=utcnow()))
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
    if profile:
        profile.preferred_advisor_id = advisor.id
        profile.advisor_selection_mode = "admin"
    if profile:
        profile.advisor_approval_status = "approved"
        profile.advisor_reviewed_by = user.id
        profile.advisor_reviewed_at = utcnow()
        finalize_student_registration(db, student, profile)
    audit(db, user.id, "admin.advisor_assigned", "user", student.id,
        after={"advisor_id": advisor.id})
    db.commit()
    return ok({"student": user_dict(student), "advisor": user_dict(advisor)})


@router.get("/admin/finance")
def admin_finance(user: User = Depends(roles("finance", "operations_admin", "super_admin")),
                  db: Session = Depends(get_db)):
    plans = db.scalars(select(SubscriptionPlan).order_by(SubscriptionPlan.price)).all()
    orders = db.scalars(select(Order).order_by(Order.created_at.desc()).limit(300)).all()
    users = {item.id: item for item in db.scalars(select(User).where(
        User.id.in_([order.user_id for order in orders]))).all()} if orders else {}
    return ok({
        "plans": [{"id": item.id, "name": item.name, "period": item.period, "price": item.price, "referral_price": item.referral_price or item.price,
            "active": item.active, "features": json_value(item.features_json, [])} for item in plans],
        "orders": [{"id": item.id, "user_id": item.user_id,
            "user_name": users[item.user_id].full_name if item.user_id in users else "—",
            "amount": item.amount, "status": item.status, "created_at": item.created_at} for item in orders],
    })


@router.get("/admin/audits")
def audit_logs(user: User = Depends(roles("operations_admin", "super_admin")), db: Session = Depends(get_db)):
    items = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100)).all()
    return ok([{"id": x.id, "actor_id": x.actor_id, "action": x.action, "resource_type": x.resource_type, "resource_id": x.resource_id, "reason": x.reason, "created_at": x.created_at} for x in items])


STAFF_ROLES = {"secretary", "upper_secondary_manager", "lower_secondary_manager"}


def update_advisor_activation(profile: AdvisorProfile, advisor: User):
    if "rejected" in {profile.lead_approval_status, profile.admin_approval_status}:
        profile.approval_status = "rejected"
        advisor.status = "pending_approval"
        advisor.onboarding_step = "rejected"
    elif profile.lead_approval_status == "approved" and profile.admin_approval_status == "approved":
        profile.approval_status = "approved"
        advisor.status = "active"
        advisor.onboarding_step = "completed"
    elif profile.lead_approval_status == "approved":
        profile.approval_status = "pending"
        advisor.status = "pending_approval"
        advisor.onboarding_step = "manager_review"
    else:
        profile.approval_status = "pending"
        advisor.status = "pending_approval"
        advisor.onboarding_step = "lead_review"


@router.post("/auth/staff-login")
def staff_login(payload: StaffOTPVerify, response: Response, db: Session = Depends(get_db)):
    if settings.env == "development" and payload.code != "123456":
        raise HTTPException(400, "کد یکبار مصرف صحیح نیست")
    user = db.scalar(select(User).where(User.phone == payload.phone))
    if not user or user.role not in STAFF_ROLES:
        raise HTTPException(403, "این شماره به عنوان منشی یا مسئول مقطع ثبت نشده است")
    if user.status != "active":
        raise HTTPException(403, "دسترسی این حساب توسط مدیر بسته شده است")
    csrf = issue_session(response, user, db)
    audit(db, user.id, "auth.staff_otp_login", "user", user.id)
    db.commit()
    return ok({"user": user_dict(user), "csrf_token": csrf})


@router.get("/admin/staff")
def admin_staff(user: User = Depends(roles("super_admin")), db: Session = Depends(get_db)):
    items = db.scalars(select(User).where(User.role.in_(STAFF_ROLES)).order_by(User.created_at.desc())).all()
    return ok([user_dict(item) | {"created_at": item.created_at} for item in items])


@router.post("/admin/staff")
def admin_create_staff(payload: StaffCreate, user: User = Depends(roles("super_admin")), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.phone == payload.phone)):
        raise HTTPException(409, "این شماره موبایل قبلاً ثبت شده است")
    staff = User(phone=payload.phone, full_name=payload.full_name, role=payload.role,
        status="active", onboarding_step="completed")
    db.add(staff); db.flush()
    audit(db, user.id, "admin.staff_created", "user", staff.id, after={"role": staff.role})
    db.commit()
    return ok(user_dict(staff))


@router.get("/management/contacts")
def management_contacts(user: User = Depends(roles("secretary", "upper_secondary_manager", "lower_secondary_manager", "super_admin")), db: Session = Depends(get_db)):
    if user.role == "super_admin":
        items = db.scalars(select(User).where(User.id != user.id, User.status == "active").order_by(User.full_name)).all()
    elif user.role == "secretary":
        items = db.scalars(select(User).where(User.role.in_(["advisor", "super_admin"]), User.status == "active").order_by(User.full_name)).all()
    else:
        level = manager_level(user)
        profiles = db.scalars(select(AdvisorProfile).where(AdvisorProfile.education_level == level, AdvisorProfile.approval_status == "approved")).all()
        ids = [profile.user_id for profile in profiles]
        items = db.scalars(select(User).where(or_(User.id.in_(ids), User.role == "super_admin"), User.status == "active").order_by(User.full_name)).all()
    return ok([user_dict(item) for item in items])


@router.get("/management/conversations")
def management_conversations(user: User = Depends(roles("upper_secondary_manager", "lower_secondary_manager", "super_admin")), db: Session = Depends(get_db)):
    assignments = db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.active.is_(True))).all()
    rows = []
    for assignment in assignments:
        student, advisor = db.get(User, assignment.student_id), db.get(User, assignment.advisor_id)
        if not student or not advisor or not can_view_student(db, user, student.id):
            continue
        last = db.scalar(select(Message).where(or_(
            (Message.sender_id == student.id) & (Message.recipient_id == advisor.id),
            (Message.sender_id == advisor.id) & (Message.recipient_id == student.id))).order_by(Message.created_at.desc()))
        rows.append({"student": user_dict(student), "advisor": user_dict(advisor),
            "last_message": last.body if last else None, "last_message_at": last.created_at if last else None})
    return ok(rows)


@router.get("/management/messages")
def management_messages(first_id: str, second_id: str,
                        user: User = Depends(roles("upper_secondary_manager", "lower_secondary_manager", "super_admin")),
                        db: Session = Depends(get_db)):
    first, second = db.get(User, first_id), db.get(User, second_id)
    if not first or not second:
        raise HTTPException(404, "کاربر یافت نشد")
    student = first if first.role == "student" else second if second.role == "student" else None
    if user.role != "super_admin" and (not student or not can_view_student(db, user, student.id)):
        raise HTTPException(403, "مشاهده این گفت‌وگو مجاز نیست")
    items = db.scalars(select(Message).where(or_(
        (Message.sender_id == first.id) & (Message.recipient_id == second.id),
        (Message.sender_id == second.id) & (Message.recipient_id == first.id)),
        Message.internal_note.is_(False)).order_by(Message.created_at)).all()
    return ok([{"id": item.id, "sender_id": item.sender_id, "recipient_id": item.recipient_id,
        "body": item.body, "created_at": item.created_at, "read_at": item.read_at} for item in items])


@router.get("/management/advisors")
def management_advisors(user: User = Depends(roles("upper_secondary_manager", "lower_secondary_manager", "super_admin")), db: Session = Depends(get_db)):
    stmt = select(AdvisorProfile).order_by(AdvisorProfile.created_at.desc())
    if user.role != "super_admin":
        stmt = stmt.where(AdvisorProfile.education_level == manager_level(user))
    profiles = db.scalars(stmt).all()
    rows = []
    for profile in profiles:
        advisor = db.get(User, profile.user_id)
        if advisor:
            rows.append(user_dict(advisor) | {"profile": advisor_profile_dict(db, profile, include_documents=True)})
    return ok(rows)


@router.patch("/management/advisors/{advisor_id}/review")
def lead_review_advisor(advisor_id: str, payload: AdvisorReview,
                        user: User = Depends(roles("upper_secondary_manager", "lower_secondary_manager")),
                        db: Session = Depends(get_db)):
    advisor = db.get(User, advisor_id)
    profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == advisor_id))
    if not advisor or not profile:
        raise HTTPException(404, "پرونده مشاور یافت نشد")
    if profile.education_level != manager_level(user):
        raise HTTPException(403, "این مشاور متعلق به مقطع شما نیست")
    if payload.status == "rejected" and not payload.note.strip():
        raise HTTPException(422, "برای رد مدارک وارد کردن دلیل الزامی است")
    profile.lead_approval_status = payload.status
    profile.lead_reviewed_by = user.id
    profile.lead_reviewed_at = utcnow()
    profile.review_note = payload.note
    update_advisor_activation(profile, advisor)
    audit(db, user.id, "lead.advisor_reviewed", "advisor_profile", profile.id,
        after={"status": payload.status, "level": profile.education_level}, reason=payload.note)
    db.commit()
    return ok(user_dict(advisor) | {"profile": advisor_profile_dict(db, profile)})


@router.get("/advisors/assignment-requests")
def advisor_assignment_requests(user: User = Depends(roles("advisor")), db: Session = Depends(get_db)):
    assignments = db.scalars(select(AdvisorAssignment).where(
        AdvisorAssignment.advisor_id == user.id, AdvisorAssignment.approval_status == "pending").order_by(AdvisorAssignment.created_at)).all()
    rows = []
    for assignment in assignments:
        student = db.get(User, assignment.student_id)
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == assignment.student_id))
        if student:
            rows.append({"id": assignment.id, "student": user_dict(student), "profile": advisor_student_profile_dict(profile),
                "created_at": assignment.created_at})
    return ok(rows)


@router.patch("/advisors/assignment-requests/{assignment_id}")
def advisor_assignment_decision(assignment_id: str, payload: AssignmentDecision,
                                user: User = Depends(roles("advisor")), db: Session = Depends(get_db)):
    assignment = db.get(AdvisorAssignment, assignment_id)
    if not assignment or assignment.advisor_id != user.id or assignment.approval_status != "pending":
        raise HTTPException(404, "درخواست تخصیص یافت نشد")
    student = db.get(User, assignment.student_id)
    if payload.decision == "approved":
        _, _, remaining = advisor_capacity(db, user.id)
        if remaining <= 0:
            raise HTTPException(409, "ظرفیت پذیرش شما تکمیل است")
        for current in db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.student_id == assignment.student_id, AdvisorAssignment.active.is_(True))).all():
            current.active = False
        assignment.active = True
        assignment.approval_status = "approved"
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
        if profile:
            profile.advisor_approval_status = "approved"
            profile.advisor_reviewed_by = user.id
            profile.advisor_reviewed_at = utcnow()
            finalize_student_registration(db, student, profile)
    else:
        assignment.active = False
        assignment.approval_status = "rejected"
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
        if profile:
            profile.advisor_approval_status = "rejected"
            profile.approval_note = payload.note
        student.status = "pending_approval"
        student.onboarding_step = "dual_approval"
    assignment.decided_at = utcnow()
    audit(db, user.id, "advisor.assignment_decided", "advisor_assignment", assignment.id,
        after={"decision": payload.decision}, reason=payload.note)
    db.commit()
    return ok({"assignment_id": assignment.id, "decision": payload.decision, "student": user_dict(student)})


@router.get("/management/students")
def management_students(user: User = Depends(roles("secretary", "upper_secondary_manager", "lower_secondary_manager", "super_admin")), db: Session = Depends(get_db)):
    students = db.scalars(select(User).where(User.role == "student").order_by(User.full_name)).all()
    rows = []
    for student in students:
        if user.role != "secretary" and not can_view_student(db, user, student.id):
            continue
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
        assignment = db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id, AdvisorAssignment.active.is_(True)))
        advisor = db.get(User, assignment.advisor_id) if assignment else None
        rows.append(user_dict(student) | {"profile": advisor_student_profile_dict(profile), "advisor": user_dict(advisor) if advisor else None})
    return ok(rows)


@router.patch("/management/students/{student_id}/review")
def review_student_registration(student_id: str, payload: AdvisorReview,
                                user: User = Depends(roles("upper_secondary_manager", "lower_secondary_manager", "super_admin")),
                                db: Session = Depends(get_db)):
    student = db.get(User, student_id)
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student_id))
    if not student or student.role != "student" or not profile:
        raise HTTPException(404, "پرونده دانش‌آموز یافت نشد")
    if user.role != "super_admin" and not can_view_student(db, user, student_id):
        raise HTTPException(403, "این دانش‌آموز متعلق به مقطع شما نیست")
    if payload.status == "rejected" and not payload.note.strip():
        raise HTTPException(422, "برای رد اطلاعات وارد کردن دلیل الزامی است")
    before = {"status": profile.registration_review_status, "step": student.onboarding_step}
    profile.registration_review_status = payload.status
    profile.registration_review_note = payload.note.strip()
    profile.registration_reviewed_by = user.id
    profile.registration_reviewed_at = utcnow()
    if payload.status == "rejected":
        if student.onboarding_step != "profile_correction":
            profile.correction_return_step = student.onboarding_step or "selection"
        student.status = "onboarding_profile"
        student.onboarding_step = "profile_correction"
    audit(db, user.id, "management.student_registration_reviewed", "student_profile", profile.id,
        before=before, after={"status": payload.status, "step": student.onboarding_step}, reason=payload.note)
    db.commit()
    return ok(user_dict(student) | {"profile": student_profile_dict(profile)})
