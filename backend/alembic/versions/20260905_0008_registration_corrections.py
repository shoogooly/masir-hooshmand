"""registration rejection reasons and correction flow

Revision ID: 20260905_0008
Revises: 20260905_0007
"""
from alembic import op
import sqlalchemy as sa


revision = "20260905_0008"
down_revision = "20260905_0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("student_profiles", sa.Column("registration_review_status", sa.String(20), nullable=False, server_default="not_reviewed"))
    op.add_column("student_profiles", sa.Column("registration_review_note", sa.Text(), nullable=False, server_default=""))
    op.add_column("student_profiles", sa.Column("registration_reviewed_by", sa.String(36), nullable=True))
    op.add_column("student_profiles", sa.Column("registration_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("student_profiles", sa.Column("correction_return_step", sa.String(40), nullable=False, server_default="selection"))
    op.create_index("ix_student_profiles_registration_review_status", "student_profiles", ["registration_review_status"])


def downgrade():
    op.drop_index("ix_student_profiles_registration_review_status", table_name="student_profiles")
    op.drop_column("student_profiles", "correction_return_step")
    op.drop_column("student_profiles", "registration_reviewed_at")
    op.drop_column("student_profiles", "registration_reviewed_by")
    op.drop_column("student_profiles", "registration_review_note")
    op.drop_column("student_profiles", "registration_review_status")
