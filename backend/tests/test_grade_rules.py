import pytest
from pydantic import ValidationError

from app.schemas import StudentOnboardingProfile


SCHEDULE = {day: ["درس ۱", "درس ۲", "درس ۳", "درس ۴"] for day in ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"]}
BASE = {
    "full_name": "دانش آموز تست معدل", "national_code": "1231231231", "birth_date": "1390/01/01",
    "parent_name": "ولی دانش آموز", "parent_phone": "09121231231", "address": "نشانی کامل دانش آموز برای تست",
    "school": "مدرسه نمونه", "school_schedule": SCHEDULE,
}


@pytest.mark.parametrize("grade,field", [
    ("هشتم", "average_grade7"), ("نهم", "average_grade8"), ("دهم", "average_grade9"),
    ("یازدهم", "average_grade10"), ("دوازدهم", "average_grade11"), ("پشت کنکوری", "average_grade12"),
])
def test_each_grade_requires_its_previous_required_average(grade, field):
    payload = {**BASE, "grade": grade, "major": "عمومی" if grade in {"هفتم", "هشتم", "نهم"} else "تجربی"}
    if grade == "پشت کنکوری":
        payload["school_schedule"] = {}
        payload["average_grade11"] = 18
    with pytest.raises(ValidationError):
        StudentOnboardingProfile(**payload)
    payload[field] = 18.5
    assert StudentOnboardingProfile(**payload).grade == grade


def test_seventh_grade_needs_no_average_major_or_goal():
    profile = StudentOnboardingProfile(**BASE, grade="هفتم")
    assert profile.major == "عمومی"
    assert profile.goal == ""


@pytest.mark.parametrize("grade", ["هفتم", "هشتم", "نهم", "دهم", "یازدهم", "دوازدهم", "پشت کنکوری"])
def test_school_schedule_is_optional_for_every_grade(grade):
    payload = {**BASE, "grade": grade, "major": "تجربی", "school_schedule": {}}
    payload.update({f"average_grade{n}": 18 for n in range(7, 13)})
    assert StudentOnboardingProfile(**payload).school_schedule == {}
    payload.pop("school_schedule")
    assert StudentOnboardingProfile(**payload).school_schedule == {}

@pytest.mark.parametrize("missing", ["average_grade11", "average_grade12"])
def test_postgraduate_needs_both_averages(missing):
    payload = {**BASE, "grade": "پشت کنکوری", "major": "تجربی", "average_grade11": 18, "average_grade12": 19}
    payload.pop(missing)
    with pytest.raises(ValidationError):
        StudentOnboardingProfile(**payload)
