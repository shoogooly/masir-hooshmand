"""The advisor overview should not issue a new report query for each student."""
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import ai_models, book_models  # noqa: F401 - register tables
from app.api.router import admin_advisors, advisor_dashboard, registration_options
from app.db.session import Base
from app.models import Activity, AdvisorAssignment, AdvisorProfile, Message, User, WeeklyPlan


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
        assert all(row["progress"] == 100 and row["last_activity"] == "تمرین" for row in response["students"])
        assert next(row for row in response["students"] if row["id"] == students[0].id)["last_message"] == "پیام دانش‌آموز"
        assert len(statements) <= 8, f"Dashboard executed {len(statements)} SQL statements for 12 students"
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
