"""add bale roles and conversation context

Revision ID: 20261031_0041
Revises: 20261028_0040
"""
from alembic import op
import sqlalchemy as sa

revision = "20261031_0041"
down_revision = "20261028_0040"
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table("bale_account_links") as batch:
        batch.add_column(sa.Column("access_role", sa.String(length=20), nullable=False, server_default=""))
        batch.add_column(sa.Column("student_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("context_json", sa.Text(), nullable=False, server_default="{}"))
        batch.create_foreign_key("fk_bale_account_links_student_id_users", "users", ["student_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_bale_account_links_student_id", ["student_id"])

def downgrade():
    with op.batch_alter_table("bale_account_links") as batch:
        batch.drop_index("ix_bale_account_links_student_id")
        batch.drop_constraint("fk_bale_account_links_student_id_users", type_="foreignkey")
        batch.drop_column("context_json")
        batch.drop_column("student_id")
        batch.drop_column("access_role")
