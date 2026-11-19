import json
from datetime import datetime, timezone
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db.session import SessionLocal
from app.models import User, WeeklyPlan, Activity, StudyReport, BaleAccountLink, AdvisorAssignment
from app.api.plan_management import complete_draft
from app.schemas import PlanCreate
from app.bale_daily_reports import deliver_due


def test_published_revision_preserves_reports_and_nightly_is_deduplicated():
    with TestClient(app), SessionLocal() as db:
        advisor = db.scalar(select(User).where(User.phone == "09120000002"))
        student = db.scalar(select(User).where(User.phone == "09120000001"))
        plan = WeeklyPlan(student_id=student.id, advisor_id=advisor.id, status="published", title="old", week_label="week", published_at=datetime.now(timezone.utc),
            schedule_days_json=json.dumps([{"label":"شنبه","date":"1405/08/30"}]))
        db.add(plan); db.flush()
        activity = Activity(plan_id=plan.id, day="شنبه", title="old", subject="ریاضی", start_time="08:00", end_time="09:00", planned_minutes=60)
        db.add(activity); db.flush()
        activity_id = activity.id
        db.add(StudyReport(plan_id=plan.id, scope="activity:"+activity_id, data_json=json.dumps({"status":"done","question_count":10}), version=1))
        db.commit()
        payload = PlanCreate(student_id=student.id, title="revised", week_label="week", days=[{"label":"شنبه","date":"1405/08/30"}], activities=[{"id":activity_id,"day":"شنبه","title":"revised","subject":"ریاضی","start_time":"08:00","end_time":"10:00"}])
        complete_draft(plan.id, payload, advisor, db)
        assert plan.status == "published" and plan.title == "revised"
        assert plan.activities[0].id == activity_id
        assert db.get(StudyReport, (plan.id, "activity:"+activity_id)) is not None
        assignment = db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id==advisor.id,AdvisorAssignment.student_id==student.id))
        assignment.active=True; assignment.approval_status="approved"
        db.add(BaleAccountLink(chat_id="nightly-test",user_id=advisor.id,access_role="advisor",linked_at=datetime.now(timezone.utc)))
        db.commit()
        def config(db,key,default=""):
            return "true" if key=="enabled" else "test-token"
        with patch("app.bale_daily_reports.value",side_effect=config), patch("app.bale_daily_reports.send") as send:
            # Midnight Tehran, after the day whose Jalali date is 1405/08/30.
            now=datetime(2026,11,21,20,30,tzinfo=timezone.utc)
            deliver_due(db,now); first=send.call_count
            assert first > 0
            assert any("revised" in call.args[2] for call in send.call_args_list)
            deliver_due(db,now)
            assert send.call_count == first
            deliver_due(db,datetime(2026,11,22,20,30,tzinfo=timezone.utc))
            assert any("خالی" in call.args[2] for call in send.call_args_list)
