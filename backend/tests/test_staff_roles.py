from fastapi.testclient import TestClient

from app.main import app


def admin_login(client: TestClient, phone: str = "09399506609") -> str:
    response = client.post("/api/v1/auth/staff-login", json={
        "phone": phone, "code": "123456",
    })
    assert response.status_code == 200, response.text
    assert response.json()["data"]["user"]["role"] == "super_admin"
    return response.json()["data"]["csrf_token"]


def create_staff(client: TestClient, csrf: str, phone: str, role: str):
    response = client.post("/api/v1/admin/staff", headers={"X-CSRF-Token": csrf}, json={
        "phone": phone, "full_name": f"کاربر آزمایشی {role}", "role": role,
    })
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_primary_manager_and_added_managers_use_otp_only():
    with TestClient(app) as admin:
        csrf = admin_login(admin)
        created = create_staff(admin, csrf, "09127770009", "super_admin")
        assert created["role"] == "super_admin"

    with TestClient(app) as added_manager:
        denied = added_manager.post("/api/v1/auth/login", json={
            "phone": "09127770009", "password": "Any-password-123",
        })
        assert denied.status_code == 403
        assert admin_login(added_manager, "09127770009")


def test_expert_is_limited_to_assigned_advisors_and_configured_permissions():
    with TestClient(app) as admin:
        csrf = admin_login(admin)
        expert = create_staff(admin, csrf, "09127770002", "expert")
        advisors = admin.get("/api/v1/admin/advisors").json()["data"]
        advisor_id = next(item["id"] for item in advisors if item["phone"] == "09120000002")
        assigned = admin.put(
            f"/api/v1/admin/experts/{expert['id']}/advisors",
            headers={"X-CSRF-Token": csrf},
            json={"advisor_ids": [advisor_id]},
        )
        assert assigned.status_code == 200, assigned.text

    with TestClient(app) as expert_client:
        login = expert_client.post("/api/v1/auth/staff-login", json={
            "phone": "09127770002", "code": "123456",
        })
        assert login.status_code == 200
        assert expert_client.post("/api/v1/auth/login", json={
            "phone": "09127770002", "password": "Any-password-123",
        }).status_code == 403
        visible = expert_client.get("/api/v1/management/advisors")
        assert visible.status_code == 200
        assert [item["id"] for item in visible.json()["data"]] == [advisor_id]
        assert expert_client.get("/api/v1/management/students").status_code == 200
        assert expert_client.get("/api/v1/management/conversations").status_code == 200

    with TestClient(app) as admin:
        csrf = admin_login(admin)
        access = admin.get("/api/v1/admin/staff-access").json()["data"]
        matrix = access["matrix"]
        matrix["expert"]["chats"] = "none"
        changed = admin.put("/api/v1/admin/staff-access", headers={"X-CSRF-Token": csrf}, json={"matrix": matrix})
        assert changed.status_code == 200

    with TestClient(app) as expert_client:
        assert expert_client.post("/api/v1/auth/staff-login", json={
            "phone": "09127770002", "code": "123456",
        }).status_code == 200
        assert expert_client.get("/api/v1/management/conversations").status_code == 403
