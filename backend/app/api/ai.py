from datetime import timedelta
from uuid import UUID
import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update, or_
from app.core.security import roles, current_user
from app.db.session import get_db
from app.models import User, AdvisorAssignment, utcnow, uid
from app.ai_models import AIStudentAccess, AITurn, AIAnalysis
from app import ai_service as ai
from app.ai_jobs import run_analysis, analysis_dict
from app.services import audit

router=APIRouter(prefix="/ai",tags=["AI"])
def ok(data):return {"success":True,"data":data}

class SettingsInput(BaseModel):
    enabled: bool
    provider: Literal["gapgpt", "mistral"] | None = None
    model: str | None = Field(default=None,pattern=r"^[a-zA-Z0-9._:/-]{1,120}$")
    weekly_limit: int = Field(ge=0,le=1000)
    api_key: str | None = Field(default=None,max_length=500)
    clear_token: bool = False
class LimitInput(BaseModel):
    weekly_limit: int | None = Field(default=None,ge=0,le=1000)
class LockInput(BaseModel):
    locked: bool
class ChatInput(BaseModel):
    message: str = Field(min_length=1,max_length=3000)
    request_id: UUID
    @field_validator("message")
    @classmethod
    def nonblank(cls,value):
        if not value.strip():raise ValueError("پیام خالی است")
        return value.strip()

def provider_profiles(config):
    profiles=ai.parse(config.profiles_json,{})
    if config.provider in ai.PROVIDERS:
        profiles[config.provider]={"token_encrypted":config.token_encrypted,"model":config.model}
    return profiles

def settings_dict(config):
    profiles=provider_profiles(config)
    return {"enabled":config.enabled,"model":config.model,"weekly_limit":config.weekly_limit,
            "token_configured":bool(config.token_encrypted),"provider":config.provider,
            "base_url":ai.PROVIDERS[config.provider]["base_url"],
            "providers":{key:{"label":info["label"],"base_url":info["base_url"],
                "model":profiles.get(key,{}).get("model",info["model"]),
                "token_configured":bool(profiles.get(key,{}).get("token_encrypted"))}
                for key,info in ai.PROVIDERS.items()}}
@router.get("/settings")
def get_settings(user=Depends(roles("super_admin")),db=Depends(get_db)):
    config=ai.configuration(db);db.commit();return ok(settings_dict(config))
@router.put("/settings")
def save_settings(payload:SettingsInput,user=Depends(roles("super_admin")),db=Depends(get_db)):
    config=ai.configuration(db)
    profiles=provider_profiles(config)
    provider=payload.provider or config.provider
    profile=profiles.get(provider,{"token_encrypted":"","model":ai.PROVIDERS[provider]["model"]}).copy()
    if payload.clear_token:profile["token_encrypted"]=""
    if payload.api_key and payload.api_key.strip():profile["token_encrypted"]=ai.encrypt_token(payload.api_key.strip())
    if payload.enabled and not profile["token_encrypted"]:raise HTTPException(422,"ابتدا توکن سرویس انتخاب‌شده را وارد کنید")
    if payload.model is not None:profile["model"]=payload.model
    profiles[provider]=profile
    config.profiles_json=json.dumps(profiles)
    config.provider=provider;config.token_encrypted=profile["token_encrypted"]
    config.enabled=payload.enabled;config.model=profile["model"];config.weekly_limit=payload.weekly_limit
    audit(db,user.id,"ai.settings","ai_configuration","1",after={"enabled":config.enabled,"model":config.model,"weekly_limit":config.weekly_limit})
    db.commit();return ok(settings_dict(config))
@router.post("/settings/test")
def test_connection(user=Depends(roles("super_admin")),db=Depends(get_db)):
    config=ai.configuration(db)
    ai.complete(config,"Return a JSON object with answer equal to اتصال برقرار است",{},ai.Reply,40)
    return ok({"message":"اتصال به "+ai.PROVIDERS[config.provider]["label"]+" برقرار است"})

