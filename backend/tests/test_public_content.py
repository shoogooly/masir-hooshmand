from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.models import Notification, User
from sqlalchemy import select


def login(client: TestClient, phone: str, role: str, mfa_code: str | None = None) -> str:
    response = client.post("/api/v1/auth/verify-otp", json={
        "phone": phone, "code": "123456", "role": role, "mfa_code": mfa_code,
    })
    assert response.status_code == 200
    return response.json()["data"]["csrf_token"]


def test_public_advisor_payload_never_exposes_private_identity_fields():
    with TestClient(app) as client:
        response = client.get("/api/v1/public/advisors")
        assert response.status_code == 200
        for advisor in response.json()["data"]:
            assert {"phone", "national_code", "address", "birth_date"}.isdisjoint(advisor)
            assert "work_levels" in advisor


def test_advisor_article_requires_admin_approval_before_publication():
    title = "مقاله چرخه تأیید آزمایشی"
    with TestClient(app) as advisor:
        csrf = login(advisor, "09120000002", "advisor")
        created = advisor.post("/api/v1/articles", headers={"X-CSRF-Token": csrf}, json={
            "title": title, "body": "این متن برای بررسی کامل چرخه تأیید و انتشار مقاله نوشته شده است.",
        })
        assert created.status_code == 200
        article = created.json()["data"]
        assert article["status"] == "pending"
        assert title not in {item["title"] for item in advisor.get("/api/v1/public/articles").json()["data"]}

    with TestClient(app) as admin:
        csrf = login(admin, "09120000003", "super_admin", "654321")
        reviewed = admin.post(f"/api/v1/admin/articles/{article['id']}/review",
                              headers={"X-CSRF-Token": csrf}, json={"status": "approved"})
        assert reviewed.status_code == 200
        assert title in {item["title"] for item in admin.get("/api/v1/public/articles").json()["data"]}


def test_admin_broadcast_targets_selected_role():
    with TestClient(app) as admin:
        csrf = login(admin, "09120000003", "super_admin", "654321")
        response = admin.post("/api/v1/admin/notifications/broadcast", headers={"X-CSRF-Token": csrf}, json={
            "audience": "students", "title": "اطلاعیه آزمایشی", "body": "این پیام فقط برای دانش‌آموزان ارسال می‌شود.",
        })
        assert response.status_code == 200
        assert response.json()["data"]["delivered"] >= 1

    with SessionLocal() as db:
        student = db.scalar(select(User).where(User.phone == "09120000001"))
        advisor = db.scalar(select(User).where(User.phone == "09120000002"))
        assert db.scalar(select(Notification).where(Notification.user_id == student.id,
                                                     Notification.title == "اطلاعیه آزمایشی")) is not None
        assert db.scalar(select(Notification).where(Notification.user_id == advisor.id,
                                                     Notification.title == "اطلاعیه آزمایشی")) is None


def test_advisor_can_change_work_levels_and_registration_options_are_filtered():
    with TestClient(app) as advisor:
        csrf = login(advisor, "09120000002", "advisor")
        profile = advisor.get("/api/v1/profile").json()["data"]
        changed = advisor.patch("/api/v1/profile", headers={"X-CSRF-Token": csrf}, json={
            "full_name": profile["full_name"], "work_levels": ["lower_secondary"],
        })
        assert changed.status_code == 200
        lower = advisor.get("/api/v1/registrations/options?education_level=lower_secondary").json()["data"]["advisors"]
        upper = advisor.get("/api/v1/registrations/options?education_level=upper_secondary").json()["data"]["advisors"]
        assert any(item["id"] == profile["id"] for item in lower)
        assert all(item["id"] != profile["id"] for item in upper)
        restored = advisor.patch("/api/v1/profile", headers={"X-CSRF-Token": csrf}, json={
            "full_name": profile["full_name"], "work_levels": ["upper_secondary"],
        })
        assert restored.status_code == 200
