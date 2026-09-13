from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.db.session import Base, get_db
from app.models import User, Subscription, SubscriptionPlan, Order, utcnow
from app.core.security import hash_password, create_token
from app.core.config import settings

@pytest.fixture
def access(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "access.db"), connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        student = User(id="student", phone="09123456789", full_name="Student", role="student", status="active", password_hash=hash_password("SafePass123"))
        db.add(student)
        db.add(SubscriptionPlan(id="plan", name="Monthly", period="monthly", price=100, referral_price=100, features_json="[]"))
        db.commit()
    def override():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = override
    # No lifespan: never seed or modify the real development database.
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"phone": "09123456789", "password": "SafePass123"})
    assert login.status_code == 200
    client.headers["X-CSRF-Token"] = login.json()["data"]["csrf_token"]
    try:
        yield client, factory, login
    finally:
        client.close()
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()

def add_subscription(factory, *, status="active", start=-30, end=-1, suffix=""):
    with factory() as db:
        order = Order(id="order"+suffix, user_id="student", plan_id="plan", amount=100, status="paid", idempotency_key="key"+suffix)
        db.add(order)
        db.flush()
        db.add(Subscription(id="sub"+suffix, user_id="student", plan_id="plan", order_id=order.id,
            starts_at=utcnow()+timedelta(days=start), expires_at=utcnow()+timedelta(days=end), status=status))
        db.commit()

@pytest.mark.parametrize("method,path,body", [
    ("GET", "/api/v1/plans", None),
    ("GET", "/api/v1/students/dashboard", None),
    ("GET", "/api/v1/profile", None),
    ("GET", "/api/v1/messages?counterpart_id=someone", None),
    ("GET", "/api/v1/results", None),
    ("GET", "/api/v1/insights", None),
    ("GET", "/api/v1/notifications/summary", None),
    ("GET", "/api/v1/chat/contacts", None),
    ("GET", "/api/v1/assigned-exams", None),
    ("GET", "/api/v1/assigned-exams/anything/question-file", None),
    ("GET", "/api/v1/assigned-exams/anything/lesson-file", None),
    ("GET", "/api/v1/onboarding/status", None),
    ("PATCH", "/api/v1/profile", {}),
    ("POST", "/api/v1/onboarding/student/selection", {}),
    ("GET", "/api/v1/plans?subscription_expired=false&role=super_admin", None),
])
def test_expired_student_cannot_bypass_renewal(access, method, path, body):
    client, factory, _ = access
    add_subscription(factory)
    response = client.request(method, path, json=body)
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "SUBSCRIPTION_REQUIRED"
    assert response.headers["cache-control"] == "no-store"

@pytest.mark.parametrize("status,start,end", [
    ("active", -5, -1), ("active", 1, 5), ("cancelled", -5, 5),
    ("pending_activation", -5, 5), ("active", -5, 0),
])
def test_only_current_active_subscription_unlocks(access, status, start, end):
    client, factory, _ = access
    add_subscription(factory, status=status, start=start, end=end)
    assert client.get("/api/v1/auth/me").json()["data"]["subscription_expired"] is True
    assert client.get("/api/v1/plans").status_code == 403

def test_missing_subscription_login_and_refresh_are_renewal_only(access):
    client, _, login = access
    assert login.json()["data"]["user"]["subscription_expired"] is True
    assert client.get("/api/v1/plans").status_code == 403
    refresh = client.post("/api/v1/auth/refresh")
    assert refresh.status_code == 200
    assert refresh.json()["data"]["user"]["subscription_expired"] is True
    assert client.get("/api/v1/plans").status_code == 403
    assert client.get("/api/v1/subscriptions/plans").status_code == 200
    client.headers["X-CSRF-Token"] = refresh.json()["data"]["csrf_token"]
    assert client.post("/api/v1/auth/logout").status_code == 200

def test_same_session_locks_after_admin_changes_expiry_and_unlocks_after_extension(access):
    client, factory, _ = access
    add_subscription(factory, end=5)
    assert client.get("/api/v1/plans").status_code == 200
    with factory() as db:
        db.get(Subscription, "sub").expires_at = utcnow()-timedelta(seconds=1)
        db.commit()
    assert client.get("/api/v1/plans").status_code == 403
    with factory() as db:
        db.get(Subscription, "sub").expires_at = utcnow()+timedelta(days=1)
        db.commit()
    assert client.get("/api/v1/plans").status_code == 200

def test_valid_subscription_is_not_hidden_by_newer_cancelled_one(access):
    client, factory, _ = access
    add_subscription(factory, end=2)
    add_subscription(factory, status="cancelled", end=10, suffix="other")
    assert client.get("/api/v1/plans").status_code == 200

def test_development_renewal_requires_verified_payment_and_is_idempotent(access):
    client, factory, _ = access
    add_subscription(factory)
    response = client.post("/api/v1/payments/orders", json={"plan_id":"plan","idempotency_key":"renewal"})
    assert response.status_code == 200
    order = response.json()["data"]
    assert client.get("/api/v1/plans").status_code == 403
    invalid = client.post("/api/v1/payments/callback", json={"order_id":order["order_id"],"success":True,"signature":"forged"})
    assert invalid.status_code == 400
    assert client.get("/api/v1/plans").status_code == 403
    payload = {"order_id":order["order_id"],"success":True,"signature":order["signature"]}
    assert client.post("/api/v1/payments/callback", json=payload).status_code == 200
    assert client.get("/api/v1/plans").status_code == 200
    assert client.post("/api/v1/payments/callback", json=payload).json()["data"]["duplicate"] is True
    with factory() as db:
        assert len(db.scalars(select(Subscription).where(Subscription.order_id == order["order_id"])).all()) == 1

def test_production_cannot_activate_with_mock_payment(access, monkeypatch):
    client, _, _ = access
    order = client.post("/api/v1/payments/orders", json={"plan_id":"plan","idempotency_key":"production-test"}).json()["data"]
    monkeypatch.setattr(settings, "env", "production")
    response = client.post("/api/v1/payments/callback", json={"order_id":order["order_id"],"success":True,"signature":order["signature"]})
    assert response.status_code == 503
    assert client.get("/api/v1/plans").status_code == 403
    assert client.post("/api/v1/payments/orders", json={"plan_id":"plan","idempotency_key":"new-prod"}).status_code == 503

def test_admin_and_onboarding_are_not_subscription_locked(access):
    client, factory, _ = access
    with factory() as db:
        user = db.get(User,"student")
        user.status = "onboarding_profile"
        db.commit()
    assert client.get("/api/v1/onboarding/status").status_code == 200
    assert client.get("/api/v1/plans").status_code == 403
    with factory() as db:
        user = db.get(User,"student")
        user.status = "active"
        user.role = "super_admin"
        db.commit()
    assert client.get("/api/v1/plans").status_code == 200

def test_other_users_payment_key_cannot_be_reused(access):
    client, factory, _ = access
    with factory() as db:
        db.add(User(id="other",phone="09123456788",full_name="Other",role="student",status="active"))
        db.flush()
        db.add(Order(user_id="other",plan_id="plan",amount=100,idempotency_key="owned-by-other"))
        db.commit()
    assert client.post("/api/v1/payments/orders", json={"plan_id":"plan","idempotency_key":"owned-by-other"}).status_code == 409
