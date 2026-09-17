from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models import User, utcnow


def register(client: TestClient, phone: str):
    response = client.post("/api/v1/auth/register", json={
        "phone": phone,
        "role": "student",
        "sms_code": "123456",
        "password": "Student-password-123",
        "password_confirm": "Student-password-123",
    })
    assert response.status_code == 200, response.text
    return response.json()["data"]["user"]


def admin_session():
    client = TestClient(app)
    client.__enter__()
    login = client.post("/api/v1/auth/staff-login", json={"phone": "09399506609", "code": "123456"})
    assert login.status_code == 200, login.text
    return client, {"X-CSRF-Token": login.json()["data"]["csrf_token"]}


def test_deleted_account_loses_access_and_can_be_restored_for_three_days():
    phone = "09128881111"
    with TestClient(app) as student_client:
        student = register(student_client, phone)
        login = student_client.post("/api/v1/auth/login", json={
            "phone": phone, "password": "Student-password-123",
        })
        assert login.status_code == 200

        admin, headers = admin_session()
        try:
            deleted = admin.delete(f"/api/v1/admin/users/{student['id']}", headers=headers)
            assert deleted.status_code == 200, deleted.text
            payload = deleted.json()["data"]
            assert payload["status"] == "deleted"
            assert payload["phone"] == phone
            assert payload["can_restore"] is True
            assert student_client.get("/api/v1/auth/me").status_code == 401

            restored = admin.post(f"/api/v1/admin/users/{student['id']}/restore", headers=headers)
            assert restored.status_code == 200, restored.text
            assert restored.json()["data"]["phone"] == phone
            assert restored.json()["data"]["status"] == "onboarding_profile"
        finally:
            admin.__exit__(None, None, None)

        assert student_client.post("/api/v1/auth/login", json={
            "phone": phone, "password": "Student-password-123",
        }).status_code == 200


def test_deleted_phone_can_register_again_and_old_account_cannot_then_restore():
    phone = "09128881112"
    with TestClient(app) as client:
        old = register(client, phone)
        admin, headers = admin_session()
        try:
            assert admin.delete(f"/api/v1/admin/users/{old['id']}", headers=headers).status_code == 200
            fresh = register(client, phone)
            assert fresh["id"] != old["id"]
            conflict = admin.post(f"/api/v1/admin/users/{old['id']}/restore", headers=headers)
            assert conflict.status_code == 409
        finally:
            admin.__exit__(None, None, None)


def test_restore_expires_and_primary_manager_is_protected_but_other_managers_are_deletable():
    phone = "09128881113"
    with TestClient(app) as client:
        student = register(client, phone)
        admin, headers = admin_session()
        try:
            assert admin.delete(f"/api/v1/admin/users/{student['id']}", headers=headers).status_code == 200
            with SessionLocal() as db:
                target = db.get(User, student["id"])
                target.restore_until = utcnow() - timedelta(seconds=1)
                db.commit()
            assert admin.post(f"/api/v1/admin/users/{student['id']}/restore", headers=headers).status_code == 410
            manager = db_manager_id()
            assert admin.delete(f"/api/v1/admin/users/{manager}", headers=headers).status_code == 403
            created = admin.post("/api/v1/admin/staff", headers=headers, json={
                "phone": "09128881114", "full_name": "مدیر قابل حذف", "role": "super_admin",
            })
            assert created.status_code == 200
            assert admin.delete(f"/api/v1/admin/users/{created.json()['data']['id']}", headers=headers).status_code == 200
        finally:
            admin.__exit__(None, None, None)


def test_deleted_phone_is_immediately_reusable_for_a_staff_role():
    phone = "09128881115"
    with TestClient(app) as client:
        old = register(client, phone)
        admin, headers = admin_session()
        try:
            assert admin.delete(f"/api/v1/admin/users/{old['id']}", headers=headers).status_code == 200
            created = admin.post("/api/v1/admin/staff", headers=headers, json={
                "phone": phone, "full_name": "کارشناس با نقش جدید", "role": "expert",
            })
            assert created.status_code == 200, created.text
            assert created.json()["data"]["role"] == "expert"
            assert admin.post(f"/api/v1/admin/users/{old['id']}/restore", headers=headers).status_code == 409
        finally:
            admin.__exit__(None, None, None)


def test_primary_manager_and_current_manager_cannot_be_disabled():
    primary, primary_headers = admin_session()
    try:
        primary_id = db_manager_id()
        assert primary.patch(
            f"/api/v1/admin/users/{primary_id}/status",
            headers=primary_headers,
            json={"status": "suspended"},
        ).status_code == 403
        created = primary.post("/api/v1/admin/staff", headers=primary_headers, json={
            "phone": "09128881116", "full_name": "مدیر دوم", "role": "super_admin",
        })
        assert created.status_code == 200
        second_id = created.json()["data"]["id"]

        with TestClient(app) as second:
            login = second.post("/api/v1/auth/staff-login", json={
                "phone": "09128881116", "code": "123456",
            })
            second_headers = {"X-CSRF-Token": login.json()["data"]["csrf_token"]}
            assert second.patch(
                f"/api/v1/admin/users/{second_id}/status",
                headers=second_headers,
                json={"status": "suspended"},
            ).status_code == 409
            assert second.patch(
                f"/api/v1/admin/users/{primary_id}/status",
                headers=second_headers,
                json={"status": "suspended"},
            ).status_code == 403

        assert primary.patch(
            f"/api/v1/admin/users/{second_id}/status",
            headers=primary_headers,
            json={"status": "suspended"},
        ).status_code == 200
    finally:
        primary.__exit__(None, None, None)


def db_manager_id():
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.phone == "09399506609"))
