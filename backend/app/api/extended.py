from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import current_account, current_user, roles
from app.db.session import get_db
from app.models import Message, Notification, Order, SiteSetting, Subscription, SubscriptionPlan, User, WeeklyPlan, utcnow
from app.schemas import AdvisorReferralCreate, FreeSubscriptionCreate, SubscriptionPlanUpdate, TermsAccept, TermsUpdate
from app.services import audit

router = APIRouter()


def ok(data=None):
    return {"success": True, "data": data, "meta": {}}


def notify(db: Session, user_id: str, kind: str, title: str, body: str = "", link: str = "", actor_id: str | None = None, related_id: str | None = None):
    db.add(Notification(user_id=user_id, actor_id=actor_id, kind=kind, title=title, body=body, link=link, related_id=related_id))


def sync_expired_plans(db: Session, user: User):
    if user.role not in {"advisor", "super_admin"}:
        return
    stmt = select(WeeklyPlan).where(WeeklyPlan.status == "published", WeeklyPlan.advisor_expiry_notified_at.is_(None))
    if user.role == "advisor":
        stmt = stmt.where(WeeklyPlan.advisor_id == user.id)
    now = utcnow()
    changed = False
    for plan in db.scalars(stmt).all():
        end = plan.ends_at or ((plan.published_at or plan.created_at) + timedelta(days=7))
        end = end if end.tzinfo else end.replace(tzinfo=timezone.utc)
        if end <= now:
            student = db.get(User, plan.student_id)
            notify(db, plan.advisor_id, "plan_expired", "برنامه دانش‌آموز تمام شد", f"برنامه {student.full_name if student else 'دانش‌آموز'} تمام شده و نیازمند برنامه جدید است.", f"/app/advisor/students/{plan.student_id}/plan", related_id=plan.id)
            plan.advisor_expiry_notified_at = now
            changed = True
    if changed:
        db.commit()


@router.get("/notifications/summary")
def notification_summary(user: User = Depends(current_user), db: Session = Depends(get_db)):
    sync_expired_plans(db, user)
    messages = db.scalars(select(Message).where(Message.recipient_id == user.id, Message.read_at.is_(None), Message.internal_note.is_(False))).all()
    by_sender: dict[str, int] = {}
    for message in messages:
        by_sender[message.sender_id] = by_sender.get(message.sender_id, 0) + 1
    unread_notes = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id, Notification.read_at.is_(None))) or 0
    latest_student_plan = db.scalar(select(WeeklyPlan).where(WeeklyPlan.student_id == user.id, WeeklyPlan.status == "published").order_by(WeeklyPlan.published_at.desc())) if user.role == "student" else None
    unseen = 1 if latest_student_plan and latest_student_plan.student_viewed_at is None else 0
    expired_ids: list[str] = []
    if user.role in {"advisor", "super_admin"}:
        stmt = select(WeeklyPlan).where(WeeklyPlan.status == "published").order_by(WeeklyPlan.published_at.desc())
        if user.role == "advisor":
            stmt = stmt.where(WeeklyPlan.advisor_id == user.id)
        latest: dict[str, WeeklyPlan] = {}
        for plan in db.scalars(stmt).all():
            if plan.student_id not in latest:
                latest[plan.student_id] = plan
        now = utcnow()
        for student_id, plan in latest.items():
            end = plan.ends_at or ((plan.published_at or plan.created_at) + timedelta(days=7))
            end = end if end.tzinfo else end.replace(tzinfo=timezone.utc)
            if end <= now:
                expired_ids.append(student_id)
    return ok({"unread_messages": len(messages), "unread_by_sender": by_sender, "unread_notifications": unread_notes, "unseen_plans": unseen or 0, "expired_student_ids": expired_ids})


@router.get("/notifications")
def list_notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    sync_expired_plans(db, user)
    items = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(40)).all()
    return ok([{"id": x.id, "kind": x.kind, "title": x.title, "body": x.body, "link": x.link, "actor_id": x.actor_id, "related_id": x.related_id, "read_at": x.read_at, "created_at": x.created_at} for x in items])


@router.post("/notifications/{notification_id}/read")
def read_notification(notification_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(Notification, notification_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "اعلان یافت نشد")
    item.read_at = item.read_at or utcnow()
    db.commit()
    return ok({"read": True})


@router.post("/notifications/read-all")
def read_all_notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    items = db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))).all()
    now = utcnow()
    for item in items:
        item.read_at = now
    db.commit()
    return ok({"read": len(items)})


@router.post("/plans/{plan_id}/view")
def view_plan(plan_id: str, user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    plan = db.get(WeeklyPlan, plan_id)
    if not plan or plan.student_id != user.id or plan.status != "published":
        raise HTTPException(404, "برنامه یافت نشد")
    plan.student_viewed_at = utcnow()
    notes = db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.kind == "plan_published", Notification.related_id == plan.id, Notification.read_at.is_(None))).all()
    for item in notes:
        item.read_at = plan.student_viewed_at
    db.commit()
    return ok({"viewed": True})


