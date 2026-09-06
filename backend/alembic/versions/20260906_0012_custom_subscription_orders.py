"""custom subscription expiry on orders"""
from alembic import op
import sqlalchemy as sa

revision = "20260906_0012"
down_revision = "20260905_0011"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("orders", sa.Column("custom_expires_at", sa.DateTime(timezone=True), nullable=True))

def downgrade():
    op.drop_column("orders", "custom_expires_at")
