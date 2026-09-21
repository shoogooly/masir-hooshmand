from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import Base
from app.models import User
from app import services


def test_host_postgres_url_is_normalized():
    config = Settings(database_url="postgres://user:pass@db.example/mahyaad")
    assert config.database_url == "postgresql+psycopg://user:pass@db.example/mahyaad"


def test_production_seed_only_creates_primary_admin(tmp_path, monkeypatch):
    engine = create_engine("sqlite:///" + str(tmp_path / "production-seed.db"))
    Base.metadata.create_all(engine)
    monkeypatch.setattr(services.settings, "env", "production")
    with Session(engine) as db:
        services.seed_database(db)
        users = db.scalars(select(User)).all()
        assert [(user.phone, user.full_name, user.role) for user in users] == [
            ("09399506609", "فرید رضازاده", "super_admin")
        ]
