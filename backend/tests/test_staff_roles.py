from fastapi.testclient import TestClient

from app.main import app


def admin_login(client: TestClient) -> str:
    response = client.post("/api/v1/auth/verify-otp", json={
        "phone": "09120000003", "code": "123456", "role": "super_admin", "mfa_code": "654321",
    })
    assert response.status_code == 200
    return response.json()["data"]["csrf_token"]


def create_staff(client: TestClient, csrf: str, phone: str, role: str):
    response = client.post("/api/v1/admin/staff", headers={"X-CSRF-Token": csrf}, json={
        "phone": phone, "full_name": f"کاربر آزمایشی {role}", "role": role,
    })
    assert response.status_code == 200
    return response.json()["data"]


def test_admin_creates_staff_and_role_is_inferred_from_phone():
    with TestClient(app) as admin:
        csrf = admin_login(admin)
        create_staff(admin, csrf, "09127770001", "secretary")
        create_staff(admin, csrf, "09127770002", "upper_secondary_manager")

    with TestClient(app) as secretary:
        assert secretary.post("/api/v1/auth/request-otp", json={"phone": "09127770001"}).status_code == 200
        login = secretary.post("/api/v1/auth/staff-login", json={"phone": "09127770001", "code": "123456"})
        assert login.status_code == 200
        assert login.json()["data"]["user"]["role"] == "secretary"
        assert secretary.get("/api/v1/plans").status_code == 200
        assert secretary.get("/api/v1/management/conversations").status_code == 403

    with TestClient(app) as manager:
        login = manager.post("/api/v1/auth/staff-login", json={"phone": "09127770002", "code": "123456"})
        assert login.status_code == 200
        assert manager.get("/api/v1/management/conversations").status_code == 200
        advisors = manager.get("/api/v1/management/advisors").json()["data"]
        assert all(item["profile"]["education_level"] == "upper_secondary" for item in advisors)

    with TestClient(app) as unknown:
        assert unknown.post("/api/v1/auth/staff-login", json={"phone": "09127779999", "code": "123456"}).status_code == 403


def test_advisor_requires_level_manager_and_admin_approval():
    advisor_phone = "09127770003"
    with TestClient(app) as advisor:
        registered = advisor.post("/api/v1/auth/register", json={
            "phone": advisor_phone, "role": "advisor", "sms_code": "123456",
            "password": "Advisor123", "password_confirm": "Advisor123",
        })
        assert registered.status_code == 200
        advisor_id = registered.json()["data"]["user"]["id"]
        login = advisor.post("/api/v1/auth/login", json={"phone": advisor_phone, "password": "Advisor123"})
        csrf = login.json()["data"]["csrf_token"]
        document = {"kind": "مدرک", "name": "file.pdf", "content_type": "application/pdf", "content_base64": "ZmlsZS1jb250ZW50LXRlc3Q="}
        submitted = advisor.post("/api/v1/onboarding/advisor/profile", headers={"X-CSRF-Token": csrf}, json={
            "full_name": "مشاور متوسطه اول", "national_code": "1122334455", "birth_date": "1375/01/01",
            "address": "نشانی کامل مشاور متوسطه اول آزمایشی", "education_level": "lower_secondary",
            "education_degree": "کارشناسی ارشد", "education_field": "مشاوره", "experience_years": 4,
            "bio": "سابقه کامل مشاوره و برنامه ریزی برای دانش آموزان متوسطه اول",
            "support_capacity": 20, "academic_year": "1405-1406",
            "documents": [document, {**document, "name": "resume.pdf"}],
        })
        assert submitted.status_code == 200
        assert submitted.json()["data"]["next_step"] == "terms"

    with TestClient(app) as admin:
        csrf = admin_login(admin)
        create_staff(admin, csrf, "09127770004", "lower_secondary_manager")

    with TestClient(app) as wrong_manager:
        login = wrong_manager.post("/api/v1/auth/staff-login", json={"phone": "09127770002", "code": "123456"})
        csrf = login.json()["data"]["csrf_token"]
        forbidden = wrong_manager.patch(f"/api/v1/management/advisors/{advisor_id}/review", headers={"X-CSRF-Token": csrf}, json={"status": "approved", "note": "wrong scope"})
        assert forbidden.status_code == 403

    with TestClient(app) as manager:
        login = manager.post("/api/v1/auth/staff-login", json={"phone": "09127770004", "code": "123456"})
        csrf = login.json()["data"]["csrf_token"]
        approved = manager.patch(f"/api/v1/management/advisors/{advisor_id}/review", headers={"X-CSRF-Token": csrf}, json={"status": "approved", "note": "مدارک مقطع تأیید شد"})
        assert approved.status_code == 200
        data = approved.json()["data"]
        assert data["status"] == "pending_approval"
        assert data["profile"]["lead_approval_status"] == "approved"
        assert data["profile"]["admin_approval_status"] == "pending"

    with TestClient(app) as admin:
        csrf = admin_login(admin)
        approved = admin.patch(f"/api/v1/admin/advisors/{advisor_id}/review", headers={"X-CSRF-Token": csrf}, json={"status": "approved", "note": "تأیید نهایی"})
        assert approved.status_code == 200
        assert approved.json()["data"]["status"] == "active"
        assert approved.json()["data"]["onboarding_step"] == "completed"
