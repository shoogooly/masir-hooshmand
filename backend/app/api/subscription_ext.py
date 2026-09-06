from datetime import timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import roles
from app.db.session import get_db
from app.models import Notification, Order, Subscription, SubscriptionPlan, User, utcnow
from app.schemas import SubscriptionAdjust
from app.services import audit, payment_provider
from app.api.admin_students_ext import create_subscription, parse_expiry

router = APIRouter()


def ok(data=None):
    return {"success": True, "data": data, "meta": {}}


@router.patch("/admin/students/{student_id}/subscription-change")
def change_subscription(student_id: str, payload: SubscriptionAdjust, user: User = Depends(roles("super_admin", "operations_admin", "finance")), db: Session = Depends(get_db)):
    student = db.get(User, student_id)
    if not student or student.role != "student":
        raise HTTPException(404, "دانش‌آموز یافت نشد")
    expires = parse_expiry(payload.expires_at)
    latest = db.scalar(select(Subscription).where(Subscription.user_id == student.id).order_by(Subscription.expires_at.desc()))
    if payload.amount and payload.amount > 0:
        current_end = latest.expires_at if latest else utcnow()
        current_end = current_end if current_end.tzinfo else current_end.replace(tzinfo=timezone.utc)
        if expires <= max(current_end, utcnow()):
            raise HTTPException(422, "اشتراک پولی باید مدت فعلی را افزایش دهد")
        plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True)).order_by(SubscriptionPlan.period.desc()))
        if not plan:
            raise HTTPException(409, "طرح اشتراک فعالی وجود ندارد")
        order = Order(user_id=student.id, plan_id=plan.id, amount=payload.amount, status="pending", custom_expires_at=expires,
            idempotency_key=f"admin-offer:{student.id}:{utcnow().timestamp()}")
        db.add(order)
        db.flush()
        payment = payment_provider.create(order.id, order.amount)
        order.provider_reference = payment["signature"]
        db.add(Notification(user_id=student.id, actor_id=user.id, kind="subscription_offer", title="پیشنهاد تمدید اشتراک",
            body=f"مدیریت تمدید اشتراک به مبلغ {payload.amount:,} تومان ثبت کرده است.", link="/app/student/subscription", related_id=order.id))
        audit(db, user.id, "admin.subscription_offer_created", "order", order.id, after={"expires_at": str(expires), "amount": payload.amount})
        db.commit()
        return ok({"payment_required": True, "order_id": order.id, "expires_at": expires, "amount": order.amount})
    before = latest.expires_at if latest else None
    if latest:
        latest.expires_at = expires
        latest.status = "active"
    else:
        latest = create_subscription(db, user, student, 0, expires)
    db.add(Notification(user_id=student.id, actor_id=user.id, kind="subscription", title="مدت اشتراک تغییر کرد",
        body="مدت اشتراک شما بدون نیاز به پرداخت توسط مدیریت تغییر کرد.", link="/app/student/overview", related_id=latest.id))
    audit(db, user.id, "admin.subscription_adjusted", "subscription", latest.id, before={"expires_at": str(before)}, after={"expires_at": str(expires), "amount": 0})
    db.commit()
    return ok({"payment_required": False, "id": latest.id, "expires_at": latest.expires_at})


@router.get("/subscriptions/pending-offer")
def pending_subscription_offer(user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    order = db.scalar(select(Order).where(Order.user_id == user.id, Order.status == "pending", Order.custom_expires_at.is_not(None)).order_by(Order.created_at.desc()))
    if not order:
        return ok(None)
    return ok({"order_id": order.id, "amount": order.amount, "expires_at": order.custom_expires_at, "signature": order.provider_reference})


@router.get("/admin/financial-ledger")
def financial_ledger(user: User = Depends(roles("super_admin", "operations_admin", "finance")), db: Session = Depends(get_db)):
    orders = db.scalars(select(Order).order_by(Order.created_at.desc())).all()
    subscriptions = db.scalars(select(Subscription).order_by(Subscription.expires_at.desc())).all()
    user_ids = {item.user_id for item in orders} | {item.user_id for item in subscriptions}
    users = {item.id: item for item in db.scalars(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}
    now = utcnow()
    return ok({
        "orders": [{"id": item.id, "user_id": item.user_id, "user_name": users[item.user_id].full_name if item.user_id in users else "—",
            "amount": item.amount, "status": item.status, "created_at": item.created_at, "custom_expires_at": item.custom_expires_at} for item in orders],
        "subscriptions": [{"id": item.id, "user_id": item.user_id, "user_name": users[item.user_id].full_name if item.user_id in users else "—",
            "starts_at": item.starts_at, "expires_at": item.expires_at, "status": item.status,
            "remaining_days": max(0, ceil(((item.expires_at if item.expires_at.tzinfo else item.expires_at.replace(tzinfo=timezone.utc)) - now).total_seconds() / 86400))} for item in subscriptions],
    })
