"""bale integration

Revision ID: 20260919_0028
Revises: 20260917_0027
"""
from alembic import op
import sqlalchemy as sa

revision = "20260919_0028"
down_revision = "20260917_0027"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("bale_account_links",
        sa.Column("chat_id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("state", sa.String(24), nullable=False, server_default="await_phone"),
        sa.Column("pending_phone", sa.String(16), nullable=False, server_default=""),
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id"))
    op.create_index("ix_bale_account_links_user_id", "bale_account_links", ["user_id"], unique=True)
    op.create_table("bale_access_grants",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=False, server_default=""),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_bale_access_grants_user_id", "bale_access_grants", ["user_id"])
    op.create_index("ix_bale_access_grants_kind", "bale_access_grants", ["kind"])
    op.create_index("ix_bale_access_grants_expires_at", "bale_access_grants", ["expires_at"])
    op.create_table("bale_processed_updates",
        sa.Column("update_id", sa.String(80), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))

def downgrade():
    op.drop_table("bale_processed_updates")
    op.drop_table("bale_access_grants")
    op.drop_table("bale_account_links")
