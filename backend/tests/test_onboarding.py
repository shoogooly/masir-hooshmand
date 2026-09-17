from fastapi.testclient import TestClient

from app.main import app


def accept_terms(client, csrf, role="student"):
    version = client.get(f"/api/v1/terms/{role}").json()["data"]["version"]
    assert client.post("/api/v1/onboarding/terms/accept", headers={"X-CSRF-Token":csrf}, json={"version":version,"accepted":True}).status_code == 200

def login_advisor(client):
    return client.post("/api/v1/auth/verify-otp", json={"phone":"09120000002","code":"123456","role":"advisor"}).json()["data"]

def decide(client, csrf, student_id, decision, note=""):
    requests = client.get("/api/v1/advisors/assignment-requests").json()["data"]
    assignment = next(row for row in requests if row["student"]["id"] == student_id)
    return client.patch(f"/api/v1/advisors/assignment-requests/{assignment['id']}",headers={"X-CSRF-Token":csrf},json={"decision":decision,"note":note})


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
        accept_terms(client, csrf)
        options = client.get("/api/v1/registrations/options").json()["data"]
        selected = client.post("/api/v1/onboarding/student/selection", headers={"X-CSRF-Token": csrf}, json={
            "plan_id": options["plans"][0]["id"], "advisor_selection_mode": "admin",
        })
        assert selected.status_code == 200
        student_id = registered.json()["data"]["user"]["id"]
        assert "signature" not in selected.json()["data"]
        assert client.get("/api/v1/onboarding/status").json()["data"]["step"] == "advisor_assignment"
        with TestClient(app) as admin, TestClient(app) as advisor:
            admin_result = admin.post("/api/v1/auth/verify-otp", json={"phone":"09120000003","code":"123456","role":"super_admin","mfa_code":"654321"})
            admin_headers = {"X-CSRF-Token":admin_result.json()["data"]["csrf_token"]}
            advisor_data = login_advisor(advisor)
            assigned = admin.post(f"/api/v1/admin/students/{student_id}/assign-advisor", headers=admin_headers, json={"advisor_id":advisor_data["user"]["id"]})
            assert assigned.status_code == 200
            approval_path = f"/api/v1/admin/students/{student_id}/registration-approval"
            assert admin.patch(approval_path, headers=admin_headers, json={"status":"approved"}).status_code == 409
            assert "payment" not in client.get("/api/v1/onboarding/status").json()["data"]
            assert decide(advisor,advisor_data["csrf_token"],student_id,"approved").status_code == 200
            status = client.get("/api/v1/onboarding/status").json()["data"]
            assert status["step"] == "payment"
            payment = status["payment"]
            assert client.post("/api/v1/onboarding/back",headers={"X-CSRF-Token":csrf}).status_code == 200
            assert client.post("/api/v1/onboarding/back",headers={"X-CSRF-Token":csrf}).status_code == 200
            assert client.post("/api/v1/payments/callback",json={"order_id":payment["order_id"],"signature":payment["signature"],"success":True}).status_code in {400,409}
            assert client.post("/api/v1/onboarding/student/selection",headers={"X-CSRF-Token":csrf},json={"plan_id":options["plans"][0]["id"],"advisor_selection_mode":"self","advisor_id":advisor_data["user"]["id"]}).status_code == 200
            assert decide(advisor,advisor_data["csrf_token"],student_id,"approved").status_code == 200
            payment = client.get("/api/v1/onboarding/status").json()["data"]["payment"]
            paid = client.post("/api/v1/payments/callback",json={"order_id":payment["order_id"],"signature":payment["signature"],"success":True})
            assert paid.status_code == 200
            assert client.get("/api/v1/onboarding/status").json()["data"]["step"] == "manager_review"
            assert client.post("/api/v1/onboarding/back",headers={"X-CSRF-Token":csrf}).status_code == 200
            status = client.get("/api/v1/onboarding/status").json()["data"]
            assert status["paid"] is True and "payment" not in status
            assert admin.patch(approval_path,headers=admin_headers,json={"status":"approved"}).status_code == 409
            assert client.post("/api/v1/onboarding/continue",headers={"X-CSRF-Token":csrf}).status_code == 200
            approval = admin.patch(approval_path,headers=admin_headers,json={"status":"approved","note":"پرونده کامل است"})
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
            "work_levels": ["upper_secondary"],
            "profile_photo": {"content_type": "image/png", "content_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="},
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
        accept_terms(student_client, csrf)
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

        student_id = registered.json()["data"]["user"]["id"]
        reason = "ظرفیت همراهی با برنامه تحصیلی شما را ندارم"
        with TestClient(app) as reviewer:
            reviewer_data = login_advisor(reviewer)
            for note in ["", "   "]:
                assert decide(reviewer, reviewer_data["csrf_token"], student_id, "rejected", note).status_code == 422
            assert decide(reviewer, reviewer_data["csrf_token"], student_id, "rejected", reason).status_code == 200
        with TestClient(app) as returning:
            login = returning.post("/api/v1/auth/login", json={"phone":invited_phone,"password":"SafePass123"})
            headers = {"X-CSRF-Token":login.json()["data"]["csrf_token"]}
            status = returning.get("/api/v1/onboarding/status").json()["data"]
            assert status["step"] == "selection"
            assert status["profile"]["approval_note"] == reason
            assert advisor_id in status["rejected_advisor_ids"]
            assert returning.post("/api/v1/onboarding/student/selection",headers=headers,json={"plan_id":plan["id"],"advisor_selection_mode":"self","advisor_id":advisor_id}).status_code == 409
            assert returning.post("/api/v1/onboarding/student/selection",headers=headers,json={"plan_id":plan["id"],"advisor_selection_mode":"admin"}).status_code == 200
            assert returning.get("/api/v1/onboarding/status").json()["data"]["step"] == "advisor_assignment"
