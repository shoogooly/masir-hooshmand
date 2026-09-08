import base64
import binascii
import json
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import current_user, roles
from app.db.session import get_db
from app.models import AdvisorAssignment, AssignedExam, Notification, User, utcnow
from app.services import audit

router = APIRouter()
MAX_PDF_BYTES = 15 * 1024 * 1024


class PdfFile(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = "application/pdf"
    content_base64: str = Field(min_length=8)


class AssignedExamCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    instructions: str = Field(default="", max_length=5000)
    question_file: PdfFile


class AnswerUpload(BaseModel):
    notes: str = Field(default="", max_length=5000)
    answer_file: PdfFile


class AnalysisUpdate(BaseModel):
    analysis_text: str = Field(default="", max_length=10000)
    resource_links: list[HttpUrl] = Field(default_factory=list, max_length=20)
    lesson_file: PdfFile | None = None


def ok(data=None):
    return {"success": True, "data": data, "meta": {}}


def validate_pdf(file: PdfFile):
    if file.content_type != "application/pdf" or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(422, "فقط فایل PDF قابل بارگذاری است")
    try:
        raw = base64.b64decode(file.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "محتوای فایل معتبر نیست")
    if len(raw) > MAX_PDF_BYTES:
        raise HTTPException(413, "حجم فایل PDF نباید بیشتر از ۱۵ مگابایت باشد")
    if not raw.startswith(b"%PDF"):
        raise HTTPException(422, "فایل بارگذاری‌شده PDF معتبر نیست")


def assigned_student(db: Session, advisor_id: str, student_id: str):
    return db.scalar(select(AdvisorAssignment).where(
        AdvisorAssignment.advisor_id == advisor_id,
        AdvisorAssignment.student_id == student_id,
        AdvisorAssignment.active.is_(True),
        AdvisorAssignment.approval_status == "approved",
    ))


def exam_dict(db: Session, item: AssignedExam):
    elapsed_minutes = None
    if item.question_downloaded_at and item.answer_uploaded_at:
        downloaded_at = item.question_downloaded_at if item.question_downloaded_at.tzinfo else item.question_downloaded_at.replace(tzinfo=timezone.utc)
        uploaded_at = item.answer_uploaded_at if item.answer_uploaded_at.tzinfo else item.answer_uploaded_at.replace(tzinfo=timezone.utc)
        elapsed_minutes = max(0, round((uploaded_at - downloaded_at).total_seconds() / 60))
    advisor = db.get(User, item.advisor_id)
    student = db.get(User, item.student_id)
    return {
        "id": item.id, "title": item.title, "duration_minutes": item.duration_minutes,
        "instructions": item.instructions, "status": item.status,
        "advisor": {"id": advisor.id, "full_name": advisor.full_name} if advisor else None,
        "student": {"id": student.id, "full_name": student.full_name} if student else None,
        "question_filename": item.question_filename,
        "question_downloaded_at": item.question_downloaded_at,
        "answer_filename": item.answer_filename, "student_notes": item.student_notes,
        "answer_uploaded_at": item.answer_uploaded_at,
        "elapsed_minutes": elapsed_minutes,
        "analysis_text": item.analysis_text,
        "resource_links": json.loads(item.resources_json or "[]"),
        "lesson_filename": item.lesson_filename, "analyzed_at": item.analyzed_at,
        "created_at": item.created_at,
    }


def access_exam(db: Session, exam_id: str, user: User):
    item = db.get(AssignedExam, exam_id)
    if not item:
        raise HTTPException(404, "آزمون یافت نشد")
    allowed = (user.role == "student" and item.student_id == user.id) or (user.role == "advisor" and item.advisor_id == user.id) or user.role == "super_admin"
    if not allowed:
        raise HTTPException(403, "به این آزمون دسترسی ندارید")
    return item


@router.get("/assigned-exams")
def list_assigned_exams(student_id: str | None = Query(default=None), user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(AssignedExam).order_by(AssignedExam.created_at.desc())
    if user.role == "student":
        stmt = stmt.where(AssignedExam.student_id == user.id)
    elif user.role == "advisor":
        stmt = stmt.where(AssignedExam.advisor_id == user.id)
        if student_id:
            if not assigned_student(db, user.id, student_id):
                raise HTTPException(403, "این دانش‌آموز به شما تخصیص ندارد")
            stmt = stmt.where(AssignedExam.student_id == student_id)
    elif user.role != "super_admin":
        raise HTTPException(403, "دسترسی به آزمون‌ها مجاز نیست")
    return ok([exam_dict(db, item) for item in db.scalars(stmt).all()])


@router.post("/advisors/students/{student_id}/assigned-exams")
def create_assigned_exam(student_id: str, payload: AssignedExamCreate, user: User = Depends(roles("advisor")), db: Session = Depends(get_db)):
    if not assigned_student(db, user.id, student_id):
        raise HTTPException(403, "این دانش‌آموز به شما تخصیص ندارد")
    validate_pdf(payload.question_file)
    item = AssignedExam(advisor_id=user.id, student_id=student_id, title=payload.title,
        duration_minutes=payload.duration_minutes or 0, instructions=payload.instructions,
        question_filename=payload.question_file.filename, question_content_type=payload.question_file.content_type,
        question_base64=payload.question_file.content_base64)
    db.add(item)
    db.flush()
    db.add(Notification(user_id=student_id, actor_id=user.id, kind="exam_assigned", title="آزمون جدید برای شما ثبت شد", body=payload.title, link="/app/student/exams", related_id=item.id))
    audit(db, user.id, "assigned_exam.created", "assigned_exam", item.id, after={"student_id": student_id, "duration_minutes": item.duration_minutes})
    db.commit()
    db.refresh(item)
    return ok(exam_dict(db, item))


@router.get("/assigned-exams/{exam_id}/question-file")
def download_question(exam_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access_exam(db, exam_id, user)
    if user.role == "student" and item.question_downloaded_at is None:
        item.question_downloaded_at = utcnow()
        item.status = "downloaded"
        audit(db, user.id, "assigned_exam.question_downloaded", "assigned_exam", item.id)
        db.commit()
    return ok({"filename": item.question_filename, "content_type": item.question_content_type, "content_base64": item.question_base64, "downloaded_at": item.question_downloaded_at})


@router.post("/assigned-exams/{exam_id}/answer")
def upload_answer(exam_id: str, payload: AnswerUpload, user: User = Depends(roles("student")), db: Session = Depends(get_db)):
    item = access_exam(db, exam_id, user)
    validate_pdf(payload.answer_file)
    item.answer_filename = payload.answer_file.filename
    item.answer_content_type = payload.answer_file.content_type
    item.answer_base64 = payload.answer_file.content_base64
    item.student_notes = payload.notes
    item.answer_uploaded_at = utcnow()
    item.status = "answered"
    db.add(Notification(user_id=item.advisor_id, actor_id=user.id, kind="exam_answered", title="پاسخنامه دانش‌آموز بارگذاری شد", body=item.title, link=f"/app/advisor/students/{item.student_id}/exams", related_id=item.id))
    audit(db, user.id, "assigned_exam.answer_uploaded", "assigned_exam", item.id)
    db.commit()
    return ok(exam_dict(db, item))


@router.get("/assigned-exams/{exam_id}/answer-file")
def download_answer(exam_id: str, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    item = access_exam(db, exam_id, user)
    if not item.answer_base64:
        raise HTTPException(404, "پاسخنامه‌ای بارگذاری نشده است")
    return ok({"filename": item.answer_filename, "content_type": item.answer_content_type, "content_base64": item.answer_base64})


@router.patch("/assigned-exams/{exam_id}/analysis")
def update_analysis(exam_id: str, payload: AnalysisUpdate, user: User = Depends(roles("advisor")), db: Session = Depends(get_db)):
    item = access_exam(db, exam_id, user)
    if payload.lesson_file:
        validate_pdf(payload.lesson_file)
        item.lesson_filename = payload.lesson_file.filename
        item.lesson_content_type = payload.lesson_file.content_type
        item.lesson_base64 = payload.lesson_file.content_base64
    item.analysis_text = payload.analysis_text
    item.resources_json = json.dumps([str(link) for link in payload.resource_links], ensure_ascii=False)
    item.analyzed_at = utcnow()
    item.status = "analyzed"
    db.add(Notification(user_id=item.student_id, actor_id=user.id, kind="exam_analysis", title="تحلیل آزمون شما آماده شد", body=item.title, link="/app/student/exams", related_id=item.id))
    audit(db, user.id, "assigned_exam.analyzed", "assigned_exam", item.id)
    db.commit()
    return ok(exam_dict(db, item))


@router.get("/assigned-exams/{exam_id}/lesson-file")
def download_lesson(exam_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access_exam(db, exam_id, user)
    if not item.lesson_base64:
        raise HTTPException(404, "فایل درسنامه‌ای بارگذاری نشده است")
    return ok({"filename": item.lesson_filename, "content_type": item.lesson_content_type, "content_base64": item.lesson_base64})
