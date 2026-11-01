from threading import Event
from datetime import timedelta
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db.session import SessionLocal
from app.models import Activity, AdvisorAssignment, BaleAccountLink, OTPChallenge, Order, SiteSetting, StudentProfile, StudyReport, Subscription, SubscriptionPlan, User, WeeklyPlan, utcnow
from app.core.security import hash_password
from app import integration_recovery, integration_service, bale_service
from app.integration_recovery import run as recover_integrations

def admin(client):
    result=client.post("/api/v1/auth/staff-login",json={"phone":"09399506609","code":"123456"})
    assert result.status_code==200
    return {"X-CSRF-Token":result.json()["data"]["csrf_token"]}

class Reply:
    def __init__(self,data):self._data=data;self.is_success=True;self.status_code=200
    def json(self):return self._data

def test_sms_ir_code_is_one_time_and_secrets_are_write_only(monkeypatch):
    sent={};done=Event()
    def post(url,**kwargs):
        sent.update(kwargs["json"]);done.set();return Reply({"status":1,"message":"موفق"})
    monkeypatch.setattr(integration_service.httpx,"post",post)
    with TestClient(app) as client:
        headers=admin(client)
        configured=client.put("/api/v1/integrations/admin/settings",headers=headers,json={
          "sms_enabled":True,"sms_api_key":"sms-secret","sms_template_id":"12345","sms_parameter_name":"Code",
          "zarinpal_enabled":False,"zarinpal_merchant_id":"","zarinpal_sandbox":True,"public_url":"https://example.test"})
        assert configured.status_code==200 and "sms-secret" not in configured.text
        requested=client.post("/api/v1/auth/request-otp",json={"phone":"09399506609"})
        assert requested.status_code==200 and "dev_code" not in requested.text
        assert done.wait(1)
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

def test_sms_ir_rejection_is_shown_and_does_not_create_otp(monkeypatch):
    monkeypatch.setattr(integration_service.httpx,"post",lambda *args,**kwargs:Reply({"status":0,"message":"قالب تأیید نشده است"}))
    with TestClient(app) as client:
        headers=admin(client)
        configured=client.put("/api/v1/integrations/admin/sms",headers=headers,json={
            "sms_enabled":True,"sms_api_key":"sms-secret","sms_template_id":"12345","sms_parameter_name":"Code"})
        assert configured.status_code==200
        result=client.post("/api/v1/auth/request-otp",json={"phone":"09121119999"})
        assert result.status_code==502
        assert "قالب تأیید نشده است" in result.json()["error"]["message"]
        with SessionLocal() as db:
            assert db.scalar(select(OTPChallenge).where(OTPChallenge.phone=="09121119999")) is None
            for key in ("sms_ir_enabled","sms_ir_api_key","sms_ir_template_id","sms_ir_parameter_name"):
                row=db.get(SiteSetting,key)
                if row:db.delete(row)
            db.commit()

def test_temporary_admin_code_only_recovers_primary_admin_and_can_be_disabled(monkeypatch):
    def rejected(*_args, **_kwargs):
        return Reply({"status":10,"message":"Invalid API key"})
    monkeypatch.setattr(integration_service.httpx,"post",rejected)
    with TestClient(app) as client:
        headers=admin(client)
        assert client.put("/api/v1/integrations/admin/sms",headers=headers,json={
            "sms_enabled":True,"sms_api_key":"bad-key","sms_template_id":"380926","sms_parameter_name":"Code"}).status_code==200
        with SessionLocal() as db:
            recover_integrations(db,enable_temporary_admin_code=True)
            for challenge in db.scalars(select(OTPChallenge).where(OTPChallenge.phone=="09399506609")).all():
                db.delete(challenge)
            db.commit()
        monkeypatch.setattr(integration_service.settings,"env","production")
        try:
            assert client.post("/api/v1/auth/request-otp",json={"phone":"09121119999"}).status_code==502
            requested=client.post("/api/v1/auth/request-otp",json={"phone":"09399506609"})
            assert requested.status_code==200 and "dev_code" not in requested.text
            monkeypatch.setattr(integration_service.settings,"env","development")
            login=client.post("/api/v1/auth/staff-login",json={"phone":"09399506609","code":"123456"})
            assert login.status_code==200
            headers={"X-CSRF-Token":login.json()["data"]["csrf_token"]}
            assert client.post("/api/v1/auth/staff-login",json={"phone":"09399506609","code":"123456"}).status_code==400
            assert client.get("/api/v1/integrations/admin/settings").json()["data"]["temporary_admin_code_active"] is True
            with SessionLocal() as db:
                # A code issued shortly before disabling must stop working immediately.
                db.add(OTPChallenge(phone="09399506609",purpose="staff",code_hash=integration_service._otp_hash("09399506609","staff","123456"),expires_at=utcnow()+timedelta(minutes=2)))
                db.commit()
            disabled=client.post("/api/v1/integrations/admin/temporary-code/disable",headers=headers)
            assert disabled.status_code==200 and disabled.json()["data"]["temporary_admin_code_active"] is False
            assert client.post("/api/v1/auth/staff-login",json={"phone":"09399506609","code":"123456"}).status_code==400
        finally:
            with SessionLocal() as db:
                for key in ("sms_ir_enabled","sms_ir_api_key","sms_ir_template_id","sms_ir_parameter_name",integration_service.TEMP_ADMIN_OTP_KEY):
                    row=db.get(SiteSetting,key)
                    if row:db.delete(row)
                db.commit()

