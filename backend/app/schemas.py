from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator


class OTPRequest(BaseModel):
    phone: str = Field(pattern=r"^09\d{9}$")


class OTPVerify(OTPRequest):
    code: str = Field(min_length=5, max_length=8)
    role: str = "student"
    mfa_code: str | None = None

SCHOOL_DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"]


class RegistrationDocument(BaseModel):
    kind: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=2, max_length=160)
    content_type: str = Field(pattern=r"^(application/pdf|image/(jpeg|png|webp))$")
    content_base64: str = Field(min_length=16, max_length=5_600_000)


class StudentRegistration(OTPRequest):
    full_name: str = Field(min_length=3, max_length=120)
    national_code: str = Field(pattern=r"^\d{10}$")
    birth_date: str = Field(min_length=8, max_length=10)
    parent_name: str = Field(min_length=3, max_length=120)
    parent_phone: str = Field(pattern=r"^09\d{9}$")
    address: str = Field(min_length=10, max_length=1000)
    grade: Literal["هفتم", "هشتم", "نهم", "دهم", "یازدهم", "دوازدهم", "پشت کنکوری"]
    major: str = Field(default="عمومی", max_length=40)
    school: str = Field(min_length=2, max_length=120)
    goal: str = Field(default="", max_length=200)
    average_grade7: float | None = Field(default=None, ge=0, le=20)
    average_grade8: float | None = Field(default=None, ge=0, le=20)
    average_grade9: float | None = Field(default=None, ge=0, le=20)
    average_grade10: float | None = Field(default=None, ge=0, le=20)
    average_grade11: float | None = Field(default=None, ge=0, le=20)
    average_grade12: float | None = Field(default=None, ge=0, le=20)
    school_schedule: dict[str, list[str]] = Field(default_factory=dict)
    extra_classes: dict[str, str] = Field(default_factory=dict)
    plan_id: str
    advisor_selection_mode: Literal["self", "admin"] = "admin"
    advisor_id: str | None = None

    @model_validator(mode="after")
    def validate_student_registration(self):
        required_average = {"هشتم": self.average_grade7, "نهم": self.average_grade8,
            "دهم": self.average_grade9, "یازدهم": self.average_grade10,
            "دوازدهم": self.average_grade11, "پشت کنکوری": self.average_grade12}
        if self.grade in required_average and required_average[self.grade] is None:
            raise ValueError("معدل سال تحصیلی الزامی وارد نشده است")
        if self.grade != "پشت کنکوری":
            if any(len(self.school_schedule.get(day, [])) != 4 or any(not value.strip() for value in self.school_schedule[day]) for day in SCHOOL_DAYS):
                raise ValueError("برنامه مدرسه شنبه تا چهارشنبه باید برای هر روز چهار زنگ کامل داشته باشد")
        if self.advisor_selection_mode == "self" and not self.advisor_id:
            raise ValueError("مشاور مورد نظر را انتخاب کنید")
        return self


class AdvisorRegistration(OTPRequest):
    full_name: str = Field(min_length=3, max_length=120)
    national_code: str = Field(pattern=r"^\d{10}$")
    birth_date: str = Field(min_length=8, max_length=10)
    address: str = Field(min_length=10, max_length=1000)
    education_degree: str = Field(min_length=2, max_length=80)
    education_field: str = Field(min_length=2, max_length=120)
    experience_years: int = Field(ge=0, le=60)
    bio: str = Field(min_length=20, max_length=2000)
    support_capacity: int = Field(ge=1, le=500)
    academic_year: str = Field(min_length=7, max_length=20)
    documents: list[RegistrationDocument] = Field(min_length=2, max_length=8)


class AdvisorReview(BaseModel):
    status: Literal["approved", "rejected"]
    note: str = Field(default="", max_length=1000)

class StaffCreate(BaseModel):
    phone: str = Field(pattern=r"^09\d{9}$")
    full_name: str = Field(min_length=3, max_length=120)
    role: Literal["secretary", "upper_secondary_manager", "lower_secondary_manager"]


class StaffOTPVerify(OTPRequest):
    code: str = Field(pattern=r"^\d{6}$")


class AssignmentDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str = Field(default="", max_length=500)




class AdvisorAssign(BaseModel):
    advisor_id: str


class UserStatusUpdate(BaseModel):
    status: Literal["active", "suspended", "onboarding_profile", "onboarding_selection", "pending_payment", "pending_approval", "pending_assignment"]


class AccountRegistration(OTPRequest):
    role: Literal["student", "advisor"]
    sms_code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.password_confirm:
            raise ValueError("رمز و تکرار رمز یکسان نیستند")
        return self


class PasswordLogin(OTPRequest):
    password: str = Field(min_length=8, max_length=128)


class PasswordReset(OTPRequest):
    sms_code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.password_confirm:
            raise ValueError("رمز و تکرار رمز یکسان نیستند")
        return self


