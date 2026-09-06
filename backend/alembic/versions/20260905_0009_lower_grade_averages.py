"""add grade seven and eight averages

Revision ID: 20260905_0009
Revises: 20260905_0008
"""
from alembic import op
import sqlalchemy as sa


revision = "20260905_0009"
down_revision = "20260905_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("student_profiles", sa.Column("average_grade7", sa.Float(), nullable=True))
    op.add_column("student_profiles", sa.Column("average_grade8", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("student_profiles", "average_grade8")
    op.drop_column("student_profiles", "average_grade7")
