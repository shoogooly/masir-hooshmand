import json
from datetime import timedelta, timezone
from math import ceil
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import current_user, roles
from app.db.session import get_db
from app.models import AdvisorAssignment, AdvisorProfile, ChatLock, Message, Notification, Order, StudentProfile, Subscription, SubscriptionPlan, User, utcnow
from app.services import audit

router = APIRouter()

def ok(data=None):
    return {"success": True, "data": data, "meta": {}}

def basic(user: User):
    return {"id": user.id, "phone": user.phone, "full_name": user.full_name, "role": user.role, "status": user.status, "onboarding_step": user.onboarding_step}

def plan_days(plan: SubscriptionPlan):
    return 365 if plan.period == "yearly" else 90 if plan.period in {"quarterly", "three_months"} else 30

def finalize_student_registration(db: Session, student: User, profile: StudentProfile | None = None):
    was_active = student.status == "active"
    profile = profile or db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
    assignment = db.scalar(select(AdvisorAssignment).where(
        AdvisorAssignment.student_id == student.id,
        AdvisorAssignment.approval_status == "approved",
        AdvisorAssignment.active.is_(True)))
    ready = bool(profile and assignment and profile.admin_approval_status == "approved" and profile.advisor_approval_status == "approved")
    if not ready:
        student.status = "pending_approval"
        student.onboarding_step = "dual_approval"
        return False
    pending = db.scalar(select(Subscription).where(
        Subscription.user_id == student.id, Subscription.status == "pending_activation"
    ).order_by(Subscription.created_at.desc()))
    if pending:
        plan = db.get(SubscriptionPlan, pending.plan_id)
        now = utcnow()
        pending.starts_at = now
        pending.expires_at = now + timedelta(days=plan_days(plan))
        pending.status = "active"
    student.status = "active"
    student.onboarding_step = "completed"
    if not was_active:
        db.add(Notification(user_id=student.id, kind="registration", title="حساب شما فعال شد",
            body="تأیید مدیر و مشاور تکمیل شد و دوره اشتراک شما از همین لحظه آغاز گردید.",
            link="/app/student/subscription"))
    return True

class LockUpdate(BaseModel):
    locked: bool

class StudentApprovalUpdate(BaseModel):
    status: Literal["approved", "rejected"]
    note: str = ""
    approve_as_advisor: bool = False

@router.get("/chat/contacts")
def chat_contacts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "super_admin":
        contacts = db.scalars(select(User).where(User.id != user.id).order_by(User.created_at.desc())).all()
    else:
        candidates = db.scalars(select(User).where(User.id != user.id, User.status == "active").order_by(User.full_name)).all()
        contacts = []
        for item in candidates:
            related = item.role == "super_admin"
            if user.role == "student" and item.role == "advisor":
                related = bool(db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.student_id == user.id, AdvisorAssignment.advisor_id == item.id, AdvisorAssignment.active.is_(True))))
            elif user.role == "advisor" and item.role == "student":
                related = bool(db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id == user.id, AdvisorAssignment.student_id == item.id, AdvisorAssignment.active.is_(True))))
            elif user.role in {"secretary", "upper_secondary_manager", "lower_secondary_manager"}:
                related = item.role in {"advisor", "super_admin"}
            has_messages = bool(db.scalar(select(Message.id).where(or_(
                (Message.sender_id == user.id) & (Message.recipient_id == item.id),
                (Message.sender_id == item.id) & (Message.recipient_id == user.id))).limit(1)))
            if related or has_messages:
                contacts.append(item)
    rows = []
    for item in contacts:
        last = db.scalar(select(Message).where(or_(
            (Message.sender_id == user.id) & (Message.recipient_id == item.id),
            (Message.sender_id == item.id) & (Message.recipient_id == user.id))).order_by(Message.created_at.desc()))
        admin_id = user.id if user.role == "super_admin" else item.id if item.role == "super_admin" else None
        locked = bool(admin_id and db.scalar(select(ChatLock).where(ChatLock.admin_id == admin_id, ChatLock.user_id == (item.id if user.role == "super_admin" else user.id), ChatLock.locked.is_(True))))
        rows.append(basic(item) | {"last_message": last.body if last else None, "last_message_at": last.created_at if last else None, "locked": locked})
    return ok(rows)

@router.patch("/admin/chat-locks/{user_id}")
def set_chat_lock(user_id: str, payload: LockUpdate, admin: User = Depends(roles("super_admin")), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target or target.id == admin.id:
        raise HTTPException(404, "کاربر یافت نشد")
    item = db.scalar(select(ChatLock).where(ChatLock.admin_id == admin.id, ChatLock.user_id == target.id))
    if item:
        item.locked = payload.locked
    else:
        item = ChatLock(admin_id=admin.id, user_id=target.id, locked=payload.locked)
        db.add(item)
    audit(db, admin.id, "admin.chat_lock_updated", "user", target.id, after={"locked": payload.locked})
    db.commit()
    return ok({"user_id": target.id, "locked": item.locked})

@router.get("/students/subscription-overview")
def student_subscription_overview(user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    subscriptions = db.scalars(select(Subscription).where(Subscription.user_id == user.id).order_by(Subscription.created_at.desc())).all()
    orders = db.scalars(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())).all()
    plans = {item.id:item for item in db.scalars(select(SubscriptionPlan).where(SubscriptionPlan.id.in_({x.plan_id for x in subscriptions + orders}))).all()} if subscriptions or orders else {}
    now = utcnow()
    current = next((item for item in subscriptions if item.status == "active" and (item.expires_at if item.expires_at.tzinfo else item.expires_at.replace(tzinfo=timezone.utc)) > now), None)
    return ok({
        "current": ({"id": current.id, "plan_name": plans[current.plan_id].name if current.plan_id in plans else "اشتراک",
            "starts_at": current.starts_at, "expires_at": current.expires_at,
            "remaining_days": max(0, ceil(((current.expires_at if current.expires_at.tzinfo else current.expires_at.replace(tzinfo=timezone.utc))-now).total_seconds()/86400)),
            "status": current.status} if current else None),
        "subscriptions": [{"id": item.id, "plan_name": plans[item.plan_id].name if item.plan_id in plans else "اشتراک", "starts_at": item.starts_at, "expires_at": item.expires_at, "status": item.status} for item in subscriptions],
        "payments": [{"id": item.id, "plan_name": plans[item.plan_id].name if item.plan_id in plans else "اشتراک", "amount": item.amount, "status": item.status, "created_at": item.created_at} for item in orders],
        "approval": {"admin": getattr(db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id)), "admin_approval_status", "pending"),
                     "advisor": getattr(db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id)), "advisor_approval_status", "pending")}
    })

