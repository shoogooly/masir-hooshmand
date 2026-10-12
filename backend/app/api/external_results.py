import json
import jdatetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select, update, delete
from sqlalchemy.orm import Session
from app.api.exam_files import assigned_student
from app.core.security import current_user
from app.db.session import get_db
from app.models import ExternalExamResult, User, utcnow
from app.services import audit

router = APIRouter()


class SubjectResult(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    topic: str = Field(min_length=1, max_length=500)
    correct_count: int = Field(ge=0, le=10000)
    wrong_count: int = Field(ge=0, le=10000)
    total_questions: int = Field(ge=1, le=10000)
    scaled_score: float = Field(ge=0, le=100000, allow_inf_nan=False)
    rank: int = Field(ge=1, le=10000000)

    @model_validator(mode="after")
    def score_bounds(self):
        self.name, self.topic = self.name.strip(), self.topic.strip()
        if not self.name or not self.topic or self.correct_count + self.wrong_count > self.total_questions:
            raise ValueError("اطلاعات درس یا تعداد پاسخ‌ها معتبر نیست")
        return self


class ResultInput(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    exam_date: str
    organizer: str = Field(min_length=2, max_length=160)
    scaled_score: float = Field(ge=0, le=100000, allow_inf_nan=False)
    rank: int = Field(ge=1, le=10000000)
    correct_count: int = Field(ge=0, le=10000)
    wrong_count: int = Field(ge=0, le=10000)
    total_questions: int = Field(ge=1, le=10000)
    subjects: list[SubjectResult] = Field(default_factory=list, max_length=50)
    notes: str = Field(default="", max_length=5000)
    version: int = Field(default=1, ge=1)

    @field_validator("exam_date")
    @classmethod
    def date_valid(cls, value):
        try:
            year, month, day = map(int, value.split("/"))
            date = jdatetime.date(year, month, day)
            if not 1300 <= year <= 1600:
                raise ValueError()
            return date.strftime("%Y/%m/%d")
        except (ValueError, TypeError):
            raise ValueError("تاریخ شمسی معتبر وارد کنید")

    @model_validator(mode="after")
    def score_valid(self):
        self.title, self.organizer = self.title.strip(), self.organizer.strip()
        if len(self.title) < 2 or len(self.organizer) < 2 or self.correct_count + self.wrong_count > self.total_questions:
            raise ValueError("عنوان، برگزارکننده یا تعداد پاسخ‌های آزمون معتبر نیست")
        return self


def authorize(db, user, student_id):
    if user.role == "student" and user.id == student_id:
        return
    if user.role == "advisor" and assigned_student(db, user.id, student_id):
        return
    raise HTTPException(403, "به نتایج این دانش‌آموز دسترسی ندارید")


def result_dict(db, row):
    author = db.get(User, row.created_by)
    editor = db.get(User, row.updated_by)
    details = json.loads(row.details_json)
    # Results saved before the richer question-count format remain readable.
    details.setdefault("organizer", "")
    for key in ("scaled_score", "rank", "correct_count", "wrong_count", "total_questions"):
        details.setdefault(key, None)
    details["subjects"] = [{"name": item.get("name", ""), "topic": item.get("topic", ""),
        "correct_count": item.get("correct_count"), "wrong_count": item.get("wrong_count"),
        "total_questions": item.get("total_questions"), "scaled_score": item.get("scaled_score"),
        "rank": item.get("rank")} for item in details.get("subjects", [])]
    return {**details, "id": row.id, "student_id": row.student_id,
        "title": row.title, "exam_date": row.exam_date, "version": row.version,
        "created_by_name": author.full_name if author else "", "updated_by_name": editor.full_name if editor else "",
        "created_at": row.created_at, "updated_at": row.updated_at}


@router.get("/students/{student_id}/external-results")
def list_results(student_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    authorize(db, user, student_id)
    rows = db.scalars(select(ExternalExamResult).where(ExternalExamResult.student_id == student_id)
        .order_by(ExternalExamResult.exam_date.desc(), ExternalExamResult.created_at.desc())).all()
    return {"success": True, "data": [result_dict(db, r) for r in rows], "meta": {}}


@router.post("/students/{student_id}/external-results")
def create_result(student_id: str, payload: ResultInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    authorize(db, user, student_id)
    row = ExternalExamResult(student_id=student_id, created_by=user.id, updated_by=user.id,
        title=payload.title, exam_date=payload.exam_date, details_json=json.dumps(payload.model_dump(exclude={"version"}), ensure_ascii=False))
    db.add(row); db.flush()
    audit(db, user.id, "external_result.created", "external_exam_result", row.id)
    db.commit()
    return {"success": True, "data": result_dict(db, row), "meta": {}}


@router.put("/students/{student_id}/external-results/{result_id}")
def edit_result(student_id: str, result_id: str, payload: ResultInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    authorize(db, user, student_id)
    row = db.get(ExternalExamResult, result_id)
    if not row or row.student_id != student_id:
        raise HTTPException(404, "نتیجه آزمون یافت نشد")
    changed = db.execute(update(ExternalExamResult).where(ExternalExamResult.id == result_id, ExternalExamResult.version == payload.version)
        .values(title=payload.title, exam_date=payload.exam_date, details_json=json.dumps(payload.model_dump(exclude={"version"}), ensure_ascii=False),
            updated_by=user.id, updated_at=utcnow(), version=payload.version+1))
    if changed.rowcount != 1:
        raise HTTPException(409, "نتیجه توسط شخص دیگری تغییر کرده است؛ صفحه را تازه کنید")
    audit(db, user.id, "external_result.updated", "external_exam_result", result_id)
    db.commit(); db.refresh(row)
    return {"success": True, "data": result_dict(db, row), "meta": {}}


@router.delete("/students/{student_id}/external-results/{result_id}")
def remove_result(student_id: str, result_id: str, version: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    authorize(db, user, student_id)
    changed = db.execute(delete(ExternalExamResult).where(ExternalExamResult.id == result_id,
        ExternalExamResult.student_id == student_id, ExternalExamResult.version == version))
    if changed.rowcount != 1:
        raise HTTPException(409, "نتیجه حذف یا ویرایش شده است؛ صفحه را تازه کنید")
    audit(db, user.id, "external_result.deleted", "external_exam_result", result_id)
    db.commit()
    return {"success": True, "data": {"deleted": True}, "meta": {}}
