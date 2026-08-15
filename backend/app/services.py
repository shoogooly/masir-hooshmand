from __future__ import annotations
from abc import ABC, abstractmethod
from datetime import timedelta
import hashlib
import hmac
import json
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models import Activity, AdvisorAssignment, AuditLog, Exam, Insight, Question, StudentProfile, SubscriptionPlan, User, WeeklyPlan, utcnow


class OTPProvider(ABC):
    @abstractmethod
    def send(self, phone: str) -> str: ...


class DevelopmentOTPProvider(OTPProvider):
    def send(self, phone: str) -> str:
        return "12345"


class AIProvider(ABC):
    @abstractmethod
    def suggest(self, metrics: dict) -> dict: ...


class MockAIProvider(AIProvider):
    def suggest(self, metrics: dict) -> dict:
        completion = metrics.get("completion", 0)
        return {
            "title": "تمرکز روی ثبات برنامه",
            "evidence": f"درصد اجرای برنامه در این هفته {completion}٪ بوده است.",
            "recommendation": "دو بازه ۴۵ دقیقه‌ای برای درس ضعیف‌تر اضافه و مرور شبانه کوتاه حفظ شود.",
            "confidence": 0.84,
            "provider": "mock-explainable-v1",
        }


class PaymentProvider(ABC):
    @abstractmethod
    def create(self, order_id: str, amount: int) -> dict: ...

    @abstractmethod
    def verify(self, order_id: str, success: bool, signature: str) -> bool: ...


class MockPaymentProvider(PaymentProvider):
    def create(self, order_id: str, amount: int) -> dict:
        signature = hmac.new(settings.secret_key.encode(), order_id.encode(), hashlib.sha256).hexdigest()
        return {"redirect_url": f"/mock-payment/{order_id}", "signature": signature, "amount": amount}

    def verify(self, order_id: str, success: bool, signature: str) -> bool:
        expected = hmac.new(settings.secret_key.encode(), order_id.encode(), hashlib.sha256).hexdigest()
        return success and hmac.compare_digest(expected, signature)


otp_provider = DevelopmentOTPProvider()
ai_provider = MockAIProvider()
payment_provider = MockPaymentProvider()


def audit(db: Session, actor_id: str | None, action: str, resource_type: str, resource_id: str | None = None, before: dict | None = None, after: dict | None = None, reason: str = ""):
    db.add(AuditLog(actor_id=actor_id, action=action, resource_type=resource_type, resource_id=resource_id, before_json=json.dumps(before or {}, ensure_ascii=False), after_json=json.dumps(after or {}, ensure_ascii=False), reason=reason))


def seed_database(db: Session):
    if db.scalar(select(User.id).limit(1)):
        return
    student = User(phone="09120000001", full_name="پارسا رضایی", role="student")
    advisor = User(phone="09120000002", full_name="دکتر آرمان بهرامی", role="advisor")
    admin = User(phone="09120000003", full_name="مدیر مسیر هوشمند", role="super_admin", is_admin_mfa_enabled=True, totp_secret="JBSWY3DPEHPK3PXP")
    editor = User(phone="09120000004", full_name="سارا محتوایی", role="content_editor")
    db.add_all([student, advisor, admin, editor])
    db.flush()
    db.add(StudentProfile(user_id=student.id))
    db.add(AdvisorAssignment(advisor_id=advisor.id, student_id=student.id))
    plan = WeeklyPlan(student_id=student.id, advisor_id=advisor.id, title="برنامه آمادگی هفتگی", week_label="۲۰ تا ۲۶ مرداد", status="published", published_at=utcnow())
    db.add(plan)
    db.flush()
    db.add_all([
        Activity(plan_id=plan.id, day="شنبه", subject="زیست‌شناسی", title="فصل گردش مواد + ۳۰ تست", planned_minutes=90, actual_minutes=85, test_count=30, status="completed"),
        Activity(plan_id=plan.id, day="یکشنبه", subject="شیمی", title="استوکیومتری و مرور نکات", planned_minutes=75, status="in_progress"),
        Activity(plan_id=plan.id, day="دوشنبه", subject="فیزیک", title="حرکت‌شناسی + آزمونک", planned_minutes=60, status="pending"),
    ])
    q1 = Question(author_id=editor.id, text="کدام گزینه درباره گردش خون صحیح است؟", subject="زیست‌شناسی", topic="گردش مواد", options_json=json.dumps(["الف", "ب", "ج", "د"], ensure_ascii=False), correct_index=2, explanation="گزینه ج با ساختار گردش خون سازگار است.", status="approved")
    q2 = Question(author_id=editor.id, text="حاصل واکنش موازنه‌شده کدام است؟", subject="شیمی", topic="استوکیومتری", options_json=json.dumps(["۱", "۲", "۳", "۴"], ensure_ascii=False), correct_index=1, status="approved")
    db.add_all([q1, q2])
    db.flush()
    db.add(Exam(title="آزمون جامع هفتگی", duration_minutes=45, question_ids_json=json.dumps([q1.id, q2.id]), audience_json=json.dumps([student.id])))
    db.add_all([
        Insight(student_id=student.id, kind="progress", title="روند مثبت در زیست", evidence="دقت پاسخ‌گویی طی سه آزمون ۱۲٪ رشد کرده است.", recommendation="مرور فاصله‌دار فصل گردش مواد ادامه پیدا کند.", confidence=0.91, status="approved", reviewer_id=advisor.id),
        Insight(student_id=student.id, kind="risk", title="نیاز به تثبیت فیزیک", evidence="دو فعالیت فیزیک با تاخیر ثبت شده است.", recommendation="حجم هر جلسه کمتر و تعداد مرورها بیشتر شود.", confidence=0.78),
    ])
    db.add_all([
        SubscriptionPlan(name="اشتراک ماهانه", period="monthly", price=200000, features_json=json.dumps(["برنامه هفتگی", "آزمون‌های هفتگی", "تحلیل هوشمند"], ensure_ascii=False)),
        SubscriptionPlan(name="اشتراک سالانه", period="yearly", price=1920000, features_json=json.dumps(["همه امکانات", "مشاور اختصاصی", "گزارش پیشرفته"], ensure_ascii=False)),
    ])
    audit(db, admin.id, "seed.created", "system", reason="داده نمایشی اولیه")
    db.commit()
