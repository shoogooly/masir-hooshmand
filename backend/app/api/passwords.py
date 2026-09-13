"""Purpose-bound, single-use password recovery and authenticated password changes."""
from datetime import timedelta
import hmac
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, update, func
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import current_account, credential_tag, hash_password, verify_password, roles
from app.db.session import get_db
from app.models import AuditLog, PasswordChallenge, RefreshToken, User, utcnow, uid
from app.services import audit

router = APIRouter()

def ok(data):
    return {'success': True, 'data': data, 'meta': {}}

def digest(value):
    return hmac.new(settings.secret_key.encode(), value.encode(), 'sha256').hexdigest()

class RecoveryRequest(BaseModel):
    phone: str = Field(pattern=r'^09[0-9]{9}$')

class NewPassword(BaseModel):
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=8, max_length=128)

    @model_validator(mode='after')
    def matching(self):
        if self.password != self.password_confirm:
            raise ValueError('رمز جدید و تکرار آن یکسان نیستند')
        return self

class RecoveryComplete(NewPassword):
    challenge_id: str = Field(min_length=36, max_length=36)
    code: str = Field(pattern=r'^[0-9]{6}$')

class PasswordChange(NewPassword):
    old_password: str = Field(min_length=1, max_length=128)

def send_recovery_sms(phone: str, code: str):
    # No fixed code and no simulated success outside the explicit local environment.
    if settings.env not in {'development', 'test'}:
        raise HTTPException(503, 'سرویس پیامک بازیابی هنوز پیکربندی نشده است؛ با پشتیبانی تماس بگیرید')

def request_code(phone: str, request: Request, db: Session):
    if settings.env not in {'development', 'test'}:
        raise HTTPException(503, 'سرویس پیامک بازیابی هنوز پیکربندی نشده است؛ با پشتیبانی تماس بگیرید')
    now = utcnow()
    ip_hash = digest('ip:' + (request.client.host if request.client else 'unknown'))
    recent = PasswordChallenge.created_at > now - timedelta(hours=1)
    count = db.scalar(select(func.count()).select_from(PasswordChallenge).where(PasswordChallenge.phone == phone, recent))
    ip_count = db.scalar(select(func.count()).select_from(PasswordChallenge).where(PasswordChallenge.ip_hash == ip_hash, recent))
    cooldown = db.scalar(select(PasswordChallenge.id).where(PasswordChallenge.phone == phone, PasswordChallenge.created_at > now-timedelta(seconds=60)).limit(1))
    if cooldown or count >= 5 or ip_count >= 30:
        raise HTTPException(429, 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید')
    user = db.scalar(select(User).where(User.phone == phone, User.status != 'suspended'))
    code = f'{secrets.randbelow(1_000_000):06d}'
    challenge_id = uid()
    db.execute(update(PasswordChallenge).where(PasswordChallenge.phone == phone, PasswordChallenge.consumed_at.is_(None)).values(consumed_at=now))
    item = PasswordChallenge(id=challenge_id, phone=phone, user_id=user.id if user else None, ip_hash=ip_hash,
        code_hash=digest(challenge_id + ':' + code), credential_tag=credential_tag(user) if user else '', expires_at=now+timedelta(minutes=3))
    db.add(item)
    if user:
        send_recovery_sms(phone, code)
    db.commit()
    result = {'challenge_id': challenge_id, 'expires_in': 180, 'retry_after': 60,
        'message': 'اگر حساب فعالی با این شماره وجود داشته باشد، کد بازیابی ارسال می‌شود.'}
    if settings.env in {'development', 'test'}:
        result['dev_code'] = code
    return result

@router.post('/auth/password-recovery/request')
def request_recovery(payload: RecoveryRequest, request: Request, db: Session = Depends(get_db)):
    return ok(request_code(payload.phone, request, db))

def replace_password(db, user, password, actor_id, action):
    old_hash = user.password_hash
    changed = db.execute(update(User).where(User.id == user.id, User.password_hash == old_hash).values(password_hash=hash_password(password)))
    if changed.rowcount != 1:
        raise HTTPException(409, 'اطلاعات حساب تغییر کرده است؛ دوباره تلاش کنید')
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=utcnow()))
    db.execute(update(PasswordChallenge).where(PasswordChallenge.user_id == user.id, PasswordChallenge.consumed_at.is_(None)).values(consumed_at=utcnow()))
    audit(db, actor_id, action, 'user', user.id)

