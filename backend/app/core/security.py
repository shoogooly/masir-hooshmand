from datetime import datetime, timedelta, timezone
from hashlib import pbkdf2_hmac, sha256
import base64
import hmac
import secrets
import struct
import time
import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.models import Subscription, User, utcnow


ALGORITHM = "HS256"

PASSWORD_ITERATIONS = 310_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256$" + str(PASSWORD_ITERATIONS) + "$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_text, digest_text = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(digest_text.encode())
        actual = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False



def credential_tag(user: User) -> str:
    return hmac.new(settings.secret_key.encode(), (user.password_hash or '').encode(), 'sha256').hexdigest()


def create_token(user: User, token_type: str, minutes: int | None = None) -> str:
    now = datetime.now(timezone.utc)
    delta = timedelta(minutes=minutes or settings.access_token_minutes)
    return jwt.encode({"sub": user.id, "role": user.role, "type": token_type, "credential_tag": credential_tag(user), "iat": now, "exp": now + delta}, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "نشست معتبر نیست") from exc
    if payload.get("type") != expected_type:
        raise HTTPException(401, "نوع نشست معتبر نیست")
    return payload



RENEWAL_ACCOUNT_ROUTES = frozenset({
    ("GET", "/api/v1/auth/me"),
    ("POST", "/api/v1/auth/logout"),
    ("POST", "/api/v1/auth/change-password"),
    ("POST", "/api/v1/payments/orders"),
})


def active_subscription(db: Session, user_id: str):
    now = utcnow()
    return db.scalar(select(Subscription).where(
        Subscription.user_id == user_id,
        Subscription.status == "active",
        Subscription.starts_at <= now,
        Subscription.expires_at > now,
    ).order_by(Subscription.expires_at.desc()))


def subscription_state(db: Session, user: User):
    if user.role != "student":
        return {}
    current = active_subscription(db, user.id)
    expires = current.expires_at if current else None
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return {
        # Incomplete registrations continue through onboarding, not renewal.
        "subscription_expired": user.status == "active" and current is None,
        "subscription": {"expires_at": expires, "status": current.status} if current else None,
        "server_time": utcnow(),
    }


def require_subscription(db: Session, user: User):
    # Database time/state is authoritative. Never trust JWT claims or browser flags.
    if user.role == "student" and user.status == "active" and active_subscription(db, user.id) is None:
        raise HTTPException(403, {
            "code": "SUBSCRIPTION_REQUIRED",
            "message": "اشتراک شما فعال نیست؛ برای ادامه اشتراک خود را تمدید کنید.",
        })


def current_account(request: Request, access_token: str | None = Cookie(default=None), db: Session = Depends(get_db)) -> User:
    if not access_token:
        raise HTTPException(401, "ابتدا وارد شوید")
    payload = decode_token(access_token)
    user = db.get(User, payload["sub"])
    if not user or user.status in {"suspended", "deleted"}:
        raise HTTPException(401, "حساب کاربری در دسترس نیست")
    if not secrets.compare_digest(payload.get('credential_tag', ''), credential_tag(user)):
        raise HTTPException(401, "رمز حساب تغییر کرده است؛ دوباره وارد شوید")
    # Only these account operations remain available without an active subscription.
    if (request.method, getattr(request.scope.get("route"), "path", None)) not in RENEWAL_ACCOUNT_ROUTES:
        require_subscription(db, user)
    return user


def current_user(user: User = Depends(current_account), db: Session = Depends(get_db)) -> User:
    if user.status != "active":
        raise HTTPException(403, "مراحل ثبت‌نام حساب هنوز تکمیل نشده است")
    require_subscription(db, user)
    return user


def roles(*allowed: str):
    def guard(user: User = Depends(current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(403, "دسترسی کافی ندارید")
        return user
    return guard


def csrf_guard(request: Request, csrf_cookie: str | None = Cookie(default=None), x_csrf_token: str | None = Header(default=None)):
    if request.url.path in {'/api/v1/auth/password-recovery/request', '/api/v1/auth/password-recovery/complete'}:
        return
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.url.path.startswith("/api/"):
        if request.url.path.endswith(("/request-otp", "/verify-otp", "/auth/register", "/auth/login", "/auth/staff-login", "/auth/refresh", "/payments/callback")):
            return
        if not csrf_cookie or not x_csrf_token or not secrets.compare_digest(csrf_cookie, x_csrf_token):
            raise HTTPException(403, "توکن CSRF معتبر نیست")


def hash_token(token: str) -> str:
    return sha256(token.encode()).hexdigest()


def new_csrf() -> str:
    return secrets.token_urlsafe(24)


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    try:
        key = base64.b32decode(secret.upper() + "=" * ((8 - len(secret) % 8) % 8))
        counter = int(time.time()) // 30
        for drift in range(-window, window + 1):
            digest = hmac.new(key, struct.pack(">Q", counter + drift), "sha1").digest()
            offset = digest[-1] & 0x0F
            value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
            if secrets.compare_digest(f"{value:06d}", code):
                return True
    except (ValueError, TypeError):
        return False
    return False
