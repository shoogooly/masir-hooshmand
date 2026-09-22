from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import roles
from app.integration_service import set_value,status
from app.models import User
router=APIRouter(prefix="/integrations",tags=["integrations"])
def ok(data=None):return {"success":True,"data":data,"meta":{}}
class Settings(BaseModel):
 sms_enabled:bool=False
 sms_api_key:str=Field(default="",max_length=500)
 sms_template_id:str=Field(default="",max_length=30)
 sms_parameter_name:str=Field(default="Code",max_length=50)
 zarinpal_enabled:bool=False
 zarinpal_merchant_id:str=Field(default="",max_length=100)
 zarinpal_sandbox:bool=False
 public_url:str=Field(default="",max_length=300)
@router.get("/admin/settings")
def read(db:Session=Depends(get_db),_user:User=Depends(roles("super_admin"))):return ok(status(db))
@router.put("/admin/settings")
def update(body:Settings,db:Session=Depends(get_db),user:User=Depends(roles("super_admin"))):
 template=body.sms_template_id.strip();parameter=body.sms_parameter_name.strip() or "Code"
 if body.sms_enabled:
  if not template or not template.isdigit():raise HTTPException(422,"برای فعال‌سازی پیامک واقعی، شناسه عددی قالب Verify الزامی است")
  if not body.sms_api_key.strip() and not status(db)["sms_key_configured"]:raise HTTPException(422,"کلید API سرویس SMS.ir الزامی است")
 set_value(db,"sms_enabled","true" if body.sms_enabled else "false",user.id)
 set_value(db,"sms_template",template,user.id);set_value(db,"sms_parameter",parameter,user.id)
 set_value(db,"zarinpal_enabled","true" if body.zarinpal_enabled else "false",user.id)
 set_value(db,"zarinpal_sandbox","true" if body.zarinpal_sandbox else "false",user.id);set_value(db,"public_url",body.public_url.strip().rstrip("/"),user.id)
 if body.sms_api_key.strip():set_value(db,"sms_key",body.sms_api_key.strip(),user.id)
 if body.zarinpal_merchant_id.strip():set_value(db,"zarinpal_merchant",body.zarinpal_merchant_id.strip(),user.id)
 db.commit();return ok(status(db))
