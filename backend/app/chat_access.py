from datetime import timedelta, timezone
from sqlalchemy import select
from app.models import ChatLock, utcnow


def request_day():
    # A calendar day in Iran, shared by all sessions and administrators.
    return utcnow().astimezone(timezone(timedelta(hours=3, minutes=30))).date().isoformat()


def chat_locked(db, admin_id, user):
    lock = db.scalar(select(ChatLock).where(ChatLock.admin_id == admin_id, ChatLock.user_id == user.id))
    return lock.locked if lock is not None else user.role == "student"
