from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import current_user, roles
from app.db.session import get_db
from app.models import AdvisorProfile, Article, Notification, User
from app.services import audit

router = APIRouter()


def ok(data=None):
    return {"success": True, "data": data, "meta": {}}


def photo(user: User):
    import json
    try:
        return json.loads(user.profile_photo_json or "")
    except (TypeError, json.JSONDecodeError):
        return None


def levels(profile: AdvisorProfile):
    import json
    try:
        result = json.loads(profile.work_levels_json or "[]")
    except (TypeError, json.JSONDecodeError):
        result = []
    return result or [profile.education_level]


def article_dict(item: Article, db: Session):
    author = db.get(User, item.author_id)
    return {"id": item.id, "title": item.title, "body": item.body, "status": item.status,
            "author_id": item.author_id, "author_name": author.full_name if author else "",
            "author_role": author.role if author else "", "created_at": item.created_at,
            "updated_at": item.updated_at, "published_at": item.published_at}


class ArticleWrite(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    body: str = Field(min_length=20, max_length=30000)


class ArticleReview(BaseModel):
    status: Literal["approved", "rejected"]


class BroadcastWrite(BaseModel):
    audience: Literal["students", "advisors", "all"]
    title: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=2, max_length=3000)


@router.get("/public/advisors")
def public_advisors(db: Session = Depends(get_db)):
    profiles = db.scalars(select(AdvisorProfile).where(AdvisorProfile.approval_status == "approved").order_by(AdvisorProfile.created_at)).all()
    result = []
    for profile in profiles:
        user = db.get(User, profile.user_id)
        if not user or user.status != "active":
            continue
        result.append({"id": user.id, "full_name": user.full_name, "profile_photo": photo(user),
                       "work_levels": levels(profile), "education_degree": profile.education_degree,
                       "education_field": profile.education_field, "experience_years": profile.experience_years,
                       "bio": profile.bio, "academic_year": profile.academic_year})
    return ok(result)


@router.get("/public/articles")
def public_articles(db: Session = Depends(get_db)):
    items = db.scalars(select(Article).where(Article.status == "approved").order_by(Article.published_at.desc(), Article.created_at.desc())).all()
    return ok([article_dict(item, db) for item in items])


@router.get("/articles/mine")
def my_articles(user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    stmt = select(Article).order_by(Article.created_at.desc())
    if user.role == "advisor":
        stmt = stmt.where(Article.author_id == user.id)
    return ok([article_dict(item, db) for item in db.scalars(stmt).all()])


@router.post("/articles")
def create_article(payload: ArticleWrite, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    approved = user.role == "super_admin"
    item = Article(author_id=user.id, title=payload.title.strip(), body=payload.body.strip(),
                   status="approved" if approved else "pending", reviewed_by=user.id if approved else None,
                   reviewed_at=datetime.now(timezone.utc) if approved else None,
                   published_at=datetime.now(timezone.utc) if approved else None)
    db.add(item); db.flush()
    audit(db, user.id, "article.created", "article", item.id, after={"status": item.status, "title": item.title})
    db.commit()
    return ok(article_dict(item, db))


@router.put("/articles/{article_id}")
def update_article(article_id: str, payload: ArticleWrite, user: User = Depends(roles("advisor", "super_admin")), db: Session = Depends(get_db)):
    item = db.get(Article, article_id)
    if not item or (user.role == "advisor" and item.author_id != user.id):
        raise HTTPException(404, "مقاله یافت نشد")
    item.title, item.body = payload.title.strip(), payload.body.strip()
    if user.role == "advisor":
        item.status, item.reviewed_by, item.reviewed_at, item.published_at = "pending", None, None, None
    audit(db, user.id, "article.updated", "article", item.id, after={"status": item.status, "title": item.title})
    db.commit()
    return ok(article_dict(item, db))


@router.post("/admin/articles/{article_id}/review")
def review_article(article_id: str, payload: ArticleReview, user: User = Depends(roles("super_admin")), db: Session = Depends(get_db)):
    item = db.get(Article, article_id)
    if not item:
        raise HTTPException(404, "مقاله یافت نشد")
    item.status, item.reviewed_by, item.reviewed_at = payload.status, user.id, datetime.now(timezone.utc)
    item.published_at = item.reviewed_at if payload.status == "approved" else None
    audit(db, user.id, "article.reviewed", "article", item.id, after={"status": item.status})
    db.commit()
    return ok(article_dict(item, db))


@router.post("/admin/notifications/broadcast")
def broadcast(payload: BroadcastWrite, user: User = Depends(roles("super_admin")), db: Session = Depends(get_db)):
    stmt = select(User).where(User.status == "active", User.id != user.id)
    if payload.audience == "students":
        stmt = stmt.where(User.role == "student")
    elif payload.audience == "advisors":
        stmt = stmt.where(User.role == "advisor")
    recipients = db.scalars(stmt).all()
    for recipient in recipients:
        db.add(Notification(user_id=recipient.id, actor_id=user.id, kind="admin_broadcast",
                            title=payload.title.strip(), body=payload.body.strip(), link=""))
    audit(db, user.id, "notification.broadcast", "notification", None,
          after={"audience": payload.audience, "delivered": len(recipients), "title": payload.title})
    db.commit()
    return ok({"delivered": len(recipients)})
