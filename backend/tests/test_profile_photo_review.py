from fastapi.testclient import TestClient
import pytest

from app.main import app

pytestmark = pytest.mark.usefixtures("subscribed_demo_student")


PHOTO = {
    "content_type": "image/png",
    "content_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
}


def sign_in(client: TestClient, phone: str, role: str):
    payload = {"phone": phone, "code": "123456", "role": role}
    if role == "super_admin":
        payload["mfa_code"] = "654321"
    response = client.post("/api/v1/auth/verify-otp", json=payload)
    assert response.status_code == 200
    data = response.json()["data"]
    return data["user"], {"X-CSRF-Token": data["csrf_token"]}


def test_profile_photo_stays_pending_until_admin_approval():
    with TestClient(app) as student:
        student_user, student_headers = sign_in(student, "09120000001", "student")
        saved = student.patch(
            "/api/v1/profile",
            headers=student_headers,
            json={"full_name": student_user["full_name"], "profile_photo": PHOTO},
        )
        assert saved.status_code == 200
        profile = student.get("/api/v1/profile").json()["data"]
        assert profile["profile_photo_pending"] is True
        assert profile["pending_profile_photo"] == PHOTO
        assert profile["profile_photo"] != PHOTO

    with TestClient(app) as admin:
        _, admin_headers = sign_in(admin, "09120000003", "super_admin")
        requests = admin.get("/api/v1/admin/profile-photo-requests")
        assert requests.status_code == 200
        item = next(row for row in requests.json()["data"] if row["id"] == student_user["id"])
        assert item["pending_profile_photo"] == PHOTO
        approved = admin.patch(
            f"/api/v1/admin/users/{student_user['id']}/profile-photo-review",
            headers=admin_headers,
            json={"status": "approved"},
        )
        assert approved.status_code == 200

    with TestClient(app) as student:
        sign_in(student, "09120000001", "student")
        profile = student.get("/api/v1/profile").json()["data"]
        assert profile["profile_photo"] == PHOTO
        assert profile["pending_profile_photo"] is None
        assert profile["profile_photo_pending"] is False
