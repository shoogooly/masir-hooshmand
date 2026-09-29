import pytest
from sqlalchemy import select
from app.models import User, StudentProfile, AdvisorProfile, AdvisorAssignment, SubscriptionPlan, Subscription, Order
from app.api.onboarding_flow import advance_student
from app.services import payment_provider
from app.core.config import settings
from test_subscription_access import access


def prepare(factory, *, referred=True, enabled=True):
    with factory() as db:
        db.add(User(id="advisor", phone="09123450000", full_name="Advisor", role="advisor", status="active"))
        db.flush()
        db.add(AdvisorProfile(user_id="advisor", approval_status="approved", education_level="upper_secondary"))
        student = db.get(User, "student")
        student.status, student.onboarding_step = "onboarding_selection", "selection"
        student.terms_accepted_version = 1
        student.referred_by_advisor_id = "advisor" if referred else None
        db.add(StudentProfile(user_id=student.id, education_level="upper_secondary"))
        db.add(SubscriptionPlan(id="referral-free", name="Free", period="referral_free", price=0,
            referral_price=0, active=enabled, duration_days=12, features_json="[]"))
        db.commit()


@pytest.mark.parametrize("referred,enabled,expected", [(True, True, 200), (True, False, 404), (False, True, 403)])
def test_free_plan_visibility_and_selection_authorization(access, referred, enabled, expected):
    client, factory, _ = access
    prepare(factory, referred=referred, enabled=enabled)
    for path in ["/subscriptions/plans", "/registrations/options"]:
        data = client.get("/api/v1" + path).json()["data"]
        plans = data if isinstance(data, list) else data["plans"]
        assert "referral-free" not in [p["id"] for p in plans]
    options = client.get("/api/v1/onboarding/student/options").json()["data"]["plans"]
    assert ("referral-free" in [p["id"] for p in options]) == (referred and enabled)
    result = client.post("/api/v1/onboarding/student/selection", json={"plan_id": "referral-free", "advisor_selection_mode": "admin"})
    assert result.status_code == expected, result.text


def test_free_registration_skips_gateway_and_preserves_selected_duration(access, monkeypatch):
    client, factory, _ = access
    prepare(factory)
    monkeypatch.setattr(settings, "env", "production")
    def forbidden(*args, **kwargs):
        pytest.fail("Free registration must never contact the payment gateway")
    monkeypatch.setattr(payment_provider, "create", forbidden)
    result = client.post("/api/v1/onboarding/student/selection", json={"plan_id":"referral-free", "advisor_selection_mode":"admin"})
    assert result.status_code == 200, result.text
    assert result.json()["data"]["amount"] == 0
    assert client.post("/api/v1/onboarding/student/selection", json={"plan_id":"referral-free"}).status_code == 409
    with factory() as db:
        student = db.get(User, "student")
        profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
        assignment = db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.student_id == student.id))
        subscription = db.scalar(select(Subscription).where(Subscription.user_id == student.id))
        order = db.get(Order, subscription.order_id)
        assert order.amount == 0 and order.status == "paid"
        assert subscription.status == "pending_activation"
        plan = db.get(SubscriptionPlan, "referral-free")
        plan.duration_days, plan.active = 25, False
        profile.advisor_approval_status = "approved"
        assignment.active, assignment.approval_status = True, "approved"
        assert not advance_student(db, student, profile)
        assert student.onboarding_step == "manager_review"
        profile.admin_approval_status = "approved"
        assert advance_student(db, student, profile)
        assert student.status == "active"
        assert (subscription.expires_at - subscription.starts_at).days == 12
        first_expiry = subscription.expires_at
        assert advance_student(db, student, profile)
        assert subscription.expires_at == first_expiry
        db.commit()
    assert client.post("/api/v1/payments/orders", json={"plan_id":"referral-free", "idempotency_key":"free-renewal"}).status_code == 404


def test_admin_can_configure_free_plan_but_paid_plans_still_require_prices(access):
    client, factory, _ = access
    prepare(factory)
    with factory() as db:
        user = db.get(User, "student")
        user.role, user.status = "super_admin", "active"
        db.commit()
    path = "/api/v1/admin/subscription-plans/referral-free"
    for days in [0, -1, 3651]:
        assert client.patch(path, json={"price":0,"referral_price":0,"active":True,"duration_days":days}).status_code == 422
    saved = client.patch(path, json={"price":0,"referral_price":0,"active":True,"duration_days":20})
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["duration_days"] == 20
    assert client.patch(path, json={"price":10,"referral_price":0,"duration_days":20}).status_code == 422
    assert client.patch("/api/v1/admin/subscription-plans/plan", json={"price":0,"referral_price":0,"active":True}).status_code == 422
    assert client.patch(path, json={"price":0,"referral_price":0,"active":False,"duration_days":20}).status_code == 200
