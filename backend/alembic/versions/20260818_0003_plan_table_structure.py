"""Store weekly plan table days and time slots."""
from alembic import op
import sqlalchemy as sa

revision = "20260818_0003"
down_revision = "20260816_0002"
branch_labels = None
depends_on = None


def upgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("weekly_plans")}
    with op.batch_alter_table("weekly_plans") as batch:
        if "schedule_days_json" not in existing:
            batch.add_column(sa.Column("schedule_days_json", sa.Text(), nullable=False, server_default="[]"))
        if "time_slots_json" not in existing:
            batch.add_column(sa.Column("time_slots_json", sa.Text(), nullable=False, server_default="[]"))


def downgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("weekly_plans")}
    with op.batch_alter_table("weekly_plans") as batch:
        if "time_slots_json" in existing:
            batch.drop_column("time_slots_json")
        if "schedule_days_json" in existing:
            batch.drop_column("schedule_days_json")
