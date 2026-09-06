"""ensure quarterly subscription plan"""
from alembic import op

revision = "20260905_0011"
down_revision = "20260905_0010"
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""
        INSERT INTO subscription_plans
        (id, name, period, price, referral_price, features_json, active, created_at, updated_at)
        SELECT 'quarterly-plan-default', 'اشتراک سه‌ماهه', 'quarterly', 540000, 450000,
               '[\"برنامه هفتگی\", \"آزمون‌های هفتگی\", \"گزارش پیشرفت\"]', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE period IN ('quarterly','three_months'))
    """)

def downgrade():
    op.execute("DELETE FROM subscription_plans WHERE id = 'quarterly-plan-default'")
