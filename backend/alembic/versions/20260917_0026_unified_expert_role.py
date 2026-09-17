"""Unify secondary managers as experts.

Revision ID: 20260917_0026
Revises: 20260916_0025
"""
from alembic import op

revision = "20260917_0026"
down_revision = "20260916_0025"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE users SET role = 'expert' WHERE role IN ('upper_secondary_manager', 'lower_secondary_manager')")


def downgrade():
    op.execute("UPDATE users SET role = 'upper_secondary_manager' WHERE role = 'expert'")
