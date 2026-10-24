"""Pending advisor profile changes for manager review."""
from alembic import op
import sqlalchemy as sa

revision = "20261020_0036"
down_revision = "20261012_0035"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("advisor_profiles", sa.Column("pending_changes_json", sa.Text(), nullable=False, server_default="{}"))
    op.add_column("advisor_profiles", sa.Column("pending_changes_requested_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("advisor_profiles", "pending_changes_requested_at")
    op.drop_column("advisor_profiles", "pending_changes_json")
