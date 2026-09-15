"""Persistent advisor-owned assessment and dated educational milestones."""
import json
import jdatetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from app.ai_models import AdvisorEvaluation
from app import ai_service as ai
from app.core.security import roles
from app.db.session import get_db
from app.models import utcnow

router=APIRouter()

class Milestone(BaseModel):
    date: str = Field(pattern=r"^[0-9]{4}/[0-9]{2}/[0-9]{2}$")
    subject: str = Field(min_length=1,max_length=120)
    topic: str = Field(min_length=1,max_length=800)
    status: Literal["pending","learning","practiced","mastered"] = "pending"

    @field_validator("date")
    @classmethod
    def valid_date(cls,value):
        year,month,day=map(int,value.split("/"))
        if not 1300<=year<=1600:raise ValueError("سال معتبر نیست")
        jdatetime.date(year,month,day)
        return value

    @field_validator("subject","topic")
    @classmethod
    def nonblank(cls,value):
        if not value.strip():raise ValueError("عنوان خالی است")
        return value.strip()

class EvaluationInput(BaseModel):
    assessment: str = Field(default="",max_length=8000)
    calendar_notes: str = Field(default="",max_length=15000)
    milestones: list[Milestone] = Field(default_factory=list,max_length=120)
    version: int = Field(ge=0)

def row_for(db,student_id,advisor_id):
    row=db.get(AdvisorEvaluation,(student_id,advisor_id))
    if row is None:
        try:
            with db.begin_nested():
                row=AdvisorEvaluation(student_id=student_id,advisor_id=advisor_id)
                db.add(row);db.flush()
        except IntegrityError:row=db.get(AdvisorEvaluation,(student_id,advisor_id))
    return row

def result(row):
    return {"success":True,"data":{"assessment":row.assessment,"calendar_notes":row.calendar_notes,
        "milestones":json.loads(row.milestones_json),"version":row.version,"updated_at":row.updated_at}}

@router.get("/advisors/students/{student_id}/evaluation")
def read_evaluation(student_id:str,user=Depends(roles("advisor")),db=Depends(get_db)):
    ai.require_student(db,student_id,user)
    row=row_for(db,student_id,user.id);db.commit()
    return result(row)

@router.put("/advisors/students/{student_id}/evaluation")
def save_evaluation(student_id:str,payload:EvaluationInput,user=Depends(roles("advisor")),db=Depends(get_db)):
    ai.require_student(db,student_id,user)
    row_for(db,student_id,user.id)
    changed=db.execute(update(AdvisorEvaluation).where(
        AdvisorEvaluation.student_id==student_id,AdvisorEvaluation.advisor_id==user.id,
        AdvisorEvaluation.version==payload.version).values(
            assessment=payload.assessment.strip(),calendar_notes=payload.calendar_notes.strip(),
            milestones_json=json.dumps([m.model_dump() for m in payload.milestones],ensure_ascii=False),
            version=payload.version+1,updated_at=utcnow()))
    if not changed.rowcount:
        db.rollback();raise HTTPException(409,"این ارزیابی در صفحه دیگری تغییر کرده است؛ پیش از ذخیره، نسخه جدید را دریافت کنید.")
    db.commit()
    return result(db.get(AdvisorEvaluation,(student_id,user.id)))