@router.get("/admin/users/{user_id}/detail")
def admin_user_detail(user_id: str, admin: User = Depends(roles("super_admin", "operations_admin")), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "کاربر یافت نشد")
    profile = None
    if target.role == "student":
        item = db.scalar(select(StudentProfile).where(StudentProfile.user_id == target.id))
        if item:
            profile = {key:getattr(item,key) for key in ("education_level","grade","major","school","goal","national_code","birth_date","parent_name","parent_phone","address","average_grade7","average_grade8","average_grade9","average_grade10","average_grade11","average_grade12","advisor_selection_mode","preferred_advisor_id","registration_review_status","registration_review_note","advisor_approval_status","admin_approval_status","approval_note")}
            profile["school_schedule"] = json.loads(item.school_schedule_json or "{}")
            profile["extra_classes"] = json.loads(item.extra_classes_json or "{}")
    elif target.role == "advisor":
        item = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == target.id))
        if item:
            profile = {key:getattr(item,key) for key in ("national_code","birth_date","address","education_degree","education_field","experience_years","education_level","bio","support_capacity","academic_year","approval_status","lead_approval_status","admin_approval_status","review_note")}
            profile["documents"] = json.loads(item.documents_json or "[]")
    orders = db.scalars(select(Order).where(Order.user_id == target.id).order_by(Order.created_at.desc())).all()
    subscriptions = db.scalars(select(Subscription).where(Subscription.user_id == target.id).order_by(Subscription.created_at.desc())).all()
    plans = {item.id:item for item in db.scalars(select(SubscriptionPlan).where(SubscriptionPlan.id.in_({x.plan_id for x in subscriptions + orders}))).all()} if subscriptions or orders else {}
    assignment = db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.student_id == target.id).order_by(AdvisorAssignment.updated_at.desc())) if target.role == "student" else None
    advisor = db.get(User, assignment.advisor_id) if assignment else None
    return ok(basic(target) | {"created_at": target.created_at, "profile": profile, "advisor": basic(advisor) if advisor else None,
        "assignment": {"approval_status": assignment.approval_status, "active": assignment.active} if assignment else None,
        "payments": [{"id":x.id,"plan_name":plans[x.plan_id].name if x.plan_id in plans else "اشتراک","amount":x.amount,"status":x.status,"created_at":x.created_at} for x in orders],
        "subscriptions": [{"id":x.id,"plan_name":plans[x.plan_id].name if x.plan_id in plans else "اشتراک","starts_at":x.starts_at,"expires_at":x.expires_at,"status":x.status} for x in subscriptions]})

@router.patch("/admin/students/{student_id}/registration-approval")
def admin_student_approval(student_id: str, payload: StudentApprovalUpdate, admin: User = Depends(roles("super_admin", "operations_admin")), db: Session = Depends(get_db)):
    student = db.get(User, student_id)
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student_id))
    if not student or student.role != "student" or not profile:
        raise HTTPException(404, "پرونده دانش‌آموز یافت نشد")
    if payload.status == "rejected" and not payload.note.strip():
        raise HTTPException(422, "برای رد پرونده دلیل را وارد کنید")
    profile.admin_approval_status = payload.status
    profile.admin_reviewed_by = admin.id
    profile.admin_reviewed_at = utcnow()
    profile.approval_note = payload.note.strip()
    if payload.approve_as_advisor:
        assignment = db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id).order_by(AdvisorAssignment.updated_at.desc()))
        if not assignment:
            raise HTTPException(409, "ابتدا یک مشاور به دانش‌آموز تخصیص دهید")
        assignment.active = True
        assignment.approval_status = payload.status
        assignment.decided_at = utcnow()
        profile.advisor_approval_status = payload.status
        profile.advisor_reviewed_by = admin.id
        profile.advisor_reviewed_at = utcnow()
    if payload.status == "rejected":
        student.status = "onboarding_profile"
        student.onboarding_step = "profile_correction"
        profile.registration_review_note = payload.note.strip()
    else:
        finalize_student_registration(db, student, profile)
    audit(db, admin.id, "admin.student_registration_approval", "student_profile", profile.id,
        after={"status": payload.status, "approve_as_advisor": payload.approve_as_advisor}, reason=payload.note)
    db.commit()
    return ok(basic(student) | {"profile": {"admin_approval_status": profile.admin_approval_status, "advisor_approval_status": profile.advisor_approval_status}})
