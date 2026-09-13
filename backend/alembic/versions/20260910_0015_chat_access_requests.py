"""Daily student requests to unlock management chat."""
from alembic import op
import sqlalchemy as sa

revision = "20260910_0015"
down_revision = "20260907_0014"
branch_labels = None
depends_on = None


def upgrade():
    if "chat_access_requests" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "chat_access_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("student_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("admin_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("request_day", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("student_id", "request_day", name="uq_student_chat_request_day"),
    )


def downgrade():
    op.drop_table("chat_access_requests")