class StudentOnboardingProfile(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)
    national_code: str = Field(pattern=r"^\d{10}$")
    birth_date: str = Field(min_length=8, max_length=10)
    parent_name: str = Field(min_length=3, max_length=120)
    parent_phone: str = Field(pattern=r"^09\d{9}$")
    address: str = Field(min_length=10, max_length=1000)
    grade: Literal["هفتم", "هشتم", "نهم", "دهم", "یازدهم", "دوازدهم", "پشت کنکوری"]
    major: str = Field(default="عمومی", max_length=40)
    school: str = Field(min_length=2, max_length=120)
    goal: str = Field(default="", max_length=200)
    average_grade7: float | None = Field(default=None, ge=0, le=20)
    average_grade8: float | None = Field(default=None, ge=0, le=20)
    average_grade9: float | None = Field(default=None, ge=0, le=20)
    average_grade10: float | None = Field(default=None, ge=0, le=20)
    average_grade11: float | None = Field(default=None, ge=0, le=20)
    average_grade12: float | None = Field(default=None, ge=0, le=20)
    school_schedule: dict[str, list[str]] = Field(default_factory=dict)
    extra_classes: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_profile(self):
        required_average = {"هشتم": self.average_grade7, "نهم": self.average_grade8,
            "دهم": self.average_grade9, "یازدهم": self.average_grade10,
            "دوازدهم": self.average_grade11, "پشت کنکوری": self.average_grade12}
        if self.grade in required_average and required_average[self.grade] is None:
            raise ValueError("معدل سال تحصیلی الزامی وارد نشده است")
        if self.grade != "پشت کنکوری" and any(
            len(self.school_schedule.get(day, [])) != 4 or
            any(not value.strip() for value in self.school_schedule[day]) for day in SCHOOL_DAYS):
            raise ValueError("برنامه مدرسه باید شنبه تا چهارشنبه و هر روز شامل چهار زنگ باشد")
        return self


class StudentOnboardingSelection(BaseModel):
    plan_id: str
    advisor_selection_mode: Literal["self", "admin"] = "admin"
    advisor_id: str | None = None

    @model_validator(mode="after")
    def validate_advisor(self):
        if self.advisor_selection_mode == "self" and not self.advisor_id:
            raise ValueError("مشاور مورد نظر را انتخاب کنید")
        return self


class AdvisorOnboardingProfile(BaseModel):
    education_level: Literal["lower_secondary", "upper_secondary"]
    full_name: str = Field(min_length=3, max_length=120)
    national_code: str = Field(pattern=r"^\d{10}$")
    birth_date: str = Field(min_length=8, max_length=10)
    address: str = Field(min_length=10, max_length=1000)
    education_degree: str = Field(min_length=2, max_length=80)
    education_field: str = Field(min_length=2, max_length=120)
    experience_years: int = Field(ge=0, le=60)
    bio: str = Field(min_length=20, max_length=2000)
    support_capacity: int = Field(ge=1, le=500)
    academic_year: str = Field(min_length=7, max_length=20)
    documents: list[RegistrationDocument] = Field(min_length=2, max_length=8)



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
    national_code: str | None = Field(default=None, pattern=r"^\d{10}$")
    birth_date: str | None = Field(default=None, max_length=10)
    parent_name: str | None = Field(default=None, max_length=120)
    parent_phone: str | None = Field(default=None, pattern=r"^09\d{9}$")
    address: str | None = Field(default=None, max_length=1000)
    average_grade9: float | None = Field(default=None, ge=0, le=20)
    average_grade10: float | None = Field(default=None, ge=0, le=20)
    average_grade7: float | None = Field(default=None, ge=0, le=20)
    average_grade8: float | None = Field(default=None, ge=0, le=20)
    average_grade11: float | None = Field(default=None, ge=0, le=20)
    average_grade12: float | None = Field(default=None, ge=0, le=20)
    school_schedule: dict[str, list[str]] | None = None
    extra_classes: dict[str, str] | None = None
    education_degree: str | None = Field(default=None, max_length=80)
    education_field: str | None = Field(default=None, max_length=120)
    experience_years: int | None = Field(default=None, ge=0, le=60)
    bio: str | None = Field(default=None, max_length=2000)
    support_capacity: int | None = Field(default=None, ge=1, le=500)
    academic_year: str | None = Field(default=None, max_length=20)


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

class AdvisorReferralCreate(BaseModel):
    phone: str = Field(pattern=r"^09\d{9}$")

class SubscriptionPlanUpdate(BaseModel):
    price: int = Field(ge=0, le=2_000_000_000)
    referral_price: int = Field(ge=0, le=2_000_000_000)
    active: bool = True

class FreeSubscriptionCreate(BaseModel):
    student_id: str
    expires_at: str

class TermsUpdate(BaseModel):
    student_text: str = Field(min_length=10, max_length=20000)
    advisor_text: str = Field(min_length=10, max_length=20000)

class TermsAccept(BaseModel):
    version: int = Field(ge=1)
    accepted: bool

class AdminStudentCreate(BaseModel):
    phone: str = Field(pattern=r"^09\d{9}$")
    advisor_id: str | None = None
    amount: int = Field(default=0, ge=0, le=2_000_000_000)
    expires_at: str | None = None

class SubscriptionAdjust(BaseModel):
    expires_at: str
    amount: int | None = Field(default=None, ge=0, le=2_000_000_000)
