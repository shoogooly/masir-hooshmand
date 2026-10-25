"""Allow advisor-created books to belong to one student catalog."""
from alembic import op
import sqlalchemy as sa

revision = "20261025_0038"
down_revision = "20261024_0037"
branch_labels = None
depends_on = None


def upgrade():
    # SQLite needs batch mode for a foreign key on an existing table.
    # The column check also resumes safely after SQLite's non-transactional DDL.
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("books")}
    if "created_for_student_id" not in columns:
        op.add_column("books", sa.Column("created_for_student_id", sa.String(36), nullable=True))
    with op.batch_alter_table("books") as batch:
        batch.create_foreign_key("fk_books_created_for_student", "users", ["created_for_student_id"], ["id"])
    op.create_index("ix_books_created_for_student_id", "books", ["created_for_student_id"])


def downgrade():
    op.drop_index("ix_books_created_for_student_id", table_name="books")
    with op.batch_alter_table("books") as batch:
        batch.drop_constraint("fk_books_created_for_student", type_="foreignkey")
        batch.drop_column("created_for_student_id")
