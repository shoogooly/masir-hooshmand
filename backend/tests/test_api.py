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
        assert request.json()["data"]["dev_code"] == "123456"
        login = client.post("/api/v1/auth/verify-otp", json={"phone": "09120000001", "code": "123456", "role": "student"})
        assert login.status_code == 200
        dashboard = client.get("/api/v1/students/dashboard")
        assert dashboard.status_code == 200
        assert "activities" in dashboard.json()["data"]


def test_role_isolation():
    with TestClient(app) as client:
        login = client.post("/api/v1/auth/verify-otp", json={"phone": "09120000001", "code": "123456", "role": "student"})
        csrf = login.json()["data"]["csrf_token"]
        response = client.get("/api/v1/admin/dashboard", headers={"X-CSRF-Token": csrf})
        assert response.status_code == 403


def login(client, phone):
    response = client.post("/api/v1/auth/verify-otp", json={"phone": phone, "code": "123456", "role": "student" if phone.endswith("1") else "advisor"})
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
        plan = client.post("/api/v1/plans", headers={"X-CSRF-Token": csrf}, json={"student_id": student_id, "title": "برنامه تست", "week_label": "هفته تست", "weekly_mission": "جمع‌بندی مباحث هفته", "days": [{"label": "شنبه", "date": "1405-05-27"}], "time_slots": [{"start": "10:00", "end": "11:15"}], "activities": [{"day": "شنبه", "subject": "ریاضی", "title": "تمرین", "start_time": "10:00", "end_time": "11:15"}]})
        assert plan.status_code == 200
        published = client.post(f"/api/v1/plans/{plan.json()['data']['id']}/publish", headers={"X-CSRF-Token": csrf})
        assert published.json()["data"]["status"] == "published"
        detail = client.get(f"/api/v1/plans/{plan.json()['data']['id']}").json()["data"]
        assert detail["days"] == [{"label": "شنبه", "date": "1405-05-27"}]
        assert detail["time_slots"] == [{"start": "10:00", "end": "11:15"}]
        assert detail["weekly_mission"] == "جمع‌بندی مباحث هفته"
        assert detail["activities"][0]["title"] == "تمرین"
        overlap = client.post("/api/v1/plans", headers={"X-CSRF-Token": csrf}, json={"student_id": student_id, "title": "بد", "week_label": "هفته", "days": [{"label": "شنبه", "date": ""}], "time_slots": [{"start": "10:00", "end": "11:00"}, {"start": "10:45", "end": "11:30"}], "activities": [{"day": "شنبه", "subject": "الف", "title": "الف", "start_time": "10:00", "end_time": "11:00"}, {"day": "شنبه", "subject": "ب", "title": "ب", "start_time": "10:45", "end_time": "11:30"}]})
        assert overlap.status_code == 422

    with TestClient(app) as student_client:
        login(student_client, "09120000001")
        history = student_client.get("/api/v1/plans").json()["data"]
        assert len(history) >= 2 and history[0]["week_label"] == "هفته تست"


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

def test_plan_timeline_range_validation():
    from pydantic import ValidationError
    from app.schemas import PlanCreate

    base = {
        "student_id": "student",
        "title": "برنامه خط زمانی",
        "week_label": "هفته تست",
        "days": [{"label": "شنبه", "date": "۱۴۰۵/۰۵/۲۷"}, {"label": "یکشنبه", "date": "۱۴۰۵/۰۵/۲۸"}],
        "time_slots": [],
        "day_start_time": "07:00",
        "day_end_time": "24:00",
    }
    valid = PlanCreate(**base, activities=[
        {"day": "شنبه", "title": "شروع زودتر", "start_time": "07:00", "end_time": "08:00"},
        {"day": "یکشنبه", "title": "شروع دیرتر", "start_time": "08:00", "end_time": "09:06"},
    ])
    assert valid.day_end_time == "24:00"

    try:
        PlanCreate(**base, activities=[
            {"day": "شنبه", "title": "اول", "start_time": "07:00", "end_time": "08:00"},
            {"day": "شنبه", "title": "همپوشان", "start_time": "07:30", "end_time": "08:30"},
        ])
        assert False, "overlapping ranges must be rejected"
    except ValidationError:
        pass
    try:
        PlanCreate(**base, activities=[
            {"day": "یکشنبه", "title": "خارج محدوده", "start_time": "06:45", "end_time": "08:00"},
        ])
        assert False, "out-of-range activity must be rejected"
    except ValidationError:
        pass


def test_admin_chat_is_visible_and_can_lock_replies():
    with TestClient(app) as admin:
        login_response = admin.post("/api/v1/auth/verify-otp", json={
            "phone":"09120000003","code":"123456","role":"super_admin","mfa_code":"654321"})
        csrf = login_response.json()["data"]["csrf_token"]
        contacts = admin.get("/api/v1/chat/contacts").json()["data"]
        student = next(item for item in contacts if item["phone"] == "09120000001")
        sent = admin.post("/api/v1/messages", headers={"X-CSRF-Token":csrf},
            json={"recipient_id":student["id"],"body":"پیام مستقیم مدیریت"})
        assert sent.status_code == 200
        locked = admin.patch(f"/api/v1/admin/chat-locks/{student['id']}",
            headers={"X-CSRF-Token":csrf}, json={"locked":True})
        assert locked.status_code == 200
        detail = admin.get(f"/api/v1/admin/users/{student['id']}/detail")
        assert detail.status_code == 200
        assert "payments" in detail.json()["data"] and "subscriptions" in detail.json()["data"]

    with TestClient(app) as student_client:
        csrf = login(student_client, "09120000001")
        contacts = student_client.get("/api/v1/chat/contacts").json()["data"]
        admin_user = next(item for item in contacts if item["role"] == "super_admin")
        assert admin_user["locked"] is True
        history = student_client.get(f"/api/v1/messages?counterpart_id={admin_user['id']}")
        assert any(item["body"] == "پیام مستقیم مدیریت" for item in history.json()["data"])
        blocked = student_client.post("/api/v1/messages", headers={"X-CSRF-Token":csrf},
            json={"recipient_id":admin_user["id"],"body":"پاسخ دانش‌آموز"})
        assert blocked.status_code == 403

    with TestClient(app) as admin:
        login_response = admin.post("/api/v1/auth/verify-otp", json={
            "phone":"09120000003","code":"123456","role":"super_admin","mfa_code":"654321"})
        csrf = login_response.json()["data"]["csrf_token"]
        student_id = next(item["id"] for item in admin.get("/api/v1/chat/contacts").json()["data"] if item["phone"] == "09120000001")
        assert admin.patch(f"/api/v1/admin/chat-locks/{student_id}", headers={"X-CSRF-Token":csrf}, json={"locked":False}).status_code == 200
