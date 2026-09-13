"""Single-use password recovery challenges."""
from alembic import op
import sqlalchemy as sa

revision = "20260912_0017"
down_revision = "20260912_0016"
branch_labels = None
depends_on = None


def upgrade():
    if "password_challenges" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table("password_challenges",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("phone", sa.String(16), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("ip_hash", sa.String(64), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("credential_tag", sa.String(64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_password_challenges_phone", "password_challenges", ["phone"])
    op.create_index("ix_password_challenges_ip_hash", "password_challenges", ["ip_hash"])


def downgrade():
    op.drop_table("password_challenges")
