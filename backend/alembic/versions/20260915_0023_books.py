"""Books, student libraries and weekly review controls."""
from alembic import op
import sqlalchemy as sa
revision="20260915_0023"
down_revision="20260915_0022"
branch_labels=None
depends_on=None
def upgrade():
    bind=op.get_bind()
    for table,name,column in [
        ("activities","book_topic_id",sa.Column("book_topic_id",sa.String(36),nullable=False,server_default="")),
        ("activities","book_question_count",sa.Column("book_question_count",sa.Integer(),nullable=False,server_default="0")),
        ("ai_student_access","weekly_auto_enabled",sa.Column("weekly_auto_enabled",sa.Boolean(),nullable=False,server_default=sa.false()))]:
        if name not in {c["name"] for c in sa.inspect(bind).get_columns(table)}:op.add_column(table,column)
    from app.book_models import Book,BookTopic,StudentBook
    for model in (Book,BookTopic,StudentBook):model.__table__.create(bind,checkfirst=True)
def downgrade():
    for name in ("student_books","book_topics","books"):op.drop_table(name)
    for table,column in [("activities","book_topic_id"),("activities","book_question_count"),("ai_student_access","weekly_auto_enabled")]:
        with op.batch_alter_table(table) as batch:batch.drop_column(column)
