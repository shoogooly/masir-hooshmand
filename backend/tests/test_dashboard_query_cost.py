"""The advisor overview should not issue a new report query for each student."""
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import ai_models, book_models  # noqa: F401 - register tables
from app.api.router import admin_advisors, advisor_dashboard, registration_options
from app.db.session import Base
from app.models import Activity, AdvisorAssignment, AdvisorProfile, Message, StudyReport, User, WeeklyPlan

def test_student_dashboard_uses_published_scheduled_days_and_saved_performance(monkeypatch):
    from app.api import router
    now = datetime(2026, 11, 24, 10, tzinfo=timezone.utc)
    monkeypatch.setattr(router, 'utcnow', lambda: now)
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        student = User(phone='09123330001', full_name='Student', role='student')
        advisor = User(phone='09123330002', full_name='Advisor', role='advisor')
        db.add_all([student, advisor]); db.flush()
        plan = WeeklyPlan(student_id=student.id, advisor_id=advisor.id, title='Published', week_label='Week', status='published', published_at=now, schedule_days_json=json.dumps([{'label':'سه‌شنبه','date':'2026-11-24'}]))
        draft = WeeklyPlan(student_id=student.id, advisor_id=advisor.id, title='Draft', week_label='Week')
        db.add_all([plan,draft]); db.flush()
        db.add_all([Activity(plan_id=plan.id,day='سه‌شنبه',subject='Math',title='Done',status='completed',actual_minutes=45),Activity(plan_id=plan.id,day='سه‌شنبه',subject='Math',title='Pending'),Activity(plan_id=draft.id,day='سه‌شنبه',subject='Math',title='Hidden',actual_minutes=999)])
        db.commit()
        data = router.student_dashboard(user=student, db=db)['data']
        assert data['progress'] == 50
        assert data['study_minutes'] == 45
        assert data['today_activity_count'] == 2
        assert data['progress_history'] == [{'date':'2026-11-24','total':2,'completed':1,'actual_minutes':45}]
    engine.dispose()


def test_advisor_dashboard_queries_stay_bounded_as_students_grow():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        advisor = User(phone="09128880000", full_name="مشاور نمونه", role="advisor")
        students = [User(phone=f"0912777{index:04d}", full_name=f"دانش‌آموز {index}", role="student")
                    for index in range(12)]
        db.add_all([advisor, *students])
        db.flush()
        for student in students:
            db.add(AdvisorAssignment(advisor_id=advisor.id, student_id=student.id, active=True))
            plan = WeeklyPlan(student_id=student.id, advisor_id=advisor.id, title="برنامه", week_label="هفته",
                              status="published", published_at=datetime.now(timezone.utc))
            db.add(plan)
            db.flush()
            db.add(Activity(plan_id=plan.id, day="شنبه", subject="ریاضی", title="تمرین", status="completed"))
        db.add(Message(sender_id=students[0].id, recipient_id=advisor.id, body="پیام دانش‌آموز"))
        db.commit()

        statements = []

        def count_query(_connection, _cursor, statement, _parameters, _context, _executemany):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", count_query)
        try:
            response = advisor_dashboard(user=advisor, db=db)["data"]
        finally:
            event.remove(engine, "before_cursor_execute", count_query)
        assert len(response["students"]) == 12
        assert all(row["plan_days_remaining"] == 7 for row in response["students"])
        assert [(week["completed"], week["total"]) for week in response["progress_history"]] == [(12, 12)]
        assert all(row["progress"] == 100 and row["last_activity"] == "تمرین" for row in response["students"])
        assert next(row for row in response["students"] if row["id"] == students[0].id)["last_message"] == "پیام دانش‌آموز"
        assert len(statements) <= 8, f"Dashboard executed {len(statements)} SQL statements for 12 students"
    engine.dispose()


def test_yesterday_indicator_uses_the_scheduled_date_and_distinct_day_key(monkeypatch):
    from app.api import router

    # On the Tehran calendar it is already Tuesday, although UTC is still Monday.
    now = datetime(2026, 11, 23, 22, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(router, "utcnow", lambda: now)
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        advisor = User(phone="09128880000", full_name="Advisor", role="advisor")
        students = [User(phone=f"0912777{i:04d}", full_name=f"Student {i}", role="student") for i in range(3)]
        db.add_all([advisor, *students])
        db.flush()
        for index, student in enumerate(students):
            db.add(AdvisorAssignment(advisor_id=advisor.id, student_id=student.id, active=True))
            plan = WeeklyPlan(
                student_id=student.id, advisor_id=advisor.id, title="Plan", week_label="Week",
                status="published", published_at=now - timedelta(days=10),
                schedule_days_json=json.dumps([
                    {"label": "دوشنبه", "date": "2026-11-16"},
                    {"label": "دوشنبه", "date": "۲۰۲۶/۱۱/۲۳", "key": "day-7"},
                ]),
            )
            db.add(plan)
            db.flush()
            if index == 0:
                db.add(StudyReport(plan_id=plan.id, scope="day:day-7", data_json='{"focus":4}'))
            elif index == 1:
                activity = Activity(plan_id=plan.id, day="day-7", subject="Physics", title="Homework")
                db.add(activity)
                db.flush()
                db.add(StudyReport(plan_id=plan.id, scope=f"activity:{activity.id}", data_json='{"status":"not_done"}'))
            else:
                db.add(StudyReport(plan_id=plan.id, scope="day:دوشنبه", data_json='{"focus":4}'))
        db.commit()
        response = advisor_dashboard(user=advisor, db=db)["data"]
        flags = {row["id"]: row["yesterday_report_submitted"] for row in response["students"]}
        assert [flags[student.id] for student in students] == [True, True, False]
    engine.dispose()


def test_admin_advisor_list_does_not_read_document_blobs():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        admin = User(phone="09128889999", full_name="مدیر", role="super_admin")
        db.add(admin)
        for index in range(12):
            advisor = User(phone=f"0912888{index:04d}", full_name=f"مشاور {index}", role="advisor")
            db.add(advisor)
            db.flush()
            db.add(AdvisorProfile(user_id=advisor.id, approval_status="approved", documents_count=2,
                                  documents_json='[{"name":"first"},{"name":"second"}]'))
        db.commit()

        statements = []

        def count_query(_connection, _cursor, statement, _parameters, _context, _executemany):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", count_query)
        try:
            advisors = admin_advisors(user=admin, db=db)["data"]
        finally:
            event.remove(engine, "before_cursor_execute", count_query)
        assert len(advisors) == 12
        assert all(row["profile"]["documents_count"] == 2 for row in advisors)
        assert len(statements) <= 3
        assert all("documents_json" not in statement for statement in statements)
        statements.clear()
        event.listen(engine, "before_cursor_execute", count_query)
        try:
            options = registration_options(db=db)["data"]
        finally:
            event.remove(engine, "before_cursor_execute", count_query)
        assert len(options["advisors"]) == 12
        assert len(statements) <= 4
        assert all("documents_json" not in statement for statement in statements)
    engine.dispose()
