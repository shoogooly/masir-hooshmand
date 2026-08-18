"""Add the shared daily time range to weekly plans."""
from alembic import op
import sqlalchemy as sa

revision = "20260818_0004"
down_revision = "20260818_0003"
branch_labels = None
depends_on = None


def upgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("weekly_plans")}
    with op.batch_alter_table("weekly_plans") as batch:
        if "day_start_time" not in existing:
            batch.add_column(sa.Column("day_start_time", sa.String(length=5), nullable=False, server_default="08:00"))
        if "day_end_time" not in existing:
            batch.add_column(sa.Column("day_end_time", sa.String(length=5), nullable=False, server_default="24:00"))


def downgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("weekly_plans")}
    with op.batch_alter_table("weekly_plans") as batch:
        if "day_end_time" in existing:
            batch.drop_column("day_end_time")
        if "day_start_time" in existing:
            batch.drop_column("day_start_time")
