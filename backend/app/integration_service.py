from __future__ import annotations
import base64, hashlib, hmac, logging, secrets
from datetime import datetime, timedelta, timezone
import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models import OTPChallenge, Order, SiteSetting, User, utcnow

logger=logging.getLogger(__name__)

KEYS={"sms_enabled":"sms_ir_enabled","sms_key":"sms_ir_api_key","sms_template":"sms_ir_template_id",
 "sms_parameter":"sms_ir_parameter_name","zarinpal_enabled":"zarinpal_enabled","zarinpal_merchant":"zarinpal_merchant_id",
 "zarinpal_sandbox":"zarinpal_sandbox","public_url":"site_public_url"}
SECRET_KEYS={"sms_key","zarinpal_merchant"}
TEMP_ADMIN_OTP_KEY="temporary_admin_otp_until"
def _cipher():
 key=hashlib.sha256(("mahyaad-integrations-v1:"+settings.secret_key).encode()).digest()
 return Fernet(base64.urlsafe_b64encode(key))
def encrypt(raw): return _cipher().encrypt(raw.encode()).decode()
def decrypt(raw):
 try:return _cipher().decrypt(raw.encode()).decode()
 except (InvalidToken,ValueError) as exc:raise HTTPException(503,"کلید سرویس قابل خواندن نیست؛ دوباره آن را ذخیره کنید") from exc
def get(db,key,default=""):
 row=db.get(SiteSetting,KEYS.get(key,key));return row.value if row else default
def get_secret(db,key):
 raw=get(db,key);return decrypt(raw) if raw else ""
def _sms_enabled(db):
 row=db.get(SiteSetting,KEYS["sms_enabled"])
 return row.value=="true" if row else settings.sms_ir_enabled
def _sms_api_key(db):
 raw=get(db,"sms_key")
 return decrypt(raw) if raw else settings.sms_ir_api_key.strip()
def _bootstrap_otp_allowed(db,phone):
 template_missing=not get(db,"sms_template").strip()
 return (
  phone==settings.bootstrap_admin_phone
  and (template_missing or (settings.allow_bootstrap_otp and not _sms_enabled(db)))
 )
def set_value(db,key,val,user_id=None):
 name=KEYS.get(key,key);row=db.get(SiteSetting,name) or SiteSetting(key=name)
 row.value=encrypt(val) if key in SECRET_KEYS and val else val;row.updated_by=user_id;row.version=(row.version or 0)+1;db.add(row)
def temporary_admin_code_active(db,phone=None,purpose="staff"):
 if (phone is not None and phone!=settings.bootstrap_admin_phone) or purpose!="staff":return False
 raw=get(db,TEMP_ADMIN_OTP_KEY)
 try:return bool(raw) and _aware(datetime.fromisoformat(raw))>utcnow()
 except ValueError:return False
def status(db):
 return {"sms_enabled":_sms_enabled(db),"sms_key_configured":bool(get(db,"sms_key") or settings.sms_ir_api_key.strip()),
  "sms_template":get(db,"sms_template"),"sms_parameter":get(db,"sms_parameter","Code"),
  "zarinpal_enabled":get(db,"zarinpal_enabled","false")=="true","zarinpal_merchant_configured":bool(get(db,"zarinpal_merchant")),
  "zarinpal_sandbox":get(db,"zarinpal_sandbox","false")=="true","public_url":get(db,"public_url"),
  "temporary_admin_code_active":temporary_admin_code_active(db)}
def _aware(value):return value if not value or value.tzinfo else value.replace(tzinfo=timezone.utc)
def _otp_hash(phone,purpose,code):return hmac.new(settings.secret_key.encode(),f"{phone}:{purpose}:{code}".encode(),hashlib.sha256).hexdigest()
def otp_purpose(db,phone):
 user=db.scalar(select(User).where(User.phone==phone))
 return "staff" if user and user.role in {"super_admin","operations_admin","expert","secretary"} else "registration"
