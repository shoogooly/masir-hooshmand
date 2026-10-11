"""Plan modes, editable drafts and external exam result history."""
from alembic import op
import sqlalchemy as sa

revision = "20261010_0034"
down_revision = "20260929_0033"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("assigned_exams", sa.Column("batch_id", sa.String(36), nullable=True))
    op.create_index("ix_assigned_exams_batch_student", "assigned_exams", ["batch_id", "student_id"], unique=True)
    op.add_column("weekly_plans", sa.Column("plan_mode", sa.String(20), nullable=False, server_default="timed"))
    op.add_column("weekly_plans", sa.Column("draft_state_json", sa.Text(), nullable=False, server_default="{}"))
    op.create_table("external_exam_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("student_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("exam_date", sa.String(10), nullable=False),
        sa.Column("details_json", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_external_exam_results_student_id", "external_exam_results", ["student_id"])
    op.create_index("ix_external_exam_results_exam_date", "external_exam_results", ["exam_date"])


def downgrade():
    op.drop_index("ix_assigned_exams_batch_student", table_name="assigned_exams")
    with op.batch_alter_table("assigned_exams") as batch:
        batch.drop_column("batch_id")
    op.drop_table("external_exam_results")
    with op.batch_alter_table("weekly_plans") as batch:
        batch.drop_column("draft_state_json")
        batch.drop_column("plan_mode")
