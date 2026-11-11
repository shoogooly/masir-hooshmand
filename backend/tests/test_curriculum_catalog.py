from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.curriculum_catalog import build_catalog, ensure_curriculum_catalog, summarize
from app.db.session import Base
from app.models import AcademicCalendar, AcademicCalendarNode, User


def test_extracted_catalog_has_all_expected_content():
    report = summarize(build_catalog())

    assert len(report) == 6
    assert sum(row["subjects"] for row in report) == 62
    assert sum(row["chapters"] for row in report) == 439
    assert sum(row["topics"] for row in report) == 1118


def test_catalog_sync_is_idempotent_and_preserves_other_calendars(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "catalog.db"))
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        admin = User(phone="09000000000", full_name="مدیر آزمون", role="super_admin", status="active")
        db.add(admin)
        db.flush()
        unrelated = AcademicCalendar(
            grade="دوازدهم",
            major="تجربی",
            title="تقویم اختصاصی موجود",
            designer_id=admin.id,
            designer_name=admin.full_name,
            designer_role=admin.role,
        )
        db.add(unrelated)
        db.commit()

        first = ensure_curriculum_catalog(db, admin)
        versions = {
            row.id: row.version for row in db.scalars(select(AcademicCalendar).where(
                AcademicCalendar.title.like("%درس‌چین"),
            )).all()
        }
        second = ensure_curriculum_catalog(db, admin)

        assert {row["action"] for row in first} == {"created"}
        assert {row["action"] for row in second} == {"unchanged"}
        assert db.get(AcademicCalendar, unrelated.id).title == "تقویم اختصاصی موجود"
        assert db.scalar(select(func.count()).select_from(AcademicCalendar)) == 7
        assert db.scalar(select(func.count()).select_from(AcademicCalendarNode)) == 1619
        assert {
            row.id: row.version for row in db.scalars(select(AcademicCalendar).where(
                AcademicCalendar.title.like("%درس‌چین"),
            )).all()
        } == versions