def test_sms_and_zarinpal_settings_are_saved_independently(capsys,monkeypatch):
    with TestClient(app) as client:
        headers=admin(client)
        sms=client.put("/api/v1/integrations/admin/sms",headers=headers,json={
            "sms_enabled":True,"sms_api_key":"sms-secret","sms_template_id":"12345","sms_parameter_name":"Code"})
        assert sms.status_code==200 and sms.json()["data"]["sms_enabled"] is True
        gateway=client.put("/api/v1/integrations/admin/zarinpal",headers=headers,json={
            "zarinpal_enabled":True,"zarinpal_merchant_id":"merchant-test","zarinpal_sandbox":True,
            "public_url":"https://example.test"})
        assert gateway.status_code==200 and gateway.json()["data"]["sms_enabled"] is True
        sms=client.put("/api/v1/integrations/admin/sms",headers=headers,json={
            "sms_enabled":False,"sms_api_key":"","sms_template_id":"12345","sms_parameter_name":"Code"})
        assert sms.status_code==200 and sms.json()["data"]["zarinpal_enabled"] is True
        with SessionLocal() as db:
            recover_integrations(db,enable_sms=True,enable_zarinpal=True)
            assert db.get(SiteSetting,"sms_ir_enabled").value=="true"
            sent=[]
            monkeypatch.setattr(integration_recovery,"send_otp",lambda db,phone,purpose:sent.append((phone,purpose)))
            recover_integrations(db,sms_template="67890",sms_parameter="CODE",send_admin_code=True)
            assert db.get(SiteSetting,"sms_ir_template_id").value=="67890"
            assert sent==[("09399506609","staff")]
            assert "sms-secret" not in capsys.readouterr().out
            for key in ("sms_ir_enabled","sms_ir_api_key","sms_ir_template_id","sms_ir_parameter_name",
                        "zarinpal_enabled","zarinpal_merchant_id","zarinpal_sandbox","site_public_url"):
                row=db.get(SiteSetting,key)
                if row:db.delete(row)
            db.commit()

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
            integration_service.set_value(db,"zarinpal_sandbox","false")
            production=integration_service.create_zarinpal(db,db.get(Order,order_id),db.get(User,login.json()["data"]["user"]["id"]))
            assert calls[-1][0]=="https://api.zarinpal.com/pg/v4/payment/request.json"
            assert production["redirect_url"].startswith("https://www.zarinpal.com/pg/StartPay/")
            for key in ("zarinpal_enabled","zarinpal_merchant_id","zarinpal_sandbox","site_public_url"): db.delete(db.get(SiteSetting,key))
            db.commit()

def test_zarinpal_invalid_terminal_ip_is_explained_to_payer(monkeypatch):
    def reject(*_args, **_kwargs):
        result=Reply({"data":{},"errors":{"code":-10,"message":"Terminal ip not valid."}})
        result.is_success=False
        result.status_code=400
        return result
    monkeypatch.setattr(integration_service.httpx,"post",reject)
    with TestClient(app) as client:
        headers=admin(client)
        assert client.put("/api/v1/integrations/admin/zarinpal",headers=headers,json={
            "zarinpal_enabled":True,"zarinpal_merchant_id":"merchant-test","zarinpal_sandbox":False,
            "public_url":"https://example.test"}).status_code==200
        try:
            login=client.post("/api/v1/auth/verify-otp",json={"phone":"09120000001","code":"123456","role":"student"})
            csrf={"X-CSRF-Token":login.json()["data"]["csrf_token"]}
            with SessionLocal() as db:plan=db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True)))
            result=client.post("/api/v1/payments/orders",headers=csrf,json={"plan_id":plan.id,"idempotency_key":"zarinpal-invalid-ip"})
            assert result.status_code==424
            assert "IP خروجی سرور" in result.json()["error"]["message"]
        finally:
            with SessionLocal() as db:
                for key in ("zarinpal_enabled","zarinpal_merchant_id","zarinpal_sandbox","site_public_url"):
                    row=db.get(SiteSetting,key)
                    if row:db.delete(row)
                db.commit()

