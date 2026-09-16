"""Durable, idempotent weekly jobs; database leases also serialize manual reviews."""
import json
import logging
from datetime import timedelta
from sqlalchemy import select, update, or_
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from app.ai_models import AIAnalysis, AIStudentAccess
from app import ai_service as ai
from app.db.session import SessionLocal
from app.models import AdvisorAssignment, User, Notification, utcnow, uid

def analysis_dict(row):
    stale=row.status=="pending" and row.retry_at and ai.aware(row.retry_at)<utcnow()
    return {"id":row.id,"student_id":row.student_id,"student_name":row.student_name,"kind":row.kind,"week":row.week,"status":"failed" if stale else row.status,
        "result":ai.parse(row.result_json,{}),"coverage":ai.parse(row.coverage_json,{}),
        "error":"بررسی قطع شده است؛ می‌توانید دوباره بررسی کنید" if stale else row.error,"created_at":row.created_at,"completed_at":row.completed_at}

def run_analysis(db, student_id, advisor_id, kind="manual"):
    config=ai.configuration(db); ai.require_ready(config)
    access=ai.access_row(db,student_id); db.commit()
    if kind=="weekly" and not access.weekly_auto_enabled:raise HTTPException(409,"تحلیل خودکار این دانش‌آموز خاموش است")
    now=utcnow(); week,_,_=ai.week_bounds(now); token=uid()
    auto_key=f"{student_id}:{advisor_id}:{week}" if kind=="weekly" else None
    old=db.scalar(select(AIAnalysis).where(AIAnalysis.automatic_key==auto_key)) if auto_key else None
    if old and (old.status=="completed" or old.attempts>=3 or (old.retry_at and ai.aware(old.retry_at)>now)):
        return old
    criteria=[AIStudentAccess.student_id==student_id,or_(AIStudentAccess.analysis_until.is_(None),AIStudentAccess.analysis_until<now)]
    if kind=="weekly":criteria.append(AIStudentAccess.weekly_auto_enabled.is_(True))
    if kind=="manual":
        criteria.append(or_(AIStudentAccess.last_manual_at.is_(None),AIStudentAccess.last_manual_at<now-timedelta(seconds=60)))
    changed=db.execute(update(AIStudentAccess).execution_options(synchronize_session='fetch').where(*criteria).values(analysis_token=token,analysis_until=now+timedelta(minutes=2),
        **({"last_manual_at":now} if kind=="manual" else {})))
    if not changed.rowcount:
        db.rollback()
        raise HTTPException(409,"بررسی دیگری در جریان است یا کمتر از یک دقیقه از بررسی قبلی گذشته است")
    if old:
        db.refresh(old)
        if old.status=="completed" or old.attempts>=3 or (old.retry_at and ai.aware(old.retry_at)>now):
            db.rollback()
            return old
    row=old or AIAnalysis(student_id=student_id,advisor_id=advisor_id,kind=kind,week=week,automatic_key=auto_key)
    if not old: db.add(row)
    row.student_name=db.get(User,student_id).full_name
    row.status="pending";row.attempts=(row.attempts or 0)+1;row.error="";row.retry_at=now+timedelta(minutes=2)
    try: db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,"بررسی هفتگی قبلاً آغاز شده است")
    try:
        context,coverage=ai.student_context(db,student_id,advisor_id=advisor_id)
        db.commit()
        result=ai.analyze(config,context)
        gate=db.execute(update(AIStudentAccess).execution_options(synchronize_session='fetch').where(AIStudentAccess.student_id==student_id,AIStudentAccess.analysis_token==token)
            .values(analysis_token="",analysis_until=None))
        if not gate.rowcount: db.rollback(); raise HTTPException(409,"مهلت این بررسی پایان یافته؛ دوباره تلاش کنید")
        row.status="completed";row.result_json=json.dumps(result,ensure_ascii=False)
        row.coverage_json=json.dumps(coverage,ensure_ascii=False);row.completed_at=utcnow();row.retry_at=None
        db.add(Notification(user_id=advisor_id,kind="ai_analysis",title="تحلیل دانش‌آموز آماده است",
            body="شرح حال و پیشنهاد هفته آینده را در پیشنهادهای AI ببینید.",link="/app/advisor/ai",
            related_id=row.id))
        db.commit()
        return row
    except Exception as exc:
        db.rollback()
        gate=db.execute(update(AIStudentAccess).execution_options(synchronize_session='fetch').where(AIStudentAccess.student_id==student_id,AIStudentAccess.analysis_token==token)
            .values(analysis_token="",analysis_until=None))
        if gate.rowcount:
            row=db.get(AIAnalysis,row.id);row.status="failed"
            row.error=str(exc.detail) if isinstance(exc,HTTPException) else "بررسی تکمیل نشد؛ دوباره تلاش کنید"
            row.retry_at=utcnow()+timedelta(minutes=15)
            db.commit()
        else: db.rollback()
        if isinstance(exc,HTTPException): raise
        raise HTTPException(503,"بررسی تکمیل نشد؛ دوباره تلاش کنید")

def weekly_tick(stop=None):
    with SessionLocal() as db:
        config=ai.configuration(db); db.commit()
        if not config.enabled or not config.token_encrypted:return
        pairs=db.execute(select(AdvisorAssignment.student_id,AdvisorAssignment.advisor_id).join(User,User.id==AdvisorAssignment.student_id).where(
            AdvisorAssignment.active.is_(True),AdvisorAssignment.approval_status=="approved",User.status=="active")).all()
    for student_id,advisor_id in pairs:
        if stop and stop.is_set():break
        try:
            with SessionLocal() as db:
                if not ai.access_row(db,student_id).weekly_auto_enabled:continue
                advisor=db.get(User,advisor_id)
                if not advisor or advisor.status!="active":continue
                ai.require_student(db,student_id,advisor)
                run_analysis(db,student_id,advisor_id,"weekly")
        except ai.AIProviderRateLimited as exc:
            # Organization-level limits affect every student: stop this batch.
            return max(900,exc.retry_after)
        except Exception:
            # No student messages, provider bodies or credentials enter logs.
            logging.getLogger(__name__).warning("Weekly AI review deferred for retry")

def worker(stop):
    delay=60
    while not stop.wait(delay):
        try:
            cooldown=weekly_tick(stop)
            delay=min(86400,max(cooldown,delay*2)) if cooldown else 60
        except Exception:
            delay=60
            logging.getLogger(__name__).warning("AI weekly scheduler will retry")
