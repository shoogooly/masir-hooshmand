"""Advisor assessment and academic calendar."""
from alembic import op
import sqlalchemy as sa
revision="20260915_0021"
down_revision="20260915_0020"
branch_labels=None
depends_on=None
def upgrade():
    if "advisor_evaluations" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table("advisor_evaluations",
            sa.Column("student_id",sa.String(36),sa.ForeignKey("users.id"),primary_key=True),
            sa.Column("advisor_id",sa.String(36),sa.ForeignKey("users.id"),primary_key=True),
            sa.Column("assessment",sa.Text(),nullable=False),
            sa.Column("calendar_notes",sa.Text(),nullable=False),
            sa.Column("milestones_json",sa.Text(),nullable=False),
            sa.Column("version",sa.Integer(),nullable=False),
            sa.Column("created_at",sa.DateTime(timezone=True),nullable=False),
            sa.Column("updated_at",sa.DateTime(timezone=True),nullable=False))
def downgrade():
    op.drop_table("advisor_evaluations")