def test_bale_password_is_deleted_and_never_stored(monkeypatch):
    calls=[]
    monkeypatch.setattr(bale_service,"api",lambda db,method,payload=None:calls.append((method,payload)) or True)
    with TestClient(app):
        with SessionLocal() as db:
            user=User(phone="09125550000",full_name="کاربر بله",role="student",status="active",password_hash=hash_password("Secret123"))
            db.add(user);db.commit()
            bale_service.handle_message(db,{"message_id":0,"chat":{"id":7001},"text":"/start"})
            bale_service.handle_callback(db,{"id":"role","message":{"chat":{"id":7001}},"data":"role:student"})
            bale_service.handle_message(db,{"message_id":1,"chat":{"id":7001},"text":"09125550000"})
            bale_service.handle_message(db,{"message_id":2,"chat":{"id":7001},"text":"Secret123"})
            db.commit();link=db.get(BaleAccountLink,"7001")
            assert link.user_id==user.id and link.pending_phone=="" and not hasattr(link,"password")
            assert any(method=="deleteMessage" and payload["message_id"]==2 for method,payload in calls)

def test_bale_student_reports_sync_with_site_and_parent_advisor_can_read(monkeypatch):
    calls=[]
    monkeypatch.setattr(bale_service,"api",lambda db,method,payload=None,**kwargs:calls.append((method,payload)) or True)
    with TestClient(app):
        with SessionLocal() as db:
            student=User(phone="09125550101",full_name="دانش‌آموز همگام",role="student",status="active",password_hash=hash_password("Secret123"))
            advisor=User(phone="09125550102",full_name="مشاور همگام",role="advisor",status="active",password_hash=hash_password("Secret123"))
            db.add_all([student,advisor]);db.flush()
            db.add(StudentProfile(user_id=student.id,parent_name="والد",parent_phone="09125550103"))
            db.add(AdvisorAssignment(advisor_id=advisor.id,student_id=student.id,active=True,approval_status="approved"))
            plan=WeeklyPlan(student_id=student.id,advisor_id=advisor.id,title="برنامه همگام",week_label="هفته آزمون",status="published",
                publication_number=7,published_at=utcnow(),schedule_days_json='[{"label":"شنبه","date":"۱۴۰۵/۰۸/۱۰"}]')
            db.add(plan);db.flush();activity=Activity(plan_id=plan.id,day="شنبه",subject="ریاضی",title="تمرین تست",start_time="08:00",end_time="09:00")
            db.add(activity);db.commit()

            def callback(chat,data):
                bale_service.handle_callback(db,{"id":"q-"+data,"message":{"chat":{"id":chat}},"data":data})
            def message(chat,text,number=1):
                bale_service.handle_message(db,{"message_id":number,"chat":{"id":chat},"text":text})

            message(7101,"/start");callback(7101,"role:student");message(7101,student.phone);message(7101,"Secret123",2)
            callback(7101,"svc:report");callback(7101,"report:"+plan.id);callback(7101,"entryday:"+plan.id+":0")
            callback(7101,"activity:"+activity.id);callback(7101,"done:"+activity.id)
            for answer in ("10","6","3","1"):message(7101,answer)
            callback(7101,"daysummary:"+plan.id+":0")
            for answer in ("4","5","7","2","صدای محیط","امتحان فردا"):message(7101,answer)
            activity_report=db.get(StudyReport,(plan.id,"activity:"+activity.id))
            day_report=db.get(StudyReport,(plan.id,"day:شنبه"))
            assert '"question_count": 10' in activity_report.data_json and '"correct": 6' in activity_report.data_json
            assert '"focus": 4' in day_report.data_json and "صدای محیط" in day_report.data_json
            db.refresh(activity)
            assert activity.status=="completed" and activity.test_count==10

            message(7102,"/start");callback(7102,"role:parent");message(7102,student.phone);callback(7102,"parent:confirm")
            callback(7102,"svc:report");callback(7102,"report:"+plan.id);callback(7102,"viewdays:"+plan.id);callback(7102,"viewday:"+plan.id+":0")
            parent_text=[payload["text"] for method,payload in calls if method=="sendMessage" and "گزارش شنبه" in payload.get("text","")][-1]
            assert "درست: 6" in parent_text and "تمرکز: 4 از ۵" in parent_text

            message(7103,"/start");callback(7103,"role:advisor");message(7103,advisor.phone);message(7103,"Secret123",3)
            callback(7103,"svc:students");callback(7103,"student:"+student.id);callback(7103,"svc:plan");callback(7103,"plan:"+plan.id)
            inline_payloads=[payload for method,payload in calls if method=="sendMessage" and "inline_keyboard" in payload.get("reply_markup",{})]
            assert any("نسخه رنگی" in str(payload) and "نسخه سیاه و سفید" in str(payload) for payload in inline_payloads)
            db.rollback()
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
    monkeypatch.setattr(integration_service.settings, "allow_bootstrap_otp", False)
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
