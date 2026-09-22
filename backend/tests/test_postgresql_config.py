from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import Base
from app.models import SubscriptionPlan, User
from app import services


def test_host_postgres_url_is_normalized():
    config = Settings(database_url="postgres://user:pass@db.example/mahyaad")
    assert config.database_url == "postgresql+psycopg://user:pass@db.example/mahyaad"


def test_production_seed_creates_unpriced_plans_without_overwriting_prices(tmp_path, monkeypatch):
    engine = create_engine("sqlite:///" + str(tmp_path / "production-seed.db"))
    Base.metadata.create_all(engine)
    monkeypatch.setattr(services.settings, "env", "production")
    with Session(engine) as db:
        services.seed_database(db)
        users = db.scalars(select(User)).all()
        assert [(user.phone, user.full_name, user.role) for user in users] == [
            ("09399506609", "فرید رضازاده", "super_admin")
        ]
        plans = db.scalars(select(SubscriptionPlan)).all()
        assert {plan.period for plan in plans} == {"monthly", "quarterly", "yearly"}
        assert all(plan.price == 0 and plan.referral_price == 0 and not plan.active for plan in plans)
        plans[0].price = 250000
        plans[0].active = True
        db.commit()
        services.seed_database(db)
        updated = db.scalars(select(SubscriptionPlan)).all()
        assert len(updated) == 3
        assert db.get(SubscriptionPlan, plans[0].id).price == 250000
        assert db.get(SubscriptionPlan, plans[0].id).active is True

def test_postgres_url_is_built_from_separate_host_fields():
    config = Settings(
        database_url="",
        database_host="postgres.internal:5433",
        database_name="mahyaad_db",
        database_user="postgres",
        database_password="p@ss:/#?",
    )
    assert config.database_url == "postgresql+psycopg://postgres:p%40ss%3A%2F%23%3F@postgres.internal:5433/mahyaad_db"
