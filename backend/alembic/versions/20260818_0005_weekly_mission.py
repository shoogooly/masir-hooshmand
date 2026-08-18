"""Add a weekly mission to each plan version."""
from alembic import op
import sqlalchemy as sa

revision = "20260818_0005"
down_revision = "20260818_0004"
branch_labels = None
depends_on = None


def upgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("weekly_plans")}
    if "weekly_mission" not in existing:
        with op.batch_alter_table("weekly_plans") as batch:
            batch.add_column(sa.Column("weekly_mission", sa.Text(), nullable=False, server_default=""))


def downgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("weekly_plans")}
    if "weekly_mission" in existing:
        with op.batch_alter_table("weekly_plans") as batch:
            batch.drop_column("weekly_mission")
