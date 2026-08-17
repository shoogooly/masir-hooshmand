import os
import tempfile
from pathlib import Path
from uuid import uuid4
os.environ["MASIR_DATABASE_URL"] = f"sqlite:///{Path(tempfile.gettempdir()) / ('masir_test_' + uuid4().hex + '.db')}"
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


def login(client, phone):
    response = client.post("/api/v1/auth/verify-otp", json={"phone": phone, "code": "12345", "role": "student" if phone.endswith("1") else "advisor"})
    return response.json()["data"]["csrf_token"]


def test_profile_report_and_timed_plan():
    with TestClient(app) as client:
        csrf = login(client, "09120000001")
        profile = client.patch("/api/v1/profile", headers={"X-CSRF-Token": csrf}, json={"full_name": "پارسا رضایی", "grade": "دوازدهم", "major": "تجربی", "school": "نمونه", "goal": "پزشکی"})
        assert profile.status_code == 200
        report = client.get("/api/v1/students/report")
        assert report.status_code == 200
        assert report.json()["data"]["summary"]["total"] >= 1

    with TestClient(app) as client:
        csrf = login(client, "09120000002")
        dashboard = client.get("/api/v1/advisors/dashboard").json()["data"]
        student_id = dashboard["students"][0]["id"]
        plan = client.post("/api/v1/plans", headers={"X-CSRF-Token": csrf}, json={"student_id": student_id, "title": "برنامه تست", "week_label": "هفته تست", "activities": [{"day": "شنبه", "subject": "ریاضی", "title": "تمرین", "start_time": "10:00", "end_time": "11:15"}]})
        assert plan.status_code == 200
        published = client.post(f"/api/v1/plans/{plan.json()['data']['id']}/publish", headers={"X-CSRF-Token": csrf})
        assert published.json()["data"]["status"] == "published"
        overlap = client.post("/api/v1/plans", headers={"X-CSRF-Token": csrf}, json={"student_id": student_id, "title": "بد", "week_label": "هفته", "activities": [{"day": "شنبه", "subject": "الف", "title": "الف", "start_time": "10:00", "end_time": "11:00"}, {"day": "شنبه", "subject": "ب", "title": "ب", "start_time": "10:45", "end_time": "11:30"}]})
        assert overlap.status_code == 422


def test_assigned_chat_and_read_receipt():
    with TestClient(app) as student:
        csrf = login(student, "09120000001")
        advisor = student.get("/api/v1/students/advisor").json()["data"]
        sent = student.post("/api/v1/messages", headers={"X-CSRF-Token": csrf}, json={"recipient_id": advisor["id"], "body": "سلام مشاور"})
        assert sent.status_code == 200
        messages = student.get(f"/api/v1/messages?counterpart_id={advisor['id']}").json()["data"]
        assert messages[-1]["body"] == "سلام مشاور"

    with TestClient(app) as advisor_client:
        csrf = login(advisor_client, "09120000002")
        student_id = advisor_client.get("/api/v1/advisors/dashboard").json()["data"]["students"][0]["id"]
        read = advisor_client.post(f"/api/v1/messages/{student_id}/read", headers={"X-CSRF-Token": csrf})
        assert read.status_code == 200 and read.json()["data"]["read"] >= 1