def _sms_ir_response(response):
 try:data=response.json()
 except ValueError as exc:raise HTTPException(502,"پاسخ نامعتبر از SMS.ir دریافت شد") from exc
 if not isinstance(data,dict):raise HTTPException(502,"پاسخ نامعتبر از SMS.ir دریافت شد")
 if not response.is_success or data.get("status") not in (1,"1",True):
  message=data.get("message") or "ارسال پیامک از SMS.ir ناموفق بود"
  logger.warning("SMS.ir Verify rejected request: http_status=%s provider_status=%s message=%s",
   response.status_code,data.get("status"),message)
  raise HTTPException(502,f"SMS.ir: {message}")
 return data
def _send_sms_ir_otp(api_key,phone,code,template,parameter="Code"):
 if not template:
  raise HTTPException(422,"شناسه قالب Verify در تنظیمات SMS.ir وارد نشده است")
 headers={"X-API-KEY":api_key,"Accept":"application/json","Content-Type":"application/json"}
 try:
  response=httpx.post("https://api.sms.ir/v1/send/verify",headers=headers,
   json={"mobile":phone,"templateId":int(template),"parameters":[{"name":parameter or "Code","value":code}]},timeout=8)
  _sms_ir_response(response)
 except (httpx.HTTPError,ValueError,TypeError) as exc:raise HTTPException(502,"ارسال کد ورود از مسیر Verify سرویس SMS.ir ناموفق بود") from exc
def send_otp(db,phone,purpose=None):
 purpose=purpose or otp_purpose(db,phone);now=utcnow()
 last=db.scalar(select(OTPChallenge).where(OTPChallenge.phone==phone,OTPChallenge.purpose==purpose).order_by(OTPChallenge.created_at.desc()))
 if last and (now-_aware(last.created_at)).total_seconds()<60:raise HTTPException(429,"برای دریافت دوباره کد یک دقیقه صبر کنید")
 code=f"{secrets.randbelow(1_000_000):06d}"
 enabled=_sms_enabled(db);template=get(db,"sms_template").strip();parameter=get(db,"sms_parameter","Code") or "Code"
 delivery=None
 recovery=temporary_admin_code_active(db,phone,purpose)
 if enabled and template:
  try:
   api_key=_sms_api_key(db)
   if not api_key:raise HTTPException(422,"کلید API سرویس SMS.ir در پنل مدیریت وارد نشده است")
   delivery=(api_key,phone,code,template,parameter)
  except HTTPException:
   if not recovery:raise
   code="123456"
 elif recovery:code="123456"
 elif settings.env in {"development","test"}:code="123456"
 elif _bootstrap_otp_allowed(db,phone):code="123456"
 elif enabled:raise HTTPException(422,"شناسه قالب Verify در تنظیمات SMS.ir وارد نشده است")
 else:raise HTTPException(422,"سرویس SMS.ir توسط مدیر فعال نشده است")
 if delivery:
  try:_send_sms_ir_otp(*delivery)
  except HTTPException:
   if not recovery:raise
   logger.warning("SMS.ir delivery failed; using time-limited primary-admin recovery code")
   code="123456"
 db.add(OTPChallenge(phone=phone,purpose=purpose,code_hash=_otp_hash(phone,purpose,code),expires_at=now+timedelta(minutes=2)))
 db.commit()
 return code if settings.env in {"development","test"} and not enabled and not recovery else None
def verify_otp(db,phone,code,purpose):
 if code=="123456" and phone==settings.bootstrap_admin_phone and purpose=="staff" and db.get(SiteSetting,TEMP_ADMIN_OTP_KEY) is not None and not temporary_admin_code_active(db,phone,purpose):
  raise HTTPException(400,"کد ورود موقت منقضی یا غیرفعال شده است")
 row=db.scalar(select(OTPChallenge).where(OTPChallenge.phone==phone,OTPChallenge.purpose==purpose,OTPChallenge.consumed_at.is_(None)).order_by(OTPChallenge.created_at.desc()))
 if not row:
  if not _sms_enabled(db):
   if settings.env in {"development","test"}:
    if code=="123456":return True
    raise HTTPException(400,"کد یک‌بارمصرف صحیح نیست")
   raise HTTPException(503,"سرویس SMS.ir توسط مدیر فعال نشده است")
  raise HTTPException(400,"کد یک‌بارمصرف منقضی یا نامعتبر است")
 if _aware(row.expires_at)<=utcnow():raise HTTPException(400,"کد یک‌بارمصرف منقضی یا نامعتبر است")
 if row.attempts>=5:raise HTTPException(429,"تعداد تلاش‌های مجاز پایان یافته است؛ کد جدید بگیرید")
 if not hmac.compare_digest(row.code_hash,_otp_hash(phone,purpose,code)):
  row.attempts+=1;db.commit();raise HTTPException(400,"کد یک‌بارمصرف صحیح نیست")
 row.consumed_at=utcnow();db.flush();return True

