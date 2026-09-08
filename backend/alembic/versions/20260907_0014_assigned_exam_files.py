"""advisor assigned PDF exams and student answer files"""
from alembic import op
import sqlalchemy as sa

revision = "20260907_0014"
down_revision = "20260906_0013"
branch_labels = None
depends_on = None


def upgrade():
    if "assigned_exams" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "assigned_exams",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("advisor_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("student_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False, server_default=""),
        sa.Column("question_filename", sa.String(length=255), nullable=False),
        sa.Column("question_content_type", sa.String(length=80), nullable=False, server_default="application/pdf"),
        sa.Column("question_base64", sa.Text(), nullable=False),
        sa.Column("question_downloaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answer_filename", sa.String(length=255), nullable=True),
        sa.Column("answer_content_type", sa.String(length=80), nullable=True),
        sa.Column("answer_base64", sa.Text(), nullable=True),
        sa.Column("student_notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("answer_uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("analysis_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("resources_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("lesson_filename", sa.String(length=255), nullable=True),
        sa.Column("lesson_content_type", sa.String(length=80), nullable=True),
        sa.Column("lesson_base64", sa.Text(), nullable=True),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="assigned"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_assigned_exams_advisor_id", "assigned_exams", ["advisor_id"])
    op.create_index("ix_assigned_exams_student_id", "assigned_exams", ["student_id"])
    op.create_index("ix_assigned_exams_status", "assigned_exams", ["status"])


def downgrade():
    op.drop_index("ix_assigned_exams_status", table_name="assigned_exams")
    op.drop_index("ix_assigned_exams_student_id", table_name="assigned_exams")
    op.drop_index("ix_assigned_exams_advisor_id", table_name="assigned_exams")
    op.drop_table("assigned_exams")
