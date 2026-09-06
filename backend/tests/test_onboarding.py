from fastapi.testclient import TestClient

from app.main import app


def test_password_registration_and_student_steps():
    with TestClient(app) as client:
        payload = {
            "phone": "09121112233", "role": "student", "sms_code": "123456",
            "password": "SafePass123", "password_confirm": "SafePass123",
        }
        assert client.post("/api/v1/auth/register", json={**payload, "sms_code": "000000"}).status_code == 400
        registered = client.post("/api/v1/auth/register", json=payload)
        assert registered.status_code == 200
        assert registered.json()["data"]["user"]["onboarding_step"] == "profile"
        assert client.get("/api/v1/auth/me").status_code == 401

        signed_in = client.post("/api/v1/auth/login", json={"phone": payload["phone"], "password": payload["password"]})
        assert signed_in.status_code == 200
        csrf = signed_in.json()["data"]["csrf_token"]
        assert client.get("/api/v1/onboarding/status").json()["data"]["step"] == "profile"
        schedule = {day: ["ریاضی", "فارسی", "علوم", "ورزش"] for day in ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"]}
        profile = client.post("/api/v1/onboarding/student/profile", headers={"X-CSRF-Token": csrf}, json={
            "full_name": "دانش آموز آزمایشی", "national_code": "1234567890", "birth_date": "1388/01/01",
            "parent_name": "ولی آزمایشی", "parent_phone": "09123334455", "address": "نشانی کامل دانش آموز آزمایشی",
            "grade": "دهم", "major": "تجربی", "school": "مدرسه نمونه", "goal": "پزشکی",
            "average_grade9": 19, "school_schedule": schedule, "extra_classes": {"شنبه": "کلاس زبان"},
        })
        assert profile.status_code == 200
        assert profile.json()["data"]["next_step"] == "terms"
        options = client.get("/api/v1/registrations/options").json()["data"]
        selected = client.post("/api/v1/onboarding/student/selection", headers={"X-CSRF-Token": csrf}, json={
            "plan_id": options["plans"][0]["id"], "advisor_selection_mode": "admin",
        })
        assert selected.status_code == 200
        payment = selected.json()["data"]
        paid = client.post("/api/v1/payments/callback", json={
            "order_id": payment["order_id"], "success": True, "signature": payment["signature"],
        })
        assert paid.status_code == 200
        assert paid.json()["data"]["user_status"] == "pending_assignment"


def test_advisor_steps_end_in_manager_review():
    with TestClient(app) as client:
        payload = {"phone": "09124445566", "role": "advisor", "sms_code": "123456", "password": "Advisor123", "password_confirm": "Advisor123"}
        assert client.post("/api/v1/auth/register", json=payload).status_code == 200
        signed_in = client.post("/api/v1/auth/login", json={"phone": payload["phone"], "password": payload["password"]})
        csrf = signed_in.json()["data"]["csrf_token"]
        document = {"kind": "مدرک", "name": "file.pdf", "content_type": "application/pdf", "content_base64": "ZmlsZS1jb250ZW50LXRlc3Q="}
        submitted = client.post("/api/v1/onboarding/advisor/profile", headers={"X-CSRF-Token": csrf}, json={
            "full_name": "مشاور آزمایشی", "national_code": "0987654321", "birth_date": "1370/01/01",
            "address": "نشانی کامل مشاور آزمایشی", "education_degree": "کارشناسی ارشد", "education_field": "مشاوره",
            "experience_years": 5, "bio": "سابقه کامل مشاوره و برنامه ریزی تحصیلی", "support_capacity": 25,
            "academic_year": "1405-1406", "documents": [document, {**document, "name": "resume.pdf"}],
            "education_level": "upper_secondary",
        })
        assert submitted.status_code == 200
        assert submitted.json()["data"]["next_step"] == "terms"
        status = client.get("/api/v1/onboarding/status").json()["data"]
        assert status["user"]["status"] == "onboarding_profile"
        assert status["profile"]["support_capacity"] == 25
