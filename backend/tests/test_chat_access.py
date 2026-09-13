from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from app.main import app
from app.db.session import SessionLocal
from app.models import ChatLock, Message, ChatAccessRequest
from app.api import accounts_ext
from app import chat_access


def login(client, phone, role):
    payload = {"phone":phone,"code":"123456","role":role}
    if role == "super_admin": payload["mfa_code"] = "654321"
    data = client.post("/api/v1/auth/verify-otp",json=payload).json()["data"]
    return data["user"], {"X-CSRF-Token":data["csrf_token"]}


def test_daily_admin_chat_request_is_locked_atomic_and_persistent(subscribed_demo_student, monkeypatch):
    monkeypatch.setattr(accounts_ext,"request_day",lambda:"2040-01-01")
    with TestClient(app) as student, TestClient(app) as admin:
        student_user, headers = login(student,"09120000001","student")
        admin_user, admin_headers = login(admin,"09120000003","super_admin")
        sid, aid = student_user["id"], admin_user["id"]
        with SessionLocal() as db:
            db.execute(delete(ChatLock).where(ChatLock.user_id==sid))
            db.commit()
        def contact(client, target):
            return next(row for row in client.get("/api/v1/chat/contacts").json()["data"] if row["id"]==target)
        assert contact(student,aid)["locked"] is True
        assert contact(admin,sid)["locked"] is True
        assert student.post("/api/v1/messages",headers=headers,json={"recipient_id":aid,"body":"bypass"}).status_code == 403
        path = f"/api/v1/chat/access-requests/{aid}"
        assert student.post(path).status_code == 403
        assert admin.post(path,headers=admin_headers).status_code == 403
        # Two simultaneous clicks must produce exactly one message/request.
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _:student.post(path,headers=headers),range(2)))
        assert sorted(r.status_code for r in responses)==[200,429]
        row = contact(student,aid)
        assert row["locked"] and row["chat_requested_today"] and not row["chat_request_allowed"]
        history = admin.get(f"/api/v1/messages?counterpart_id={sid}").json()["data"]
        assert history[-1]["sender_id"] == sid
        assert student_user["full_name"] in history[-1]["body"]
        assert "فعال فرمایید" in history[-1]["body"]
        with TestClient(app) as returning:
            _, fresh_headers = login(returning,"09120000001","student")
            assert returning.post(path,headers=fresh_headers).status_code==429
        assert student.post("/api/v1/messages",headers=headers,json={"recipient_id":aid,"body":"still locked"}).status_code==403
        assert student.patch(f"/api/v1/admin/chat-locks/{sid}",headers=headers,json={"locked":False}).status_code==403
        assert admin.patch(f"/api/v1/admin/chat-locks/{sid}",headers=admin_headers,json={"locked":False}).status_code==200
        assert contact(student,aid)["locked"] is False
        assert student.post("/api/v1/messages",headers=headers,json={"recipient_id":aid,"body":"Thank you"}).status_code==200
        assert student.post(path,headers=headers).status_code==409
        assert admin.patch(f"/api/v1/admin/chat-locks/{sid}",headers=admin_headers,json={"locked":True}).status_code==200
        monkeypatch.setattr(accounts_ext,"request_day",lambda:"2040-01-02")
        assert contact(student,aid)["chat_request_allowed"] is True
        assert student.post(path,headers=headers).status_code==200
        with SessionLocal() as db:
            assert len(db.scalars(select(ChatAccessRequest).where(ChatAccessRequest.student_id==sid)).all())==2


def test_request_day_resets_at_iran_midnight(monkeypatch):
    monkeypatch.setattr(chat_access,"utcnow",lambda:datetime(2026,9,10,20,29,59,tzinfo=timezone.utc))
    assert chat_access.request_day()=="2026-09-10"
    monkeypatch.setattr(chat_access,"utcnow",lambda:datetime(2026,9,10,20,30,tzinfo=timezone.utc))
    assert chat_access.request_day()=="2026-09-11"
