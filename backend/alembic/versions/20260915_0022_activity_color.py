"""Store an optional advisor-selected activity color."""
from alembic import op
import sqlalchemy as sa
revision="20260915_0022"
down_revision="20260915_0021"
branch_labels=None
depends_on=None
def upgrade():
    if "color" not in {c["name"] for c in sa.inspect(op.get_bind()).get_columns("activities")}:
        op.add_column("activities",sa.Column("color",sa.String(7),nullable=False,server_default=""))
def downgrade():
    with op.batch_alter_table("activities") as batch:
        batch.drop_column("color")
