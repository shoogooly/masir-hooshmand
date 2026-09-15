"""Mistral configuration, isolated student conversations and durable weekly analyses."""
from alembic import op
import sqlalchemy as sa
revision="20260914_0019"
down_revision="20260914_0018"
branch_labels=None
depends_on=None
def times():
    return [sa.Column("created_at",sa.DateTime(timezone=True),nullable=False),
            sa.Column("updated_at",sa.DateTime(timezone=True),nullable=False)]
def upgrade():
    names=sa.inspect(op.get_bind()).get_table_names()
    if "ai_configuration" not in names:
        op.create_table("ai_configuration",sa.Column("id",sa.Integer(),primary_key=True),
            sa.Column("token_encrypted",sa.Text(),nullable=False),sa.Column("enabled",sa.Boolean(),nullable=False),
            sa.Column("model",sa.String(120),nullable=False),sa.Column("weekly_limit",sa.Integer(),nullable=False),*times())
    if "ai_student_access" not in names:
        op.create_table("ai_student_access",sa.Column("student_id",sa.String(36),sa.ForeignKey("users.id"),primary_key=True),
            sa.Column("weekly_limit",sa.Integer(),nullable=True),sa.Column("locked",sa.Boolean(),nullable=False),
            sa.Column("locked_by",sa.String(36),sa.ForeignKey("users.id"),nullable=True),
            sa.Column("chat_token",sa.String(36),nullable=False),sa.Column("chat_until",sa.DateTime(timezone=True),nullable=True),
            sa.Column("analysis_token",sa.String(36),nullable=False),sa.Column("analysis_until",sa.DateTime(timezone=True),nullable=True),
            sa.Column("last_manual_at",sa.DateTime(timezone=True),nullable=True),*times())
    if "ai_turns" not in names:
        op.create_table("ai_turns",sa.Column("id",sa.String(36),primary_key=True),
            sa.Column("student_id",sa.String(36),sa.ForeignKey("users.id"),nullable=False),
            sa.Column("request_id",sa.String(36),nullable=False),sa.Column("week",sa.String(10),nullable=False),
            sa.Column("message",sa.Text(),nullable=False),sa.Column("reply",sa.Text(),nullable=False),
            sa.Column("status",sa.String(20),nullable=False),sa.Column("error",sa.String(250),nullable=False),
            *times(),sa.UniqueConstraint("student_id","request_id",name="uq_ai_turn_request"))
        op.create_index("ix_ai_turns_student_id","ai_turns",["student_id"])
        op.create_index("ix_ai_turns_week","ai_turns",["week"])
    if "ai_analyses" not in names:
        op.create_table("ai_analyses",sa.Column("id",sa.String(36),primary_key=True),
            sa.Column("student_id",sa.String(36),sa.ForeignKey("users.id"),nullable=False),
            sa.Column("advisor_id",sa.String(36),sa.ForeignKey("users.id"),nullable=False),
            sa.Column("student_name",sa.String(120),nullable=False),
            sa.Column("kind",sa.String(20),nullable=False),sa.Column("week",sa.String(10),nullable=False),
            sa.Column("automatic_key",sa.String(100),nullable=True,unique=True),
            sa.Column("status",sa.String(20),nullable=False),sa.Column("result_json",sa.Text(),nullable=False),
            sa.Column("coverage_json",sa.Text(),nullable=False),sa.Column("error",sa.String(250),nullable=False),
            sa.Column("attempts",sa.Integer(),nullable=False),sa.Column("retry_at",sa.DateTime(timezone=True),nullable=True),
            sa.Column("completed_at",sa.DateTime(timezone=True),nullable=True),*times())
        op.create_index("ix_ai_analyses_student_id","ai_analyses",["student_id"])
        op.create_index("ix_ai_analyses_advisor_id","ai_analyses",["advisor_id"])
def downgrade():
    for name in ("ai_analyses","ai_turns","ai_student_access","ai_configuration"):op.drop_table(name)

