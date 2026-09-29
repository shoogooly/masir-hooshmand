"""Add configurable duration for the referral-only free registration plan."""
from alembic import op
import sqlalchemy as sa

revision = "20260929_0033"
down_revision = "20260929_0032"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("subscription_plans", sa.Column("duration_days", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("subscription_plans") as batch:
        batch.drop_column("duration_days")
