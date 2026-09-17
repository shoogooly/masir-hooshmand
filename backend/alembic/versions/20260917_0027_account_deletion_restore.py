"""Add three-day account deletion recovery.

Revision ID: 20260917_0027
Revises: 20260917_0026
"""
from alembic import op
import sqlalchemy as sa

revision = "20260917_0027"
down_revision = "20260917_0026"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("restore_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("deleted_phone", sa.String(length=16), nullable=True))
    op.add_column("users", sa.Column("status_before_deletion", sa.String(length=20), nullable=True))
    op.create_index("ix_users_deleted_phone", "users", ["deleted_phone"], unique=False)


def downgrade():
    op.drop_index("ix_users_deleted_phone", table_name="users")
    op.drop_column("users", "status_before_deletion")
    op.drop_column("users", "deleted_phone")
    op.drop_column("users", "restore_until")
    op.drop_column("users", "deleted_at")
