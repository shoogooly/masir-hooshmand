from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.book_models import Book, BookTopic, StudentBook
from app.models import AcademicCalendar, AcademicCalendarNode
from app.book_service import catalog
from app.ai_service import require_student
from app.core.security import roles
from app.db.session import get_db
from app.services import audit

router=APIRouter()
def ok(data):return {"success":True,"data":data}
class BookInput(BaseModel):
    title: str=Field(min_length=1,max_length=60)
    subject: str=Field(default="",max_length=120)
    publication_year: int=Field(ge=1300,le=2100)
    active: bool=True
    @field_validator("title")
    @classmethod
    def nonblank(cls,v):
        if not v.strip():raise ValueError("عنوان را وارد کنید")
        return v.strip()
class TopicInput(BaseModel):
    title: str=Field(min_length=1,max_length=60)
    calendar_topic_id: str=Field(default="",max_length=36)
    question_type: Literal["test","written"]
    question_count: int=Field(ge=0,le=100000,strict=True)
    @field_validator("title")
    @classmethod
    def nonblank(cls,v):
        if not v.strip():raise ValueError("عنوان را وارد کنید")
        return v.strip()
class Ownership(BaseModel):
    owned: bool

@router.get("/books")
def list_books(user=Depends(roles("student","super_admin")),db=Depends(get_db)):
    return ok(catalog(db,user.id if user.role=="student" else None))
@router.get("/advisors/students/{student_id}/books")
def student_books(student_id:str,user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    require_student(db,student_id,user)
    return ok(catalog(db,student_id))

@router.post("/advisors/students/{student_id}/books")
def advisor_create_book(student_id:str,payload:BookInput,user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    require_student(db,student_id,user)
    row=Book(title=payload.title,subject=payload.subject,publication_year=payload.publication_year,
             active=True,created_for_student_id=student_id)
    db.add(row);db.flush()
    db.add(StudentBook(student_id=student_id,book_id=row.id,owned=True))
    audit(db,user.id,"student_book.created","book",row.id,after={"student_id":student_id,"title":row.title})
    db.commit()
    return ok({"id":row.id,"owned":True})
@router.post("/books")
def create_book(payload:BookInput,user=Depends(roles("super_admin")),db=Depends(get_db)):
    row=Book(**payload.model_dump());db.add(row);db.commit();return ok({"id":row.id})
def may_edit_book(db,book,user):
    if user.role=="super_admin":return
    if user.role=="advisor" and book.created_for_student_id:
        require_student(db,book.created_for_student_id,user)
        return
    raise HTTPException(403,"فقط کتاب اختصاصی دانش‌آموز خودتان را می‌توانید ویرایش کنید")

@router.put("/books/{book_id}")
def update_book(book_id:str,payload:BookInput,user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    row=db.get(Book,book_id)
    if not row:raise HTTPException(404,"کتاب یافت نشد")
    may_edit_book(db,row,user)
    for key,value in payload.model_dump().items():setattr(row,key,value)
    db.commit();return ok({"id":row.id})
@router.post("/books/{book_id}/topics")
def create_topic(book_id:str,payload:TopicInput,user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    book=db.get(Book,book_id)
    if not book:raise HTTPException(404,"کتاب یافت نشد")
    may_edit_book(db,book,user)
    validate_calendar_link(db,book,payload.calendar_topic_id)
    row=BookTopic(book_id=book_id,**payload.model_dump());db.add(row);db.commit();return ok({"id":row.id})
@router.put("/books/{book_id}/topics/{topic_id}")
def update_topic(book_id:str,topic_id:str,payload:TopicInput,user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    row=db.get(BookTopic,topic_id)
    if not row or row.book_id!=book_id:raise HTTPException(404,"مبحث یافت نشد")
    book=db.get(Book,book_id)
    may_edit_book(db,book,user)
    validate_calendar_link(db,book,payload.calendar_topic_id)
    for key,value in payload.model_dump().items():setattr(row,key,value)
    db.commit();return ok({"id":row.id})

def validate_calendar_link(db,book,topic_id):
    if not topic_id:return
    node=db.get(AcademicCalendarNode,topic_id)
    if not node or not book or (book.subject and book.subject!=node.subject):
        raise HTTPException(422,"مبحث تقویم با درس کتاب یکسان نیست")
@router.put("/books/{book_id}/ownership")
def set_ownership(book_id:str,payload:Ownership,user=Depends(roles("student")),db=Depends(get_db)):
    book=db.get(Book,book_id)
    if not book or book.created_for_student_id not in (None,user.id):
        raise HTTPException(404,"کتاب یافت نشد")
    return change_ownership(db,user.id,book,payload.owned,user.id)

@router.put("/advisors/students/{student_id}/books/{book_id}/ownership")
def advisor_set_ownership(student_id:str,book_id:str,payload:Ownership,
                          user=Depends(roles("advisor","super_admin")),db=Depends(get_db)):
    require_student(db,student_id,user)
    book=db.get(Book,book_id)
    if not book or book.created_for_student_id not in (None,student_id):
        raise HTTPException(404,"کتاب یافت نشد")
    return change_ownership(db,student_id,book,payload.owned,user.id)

def change_ownership(db,student_id,book,owned,actor_id):
    if owned and not book.active:raise HTTPException(422,"کتاب غیرفعال است")
    row=db.get(StudentBook,(student_id,book.id))
    if not row:
        try:
            with db.begin_nested():
                row=StudentBook(student_id=student_id,book_id=book.id,owned=owned);db.add(row);db.flush()
        except IntegrityError:
            row=db.get(StudentBook,(student_id,book.id));row.owned=owned
    else:row.owned=owned
    audit(db,actor_id,"student_book.assigned" if owned else "student_book.removed","book",book.id,
          after={"student_id":student_id})
    db.commit();return ok({"owned":row.owned})
