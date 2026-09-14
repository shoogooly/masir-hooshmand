import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.security import current_user, roles
from app.db.session import get_db
from app.models import Activity, StudyReport, User, WeeklyPlan, utcnow
from app.study_reporting import ensure_report_editable, report_bounds, legacy_report
from app.services import audit

router = APIRouter()

class ActivityReportInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(default=0, ge=0)
    status: Literal['done','not_done'] | None = None
    actual_minutes: int | None = Field(default=None, ge=0, le=1440, strict=True)
    question_count: int | None = Field(default=None, ge=0, le=10000, strict=True)
    correct: int | None = Field(default=None, ge=0, le=10000, strict=True)
    wrong: int | None = Field(default=None, ge=0, le=10000, strict=True)
    unanswered: int | None = Field(default=None, ge=0, le=10000, strict=True)
    quality: str | None = Field(default=None, max_length=2000)
    not_done_reason: str | None = Field(default=None, max_length=2000)

class DayReportInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(default=0, ge=0)
    focus: int | None = Field(default=None, ge=1, le=5, strict=True)
    distractions: str | None = Field(default=None, max_length=2000)
    energy: int | None = Field(default=None, ge=1, le=5, strict=True)
    sleep_hours: float | None = Field(default=None, ge=0, le=24, allow_inf_nan=False)
    stress: int | None = Field(default=None, ge=1, le=5, strict=True)
    stress_source: str | None = Field(default=None, max_length=2000)

def ok(data):
    return {'success':True,'data':data,'meta':{}}

def access(plan_id, user, db):
    plan = db.get(WeeklyPlan, plan_id)
    if not plan:
        raise HTTPException(404, 'برنامه یافت نشد')
    if not ((user.role == 'student' and plan.student_id == user.id and plan.status == 'published') or
            (user.role == 'advisor' and plan.advisor_id == user.id) or user.role in {'super_admin','operations_admin'}):
        raise HTTPException(403, 'به گزارش این برنامه دسترسی ندارید')
    return plan

def snapshot(plan, db):
    rows = db.scalars(select(StudyReport).where(StudyReport.plan_id == plan.id)).all()
    records = {row.scope:{'values':json.loads(row.data_json),'version':row.version,'updated_at':row.updated_at} for row in rows}
    activities = {a.id:records.get('activity:'+a.id, {'values':legacy_report(a),'version':0}) for a in plan.activities}
    days = {key[4:]:value for key,value in records.items() if key.startswith('day:')}
    start,end,deadline = report_bounds(plan)
    now = utcnow()
    return {'activities':activities,'days':days,'starts_at':start,'ends_at':end,'editable_until':deadline,
        'editable':plan.status == 'published' and start <= now < deadline,'server_time':now}

@router.get('/plans/{plan_id}/study-reports')
def get_reports(plan_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return ok(snapshot(access(plan_id,user,db),db))

def persist(plan,scope,payload,db,user,activity=None):
    ensure_report_editable(plan)
    row = db.get(StudyReport,(plan.id,scope))
    old = json.loads(row.data_json) if row else legacy_report(activity) if activity else {}
    values = old | payload.model_dump(exclude_unset=True, exclude={'version'})
    if activity:
        # Fields from the other branch have no meaning after an explicit status change.
        if values.get('status') == 'not_done':
            for key in ('actual_minutes','question_count','correct','wrong','unanswered','quality'):
                values.pop(key,None)
        elif values.get('status') == 'done':
            values.pop('not_done_reason',None)
        total = values.get('question_count')
        if total is None:
            for key in ('correct','wrong','unanswered'):
                values.pop(key,None)
        elif sum(values.get(key) or 0 for key in ('correct','wrong','unanswered')) > total:
            raise HTTPException(422,'جمع پاسخ‌های درست، غلط و بی‌پاسخ نباید از تعداد سؤال‌ها بیشتر باشد')
    values = {key:value.strip() if isinstance(value,str) else value for key,value in values.items()}
    encoded = json.dumps(values,ensure_ascii=False)
    if row:
        changed=db.execute(update(StudyReport).where(StudyReport.plan_id==plan.id,StudyReport.scope==scope,
            StudyReport.version==payload.version).values(data_json=encoded,version=payload.version+1,updated_at=utcnow()))
        if changed.rowcount != 1:
            raise HTTPException(409,'این گزارش در صفحه دیگری تغییر کرده است؛ آخرین نسخه را دریافت کنید')
    else:
        if payload.version != 0:
            raise HTTPException(409,'نسخه گزارش معتبر نیست؛ آخرین نسخه را دریافت کنید')
        db.add(StudyReport(plan_id=plan.id,scope=scope,data_json=encoded,version=1))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409,'گزارش هم‌زمان تغییر کرده است؛ آخرین نسخه را دریافت کنید')
    if activity:
        activity.status = {'done':'completed','not_done':'skipped'}.get(values.get('status'),'pending')
        activity.actual_minutes = values.get('actual_minutes') or 0
        activity.test_count = values.get('question_count') or 0
        activity.note = values.get('quality') or values.get('not_done_reason') or ''
    audit(db,user.id,'study_report.saved','weekly_plan',plan.id,after={'scope':scope})
    db.commit()
    return ok(snapshot(plan,db))

@router.put('/plans/{plan_id}/study-reports/activities/{activity_id}')
def save_activity(plan_id: str, activity_id: str, payload: ActivityReportInput,
                  user: User = Depends(roles('student')), db: Session = Depends(get_db)):
    plan=access(plan_id,user,db)
    activity=db.get(Activity,activity_id)
    if not activity or activity.plan_id != plan.id:
        raise HTTPException(404,'بازه در این برنامه یافت نشد')
    return persist(plan,'activity:'+activity.id,payload,db,user,activity)

@router.put('/plans/{plan_id}/study-reports/days/{day}')
def save_day(plan_id: str, day: str, payload: DayReportInput,
             user: User = Depends(roles('student')), db: Session = Depends(get_db)):
    plan=access(plan_id,user,db)
    labels={x['label'] for x in json.loads(plan.schedule_days_json or '[]')} or {'شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'}
    if day not in labels:
        raise HTTPException(404,'روز در این برنامه یافت نشد')
    return persist(plan,'day:'+day,payload,db,user)
