import json
from datetime import datetime, time, timedelta, timezone
import jdatetime
from fastapi import HTTPException
from app.models import utcnow

IRAN = timezone(timedelta(hours=3, minutes=30))

def aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

def report_bounds(plan):
    dates = []
    for day in json.loads(plan.schedule_days_json or '[]'):
        raw = str(day.get('date', '')).translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'))
        try:
            y,m,d = map(int, raw.replace('-', '/').split('/'))
            dates.append(jdatetime.date(y,m,d).togregorian() if y < 1700 else datetime(y,m,d).date())
        except (ValueError, TypeError):
            pass
    if dates:
        start = datetime.combine(min(dates), time.min, IRAN)
        end = datetime.combine(max(dates)+timedelta(days=1), time.min, IRAN)
    else:
        start = aware(plan.published_at or plan.created_at)
        end = aware(plan.ends_at) if plan.ends_at else start+timedelta(days=7)
    return start, end, end+timedelta(days=2)

def ensure_report_editable(plan):
    start, _, deadline = report_bounds(plan)
    now = utcnow()
    if plan.status != 'published' or now < start:
        raise HTTPException(403, 'ثبت گزارش از شروع برنامه منتشرشده امکان‌پذیر است')
    if now >= deadline:
        raise HTTPException(403, 'مهلت ویرایش گزارش این هفته تمام شده است؛ گزارش همچنان قابل مشاهده است')

def legacy_report(activity):
    result = {}
    if activity.status == 'completed':
        result['status'] = 'done'
    elif activity.status == 'skipped':
        result['status'] = 'not_done'
    if activity.actual_minutes:
        result['actual_minutes'] = activity.actual_minutes
    if activity.test_count:
        result['question_count'] = activity.test_count
    if activity.note:
        result['quality'] = activity.note
    return result
