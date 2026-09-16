from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.book_models import Book, BookTopic, StudentBook
from app.book_service import catalog
from app.ai_service import require_student
from app.core.security import roles
from app.db.session import get_db

router=APIRouter()
def ok(data):return {"success":True,"data":data}
class BookInput(BaseModel):
    title: str=Field(min_length=1,max_length=60)
    publication_year: int=Field(ge=1300,le=2100)
    active: bool=True
    @field_validator("title")
    @classmethod
    def nonblank(cls,v):
        if not v.strip():raise ValueError("عنوان را وارد کنید")
        return v.strip()
class TopicInput(BaseModel):
    title: str=Field(min_length=1,max_length=60)
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
    return ok([b for b in catalog(db,student_id) if b["owned"]])
@router.post("/books")
def create_book(payload:BookInput,user=Depends(roles("super_admin")),db=Depends(get_db)):
    row=Book(**payload.model_dump());db.add(row);db.commit();return ok({"id":row.id})
@router.put("/books/{book_id}")
def update_book(book_id:str,payload:BookInput,user=Depends(roles("super_admin")),db=Depends(get_db)):
    row=db.get(Book,book_id)
    if not row:raise HTTPException(404,"کتاب یافت نشد")
    for key,value in payload.model_dump().items():setattr(row,key,value)
    db.commit();return ok({"id":row.id})
@router.post("/books/{book_id}/topics")
def create_topic(book_id:str,payload:TopicInput,user=Depends(roles("super_admin")),db=Depends(get_db)):
    if not db.get(Book,book_id):raise HTTPException(404,"کتاب یافت نشد")
    row=BookTopic(book_id=book_id,**payload.model_dump());db.add(row);db.commit();return ok({"id":row.id})
@router.put("/books/{book_id}/topics/{topic_id}")
def update_topic(book_id:str,topic_id:str,payload:TopicInput,user=Depends(roles("super_admin")),db=Depends(get_db)):
    row=db.get(BookTopic,topic_id)
    if not row or row.book_id!=book_id:raise HTTPException(404,"مبحث یافت نشد")
    for key,value in payload.model_dump().items():setattr(row,key,value)
    db.commit();return ok({"id":row.id})
@router.put("/books/{book_id}/ownership")
def set_ownership(book_id:str,payload:Ownership,user=Depends(roles("student")),db=Depends(get_db)):
    book=db.get(Book,book_id)
    if not book or (payload.owned and not book.active):raise HTTPException(404,"کتاب فعال یافت نشد")
    row=db.get(StudentBook,(user.id,book_id))
    if not row:
        try:
            with db.begin_nested():
                row=StudentBook(student_id=user.id,book_id=book_id,owned=payload.owned);db.add(row);db.flush()
        except IntegrityError:
            row=db.get(StudentBook,(user.id,book_id));row.owned=payload.owned
    else:row.owned=payload.owned
    db.commit();return ok({"owned":row.owned})
