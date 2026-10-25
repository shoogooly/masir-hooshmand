"""Tree topics, book topic links and selected plan topics."""
from alembic import op
import sqlalchemy as sa
from uuid import uuid4

revision = "20261024_0037"
down_revision = "20261020_0036"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("academic_calendar_nodes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("calendar_id", sa.String(36), sa.ForeignKey("academic_calendars.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", sa.String(36), nullable=True),
        sa.Column("subject", sa.String(120), nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=True),
        sa.Column("day", sa.Integer(), nullable=True))
    op.create_index("ix_academic_calendar_nodes_calendar_id", "academic_calendar_nodes", ["calendar_id"])
    op.create_index("ix_academic_calendar_nodes_parent_id", "academic_calendar_nodes", ["parent_id"])
    op.add_column("books", sa.Column("subject", sa.String(120), nullable=False, server_default=""))
    op.add_column("book_topics", sa.Column("calendar_topic_id", sa.String(36), nullable=False, server_default=""))
    op.add_column("activities", sa.Column("calendar_topic_ids_json", sa.Text(), nullable=False, server_default="[]"))
    op.add_column("student_academic_calendars", sa.Column("override_nodes_json", sa.Text(), nullable=True))
    op.add_column("student_academic_calendars", sa.Column("override_items_json", sa.Text(), nullable=True))
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT calendar_id, subject, topics, month, day FROM academic_calendar_items ORDER BY calendar_id, sort_order")).mappings().all()
    roots = {}
    positions = {}
    for row in rows:
        calendar_id, subject = row["calendar_id"], row["subject"].strip()
        key = (calendar_id, subject)
        position = positions.get(calendar_id, 0)
        if key not in roots:
            root_id = str(uuid4())
            roots[key] = root_id
            connection.execute(sa.text("INSERT INTO academic_calendar_nodes (id, calendar_id, parent_id, subject, title, depth, sort_order, month, day) VALUES (:id, :calendar_id, NULL, :subject, :title, 1, :sort_order, NULL, NULL)"),
                {"id": root_id, "calendar_id": calendar_id, "subject": subject, "title": subject, "sort_order": position})
            position += 1
        connection.execute(sa.text("INSERT INTO academic_calendar_nodes (id, calendar_id, parent_id, subject, title, depth, sort_order, month, day) VALUES (:id, :calendar_id, :parent_id, :subject, :title, 2, :sort_order, :month, :day)"),
            {"id": str(uuid4()), "calendar_id": calendar_id, "parent_id": roots[key], "subject": subject,
             "title": row["topics"][:180], "sort_order": position, "month": row["month"], "day": row["day"]})
        positions[calendar_id] = position + 1


def downgrade():
    op.drop_column("student_academic_calendars", "override_items_json")
    op.drop_column("student_academic_calendars", "override_nodes_json")
    op.drop_column("activities", "calendar_topic_ids_json")
    op.drop_column("book_topics", "calendar_topic_id")
    op.drop_column("books", "subject")
    op.drop_table("academic_calendar_nodes")
