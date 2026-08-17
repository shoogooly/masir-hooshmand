"""Add hourly ranges to plan activities."""
from alembic import op
import sqlalchemy as sa

revision = "20260816_0002"
down_revision = "20260815_0001"
branch_labels = None
depends_on = None


def upgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("activities")}
    with op.batch_alter_table("activities") as batch:
        if "start_time" not in existing:
            batch.add_column(sa.Column("start_time", sa.String(length=5), nullable=False, server_default="08:00"))
        if "end_time" not in existing:
            batch.add_column(sa.Column("end_time", sa.String(length=5), nullable=False, server_default="09:00"))


def downgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("activities")}
    with op.batch_alter_table("activities") as batch:
        if "end_time" in existing: batch.drop_column("end_time")
        if "start_time" in existing: batch.drop_column("start_time")
