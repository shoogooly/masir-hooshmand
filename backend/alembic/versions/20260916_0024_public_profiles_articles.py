"""Public profile photos, advisor levels and articles."""
from alembic import op
import sqlalchemy as sa

revision = "20260916_0024"
down_revision = "20260915_0023"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "profile_photo_json" not in user_columns:
        op.add_column("users", sa.Column("profile_photo_json", sa.Text(), nullable=False, server_default=""))
    advisor_columns = {column["name"] for column in inspector.get_columns("advisor_profiles")}
    if "work_levels_json" not in advisor_columns:
        op.add_column("advisor_profiles", sa.Column("work_levels_json", sa.Text(), nullable=False, server_default='["upper_secondary"]'))
        op.execute("UPDATE advisor_profiles SET work_levels_json = '[\"' || education_level || '\"]'")
    from app.models import Article
    Article.__table__.create(bind, checkfirst=True)


def downgrade():
    op.drop_table("articles")
    with op.batch_alter_table("advisor_profiles") as batch:
        batch.drop_column("work_levels_json")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("profile_photo_json")
