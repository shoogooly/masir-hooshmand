"""Registration transitions shared by student, advisor, payment and admin endpoints."""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.security import current_account
from app.db.session import get_db
from app.models import AdvisorAssignment, AdvisorProfile, Order, StudentProfile, Subscription, SubscriptionPlan, User, utcnow
from app.services import audit, payment_provider

router = APIRouter()

def ensure_editable(user):
    if user.role not in {"student", "advisor"} or user.status in {"active", "suspended"}:
        raise HTTPException(403, "ثبت‌نام تکمیل‌شده از این مسیر قابل تغییر نیست")

def latest_order(db, user_id):
    return db.scalar(select(Order).where(Order.user_id == user_id, Order.status != "cancelled").order_by(Order.created_at.desc()))

def paid_registration(db, user_id):
    return db.scalar(select(Subscription).join(Order, Subscription.order_id == Order.id).where(
        Subscription.user_id == user_id, Order.status == "paid",
        Subscription.status.in_(["pending_activation", "active"])
    ).order_by(Subscription.created_at.desc()))

def approved_assignment(db, student):
    return db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id,
        AdvisorAssignment.active.is_(True), AdvisorAssignment.approval_status == "approved"))

def reset_student_reviews(db, student, profile):
    for assignment in db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id)).all():
        assignment.active = False
        if assignment.approval_status != "rejected":
            assignment.approval_status = "cancelled"
    profile.advisor_approval_status = "pending"
    profile.advisor_reviewed_by = None
    profile.advisor_reviewed_at = None
    profile.admin_approval_status = "pending"
    profile.admin_reviewed_by = None
    profile.admin_reviewed_at = None
    for order in db.scalars(select(Order).where(Order.user_id == student.id, Order.status.in_(["pending", "failed", "awaiting_advisor"]))).all():
        order.status = "awaiting_advisor"
        order.provider_reference = None

def request_advisor(db, student, profile, advisor_id, source="student"):
    for item in db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id)).all():
        item.active = False
        if item.approval_status != "rejected":
            item.approval_status = "cancelled"
    target = db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id, AdvisorAssignment.advisor_id == advisor_id))
    if target is None:
        target = AdvisorAssignment(student_id=student.id, advisor_id=advisor_id)
        db.add(target)
    target.active = False
    target.approval_status = "pending"
    target.assignment_source = source
    target.assigned_by = student.id
    target.decided_at = None
    profile.preferred_advisor_id = advisor_id
    profile.advisor_approval_status = "pending"
    profile.admin_approval_status = "pending"
    student.status = "pending_assignment"
    student.onboarding_step = "advisor_confirmation"
    db.flush()
    return target

def advance_student(db, student, profile=None):
    profile = profile or db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
    db.flush()
    assignment = approved_assignment(db, student)
    if not profile or profile.advisor_approval_status != "approved" or not assignment:
        student.status = "pending_assignment"
        student.onboarding_step = "advisor_confirmation" if profile and profile.preferred_advisor_id else "advisor_assignment"
        return False
    paid = paid_registration(db, student.id)
    if not paid:
        order = latest_order(db, student.id)
        if not order:
            student.status, student.onboarding_step = "onboarding_selection", "selection"
            return False
        if order.status not in {"pending", "failed", "awaiting_advisor"}:
            raise HTTPException(409, "وضعیت سفارش برای پرداخت معتبر نیست")
        if not order.provider_reference:
            payment = payment_provider.create(order.id, order.amount)
            order.provider_reference = payment["signature"]
        order.status = "pending"
        student.status, student.onboarding_step = "pending_payment", "payment"
        return False
    if profile.admin_approval_status != "approved":
        student.status, student.onboarding_step = "pending_approval", "manager_review"
        return False
    if paid.status == "pending_activation":
        plan = db.get(SubscriptionPlan, paid.plan_id)
        days = 365 if plan.period == "yearly" else 90 if plan.period in {"quarterly", "three_months"} else 30
        paid.starts_at = utcnow()
        paid.expires_at = paid.starts_at + timedelta(days=days)
        paid.status = "active"
    student.status, student.onboarding_step = "active", "completed"
    return True

@router.post("/onboarding/back")
def previous_step(user: User = Depends(current_account), db: Session = Depends(get_db)):
    ensure_editable(user)
    student_steps = {"terms":"profile", "selection":"terms", "advisor_confirmation":"selection",
        "advisor_assignment":"selection", "payment":"advisor_confirmation", "manager_review":"payment",
        "dual_approval":"selection", "profile_correction":"profile"}
    advisor_steps = {"terms":"profile", "lead_review":"terms", "manager_review":"lead_review", "rejected":"profile"}
    target = (student_steps if user.role == "student" else advisor_steps).get(user.onboarding_step)
    if not target:
        raise HTTPException(409, "مرحله قبلی در دسترس نیست")
    if user.role == "student" and target in {"selection", "terms", "profile"}:
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
        if profile:
            reset_student_reviews(db, user, profile)
    user.onboarding_step = target
    user.status = "onboarding_profile" if target in {"profile","terms"} else "onboarding_selection" if target == "selection" else "pending_approval"
    audit(db, user.id, "onboarding.previous_step", "user", user.id, after={"step": target})
    db.commit()
    return {"success":True, "data":{"next_step":target}, "meta":{}}

@router.post("/onboarding/continue")
def continue_step(user: User = Depends(current_account), db: Session = Depends(get_db)):
    ensure_editable(user)
    if user.role == "student":
        if user.onboarding_step not in {"advisor_confirmation", "payment", "manager_review"}:
            raise HTTPException(409, "ابتدا مرحله فعلی را کامل کنید")
        advance_student(db, user)
    elif user.onboarding_step == "lead_review":
        profile = db.scalar(select(AdvisorProfile).where(AdvisorProfile.user_id == user.id))
        if not profile or profile.lead_approval_status != "approved":
            raise HTTPException(409, "در انتظار تأیید مسئول مقطع")
        user.onboarding_step = "manager_review"
    else:
        raise HTTPException(409, "ابتدا مرحله فعلی را کامل کنید")
    db.commit()
    return {"success":True, "data":{"next_step":user.onboarding_step}, "meta":{}}
