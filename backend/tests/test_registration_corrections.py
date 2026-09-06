from fastapi.testclient import TestClient

from app.main import app


def test_student_sees_rejection_reason_and_can_correct_profile():
    phone = "09128880001"
    schedule = {day: ["ریاضی", "فارسی", "علوم", "ورزش"] for day in ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"]}
    profile = {
        "full_name": "دانش آموز اصلاحی", "national_code": "5566778899", "birth_date": "1391/01/01",
        "parent_name": "ولی دانش آموز", "parent_phone": "09128880002", "address": "نشانی کامل دانش آموز اصلاحی",
        "grade": "هفتم", "major": "عمومی", "school": "مدرسه متوسطه اول", "goal": "پیشرفت تحصیلی",
        "school_schedule": schedule, "extra_classes": {},
    }
    with TestClient(app) as student:
        registered = student.post("/api/v1/auth/register", json={
            "phone": phone, "role": "student", "sms_code": "123456",
            "password": "Student123", "password_confirm": "Student123",
        })
        student_id = registered.json()["data"]["user"]["id"]
        login = student.post("/api/v1/auth/login", json={"phone": phone, "password": "Student123"})
        csrf = login.json()["data"]["csrf_token"]
        assert student.post("/api/v1/onboarding/student/profile", headers={"X-CSRF-Token": csrf}, json=profile).status_code == 200

    with TestClient(app) as admin:
        login = admin.post("/api/v1/auth/verify-otp", json={
            "phone": "09120000003", "code": "123456", "role": "super_admin", "mfa_code": "654321",
        })
        csrf = login.json()["data"]["csrf_token"]
        endpoint = f"/api/v1/management/students/{student_id}/review"
        assert admin.patch(endpoint, headers={"X-CSRF-Token": csrf}, json={"status": "rejected", "note": ""}).status_code == 422
        rejected = admin.patch(endpoint, headers={"X-CSRF-Token": csrf}, json={"status": "rejected", "note": "نام مدرسه و نشانی را دقیق‌تر وارد کنید"})
        assert rejected.status_code == 200
        assert rejected.json()["data"]["onboarding_step"] == "profile_correction"

    with TestClient(app) as student:
        login = student.post("/api/v1/auth/login", json={"phone": phone, "password": "Student123"})
        csrf = login.json()["data"]["csrf_token"]
        status = student.get("/api/v1/onboarding/status").json()["data"]
        assert status["step"] == "profile_correction"
        assert status["profile"]["registration_review_note"] == "نام مدرسه و نشانی را دقیق‌تر وارد کنید"
        corrected = student.post("/api/v1/onboarding/student/profile", headers={"X-CSRF-Token": csrf}, json={
            **profile, "school": "مدرسه متوسطه اول نمونه", "address": "نشانی کامل و اصلاح شده دانش آموز",
        })
        assert corrected.status_code == 200
        assert corrected.json()["data"]["next_step"] == "terms"
