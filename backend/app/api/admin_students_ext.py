from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import roles
from app.db.session import get_db
from app.models import AdvisorAssignment, Notification, Order, Subscription, SubscriptionPlan, User, utcnow
from app.schemas import AdminStudentCreate, AdvisorAssign, SubscriptionAdjust
from app.services import audit

router = APIRouter()


def ok(data=None):
    return {"success": True, "data": data, "meta": {}}


def parse_expiry(value: str | None):
    if not value:
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(422, "تاریخ پایان اشتراک معتبر نیست") from exc
    return result if result.tzinfo else result.replace(tzinfo=timezone.utc)


def assign_student(db: Session, admin: User, student: User, advisor_id: str | None):
    current = db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id)).all()
    for item in current:
        item.active = False
    if not advisor_id:
        return None
    advisor = db.get(User, advisor_id)
    if not advisor or advisor.role != "advisor" or advisor.status != "active":
        raise HTTPException(404, "مشاور فعال یافت نشد")
    target = next((item for item in current if item.advisor_id == advisor.id), None)
    if target:
        target.active = True
        target.approval_status = "approved"
        target.assignment_source = "admin"
        target.assigned_by = admin.id
        target.decided_at = utcnow()
    else:
        target = AdvisorAssignment(advisor_id=advisor.id, student_id=student.id, active=True, approval_status="approved", assignment_source="admin", assigned_by=admin.id, decided_at=utcnow())
        db.add(target)
    student.status = "active" if student.password_hash else "invited"
    student.onboarding_step = "completed" if student.password_hash else "account"
    return target


def create_subscription(db: Session, admin: User, student: User, amount: int, expires_at: datetime):
    if expires_at <= utcnow():
        raise HTTPException(422, "تاریخ پایان اشتراک باید در آینده باشد")
    plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True)).order_by(SubscriptionPlan.period.desc()))
    if not plan:
        raise HTTPException(409, "طرح اشتراک فعالی وجود ندارد")
    order = Order(user_id=student.id, plan_id=plan.id, amount=amount, status="paid", idempotency_key=f"admin:{student.id}:{utcnow().timestamp()}", provider_reference="admin-custom")
    db.add(order)
    db.flush()
    sub = Subscription(user_id=student.id, plan_id=plan.id, order_id=order.id, starts_at=utcnow(), expires_at=expires_at, status="active")
    db.add(sub)
    db.add(Notification(user_id=student.id, actor_id=admin.id, kind="subscription", title="اشتراک توسط مدیریت فعال شد", body="اشتراک شما تا تاریخ تعیین‌شده فعال است؛ تاریخ پایان در پنل به‌صورت شمسی نمایش داده می‌شود.", link="/app/student/overview", related_id=sub.id))
    return sub


@router.post("/admin/students/invite")
def admin_invite_student(payload: AdminStudentCreate, user: User = Depends(roles("super_admin", "operations_admin")), db: Session = Depends(get_db)):
    student = db.scalar(select(User).where(User.phone == payload.phone))
    if student and student.role != "student":
        raise HTTPException(409, "این شماره متعلق به نقش دیگری است")
    if not student:
        student = User(phone=payload.phone, full_name="دانش‌آموز معرفی‌شده توسط مدیر", role="student", status="invited", onboarding_step="account")
        db.add(student)
        db.flush()
    assignment = assign_student(db, user, student, payload.advisor_id)
    expiry = parse_expiry(payload.expires_at)
    subscription = create_subscription(db, user, student, payload.amount, expiry) if expiry else None
    audit(db, user.id, "admin.student_invited", "user", student.id, after={"advisor_id": payload.advisor_id, "amount": payload.amount, "expires_at": payload.expires_at})
    db.commit()
    return ok({"id": student.id, "phone": student.phone, "assignment_id": assignment.id if assignment else None, "subscription_id": subscription.id if subscription else None})


@router.patch("/admin/students/{student_id}/subscription")
def adjust_subscription(student_id: str, payload: SubscriptionAdjust, user: User = Depends(roles("super_admin", "operations_admin", "finance")), db: Session = Depends(get_db)):
    student = db.get(User, student_id)
    if not student or student.role != "student":
        raise HTTPException(404, "دانش‌آموز یافت نشد")
    expires = parse_expiry(payload.expires_at)
    latest = db.scalar(select(Subscription).where(Subscription.user_id == student.id).order_by(Subscription.expires_at.desc()))
    if latest:
        before = latest.expires_at
        latest.expires_at = expires
        latest.status = "active"
        if payload.amount is not None:
            order = db.get(Order, latest.order_id)
            if order:
                order.amount = payload.amount
    else:
        latest = create_subscription(db, user, student, payload.amount or 0, expires)
        before = None
    db.add(Notification(user_id=student.id, actor_id=user.id, kind="subscription", title="مدت اشتراک تغییر کرد", body="تاریخ پایان اشتراک شما توسط مدیریت تغییر کرد و در پنل به‌صورت شمسی قابل مشاهده است.", link="/app/student/overview", related_id=latest.id))
    audit(db, user.id, "admin.subscription_adjusted", "subscription", latest.id, before={"expires_at": str(before)}, after={"expires_at": str(expires), "amount": payload.amount})
    db.commit()
    return ok({"id": latest.id, "expires_at": latest.expires_at})


@router.delete("/admin/students/{student_id}/advisor")
def disconnect_advisor(student_id: str, user: User = Depends(roles("super_admin", "operations_admin")), db: Session = Depends(get_db)):
    student = db.get(User, student_id)
    if not student or student.role != "student":
        raise HTTPException(404, "دانش‌آموز یافت نشد")
    assignments = db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id, AdvisorAssignment.active.is_(True))).all()
    for item in assignments:
        item.active = False
    student.status = "pending_assignment" if student.password_hash else "invited"
    student.onboarding_step = "advisor_assignment" if student.password_hash else "account"
    audit(db, user.id, "admin.advisor_disconnected", "user", student.id)
    db.commit()
    return ok({"disconnected": len(assignments)})


@router.post("/admin/students/{student_id}/force-advisor")
def force_advisor(student_id: str, payload: AdvisorAssign, user: User = Depends(roles("super_admin", "operations_admin")), db: Session = Depends(get_db)):
    student = db.get(User, student_id)
    if not student or student.role != "student":
        raise HTTPException(404, "دانش‌آموز یافت نشد")
    target = assign_student(db, user, student, payload.advisor_id)
    audit(db, user.id, "admin.advisor_force_assigned", "user", student.id, after={"advisor_id": payload.advisor_id})
    db.commit()
    return ok({"assignment_id": target.id if target else None})
