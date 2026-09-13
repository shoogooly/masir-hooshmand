"""Online answer sheets for advisor PDF exams."""
from alembic import op
import sqlalchemy as sa

revision = "20260912_0016"
down_revision = "20260910_0015"
branch_labels = None
depends_on = None


def upgrade():
    if "assigned_exam_sheets" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table("assigned_exam_sheets",
        sa.Column("exam_id", sa.String(36), sa.ForeignKey("assigned_exams.id"), primary_key=True),
        sa.Column("sections_json", sa.Text(), nullable=False),
        sa.Column("answers_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("negative_marking", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("assigned_exam_sheets")