def zarinpal_ready(db):return get(db,"zarinpal_enabled","false")=="true" and bool(get(db,"zarinpal_merchant"))
def _zarinpal_api_base(db):return "https://sandbox.zarinpal.com" if get(db,"zarinpal_sandbox","false")=="true" else "https://api.zarinpal.com"
def _zarinpal_payment_base(db):return "https://sandbox.zarinpal.com" if get(db,"zarinpal_sandbox","false")=="true" else "https://www.zarinpal.com"
def _zarinpal_error(body):
 errors=body.get("errors") if isinstance(body,dict) else None
 if isinstance(errors,dict):
  code=errors.get("code")
  message=errors.get("message") or "درخواست زرین‌پال رد شد"
  return f"زرین‌پال: {message}" + (f" (کد {code})" if code is not None else "")
 return "پاسخ نامعتبر از زرین‌پال دریافت شد"
def create_zarinpal(db,order,user):
 if not zarinpal_ready(db):
  if settings.env in {"development","test"}:return None
  raise HTTPException(503,"درگاه زرین‌پال توسط مدیر فعال نشده است")
 merchant=get_secret(db,"zarinpal_merchant");public=get(db,"public_url").rstrip("/")
 if not public.startswith("https://") and not get(db,"zarinpal_sandbox","false")=="true":raise HTTPException(503,"نشانی عمومی HTTPS سایت در تنظیمات درگاه وارد نشده است")
 callback=f"{public}/api/v1/payments/zarinpal/callback?order_id={order.id}"
 payload={"merchant_id":merchant,"amount":order.amount*10,"currency":"IRR","description":"پرداخت خدمات مهیاد",
   "callback_url":callback,"metadata":{"mobile":user.phone,"order_id":order.id}}
 try:
  response=httpx.post(_zarinpal_api_base(db)+"/pg/v4/payment/request.json",json=payload,timeout=10);body=response.json()
 except (httpx.HTTPError,ValueError) as exc:
  logger.exception("Zarinpal payment request failed for order %s",order.id)
  raise HTTPException(502,"ارتباط با API زرین‌پال برقرار نشد؛ لطفاً دوباره تلاش کنید") from exc
 data=body.get("data") if isinstance(body,dict) else None
 data=data if isinstance(data,dict) else {}
 if not response.is_success or data.get("code")!=100 or not data.get("authority"):
  logger.warning("Zarinpal rejected payment request for order %s: %s",order.id,_zarinpal_error(body))
  raise HTTPException(502,_zarinpal_error(body))
 order.provider_reference=data["authority"];db.flush()
 return {"redirect_url":_zarinpal_payment_base(db)+"/pg/StartPay/"+data["authority"],"authority":data["authority"],"amount":order.amount}
def verify_zarinpal(db,order,authority):
 if not zarinpal_ready(db):return False,None
 if not order.provider_reference or not hmac.compare_digest(order.provider_reference,authority):return False,None
 payload={"merchant_id":get_secret(db,"zarinpal_merchant"),"amount":order.amount*10,"authority":authority}
 try:
  response=httpx.post(_zarinpal_api_base(db)+"/pg/v4/payment/verify.json",json=payload,timeout=10);body=response.json()
 except (httpx.HTTPError,ValueError) as exc:
  logger.exception("Zarinpal verification failed for order %s",order.id)
  raise HTTPException(502,"اعتبارسنجی پرداخت زرین‌پال ناموفق بود") from exc
 data=body.get("data") if isinstance(body,dict) else None
 data=data if isinstance(data,dict) else {};code=data.get("code")
 return code in {100,101},str(data.get("ref_id") or "")
