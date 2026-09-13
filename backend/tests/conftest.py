import os
import tempfile
from pathlib import Path
from uuid import uuid4

# All integration tests must run against disposable storage, never the local app DB.
os.environ["MASIR_DATABASE_URL"] = "sqlite:///" + str(Path(tempfile.gettempdir()) / ("masir_test_" + uuid4().hex + ".db"))
os.environ["MASIR_UPLOAD_DIR"] = str(Path(tempfile.gettempdir()) / ("masir_test_uploads_" + uuid4().hex))
os.environ["MASIR_ENV"] = "development"

import pytest

@pytest.fixture
def subscribed_demo_student():
    """Existing education/chat tests require a paid, currently subscribed student."""
    from datetime import timedelta
    from fastapi.testclient import TestClient
    from sqlalchemy import select
    from app.main import app
    from app.db.session import SessionLocal
    from app.models import Order, Subscription, SubscriptionPlan, User, utcnow

    with TestClient(app):
        with SessionLocal() as db:
            student = db.scalar(select(User).where(User.phone == "09120000001"))
            if db.get(Order, "test-demo-subscription-order") is None:
                plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True)))
                db.add(Order(id="test-demo-subscription-order", user_id=student.id, plan_id=plan.id,
                    amount=plan.price, status="paid", idempotency_key="test-demo-subscription"))
                db.flush()
                db.add(Subscription(user_id=student.id, plan_id=plan.id, order_id="test-demo-subscription-order",
                    starts_at=utcnow()-timedelta(days=1), expires_at=utcnow()+timedelta(days=30), status="active"))
                db.commit()
