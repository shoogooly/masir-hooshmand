"""Keep separate credentials for selectable AI providers."""
from alembic import op
import sqlalchemy as sa

revision = "20260915_0020"
down_revision = "20260914_0019"
branch_labels = None
depends_on = None

def upgrade():
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("ai_configuration")}
    # All pre-provider configurations belonged to Mistral. Never relabel their key.
    if "provider" not in columns:
        op.add_column("ai_configuration", sa.Column("provider", sa.String(30), nullable=False, server_default="mistral"))
    if "profiles_json" not in columns:
        op.add_column("ai_configuration", sa.Column("profiles_json", sa.Text(), nullable=False, server_default="{}"))

def downgrade():
    op.get_bind().execute(sa.text("UPDATE ai_configuration SET token_encrypted = '', enabled = false, model = 'mistral-small-latest'"))
    with op.batch_alter_table("ai_configuration") as batch:
        batch.drop_column("profiles_json")
        batch.drop_column("provider")
