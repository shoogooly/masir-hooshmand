"""Number plans when they are sent to a student, excluding drafts."""
from alembic import op
import sqlalchemy as sa

revision = "20261028_0040"
down_revision = "20261025_0039"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("weekly_plans", sa.Column("publication_number", sa.Integer(), nullable=True))
    connection = op.get_bind()
    rows = connection.execute(sa.text("""
        SELECT id, student_id FROM weekly_plans WHERE status = 'published'
        ORDER BY student_id, COALESCE(published_at, created_at), created_at, id
    """)).mappings()
    current_student = None
    number = 0
    for row in rows:
        if row["student_id"] != current_student:
            current_student = row["student_id"]
            number = 0
        number += 1
        connection.execute(sa.text("UPDATE weekly_plans SET publication_number = :number WHERE id = :id"),
                           {"number": number, "id": row["id"]})
    op.create_index("uq_weekly_plans_student_publication_number", "weekly_plans",
                    ["student_id", "publication_number"], unique=True)


def downgrade():
    op.drop_index("uq_weekly_plans_student_publication_number", table_name="weekly_plans")
    op.drop_column("weekly_plans", "publication_number")