@router.post("/advisors/referrals")
def advisor_referral(payload: AdvisorReferralCreate, user: User = Depends(roles("advisor")), db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.phone == payload.phone))
    if existing and (existing.role != "student" or existing.password_hash):
        raise HTTPException(409, "این شماره قبلاً در سایت ثبت شده است")
    student = existing or User(phone=payload.phone, full_name="دانش‌آموز معرفی‌شده", role="student", status="invited", onboarding_step="account")
    student.referred_by_advisor_id = user.id
    if not existing:
        db.add(student)
    db.commit()
    return ok({"id": student.id, "phone": student.phone, "message": "دانش‌آموز معرفی شد؛ اکنون می‌تواند با همین شماره ثبت‌نام کند."})


@router.patch("/admin/subscription-plans/{plan_id}")
def update_subscription_plan(plan_id: str, payload: SubscriptionPlanUpdate, user: User = Depends(roles("super_admin", "finance")), db: Session = Depends(get_db)):
    plan = db.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(404, "طرح یافت نشد")
    plan.price, plan.referral_price, plan.active = payload.price, payload.referral_price, payload.active
    audit(db, user.id, "subscription_plan.updated", "subscription_plan", plan.id, after={"price": plan.price, "referral_price": plan.referral_price})
    db.commit()
    return ok({"id": plan.id, "price": plan.price, "referral_price": plan.referral_price, "active": plan.active})


@router.post("/admin/subscriptions/free")
def grant_free_subscription(payload: FreeSubscriptionCreate, user: User = Depends(roles("super_admin", "finance")), db: Session = Depends(get_db)):
    student = db.get(User, payload.student_id)
    if not student or student.role != "student":
        raise HTTPException(404, "دانش‌آموز یافت نشد")
    plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True)).order_by(SubscriptionPlan.period.desc()))
    if not plan:
        raise HTTPException(409, "ابتدا یک طرح اشتراک فعال ایجاد کنید")
    try:
        expires = datetime.fromisoformat(payload.expires_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(422, "تاریخ پایان معتبر نیست") from exc
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= utcnow():
        raise HTTPException(422, "تاریخ پایان باید در آینده باشد")
    order = Order(user_id=student.id, plan_id=plan.id, amount=0, status="paid", idempotency_key=f"free:{student.id}:{utcnow().timestamp()}", provider_reference="admin-free")
    db.add(order)
    db.flush()
    sub = Subscription(user_id=student.id, plan_id=plan.id, order_id=order.id, starts_at=utcnow(), expires_at=expires)
    db.add(sub)
    notify(db, student.id, "subscription", "اشتراک رایگان فعال شد", "اشتراک شما تا تاریخ تعیین‌شده توسط مدیریت فعال شد؛ تاریخ پایان در پنل به‌صورت شمسی نمایش داده می‌شود.", "/app/student/overview", user.id, sub.id)
    db.commit()
    return ok({"id": sub.id, "expires_at": sub.expires_at})


def terms_setting(db: Session, role: str):
    key = "terms_advisor" if role == "advisor" else "terms_student"
    item = db.get(SiteSetting, key)
    if not item:
        item = SiteSetting(key=key, value="با ثبت‌نام در مسیر هوشمند، صحت اطلاعات و رعایت قوانین آموزشی و حریم خصوصی را می‌پذیرم.", version=1)
        db.add(item)
        db.commit()
        db.refresh(item)
    return item


@router.get("/terms/{role}")
def get_terms(role: str, db: Session = Depends(get_db)):
    if role not in {"student", "advisor"}:
        raise HTTPException(404, "نقش معتبر نیست")
    item = terms_setting(db, role)
    return ok({"role": role, "text": item.value, "version": item.version})


@router.post("/onboarding/terms/accept")
def accept_terms(payload: TermsAccept, user: User = Depends(current_account), db: Session = Depends(get_db)):
    if not payload.accepted:
        raise HTTPException(422, "پذیرش شرایط برای ادامه الزامی است")
    item = terms_setting(db, user.role)
    if payload.version != item.version:
        raise HTTPException(409, "شرایط تغییر کرده است؛ متن جدید را مطالعه کنید")
    user.terms_accepted_version = item.version
    user.onboarding_step = "selection" if user.role == "student" else "lead_review"
    user.status = "onboarding_selection" if user.role == "student" else "pending_approval"
    db.commit()
    return ok({"next_step": user.onboarding_step})


@router.get("/admin/terms")
def admin_terms(user: User = Depends(roles("super_admin")), db: Session = Depends(get_db)):
    student, advisor = terms_setting(db, "student"), terms_setting(db, "advisor")
    return ok({"student_text": student.value, "student_version": student.version, "advisor_text": advisor.value, "advisor_version": advisor.version})


@router.patch("/admin/terms")
def update_terms(payload: TermsUpdate, user: User = Depends(roles("super_admin")), db: Session = Depends(get_db)):
    student, advisor = terms_setting(db, "student"), terms_setting(db, "advisor")
    if student.value != payload.student_text:
        student.value, student.version, student.updated_by = payload.student_text, student.version + 1, user.id
    if advisor.value != payload.advisor_text:
        advisor.value, advisor.version, advisor.updated_by = payload.advisor_text, advisor.version + 1, user.id
    db.commit()
    return ok({"saved": True})
