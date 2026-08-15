from typing import Any
from pydantic import BaseModel, Field


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
