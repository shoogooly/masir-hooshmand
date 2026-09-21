"""Create or upgrade the configured database safely.

Fresh databases receive the current SQLAlchemy schema and are stamped at the
latest Alembic revision. Existing versioned databases run normal migrations.
"""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app import ai_models, book_models, models  # noqa: F401
from app.db.session import Base, engine


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def alembic_config() -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    return config


def bootstrap() -> str:
    tables = set(inspect(engine).get_table_names())
    config = alembic_config()
    if not tables:
        Base.metadata.create_all(engine)
        command.stamp(config, "head")
        return "created"
    if "alembic_version" not in tables:
        raise RuntimeError("Database is not empty and has no Alembic version; import or stamp it manually.")
    command.upgrade(config, "head")
    return "upgraded"


if __name__ == "__main__":
    print(f"database_{bootstrap()}")
