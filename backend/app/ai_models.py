"""Private AI configuration, chat turns and durable analysis jobs."""
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from app.models import TimeMixin, uid

class AdvisorEvaluation(Base, TimeMixin):
    __tablename__ = "advisor_evaluations"
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    advisor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    assessment: Mapped[str] = mapped_column(Text, default="")
    calendar_notes: Mapped[str] = mapped_column(Text, default="")
    milestones_json: Mapped[str] = mapped_column(Text, default="[]")
    version: Mapped[int] = mapped_column(Integer, default=0)

class AIConfiguration(Base, TimeMixin):
    __tablename__ = "ai_configuration"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    provider: Mapped[str] = mapped_column(String(30), default="gapgpt")
    profiles_json: Mapped[str] = mapped_column(Text, default="{}")
    token_encrypted: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[str] = mapped_column(String(120), default="gpt-4o-mini")
    weekly_limit: Mapped[int] = mapped_column(Integer, default=5)

class AIStudentAccess(Base, TimeMixin):
    __tablename__ = "ai_student_access"
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    weekly_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weekly_auto_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    locked_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    chat_token: Mapped[str] = mapped_column(String(36), default="")
    chat_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    analysis_token: Mapped[str] = mapped_column(String(36), default="")
    analysis_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_manual_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class AITurn(Base, TimeMixin):
    __tablename__ = "ai_turns"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    request_id: Mapped[str] = mapped_column(String(36))
    week: Mapped[str] = mapped_column(String(10), index=True)
    message: Mapped[str] = mapped_column(Text)
    reply: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error: Mapped[str] = mapped_column(String(250), default="")
    __table_args__ = (UniqueConstraint("student_id", "request_id", name="uq_ai_turn_request"),)

class AIAnalysis(Base, TimeMixin):
    __tablename__ = "ai_analyses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    advisor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    student_name: Mapped[str] = mapped_column(String(120), default="")
    kind: Mapped[str] = mapped_column(String(20), default="manual")
    week: Mapped[str] = mapped_column(String(10))
    automatic_key: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    result_json: Mapped[str] = mapped_column(Text, default="{}")
    coverage_json: Mapped[str] = mapped_column(Text, default="{}")
    error: Mapped[str] = mapped_column(String(250), default="")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
