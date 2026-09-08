"""universal chat locks and dual student approvals"""
from alembic import op
import sqlalchemy as sa

revision = "20260906_0013"
down_revision = "20260906_0012"
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {item["name"] for item in inspector.get_columns("student_profiles")}
    columns = [
        sa.Column("advisor_approval_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("admin_approval_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("advisor_reviewed_by", sa.String(36), nullable=True),
        sa.Column("advisor_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("admin_reviewed_by", sa.String(36), nullable=True),
        sa.Column("admin_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approval_note", sa.Text(), nullable=False, server_default=""),
    ]
    for column in columns:
        if column.name not in existing:
            op.add_column("student_profiles", column)
    if "chat_locks" not in inspector.get_table_names():
        op.create_table(
            "chat_locks",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("admin_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("admin_id", "user_id", name="uq_chat_lock_admin_user"),
        )
    op.execute("UPDATE student_profiles SET advisor_approval_status='approved', admin_approval_status='approved' WHERE user_id IN (SELECT id FROM users WHERE status='active')")

def downgrade():
    op.drop_table("chat_locks")
    for name in ("approval_note","admin_reviewed_at","admin_reviewed_by","advisor_reviewed_at","advisor_reviewed_by","admin_approval_status","advisor_approval_status"):
        op.drop_column("student_profiles", name)
