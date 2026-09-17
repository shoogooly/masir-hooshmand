"""Pending profile photo review."""
from alembic import op
import sqlalchemy as sa

revision = "20260916_0025"
down_revision = "20260916_0024"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("users")}
    if "pending_profile_photo_json" not in columns:
        op.add_column("users", sa.Column("pending_profile_photo_json", sa.Text(), nullable=False, server_default=""))


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_column("pending_profile_photo_json")
