import json
from datetime import datetime, time, timedelta, timezone
import jdatetime
from fastapi import HTTPException
from app.models import utcnow

IRAN = timezone(timedelta(hours=3, minutes=30))
WEEKDAY_LABELS = ("دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه")

def aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

def schedule_date(value):
    raw = str(value or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
    try:
        year, month, day = map(int, raw.replace("-", "/").split("/"))
        return jdatetime.date(year, month, day).togregorian() if year < 1700 else datetime(year, month, day).date()
    except (ValueError, TypeError):
        return None


def report_bounds(plan):
    dates = [value for day in json.loads(plan.schedule_days_json or "[]") if (value := schedule_date(day.get("date")))]
    if dates:
        start = datetime.combine(min(dates), time.min, IRAN)
        end = datetime.combine(max(dates)+timedelta(days=1), time.min, IRAN)
    else:
        start = aware(plan.published_at or plan.created_at)
        end = aware(plan.ends_at) if plan.ends_at else start+timedelta(days=7)
    return start, end, end+timedelta(days=2)


def report_day_key(plan, target):
    days = json.loads(plan.schedule_days_json or "[]")
    dated_days = [(day, date) for day in days if (date := schedule_date(day.get("date")))]
    if dated_days:
        return next((day.get("key", day["label"]) for day, date in dated_days if date == target), None)
    start, end, _ = report_bounds(plan)
    midnight = datetime.combine(target, time.min, IRAN)
    if start >= midnight + timedelta(days=1) or end <= midnight:
        return None
    label = WEEKDAY_LABELS[target.weekday()]
    if not days:
        return label
    return next((day.get("key", day["label"]) for day in days if day["label"] == label), None)


def ensure_report_editable(plan):
    if plan.status != 'published':
        raise HTTPException(403, 'ثبت گزارش فقط برای برنامه منتشرشده امکان‌پذیر است')

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
