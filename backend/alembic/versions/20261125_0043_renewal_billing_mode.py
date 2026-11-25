"""Store an optional per-student renewal billing preference."""

import sqlalchemy as sa
from alembic import op

revision = "20261125_0043"
down_revision = "20261124_0042"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("renewal_billing_mode", sa.String(16), nullable=True))


def downgrade():
    op.drop_column("users", "renewal_billing_mode")
