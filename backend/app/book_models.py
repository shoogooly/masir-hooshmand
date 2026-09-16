from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from app.models import TimeMixin, uid

class Book(Base,TimeMixin):
    __tablename__="books"
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    title: Mapped[str]=mapped_column(String(60))
    publication_year: Mapped[int]=mapped_column(Integer)
    active: Mapped[bool]=mapped_column(Boolean,default=True)

class BookTopic(Base,TimeMixin):
    __tablename__="book_topics"
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    book_id: Mapped[str]=mapped_column(ForeignKey("books.id"),index=True)
    title: Mapped[str]=mapped_column(String(60))
    question_type: Mapped[str]=mapped_column(String(20))
    question_count: Mapped[int]=mapped_column(Integer)

class StudentBook(Base,TimeMixin):
    __tablename__="student_books"
    student_id: Mapped[str]=mapped_column(ForeignKey("users.id"),primary_key=True)
    book_id: Mapped[str]=mapped_column(ForeignKey("books.id"),primary_key=True)
    owned: Mapped[bool]=mapped_column(Boolean,default=True)
