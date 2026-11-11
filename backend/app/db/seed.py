"""Run idempotent production seed tasks before web workers start."""

from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import AcademicCalendar
from app.services import seed_database


def seed() -> int:
    with SessionLocal() as db:
        seed_database(db)
        return int(db.scalar(select(func.count()).select_from(AcademicCalendar).where(
            AcademicCalendar.title.like("%درس‌چین"),
        )) or 0)


if __name__ == "__main__":
    print(f"curriculum_calendars={seed()}")
