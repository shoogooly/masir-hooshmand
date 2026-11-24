"""Store when an advisor opens an AI analysis."""

import sqlalchemy as sa
from alembic import op

revision = "20261124_0042"
down_revision = "20261031_0041"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_analysis_reads",
        sa.Column("analysis_id", sa.String(36), sa.ForeignKey("ai_analyses.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("ai_analysis_reads")
