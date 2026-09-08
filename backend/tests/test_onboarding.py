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
        assert paid.json()["data"]["user_status"] == "pending_approval"
        status = client.get("/api/v1/onboarding/status").json()["data"]
        assert status["step"] == "dual_approval"
        assert status["profile"]["admin_approval_status"] == "pending"
        assert status["profile"]["advisor_approval_status"] == "pending"

        with TestClient(app) as admin:
            admin_login = admin.post("/api/v1/auth/verify-otp", json={"phone":"09120000003","code":"123456","role":"super_admin","mfa_code":"654321"})
            admin_csrf = admin_login.json()["data"]["csrf_token"]
            advisors = admin.get("/api/v1/registrations/options").json()["data"]["advisors"]
            assigned = admin.post(f"/api/v1/admin/students/{registered.json()['data']['user']['id']}/assign-advisor", headers={"X-CSRF-Token":admin_csrf}, json={"advisor_id":advisors[0]["id"]})
            assert assigned.status_code == 200
            approval = admin.patch(f"/api/v1/admin/students/{registered.json()['data']['user']['id']}/registration-approval", headers={"X-CSRF-Token":admin_csrf}, json={"status":"approved","note":"پرونده کامل است","approve_as_advisor":False})
            assert approval.status_code == 200
            assert approval.json()["data"]["status"] == "active"

        overview = client.get("/api/v1/students/subscription-overview")
        assert overview.status_code == 200
        assert overview.json()["data"]["current"]["remaining_days"] in {30, 31}
        assert overview.json()["data"]["subscriptions"][0]["status"] == "active"


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

def test_advisor_referral_locks_selection_and_uses_referral_price():
    invited_phone = "09127778899"
    with TestClient(app) as advisor_client:
        advisor_login = advisor_client.post("/api/v1/auth/verify-otp", json={
            "phone": "09120000002", "code": "123456", "role": "advisor",
        })
        assert advisor_login.status_code == 200
        advisor_id = advisor_login.json()["data"]["user"]["id"]
        advisor_csrf = advisor_login.json()["data"]["csrf_token"]
        referral = advisor_client.post("/api/v1/advisors/referrals", headers={"X-CSRF-Token": advisor_csrf}, json={"phone": invited_phone})
        assert referral.status_code == 200
        assert referral.json()["data"]["advisor_id"] == advisor_id

    with TestClient(app) as student_client:
        registered = student_client.post("/api/v1/auth/register", json={
            "phone": invited_phone, "role": "student", "sms_code": "123456",
            "password": "SafePass123", "password_confirm": "SafePass123",
        })
        assert registered.status_code == 200
        assert registered.json()["data"]["user"]["referred_by_advisor_id"] == advisor_id
        login = student_client.post("/api/v1/auth/login", json={"phone": invited_phone, "password": "SafePass123"})
        csrf = login.json()["data"]["csrf_token"]
        schedule = {day: ["ریاضی", "فارسی", "علوم", "ورزش"] for day in ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"]}
        profile = student_client.post("/api/v1/onboarding/student/profile", headers={"X-CSRF-Token": csrf}, json={
            "full_name": "دانش آموز معرفی شده", "national_code": "1122334455", "birth_date": "1388/02/02",
            "parent_name": "ولی دانش آموز", "parent_phone": "09125556677", "address": "نشانی کامل دانش آموز معرفی شده",
            "grade": "دهم", "major": "تجربی", "school": "مدرسه معرفی", "goal": "پزشکی",
            "average_grade9": 18.5, "school_schedule": schedule, "extra_classes": {},
        })
        assert profile.status_code == 200
        options = student_client.get("/api/v1/registrations/options").json()["data"]
        plan = options["plans"][0]
        selection = student_client.post("/api/v1/onboarding/student/selection", headers={"X-CSRF-Token": csrf}, json={
            "plan_id": plan["id"], "advisor_selection_mode": "admin", "advisor_id": None,
        })
        assert selection.status_code == 200
        assert selection.json()["data"]["amount"] == plan["referral_price"]
        status = student_client.get("/api/v1/onboarding/status").json()["data"]
        assert status["referred_advisor"]["id"] == advisor_id
        assert status["profile"]["advisor_selection_mode"] == "self"
        assert status["profile"]["preferred_advisor_id"] == advisor_id
