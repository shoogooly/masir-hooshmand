import os
os.environ["MASIR_DATABASE_URL"] = "sqlite:///./test_masir.db"
os.environ["MASIR_ENV"] = "development"

from fastapi.testclient import TestClient
from app.main import app


def test_health():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


def test_otp_and_student_dashboard():
    with TestClient(app) as client:
        request = client.post("/api/v1/auth/request-otp", json={"phone": "09120000001"})
        assert request.json()["data"]["dev_code"] == "12345"
        login = client.post("/api/v1/auth/verify-otp", json={"phone": "09120000001", "code": "12345", "role": "student"})
        assert login.status_code == 200
        dashboard = client.get("/api/v1/students/dashboard")
        assert dashboard.status_code == 200
        assert "activities" in dashboard.json()["data"]


def test_role_isolation():
    with TestClient(app) as client:
        login = client.post("/api/v1/auth/verify-otp", json={"phone": "09120000001", "code": "12345", "role": "student"})
        csrf = login.json()["data"]["csrf_token"]
        response = client.get("/api/v1/admin/dashboard", headers={"X-CSRF-Token": csrf})
        assert response.status_code == 403
