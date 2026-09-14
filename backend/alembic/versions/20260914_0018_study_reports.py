"""Persistent per-activity and daily student reports."""
from alembic import op
import sqlalchemy as sa
revision = "20260914_0018"
down_revision = "20260912_0017"
branch_labels = None
depends_on = None

def upgrade():
    if "study_reports" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table("study_reports",
        sa.Column("plan_id",sa.String(36),sa.ForeignKey("weekly_plans.id",ondelete="CASCADE"),primary_key=True),
        sa.Column("scope",sa.String(80),primary_key=True),
        sa.Column("data_json",sa.Text(),nullable=False),
        sa.Column("version",sa.Integer(),nullable=False,server_default="1"),
        sa.Column("created_at",sa.DateTime(timezone=True),nullable=False),
        sa.Column("updated_at",sa.DateTime(timezone=True),nullable=False))

def downgrade():
    op.drop_table("study_reports")
