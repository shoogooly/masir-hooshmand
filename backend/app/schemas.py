from typing import Any
from pydantic import BaseModel, Field, field_validator


class OTPRequest(BaseModel):
    phone: str = Field(pattern=r"^09\d{9}$")


class OTPVerify(OTPRequest):
    code: str = Field(min_length=5, max_length=8)
    role: str = "student"
    mfa_code: str | None = None


class PlanCreate(BaseModel):
    student_id: str
    title: str
    week_label: str
    activities: list[dict[str, Any]] = []

    @field_validator("activities")
    @classmethod
    def validate_activities(cls, items: list[dict[str, Any]]):
        occupied: dict[str, list[tuple[str, str]]] = {}
        for item in items:
            start, end = item.get("start_time", "08:00"), item.get("end_time", "09:00")
            if not isinstance(start, str) or not isinstance(end, str) or len(start) != 5 or len(end) != 5 or start >= end:
                raise ValueError("بازه زمانی فعالیت معتبر نیست")
            if any(not part.isdigit() for part in start.split(":") + end.split(":")):
                raise ValueError("فرمت ساعت معتبر نیست")
            sh, sm = map(int, start.split(":")); eh, em = map(int, end.split(":"))
            if sh > 23 or eh > 23 or sm > 59 or em > 59 or sm % 15 or em % 15:
                raise ValueError("ساعت باید در بازه‌های ۱۵ دقیقه‌ای باشد")
            day = item.get("day", "شنبه")
            if any(start < other_end and end > other_start for other_start, other_end in occupied.setdefault(day, [])):
                raise ValueError("بازه‌های برنامه هم‌پوشانی دارند")
            occupied[day].append((start, end))
        return items


class ActivityUpdate(BaseModel):
    status: str
    actual_minutes: int = 0
    test_count: int = 0
    note: str = ""
    idempotency_key: str


class MessageCreate(BaseModel):
    recipient_id: str
    body: str = Field(min_length=1, max_length=3000)
    internal_note: bool = False


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    grade: str | None = Field(default=None, max_length=40)
    major: str | None = Field(default=None, max_length=40)
    school: str | None = Field(default=None, max_length=120)
    goal: str | None = Field(default=None, max_length=200)


class QuestionCreate(BaseModel):
    text: str
    subject: str
    topic: str
    difficulty: str = "medium"
    options: list[str] = Field(min_length=2, max_length=6)
    correct_index: int
    explanation: str = ""


class ExamCreate(BaseModel):
    title: str
    duration_minutes: int = Field(default=30, ge=5, le=300)
    question_ids: list[str]
    audience: list[str] = []


class AnswerUpdate(BaseModel):
    question_id: str
    selected_index: int | None = None
    elapsed_seconds: int = 0
    client_version: int = 1
    idempotency_key: str


class InsightReview(BaseModel):
    status: str = Field(pattern="^(approved|rejected|edited)$")
    reason: str = ""
    recommendation: str | None = None


class OrderCreate(BaseModel):
    plan_id: str
    idempotency_key: str


class PaymentCallback(BaseModel):
    order_id: str
    success: bool
    signature: str
