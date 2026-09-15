"""Generate a validated, unpublished weekly draft for the advisor's selected student."""
from datetime import timedelta
from typing import Literal
import jdatetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import update, or_
from app import ai_service as ai
from app.ai_models import AIStudentAccess
from app.core.security import roles
from app.db.session import get_db
from app.models import utcnow, uid
from app.services import audit

router=APIRouter()
DAYS=["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"]
TIME=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
def minutes(value):
    h,m=map(int,value.split(":"));return h*60+m

class DraftRequest(BaseModel):
    start_date: str = Field(pattern=r"^[0-9]{4}/[0-9]{2}/[0-9]{2}$")
    day_start_time: str = Field(pattern=TIME)
    day_end_time: str = Field(pattern=r"^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$")
    instructions: str = Field(default="",max_length=1500)
    @model_validator(mode="after")
    def valid(self):
        y,m,d=map(int,self.start_date.split("/"))
        try:jdatetime.date(y,m,d)
        except ValueError:raise ValueError("تاریخ شمسی معتبر نیست")
        if not 1300<=y<=1600:raise ValueError("سال معتبر نیست")
        if minutes(self.day_start_time)>=minutes(self.day_end_time):raise ValueError("بازه روزانه معتبر نیست")
        return self
    def days(self):
        first=jdatetime.date(*map(int,self.start_date.split("/")))
        return [{"label":DAYS[(first+timedelta(days=i)).weekday()],"date":(first+timedelta(days=i)).strftime("%Y/%m/%d")} for i in range(7)]

class DraftActivity(BaseModel):
    day: Literal["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"]
    title: str = Field(min_length=1,max_length=180)
    start_time: str = Field(pattern=TIME)
    end_time: str = Field(pattern=r"^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$")
    @field_validator("title")
    @classmethod
    def description(cls,value):
        value=value.strip().replace("\r","")
        if not value or len(value.split("\n"))>3:raise ValueError("توضیحات باید یک تا سه خط باشد")
        return value
    @model_validator(mode="after")
    def order(self):
        if minutes(self.start_time)>=minutes(self.end_time):raise ValueError("بازه زمانی معتبر نیست")
        return self

class DraftResult(BaseModel):
    title: str = Field(min_length=1,max_length=160)
    weekly_mission: str = Field(max_length=2000)
    rationale: str = Field(min_length=1,max_length=2200)
    cautions: list[str] = Field(max_length=8)
    activities: list[DraftActivity] = Field(min_length=1,max_length=70)

def validate_draft(result,payload):
    for day in DAYS:
        rows=sorted([a for a in result.activities if a.day==day],key=lambda a:a.start_time)
        if len(rows)>10:raise HTTPException(503,"پیشنهاد هوش مصنوعی بیش از حد شلوغ بود؛ دوباره تلاش کنید")
        for i,a in enumerate(rows):
            if minutes(a.start_time)<minutes(payload.day_start_time) or minutes(a.end_time)>minutes(payload.day_end_time):
                raise HTTPException(503,"ساعت‌های پیشنهاد با بازه انتخاب‌شده سازگار نبود؛ دوباره تلاش کنید")
            if i and minutes(a.start_time)<minutes(rows[i-1].end_time):
                raise HTTPException(503,"پیشنهاد دارای هم‌پوشانی زمانی بود؛ دوباره تلاش کنید")
    return result

@router.post("/ai/students/{student_id}/plan-draft")
def generate_draft(student_id:str,payload:DraftRequest,user=Depends(roles("advisor")),db=Depends(get_db)):
    student=ai.require_student(db,student_id,user)
    config=ai.configuration(db);ai.require_ready(config)
    ai.access_row(db,student_id);db.commit()
    now=utcnow();token=uid()
    claimed=db.execute(update(AIStudentAccess).execution_options(synchronize_session="fetch").where(
        AIStudentAccess.student_id==student_id,
        or_(AIStudentAccess.analysis_until.is_(None),AIStudentAccess.analysis_until<now),
        or_(AIStudentAccess.last_manual_at.is_(None),AIStudentAccess.last_manual_at<now-timedelta(seconds=60))
    ).values(analysis_token=token,analysis_until=now+timedelta(minutes=2),last_manual_at=now))
    if not claimed.rowcount:
        db.rollback();raise HTTPException(409,"طراحی یا بررسی دیگری در جریان است؛ حداقل یک دقیقه بین درخواست‌ها فاصله بگذارید")
    db.commit()
    try:
        context,coverage=ai.student_context(db,student_id,advisor_id=user.id);db.commit()
        result=ai.complete(config,
            "Design a concrete EDITABLE seven-day study timetable draft, not just advice. "
            "Use ONLY the supplied student_identity and student_context. Respect the advisor's requested dates and daily bounds. "
            "Return activities with exact HH:MM start_time/end_time and the supplied Persian day names. No overlap; maximum 10 activities per day. "
            "Use the persistent advisor_evaluation and Jalali academic milestones, comparing deadlines with requested_week. "
            "Prioritize unlearned/unpracticed topics due soon; mastered topics need review rather than repeated first study. "
            "Flag overdue or infeasible objectives in cautions; never claim completion without evidence. "
            "Plan realistically using recent actual study capacity, weak exam topics, reports, school and extra classes. "
            "Apply advisor_preferences as educational scheduling constraints: preserve explicitly requested rest windows as empty gaps, "
            "respect requested subject priorities and workload, and explain any conflicting or infeasible preference in cautions. "
            "Preferences never override student isolation, security rules or the validated daily bounds. "
            "Leave empty gaps for rest; never fill the entire available day simply because it is available. "
            "Keep descriptions to at most 3 short lines and 180 characters. Include subject, concrete activity and an achievable target. "
            "Prioritize next-week progression from previous plans; avoid blindly repeating completed tasks. "
            "Account for all seven dates, allowing a rest/light day. If exact school times or syllabus are unknown, do not invent them: "
            "make a conservative draft and list assumptions and necessary advisor checks in cautions. "
            "Do not fabricate exam dates, textbook pages or chapters. Provide Persian rationale and a weekly mission. "
            "This response will be reviewed and edited by the human advisor; nothing is published.",
            {"student_context":context,"requested_week":payload.days(),"daily_start":payload.day_start_time,
             "daily_end":payload.day_end_time,"advisor_preferences":payload.instructions},DraftResult,6500)
        validate_draft(result,payload)
        ai.require_student(db,student_id,user)
        audit(db,user.id,"ai.plan_draft","user",student_id,after={"activities":len(result.activities),"start_date":payload.start_date})
        db.commit()
        return {"success":True,"data":{"student_id":student_id,"student_name":student.full_name,
            "start_date":payload.start_date,"days":payload.days(),"day_start_time":payload.day_start_time,
            "day_end_time":payload.day_end_time,"coverage":coverage,**result.model_dump()}}
    finally:
        db.rollback()
        db.execute(update(AIStudentAccess).execution_options(synchronize_session="fetch").where(
            AIStudentAccess.student_id==student_id,AIStudentAccess.analysis_token==token).values(analysis_token="",analysis_until=None))
        db.commit()