@router.post('/auth/password-recovery/complete')
def complete_recovery(payload: RecoveryComplete, response: Response, db: Session = Depends(get_db)):
    if settings.env not in {'development', 'test'}:
        raise HTTPException(503, 'سرویس پیامک بازیابی هنوز پیکربندی نشده است')
    now = utcnow()
    # Reserve one attempt in the database, including wrong codes; parallel requests cannot bypass the limit.
    reserved = db.execute(update(PasswordChallenge).where(PasswordChallenge.id == payload.challenge_id,
        PasswordChallenge.consumed_at.is_(None), PasswordChallenge.expires_at > now, PasswordChallenge.attempts < 5
    ).values(attempts=PasswordChallenge.attempts+1))
    if reserved.rowcount != 1:
        db.rollback()
        raise HTTPException(400, 'کد منقضی یا مصرف شده است؛ کد جدید دریافت کنید')
    item = db.get(PasswordChallenge, payload.challenge_id)
    user = db.get(User, item.user_id) if item.user_id else None
    if not user or user.status == 'suspended' or not secrets.compare_digest(item.code_hash, digest(item.id+':'+payload.code)) or not secrets.compare_digest(item.credential_tag, credential_tag(user)):
        db.commit()
        raise HTTPException(400, 'کد بازیابی معتبر نیست')
    item.consumed_at = now
    replace_password(db, user, payload.password, user.id, 'auth.password_recovered')
    db.commit()
    for name in ('access_token', 'refresh_token', 'csrf_cookie'):
        response.delete_cookie(name)
    return ok({'message': 'رمز تغییر کرد؛ با رمز جدید وارد شوید.'})

@router.post('/auth/change-password')
def change_password(payload: PasswordChange, response: Response, user: User = Depends(current_account), db: Session = Depends(get_db)):
    failures = db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.actor_id == user.id,
        AuditLog.action == 'auth.password_change_failed', AuditLog.created_at > utcnow()-timedelta(minutes=15)))
    if failures >= 5:
        raise HTTPException(429, 'تلاش‌های ناموفق زیاد است؛ ۱۵ دقیقه بعد دوباره تلاش کنید')
    if not verify_password(payload.old_password, user.password_hash):
        audit(db, user.id, 'auth.password_change_failed', 'user', user.id)
        db.commit()
        raise HTTPException(400, 'رمز فعلی صحیح نیست')
    if payload.password == payload.old_password:
        raise HTTPException(400, 'رمز جدید باید با رمز فعلی متفاوت باشد')
    replace_password(db, user, payload.password, user.id, 'auth.password_changed')
    db.commit()
    for name in ('access_token', 'refresh_token', 'csrf_cookie'):
        response.delete_cookie(name)
    return ok({'message': 'رمز تغییر کرد؛ با رمز جدید وارد شوید.'})

@router.post('/admin/users/{user_id}/password-recovery')
def admin_recovery(user_id: str, request: Request, admin: User = Depends(roles('super_admin')), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user or user.role not in {'student', 'advisor'}:
        raise HTTPException(404, 'دانش‌آموز یا مشاور یافت نشد')
    if settings.env in {'development', 'test'}:
        return ok({'message': 'حالت آزمایشی است و پیامکی ارسال نمی‌شود. کاربر از صفحه فراموشی رمز، کد آزمایشی خود را دریافت کند.'})
    result = request_code(user.phone, request, db)
    audit(db, admin.id, 'admin.password_recovery_requested', 'user', user.id)
    db.commit()
    # Never reveal the code to the administrator, including in development.
    return ok({'message': result['message']})
