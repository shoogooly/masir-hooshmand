"""sms otp challenges

Revision ID: 20260919_0029
Revises: 20260919_0028
"""
from alembic import op
import sqlalchemy as sa
revision="20260919_0029"
down_revision="20260919_0028"
branch_labels=None
depends_on=None
def upgrade():
    op.create_table("otp_challenges",
      sa.Column("id",sa.String(36),primary_key=True),
      sa.Column("phone",sa.String(16),nullable=False),
      sa.Column("purpose",sa.String(24),nullable=False),
      sa.Column("code_hash",sa.String(64),nullable=False),
      sa.Column("expires_at",sa.DateTime(timezone=True),nullable=False),
      sa.Column("attempts",sa.Integer(),nullable=False,server_default="0"),
      sa.Column("consumed_at",sa.DateTime(timezone=True),nullable=True),
      sa.Column("created_at",sa.DateTime(timezone=True),nullable=False))
    op.create_index("ix_otp_challenges_phone","otp_challenges",["phone"])
    op.create_index("ix_otp_challenges_purpose","otp_challenges",["purpose"])
    op.create_index("ix_otp_challenges_expires_at","otp_challenges",["expires_at"])
def downgrade(): op.drop_table("otp_challenges")
