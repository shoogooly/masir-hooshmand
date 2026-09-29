"""Rename the yearly plan shared by normal and advisor-referral pricing.

Revision ID: 20260929_0032
Revises: 20260929_0031
"""
from alembic import op
import sqlalchemy as sa

revision = "20260929_0032"
down_revision = "20260929_0031"
branch_labels = None
depends_on = None

plans = sa.table("subscription_plans", sa.column("period", sa.String()), sa.column("name", sa.String()))
new_name = "اشتراک از اکنون تا پایان سال تحصیلی"


def upgrade():
    op.execute(plans.update().where(plans.c.period == "yearly").values(name=new_name))


def downgrade():
    op.execute(plans.update().where(plans.c.period == "yearly", plans.c.name == new_name).values(name="اشتراک سالانه"))
