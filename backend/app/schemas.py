from typing import Any
from pydantic import BaseModel, Field, field_validator, model_validator


class OTPRequest(BaseModel):
    phone: str = Field(pattern=r"^09\d{9}$")


class OTPVerify(OTPRequest):
    code: str = Field(min_length=5, max_length=8)
    role: str = "student"
    mfa_code: str | None = None


def time_minutes(value: str) -> int:
    if not isinstance(value, str) or len(value) != 5 or value[2] != ":":
        raise ValueError("فرمت ساعت معتبر نیست")
    hour_text, minute_text = value.split(":")
    if not hour_text.isdigit() or not minute_text.isdigit():
        raise ValueError("فرمت ساعت معتبر نیست")
    hour, minute = int(hour_text), int(minute_text)
    if hour == 24 and minute == 0:
        return 24 * 60
    if hour > 23 or minute > 59:
        raise ValueError("ساعت واردشده معتبر نیست")
    return hour * 60 + minute

class PlanCreate(BaseModel):
    student_id: str
    title: str = Field(min_length=2, max_length=160)
    week_label: str = Field(min_length=2, max_length=60)
    days: list[dict[str, Any]] = Field(default_factory=list, min_length=1, max_length=14)
    time_slots: list[dict[str, Any]] = Field(default_factory=list, max_length=64)
    day_start_time: str = "08:00"
    day_end_time: str = "24:00"
    weekly_mission: str = Field(default="", max_length=2000)
    activities: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("activities")
    @classmethod
    def validate_activities(cls, items: list[dict[str, Any]]):
        occupied: dict[str, list[tuple[int, int]]] = {}
        for item in items:
            start, end = item.get("start_time", "08:00"), item.get("end_time", "09:00")
            start_minute, end_minute = time_minutes(start), time_minutes(end)
            if start_minute >= end_minute:
                raise ValueError("بازه زمانی فعالیت معتبر نیست")
            day = str(item.get("day", "")).strip()
            if any(start_minute < other_end and end_minute > other_start for other_start, other_end in occupied.setdefault(day, [])):
                raise ValueError("بازه‌های برنامه هم‌پوشانی دارند")
            occupied[day].append((start_minute, end_minute))
        return items

    @model_validator(mode="after")
    def validate_table(self):
        day_labels = [str(day.get("label", "")).strip() for day in self.days]
        if any(not label for label in day_labels) or len(day_labels) != len(set(day_labels)):
            raise ValueError("نام روزهای جدول باید کامل و یکتا باشد")
        range_start, range_end = time_minutes(self.day_start_time), time_minutes(self.day_end_time)
        if range_start >= range_end:
            raise ValueError("بازه کلی روز معتبر نیست")
        for item in self.activities:
            if str(item.get("day", "")).strip() not in day_labels:
                raise ValueError("روز فعالیت در جدول وجود ندارد")
            start, end = time_minutes(item.get("start_time", "")), time_minutes(item.get("end_time", ""))
            if start < range_start or end > range_end:
                raise ValueError("فعالیت خارج از بازه کلی روز است")
        return self



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
