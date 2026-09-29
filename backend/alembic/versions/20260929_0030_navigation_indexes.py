"""Indexes for dashboard and notification summary queries.

Revision ID: 20260929_0030
Revises: 20260919_0029
"""
from alembic import op
from contextlib import nullcontext

revision = "20260929_0030"
down_revision = "20260919_0029"
branch_labels = None
depends_on = None


def upgrade():
    postgres = op.get_bind().dialect.name == "postgresql"
    context = op.get_context().autocommit_block() if postgres else nullcontext()
    with context:
        op.create_index("ix_advisor_assignments_advisor_active", "advisor_assignments", ["advisor_id", "active"], postgresql_concurrently=postgres)
        op.create_index("ix_weekly_plans_summary", "weekly_plans", ["status", "advisor_id", "student_id", "published_at"], postgresql_concurrently=postgres)
        op.create_index("ix_weekly_plans_expiry_lookup", "weekly_plans", ["status", "advisor_expiry_notified_at", "ends_at"], postgresql_concurrently=postgres)
        op.create_index("ix_messages_unread_summary", "messages", ["recipient_id", "read_at", "internal_note", "sender_id"], postgresql_concurrently=postgres)
        op.create_index("ix_notifications_unread_summary", "notifications", ["user_id", "read_at", "kind"], postgresql_concurrently=postgres)


def downgrade():
    postgres = op.get_bind().dialect.name == "postgresql"
    context = op.get_context().autocommit_block() if postgres else nullcontext()
    with context:
        op.drop_index("ix_notifications_unread_summary", table_name="notifications", postgresql_concurrently=postgres)
        op.drop_index("ix_messages_unread_summary", table_name="messages", postgresql_concurrently=postgres)
        op.drop_index("ix_weekly_plans_expiry_lookup", table_name="weekly_plans", postgresql_concurrently=postgres)
        op.drop_index("ix_weekly_plans_summary", table_name="weekly_plans", postgresql_concurrently=postgres)
        op.drop_index("ix_advisor_assignments_advisor_active", table_name="advisor_assignments", postgresql_concurrently=postgres)