@router.get("/students")
def students(user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    query=select(User).where(User.role=="student")
    if user.role=="advisor":
        query=query.where(User.id.in_(select(AdvisorAssignment.student_id).where(
            AdvisorAssignment.advisor_id==user.id,AdvisorAssignment.active.is_(True),AdvisorAssignment.approval_status=="approved")))
    users=db.scalars(query.order_by(User.full_name)).all()
    result=[]
    for student in users:
        latest=select(AIAnalysis).where(AIAnalysis.student_id==student.id)
        if user.role=="advisor":latest=latest.where(AIAnalysis.advisor_id==user.id)
        row=db.scalar(latest.order_by(AIAnalysis.created_at.desc()).limit(1))
        result.append({"id":student.id,"full_name":student.full_name,"status":student.status,
            "usage":ai.usage(db,student.id),"latest":analysis_dict(row) if row else None})
    db.commit();return ok(result)
@router.put("/students/{student_id}/limit")
def set_limit(student_id:str,payload:LimitInput,user=Depends(roles("super_admin")),db=Depends(get_db)):
    ai.require_student(db,student_id,user);access=ai.access_row(db,student_id)
    access.weekly_limit=payload.weekly_limit
    audit(db,user.id,"ai.limit","user",student_id,after={"weekly_limit":payload.weekly_limit})
    db.commit();return ok(ai.usage(db,student_id))
@router.put("/students/{student_id}/lock")
def set_lock(student_id:str,payload:LockInput,user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    ai.require_student(db,student_id,user);access=ai.access_row(db,student_id)
    access.locked=payload.locked;access.locked_by=user.id if payload.locked else None
    audit(db,user.id,"ai.chat_lock","user",student_id,after={"locked":payload.locked})
    db.commit();return ok(ai.usage(db,student_id))

def turn_dict(t):
    stale=t.status=="pending" and ai.aware(t.created_at)<utcnow()-timedelta(minutes=3)
    return {"id":t.id,"message":t.message,"reply":t.reply,"status":"failed" if stale else t.status,
        "error":"پاسخ دریافت نشد؛ دوباره تلاش کنید" if stale else t.error,"created_at":t.created_at}
def chat_data(db,student_id,before=None):
    query=select(AITurn).where(AITurn.student_id==student_id)
    if before:
        cursor=db.get(AITurn,before)
        if not cursor or cursor.student_id!=student_id:raise HTTPException(404,"پیام یافت نشد")
        query=query.where(or_(AITurn.created_at<cursor.created_at,(AITurn.created_at==cursor.created_at)&(AITurn.id<cursor.id)))
    turns=db.scalars(query.order_by(AITurn.created_at.desc(),AITurn.id.desc()).limit(51)).all()
    more=len(turns)>50;turns=turns[:50]
    return {"turns":[turn_dict(t) for t in reversed(turns)],"next_cursor":turns[-1].id if more else None,"usage":ai.usage(db,student_id)}
@router.get("/chat")
def own_chat(before:str|None=None,user=Depends(roles("student")),db=Depends(get_db)):
    result=chat_data(db,user.id,before);db.commit();return ok(result)
@router.get("/students/{student_id}/chat")
def view_chat(student_id:str,before:str|None=None,user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    ai.require_student(db,student_id,user);result=chat_data(db,student_id,before);db.commit();return ok(result)

@router.post("/chat")
def send_chat(payload:ChatInput,user=Depends(roles("student")),db=Depends(get_db)):
    config=ai.configuration(db);ai.require_ready(config)
    access=ai.access_row(db,user.id);db.commit()
    request_id=str(payload.request_id)
    duplicate=db.scalar(select(AITurn).where(AITurn.student_id==user.id,AITurn.request_id==request_id))
    if duplicate:
        if duplicate.message!=payload.message:raise HTTPException(409,"شناسه این پیام قبلاً استفاده شده است")
        return ok({"turn":turn_dict(duplicate),"usage":ai.usage(db,user.id)})
    now=utcnow();token=uid()
    changed=db.execute(update(AIStudentAccess).execution_options(synchronize_session='fetch').where(AIStudentAccess.student_id==user.id,AIStudentAccess.locked.is_(False),
        or_(AIStudentAccess.chat_until.is_(None),AIStudentAccess.chat_until<now)).values(chat_token=token,chat_until=now+timedelta(minutes=3)))
    if not changed.rowcount:
        db.rollback()
        raise HTTPException(403 if db.get(AIStudentAccess,user.id).locked else 409,
            "گفت‌وگو توسط مشاور قفل شده است" if db.get(AIStudentAccess,user.id).locked else "منتظر پاسخ پیام قبلی بمانید")
    duplicate=db.scalar(select(AITurn).where(AITurn.student_id==user.id,AITurn.request_id==request_id))
    if duplicate:
        db.rollback()
        if duplicate.message!=payload.message:raise HTTPException(409,"شناسه این پیام قبلاً استفاده شده است")
        return ok({"turn":turn_dict(duplicate),"usage":ai.usage(db,user.id)})
    state=ai.usage(db,user.id)
    if state["remaining"]<=0:db.rollback();raise HTTPException(429,"سهمیه پیام‌های این هفته تمام شده است")
    week,_,_=ai.week_bounds(now)
    turn=AITurn(student_id=user.id,request_id=request_id,message=payload.message,week=week,created_at=now)
    db.add(turn);db.commit()
    try:
        context,_=ai.student_context(db,user.id);db.commit()
        answer=ai.chat_reply(config,context,payload.message)
        gate=db.execute(update(AIStudentAccess).execution_options(synchronize_session='fetch').where(AIStudentAccess.student_id==user.id,AIStudentAccess.chat_token==token)
            .values(chat_token="",chat_until=None))
        if not gate.rowcount:db.rollback();raise HTTPException(409,"مهلت پاسخ پایان یافته؛ دوباره تلاش کنید")
        turn.status="completed";turn.reply=answer
        db.commit()
    except Exception as exc:
        db.rollback()
        gate=db.execute(update(AIStudentAccess).execution_options(synchronize_session='fetch').where(AIStudentAccess.student_id==user.id,AIStudentAccess.chat_token==token)
            .values(chat_token="",chat_until=None))
        if gate.rowcount:
            turn=db.get(AITurn,turn.id);turn.status="failed"
            turn.error=str(exc.detail) if isinstance(exc,HTTPException) else "پاسخ دریافت نشد؛ دوباره تلاش کنید"
            db.commit()
        else:db.rollback()
        if isinstance(exc,HTTPException):raise
        raise HTTPException(503,"پاسخ دریافت نشد؛ سهمیه شما کم نمی‌شود")
    return ok({"turn":turn_dict(turn),"usage":ai.usage(db,user.id)})

@router.get("/students/{student_id}/analyses")
def analyses(student_id:str,user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    ai.require_student(db,student_id,user)
    query=select(AIAnalysis).where(AIAnalysis.student_id==student_id)
    if user.role=="advisor":query=query.where(AIAnalysis.advisor_id==user.id)
    return ok([analysis_dict(row) for row in db.scalars(query.order_by(AIAnalysis.created_at.desc())).all()])
@router.post("/students/{student_id}/analyze")
def generate_analysis(student_id:str,user=Depends(roles("advisor")),db=Depends(get_db)):
    ai.require_student(db,student_id,user)
    return ok(analysis_dict(run_analysis(db,student_id,user.id)))

class WeeklyReviewInput(BaseModel):
    enabled: bool
@router.put("/students/{student_id}/weekly-review")
def weekly_review(student_id:str,payload:WeeklyReviewInput,user=Depends(roles("super_admin")),db=Depends(get_db)):
    ai.require_student(db,student_id,user)
    access=ai.access_row(db,student_id);access.weekly_auto_enabled=payload.enabled
    audit(db,user.id,"ai.weekly_review","user",student_id,after={"enabled":payload.enabled})
    db.commit();return ok(ai.usage(db,student_id))
