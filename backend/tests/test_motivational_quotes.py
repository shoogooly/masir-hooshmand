from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import jdatetime
from app.api import router as plan_router
from test_ai import env


def test_admin_quotes_are_snapshotted_on_publication_day(env, monkeypatch):
    student, advisor, admin, student_headers, advisor_headers, admin_headers, student_id, _ = env
    path = "/api/v1/admin/motivational-quotes"
    assert student.get(path, headers=student_headers).status_code == 403
    quotes = [f"انگیزه روز {day}" for day in range(1, 32)]
    saved = admin.put(path, headers=admin_headers, json={"quotes": quotes})
    assert saved.status_code == 200, saved.text
    assert admin.get(path, headers=admin_headers).json()["data"] == quotes
    assert admin.put(path, headers=admin_headers, json={"quotes": quotes[:-1]}).status_code == 422

    published_at = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(plan_router, "utcnow", lambda: published_at)
    created = advisor.post("/api/v1/plans", headers=advisor_headers, json={
        "student_id": student_id, "title": "برنامه رنگی", "week_label": "هفته آزمون",
        "days": [{"label": "شنبه"}],
        "activities": [{"day": "شنبه", "title": "فیزیک", "subject": "فیزیک",
                        "start_time": "08:00", "end_time": "09:00"}]})
    assert created.status_code == 200, created.text
    plan_id = created.json()["data"]["id"]
    published = advisor.post(f"/api/v1/plans/{plan_id}/publish", headers=advisor_headers)
    assert published.status_code == 200, published.text
    day = jdatetime.date.fromgregorian(date=published_at.astimezone(ZoneInfo("Asia/Tehran")).date()).day
    detail = student.get(f"/api/v1/plans/{plan_id}", headers=student_headers).json()["data"]
    assert detail["motivational_quote"] == quotes[day - 1]

    admin.put(path, headers=admin_headers, json={"quotes": ["جمله جدید"] * 31})
    detail = student.get(f"/api/v1/plans/{plan_id}", headers=student_headers).json()["data"]
    assert detail["motivational_quote"] == quotes[day - 1]


def test_requested_collection_has_31_days_and_installs_only_once(env):
    from app.api.motivational_quotes import install_quote_collection, read_quotes, SETTING_KEY
    from app.plan_quote_defaults import DEFAULT_QUOTES
    from app.db.session import SessionLocal
    from app.integration_service import set_value
    assert len(DEFAULT_QUOTES) == 31
    assert not any(text.startswith("از همین اول") for text in DEFAULT_QUOTES)
    with SessionLocal() as db:
        set_value(db, "plan_quotes_collection_20261121", "")
        db.commit()
        install_quote_collection(db)
        assert read_quotes(db) == DEFAULT_QUOTES
        changed = list(DEFAULT_QUOTES); changed[0] = "ویرایش مدیر"
        set_value(db, SETTING_KEY, __import__('json').dumps(changed)); db.commit()
        install_quote_collection(db)
        assert read_quotes(db) == changed
