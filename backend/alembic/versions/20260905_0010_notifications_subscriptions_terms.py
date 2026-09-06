"""notifications, subscriptions, referrals and terms"""
from alembic import op
import sqlalchemy as sa
revision = "20260905_0010"
down_revision = "20260905_0009"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("users", sa.Column("referred_by_advisor_id", sa.String(36), nullable=True))
    op.add_column("users", sa.Column("terms_accepted_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_users_referred_by_advisor_id", "users", ["referred_by_advisor_id"])
    op.add_column("weekly_plans", sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("weekly_plans", sa.Column("student_viewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("weekly_plans", sa.Column("advisor_expiry_notified_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_weekly_plans_ends_at", "weekly_plans", ["ends_at"])
    op.add_column("subscription_plans", sa.Column("referral_price", sa.Integer(), nullable=False, server_default="0"))
    op.execute("UPDATE subscription_plans SET referral_price = price WHERE referral_price = 0")
    op.create_table("notifications", sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), nullable=False), sa.Column("actor_id", sa.String(36), nullable=True), sa.Column("kind", sa.String(40), nullable=False), sa.Column("title", sa.String(160), nullable=False), sa.Column("body", sa.Text(), nullable=False, server_default=""), sa.Column("link", sa.String(255), nullable=False, server_default=""), sa.Column("related_id", sa.String(36), nullable=True), sa.Column("read_at", sa.DateTime(timezone=True), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.ForeignKeyConstraint(["user_id"], ["users.id"]), sa.ForeignKeyConstraint(["actor_id"], ["users.id"]))
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_actor_id", "notifications", ["actor_id"])
    op.create_index("ix_notifications_kind", "notifications", ["kind"])
    op.create_index("ix_notifications_related_id", "notifications", ["related_id"])
    op.create_table("site_settings", sa.Column("key", sa.String(80), primary_key=True), sa.Column("value", sa.Text(), nullable=False, server_default=""), sa.Column("version", sa.Integer(), nullable=False, server_default="1"), sa.Column("updated_by", sa.String(36), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.ForeignKeyConstraint(["updated_by"], ["users.id"]))

def downgrade():
    op.drop_table("site_settings")
    op.drop_table("notifications")
    op.drop_column("subscription_plans", "referral_price")
    op.drop_index("ix_weekly_plans_ends_at", table_name="weekly_plans")
    op.drop_column("weekly_plans", "advisor_expiry_notified_at")
    op.drop_column("weekly_plans", "student_viewed_at")
    op.drop_column("weekly_plans", "ends_at")
    op.drop_index("ix_users_referred_by_advisor_id", table_name="users")
    op.drop_column("users", "terms_accepted_version")
    op.drop_column("users", "referred_by_advisor_id")
