"""Store the motivational sentence shown when a plan was published."""
from alembic import op
import sqlalchemy as sa

revision = "20261025_0039"
down_revision = "20261025_0038"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("weekly_plans", sa.Column("motivational_quote", sa.String(240),
                                           nullable=False, server_default=""))


def downgrade():
    op.drop_column("weekly_plans", "motivational_quote")
