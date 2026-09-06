"""registration profiles, school schedule, advisor approval and capacity

Revision ID: 20260830_0006
Revises: 20260818_0005
Create Date: 2026-08-30
"""
from alembic import op
import sqlalchemy as sa


revision = "20260830_0006"
down_revision = "20260818_0005"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("password_hash", sa.String(length=255), nullable=False, server_default=""))
        batch.add_column(sa.Column("onboarding_step", sa.String(length=40), nullable=False, server_default="completed"))

    with op.batch_alter_table("student_profiles") as batch:
        batch.add_column(sa.Column("national_code", sa.String(length=10), nullable=False, server_default=""))
        batch.add_column(sa.Column("birth_date", sa.String(length=10), nullable=False, server_default=""))
        batch.add_column(sa.Column("parent_name", sa.String(length=120), nullable=False, server_default=""))
        batch.add_column(sa.Column("parent_phone", sa.String(length=16), nullable=False, server_default=""))
        batch.add_column(sa.Column("address", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("average_grade9", sa.Float(), nullable=True))
        batch.add_column(sa.Column("average_grade10", sa.Float(), nullable=True))
        batch.add_column(sa.Column("average_grade11", sa.Float(), nullable=True))
        batch.add_column(sa.Column("average_grade12", sa.Float(), nullable=True))
        batch.add_column(sa.Column("school_schedule_json", sa.Text(), nullable=False, server_default="{}"))
        batch.add_column(sa.Column("extra_classes_json", sa.Text(), nullable=False, server_default="{}"))
        batch.add_column(sa.Column("advisor_selection_mode", sa.String(length=20), nullable=False, server_default="admin"))
        batch.add_column(sa.Column("preferred_advisor_id", sa.String(length=36), nullable=True))
        batch.create_foreign_key("fk_student_preferred_advisor", "users", ["preferred_advisor_id"], ["id"])

    op.create_table(
        "advisor_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("national_code", sa.String(length=10), nullable=False, server_default=""),
        sa.Column("birth_date", sa.String(length=10), nullable=False, server_default=""),
        sa.Column("address", sa.Text(), nullable=False, server_default=""),
        sa.Column("education_degree", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("education_field", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("experience_years", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bio", sa.Text(), nullable=False, server_default=""),
        sa.Column("support_capacity", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("academic_year", sa.String(length=20), nullable=False, server_default="1405-1406"),
        sa.Column("documents_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("approval_status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by", sa.String(length=36), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_advisor_profiles_user_id", "advisor_profiles", ["user_id"], unique=True)
    op.create_index("ix_advisor_profiles_approval_status", "advisor_profiles", ["approval_status"], unique=False)


def downgrade():
    op.drop_index("ix_advisor_profiles_approval_status", table_name="advisor_profiles")
    op.drop_index("ix_advisor_profiles_user_id", table_name="advisor_profiles")
    op.drop_table("advisor_profiles")
    with op.batch_alter_table("student_profiles") as batch:
        batch.drop_constraint("fk_student_preferred_advisor", type_="foreignkey")
        for column in (
            "preferred_advisor_id", "advisor_selection_mode", "extra_classes_json", "school_schedule_json",
            "average_grade12", "average_grade11", "average_grade10", "average_grade9", "address",
            "parent_phone", "parent_name", "birth_date", "national_code",
        ):
            batch.drop_column(column)

    with op.batch_alter_table("users") as batch:
        batch.drop_column("onboarding_step")
        batch.drop_column("password_hash")

