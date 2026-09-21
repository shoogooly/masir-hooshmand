from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import settings


class Base(DeclarativeBase):
    pass


is_sqlite = settings.database_url.startswith("sqlite")
engine_options = {"connect_args": {"check_same_thread": False}} if is_sqlite else {
    "pool_size": settings.database_pool_size,
    "max_overflow": settings.database_max_overflow,
    "pool_timeout": 30,
    "pool_recycle": 1800,
}
engine = create_engine(settings.database_url, pool_pre_ping=True, **engine_options)


if is_sqlite:
    @event.listens_for(engine, "connect")
    def configure_sqlite(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

