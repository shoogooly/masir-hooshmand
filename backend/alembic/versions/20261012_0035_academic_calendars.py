"""Grade calendar templates and per-student selection."""
from alembic import op
import sqlalchemy as sa

revision = "20261012_0035"
down_revision = "20261010_0034"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("academic_calendars",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("grade", sa.String(40), nullable=False),
        sa.Column("major", sa.String(40), nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("designer_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("designer_name", sa.String(120), nullable=False),
        sa.Column("designer_role", sa.String(32), nullable=False),
        sa.Column("source_student_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_academic_calendars_grade", "academic_calendars", ["grade"])
    op.create_index("ix_academic_calendars_major", "academic_calendars", ["major"])
    op.create_index("ix_academic_calendars_designer_id", "academic_calendars", ["designer_id"])
    op.create_index("ix_academic_calendars_source_student_id", "academic_calendars", ["source_student_id"])
    op.create_table("academic_calendar_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("calendar_id", sa.String(36), sa.ForeignKey("academic_calendars.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(120), nullable=False),
        sa.Column("topics", sa.Text(), nullable=False))
    op.create_index("ix_academic_calendar_items_calendar_id", "academic_calendar_items", ["calendar_id"])
    op.create_table("student_academic_calendars",
        sa.Column("student_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("calendar_id", sa.String(36), sa.ForeignKey("academic_calendars.id"), nullable=False),
        sa.Column("selected_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_student_academic_calendars_calendar_id", "student_academic_calendars", ["calendar_id"])


def downgrade():
    op.drop_table("student_academic_calendars")
    op.drop_table("academic_calendar_items")
    op.drop_table("academic_calendars")
