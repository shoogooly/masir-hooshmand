"""Keep advisor document count without reading stored document contents.

Revision ID: 20260929_0031
Revises: 20260929_0030
"""
from alembic import op
import sqlalchemy as sa

revision = "20260929_0031"
down_revision = "20260929_0030"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("advisor_profiles", sa.Column("documents_count", sa.Integer(), nullable=False, server_default="0"))
    if op.get_bind().dialect.name == "postgresql":
        op.execute("UPDATE advisor_profiles SET documents_count = jsonb_array_length(documents_json::jsonb)")
    else:
        op.execute("UPDATE advisor_profiles SET documents_count = json_array_length(documents_json)")


def downgrade():
    with op.batch_alter_table("advisor_profiles") as batch:
        batch.drop_column("documents_count")
