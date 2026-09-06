"""staff roles, education scopes and approval workflows

Revision ID: 20260905_0007
Revises: 20260830_0006
"""
from alembic import op
import sqlalchemy as sa


revision = "20260905_0007"
down_revision = "20260830_0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("student_profiles", sa.Column("education_level", sa.String(20), nullable=False, server_default="upper_secondary"))
    op.create_index("ix_student_profiles_education_level", "student_profiles", ["education_level"])
    op.add_column("advisor_profiles", sa.Column("education_level", sa.String(20), nullable=False, server_default="upper_secondary"))
    op.create_index("ix_advisor_profiles_education_level", "advisor_profiles", ["education_level"])
    op.add_column("advisor_profiles", sa.Column("lead_approval_status", sa.String(20), nullable=False, server_default="pending"))
    op.add_column("advisor_profiles", sa.Column("lead_reviewed_by", sa.String(36), nullable=True))
    op.add_column("advisor_profiles", sa.Column("lead_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("advisor_profiles", sa.Column("admin_approval_status", sa.String(20), nullable=False, server_default="pending"))
    op.add_column("advisor_profiles", sa.Column("admin_reviewed_by", sa.String(36), nullable=True))
    op.add_column("advisor_profiles", sa.Column("admin_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_advisor_profiles_lead_approval_status", "advisor_profiles", ["lead_approval_status"])
    op.create_index("ix_advisor_profiles_admin_approval_status", "advisor_profiles", ["admin_approval_status"])
    op.add_column("advisor_assignments", sa.Column("approval_status", sa.String(24), nullable=False, server_default="approved"))
    op.add_column("advisor_assignments", sa.Column("assignment_source", sa.String(20), nullable=False, server_default="admin"))
    op.add_column("advisor_assignments", sa.Column("assigned_by", sa.String(36), nullable=True))
    op.add_column("advisor_assignments", sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_advisor_assignments_approval_status", "advisor_assignments", ["approval_status"])
    op.execute("UPDATE advisor_profiles SET lead_approval_status='approved', admin_approval_status='approved' WHERE approval_status='approved'")


def downgrade():
    op.drop_index("ix_advisor_assignments_approval_status", table_name="advisor_assignments")
    for name in ("decided_at", "assigned_by", "assignment_source", "approval_status"):
        op.drop_column("advisor_assignments", name)
    op.drop_index("ix_advisor_profiles_admin_approval_status", table_name="advisor_profiles")
    op.drop_index("ix_advisor_profiles_lead_approval_status", table_name="advisor_profiles")
    for name in ("admin_reviewed_at", "admin_reviewed_by", "admin_approval_status", "lead_reviewed_at", "lead_reviewed_by", "lead_approval_status"):
        op.drop_column("advisor_profiles", name)
    op.drop_index("ix_advisor_profiles_education_level", table_name="advisor_profiles")
    op.drop_column("advisor_profiles", "education_level")
    op.drop_index("ix_student_profiles_education_level", table_name="student_profiles")
    op.drop_column("student_profiles", "education_level")
