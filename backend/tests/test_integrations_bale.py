from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db.session import SessionLocal
from app.models import BaleAccountLink, OTPChallenge, Order, SiteSetting, Subscription, SubscriptionPlan, User
from app.core.security import hash_password
from app import integration_service, bale_service

def admin(client):
    result=client.post("/api/v1/auth/staff-login",json={"phone":"09399506609","code":"123456"})
    assert result.status_code==200
    return {"X-CSRF-Token":result.json()["data"]["csrf_token"]}

class Reply:
    def __init__(self,data):self._data=data;self.is_success=True
    def json(self):return self._data

def test_sms_ir_code_is_one_time_and_secrets_are_write_only(monkeypatch):
    sent={}
    def post(url,**kwargs):
        sent.update(kwargs["json"]);return Reply({"status":1,"message":"موفق"})
    monkeypatch.setattr(integration_service.httpx,"post",post)
    with TestClient(app) as client:
        headers=admin(client)
        configured=client.put("/api/v1/integrations/admin/settings",headers=headers,json={
          "sms_enabled":True,"sms_api_key":"sms-secret","sms_template_id":"12345","sms_parameter_name":"Code",
          "zarinpal_enabled":False,"zarinpal_merchant_id":"","zarinpal_sandbox":True,"public_url":"https://example.test"})
        assert configured.status_code==200 and "sms-secret" not in configured.text
        requested=client.post("/api/v1/auth/request-otp",json={"phone":"09399506609"})
        assert requested.status_code==200 and "dev_code" not in requested.text
        code=sent["parameters"][0]["value"]
        assert client.post("/api/v1/auth/staff-login",json={"phone":"09399506609","code":code}).status_code==200
        assert client.post("/api/v1/auth/staff-login",json={"phone":"09399506609","code":code}).status_code==400
        with SessionLocal() as db:
            assert db.get(SiteSetting,"sms_ir_api_key").value!="sms-secret"
            row=db.scalar(select(OTPChallenge).where(OTPChallenge.phone=="09399506609").order_by(OTPChallenge.created_at.desc()))
            assert row.consumed_at is not None and code not in row.code_hash
            for key in ("sms_ir_enabled","sms_ir_api_key","sms_ir_template_id","sms_ir_parameter_name"): db.delete(db.get(SiteSetting,key))
            db.commit()

def test_sms_ir_cannot_be_enabled_without_verify_template():
    with TestClient(app) as client:
        headers=admin(client)
        configured=client.put("/api/v1/integrations/admin/settings",headers=headers,json={
          "sms_enabled":True,"sms_api_key":"sms-secret","sms_template_id":"","sms_parameter_name":"Code",
          "zarinpal_enabled":False,"zarinpal_merchant_id":"","zarinpal_sandbox":True,"public_url":"https://example.test"})
        assert configured.status_code==422
        assert "Verify" in configured.json()["error"]["message"]

def test_zarinpal_amount_authority_and_server_side_verification(monkeypatch):
    calls=[]
    def post(url,**kwargs):
        calls.append((url,kwargs["json"]))
        if url.endswith("request.json"):return Reply({"data":{"code":100,"authority":"S000000000000000000000000000000001"},"errors":[]})
        return Reply({"data":{"code":100,"ref_id":987654},"errors":[]})
    monkeypatch.setattr(integration_service.httpx,"post",post)
    with TestClient(app) as client:
        headers=admin(client)
        assert client.put("/api/v1/integrations/admin/settings",headers=headers,json={
          "sms_enabled":False,"sms_api_key":"","sms_template_id":"","sms_parameter_name":"Code",
          "zarinpal_enabled":True,"zarinpal_merchant_id":"merchant-test","zarinpal_sandbox":True,
          "public_url":"https://example.test"}).status_code==200
        login=client.post("/api/v1/auth/verify-otp",json={"phone":"09120000001","code":"123456","role":"student"})
        csrf={"X-CSRF-Token":login.json()["data"]["csrf_token"]}
        with SessionLocal() as db: plan=db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True)))
        created=client.post("/api/v1/payments/orders",headers=csrf,json={"plan_id":plan.id,"idempotency_key":"zarinpal-test"})
        assert created.status_code==200 and created.json()["data"]["redirect_url"].endswith("S000000000000000000000000000000001")
        order_id=created.json()["data"]["order_id"]
        assert calls[0][1]["amount"]==plan.price*10 and calls[0][1]["currency"]=="IRR"
        callback=client.get("/api/v1/payments/zarinpal/callback",params={"order_id":order_id,"Authority":"S000000000000000000000000000000001","Status":"OK"},follow_redirects=False)
        assert callback.status_code in {302,307} and "status=success" in callback.headers["location"]
        with SessionLocal() as db:
            assert db.get(Order,order_id).status=="paid"
            assert db.scalar(select(Subscription).where(Subscription.order_id==order_id))
            for key in ("zarinpal_enabled","zarinpal_merchant_id","zarinpal_sandbox","site_public_url"): db.delete(db.get(SiteSetting,key))
            db.commit()

def test_bale_password_is_deleted_and_never_stored(monkeypatch):
    calls=[]
    monkeypatch.setattr(bale_service,"api",lambda db,method,payload=None:calls.append((method,payload)) or True)
    with TestClient(app):
        with SessionLocal() as db:
            user=User(phone="09125550000",full_name="کاربر بله",role="student",status="active",password_hash=hash_password("Secret123"))
            db.add(user);db.commit()
            bale_service.handle_message(db,{"message_id":1,"chat":{"id":7001},"text":"09125550000"})
            bale_service.handle_message(db,{"message_id":2,"chat":{"id":7001},"text":"Secret123"})
            db.commit();link=db.get(BaleAccountLink,"7001")
            assert link.user_id==user.id and link.pending_phone=="" and not hasattr(link,"password")
            assert any(method=="deleteMessage" and payload["message_id"]==2 for method,payload in calls)
def test_production_bootstrap_otp_is_limited_to_primary_admin(monkeypatch):
    class BootstrapDB:
        settings = {}
        challenge = None
        def get(self, model, key):
            return self.settings.get(key) if model is SiteSetting else None
        def scalar(self, _query):
            return None
        def add(self, value):
            self.challenge = value
        def commit(self):
            pass

    db = BootstrapDB()
    monkeypatch.setattr(integration_service.settings, "env", "production")
    monkeypatch.setattr(integration_service.settings, "sms_ir_enabled", False)
    monkeypatch.setattr(integration_service.settings, "allow_bootstrap_otp", True)
    monkeypatch.setattr(integration_service.settings, "bootstrap_admin_phone", "09399506609")

    assert integration_service._bootstrap_otp_allowed(db, "09399506609")
    assert not integration_service._bootstrap_otp_allowed(db, "09120000000")
    integration_service.send_otp(db, "09399506609", "staff")
    assert db.challenge.code_hash == integration_service._otp_hash("09399506609", "staff", "123456")

    db.settings["sms_ir_enabled"] = SiteSetting(key="sms_ir_enabled", value="false")
    assert integration_service._bootstrap_otp_allowed(db, "09399506609")
    db.settings["sms_ir_enabled"] = SiteSetting(key="sms_ir_enabled", value="true")
    assert integration_service._bootstrap_otp_allowed(db, "09399506609")
    db.settings["sms_ir_template_id"] = SiteSetting(key="sms_ir_template_id", value="12345")
    assert not integration_service._bootstrap_otp_allowed(db, "09399506609")
