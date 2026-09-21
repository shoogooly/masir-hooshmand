import hmac, secrets
from datetime import timezone
from fastapi import APIRouter, Body, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.router import issue_session, plan_dict
from app.api.study_reports import snapshot
from app.bale_service import api as bale_api, configured, process_update, save_value, value
from app.core.security import hash_token, roles
from app.db.session import get_db
from app.models import BaleAccessGrant, BaleProcessedUpdate, User, WeeklyPlan, utcnow

router=APIRouter(prefix="/bale",tags=["bale"])
def ok(data=None): return {"success":True,"data":data,"meta":{}}
class BaleSettings(BaseModel):
    enabled: bool=False
    public_url: str=Field(default="",max_length=300)
    bot_token: str=Field(default="",max_length=300)
    payment_token: str=Field(default="",max_length=500)

@router.get("/admin/settings")
def get_settings(db:Session=Depends(get_db),_user:User=Depends(roles("super_admin"))): return ok(configured(db))
@router.put("/admin/settings")
def put_settings(body:BaleSettings,db:Session=Depends(get_db),user:User=Depends(roles("super_admin"))):
    save_value(db,"enabled","true" if body.enabled else "false",user.id)
    save_value(db,"public_url",body.public_url.strip().rstrip("/"),user.id)
    if body.bot_token.strip(): save_value(db,"bot_token",body.bot_token.strip(),user.id,True)
    if body.payment_token.strip(): save_value(db,"payment_token",body.payment_token.strip(),user.id,True)
    if not value(db,"webhook_secret"): save_value(db,"webhook_secret",secrets.token_urlsafe(32),user.id)
    db.commit(); return ok(configured(db))
@router.post("/admin/test")
def test_bot(db:Session=Depends(get_db),_user:User=Depends(roles("super_admin"))): return ok({"bot":bale_api(db,"getMe")})
@router.post("/admin/webhook")
def configure_webhook(db:Session=Depends(get_db),user:User=Depends(roles("super_admin"))):
    public=value(db,"public_url").strip().rstrip("/")
    if not public.startswith("https://"): raise HTTPException(422,"نشانی عمومی HTTPS سایت را وارد کنید")
    secret=value(db,"webhook_secret") or secrets.token_urlsafe(32)
    if not value(db,"webhook_secret"): save_value(db,"webhook_secret",secret,user.id); db.flush()
    result=bale_api(db,"setWebhook",{"url":f"{public}/api/v1/bale/webhook/{secret}","allowed_updates":["message","edited_message","callback_query","pre_checkout_query"]})
    save_value(db,"webhook_active","true",user.id)
    db.commit(); return ok({"configured":bool(result)})

@router.post("/webhook/{secret}")
def webhook(secret:str,update:dict=Body(...),db:Session=Depends(get_db)):
    expected=value(db,"webhook_secret")
    if not expected or not hmac.compare_digest(secret,expected): raise HTTPException(404,"یافت نشد")
    if not str(update.get("update_id","")).strip(): raise HTTPException(422,"شناسه به‌روزرسانی معتبر نیست")
    process_update(db,update); return {"ok":True}

def get_grant(db,raw,kind=None):
    item=db.get(BaleAccessGrant,hash_token(raw))
    if not item: raise HTTPException(404,"پیوند معتبر نیست")
    expires=item.expires_at if item.expires_at.tzinfo else item.expires_at.replace(tzinfo=timezone.utc)
    if expires<=utcnow() or (kind and item.kind!=kind): raise HTTPException(410,"اعتبار پیوند پایان یافته است")
    return item
@router.get("/download/{raw}")
def download(raw:str,db:Session=Depends(get_db)):
    item=get_grant(db,raw); plan=db.get(WeeklyPlan,item.resource_id)
    if item.kind not in {"plan","report"} or not plan: raise HTTPException(404,"فایل پیدا نشد")
    owner=db.get(User,item.user_id); student=db.get(User,plan.student_id); advisor=db.get(User,plan.advisor_id)
    if item.kind=="plan" and plan.student_id!=item.user_id: raise HTTPException(403,"دسترسی مجاز نیست")
    if item.kind=="report" and (not owner or owner.role!="advisor" or plan.advisor_id!=owner.id): raise HTTPException(403,"دسترسی مجاز نیست")
    return ok({"kind":item.kind,"plan":plan_dict(plan),"reports":snapshot(plan,db) if item.kind=="report" else None,
      "student_name":student.full_name if student else "دانش‌آموز","advisor_name":advisor.full_name if advisor else "مشاور"})
@router.post("/session/{raw}")
def exchange(raw:str,response:Response,db:Session=Depends(get_db)):
    item=get_grant(db,raw,"session")
    if item.used_at: raise HTTPException(410,"این پیوند قبلاً استفاده شده است")
    user=db.get(User,item.user_id)
    if not user or user.status in {"deleted","suspended"} or user.role not in {"student","advisor"}: raise HTTPException(403,"حساب در دسترس نیست")
    if item.resource_id:
        plan=db.get(WeeklyPlan,item.resource_id)
        if not plan or plan.student_id!=user.id: raise HTTPException(403,"دسترسی مجاز نیست")
    item.used_at=utcnow(); csrf=issue_session(response,user,db); db.commit()
    return ok({"user":{"id":user.id,"role":user.role,"full_name":user.full_name},"csrf":csrf})
