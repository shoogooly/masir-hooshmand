"""Permanently remove expired accounts in independent, retryable transactions."""
import logging
from datetime import timedelta, timezone

from sqlalchemy import and_, delete, or_, select, update

from app.db.session import Base, SessionLocal
from app.models import AuditLog, OTPChallenge, SiteSetting, User, utcnow

WINDOW = timedelta(hours=24)


def deadline(user):
    def aware(value):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    dates = []
    if user.deleted_at:
        dates.append(aware(user.deleted_at) + WINDOW)
    if user.restore_until:
        dates.append(aware(user.restore_until))
    return min(dates) if dates else None


def expired(now):
    return and_(User.status == "deleted", or_(
        User.restore_until <= now, User.deleted_at <= now - WINDOW))


def remove_dependencies(db, parent, condition):
    """Walk incoming foreign keys child-first. Detach attribution on surviving records."""
    private_links = {
        ("password_challenges", "user_id"), ("academic_calendars", "source_student_id"),
        ("books", "created_for_student_id"), ("bale_account_links", "user_id"),
        ("bale_account_links", "student_id"),
    }
    for child in Base.metadata.tables.values():
        owned = []
        for fk in child.foreign_keys:
            if fk.column.table is not parent:
                continue
            column = fk.parent
            matches = column.in_(select(fk.column).where(condition))
            if column.nullable and (child.name, column.name) not in private_links:
                db.execute(child.update().where(matches).values({column: None}))
            else:
                owned.append(matches)
        if owned:
            child_condition = or_(*owned)
            remove_dependencies(db, child, child_condition)
            db.execute(child.delete().where(child_condition))


def purge_account(db, user_id, now):
    claim = db.execute(update(User).where(User.id == user_id, expired(now))
                       .values(status="purging").execution_options(synchronize_session=False))
    if claim.rowcount != 1:
        return False
    target = db.get(User, user_id, populate_existing=True)
    if target.deleted_phone and target.deleted_at:
        db.execute(delete(OTPChallenge).where(OTPChallenge.phone == target.deleted_phone,
                                              OTPChallenge.created_at <= target.deleted_at))
    db.execute(delete(SiteSetting).where(SiteSetting.key == "expert_advisors:" + user_id))
    db.execute(delete(AuditLog).where(AuditLog.resource_type == "user", AuditLog.resource_id == user_id))
    users = User.__table__
    remove_dependencies(db, users, users.c.id == user_id)
    db.execute(users.delete().where(users.c.id == user_id))
    return True


def purge_worker(stop):
    while not stop.is_set():
        try:
            with SessionLocal() as db:
                ids = db.scalars(select(User.id).where(expired(utcnow()))).all()
            for user_id in ids:
                if stop.is_set():
                    return
                try:
                    with SessionLocal.begin() as db:
                        purge_account(db, user_id, utcnow())
                except Exception:
                    logging.exception("Account cleanup deferred for retry")
        except Exception:
            logging.exception("Account cleanup scan deferred for retry")
        stop.wait(30)
