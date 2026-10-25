import json
from datetime import datetime
from zoneinfo import ZoneInfo

import jdatetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import roles
from app.db.session import get_db
from app.integration_service import get, set_value
from app.services import audit

router = APIRouter()
SETTING_KEY = "plan_motivational_quotes_v1"
DEFAULT_QUOTE = "با برنامه، هر روز یک قدم جلوتر!"


class QuotesInput(BaseModel):
    quotes: list[str] = Field(min_length=31, max_length=31)


def read_quotes(db: Session) -> list[str]:
    try:
        value = json.loads(get(db, SETTING_KEY, "[]"))
        if isinstance(value, list) and len(value) == 31:
            return [str(item).strip()[:240] for item in value]
    except (ValueError, TypeError):
        pass
    return [""] * 31


def quote_for_publication(db: Session, published_at: datetime) -> str:
    day = jdatetime.date.fromgregorian(date=published_at.astimezone(ZoneInfo("Asia/Tehran")).date()).day
    return read_quotes(db)[day - 1] or DEFAULT_QUOTE


@router.get("/admin/motivational-quotes")
def list_quotes(user=Depends(roles("super_admin", "operations_admin")), db: Session = Depends(get_db)):
    return {"success": True, "data": read_quotes(db)}


@router.put("/admin/motivational-quotes")
def save_quotes(payload: QuotesInput, user=Depends(roles("super_admin", "operations_admin")),
                db: Session = Depends(get_db)):
    quotes = [item.strip() for item in payload.quotes]
    if any(len(item) > 240 for item in quotes):
        from fastapi import HTTPException
        raise HTTPException(422, "هر جمله حداکثر ۲۴۰ نویسه داشته باشد")
    set_value(db, SETTING_KEY, json.dumps(quotes, ensure_ascii=False), user.id)
    audit(db, user.id, "motivational_quotes.updated", "site_setting", SETTING_KEY,
          after={"filled_days": sum(bool(item) for item in quotes)})
    db.commit()
    return {"success": True, "data": quotes}
