"""Inspect or restore saved integration switches from the service terminal.

Never prints credentials, connection strings, or OTPs.
"""
import argparse

from fastapi import HTTPException
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.integration_service import get, get_secret, set_value
from app.models import User


def credential_readable(db, key):
    try:
        return bool(get_secret(db, key))
    except HTTPException:
        return False


def run(db, enable_sms=False, enable_zarinpal=False):
    users = db.scalar(select(func.count(User.id))) or 0
    sms_key = credential_readable(db, "sms_key")
    sms_template = get(db, "sms_template").strip()
    merchant = credential_readable(db, "zarinpal_merchant")
    public_url = get(db, "public_url").strip()
    print(f"users={users}")
    print(f"sms_enabled={get(db, 'sms_enabled', 'false') == 'true'} sms_key_readable={sms_key} verify_template_present={bool(sms_template)}")
    print(f"zarinpal_enabled={get(db, 'zarinpal_enabled', 'false') == 'true'} merchant_readable={merchant} public_url_https={public_url.startswith('https://')}")
    if enable_sms:
        if not sms_key or not sms_template.isdigit():
            print("SMS.ir was not enabled: saved API key or Verify template is missing/unreadable.")
        else:
            set_value(db, "sms_enabled", "true")
            db.commit()
            print("SMS.ir enabled using the existing saved key and Verify template.")
    if enable_zarinpal:
        if not merchant or not public_url.startswith("https://"):
            print("Zarinpal was not enabled: saved Merchant ID or HTTPS public URL is missing/unreadable.")
        else:
            set_value(db, "zarinpal_enabled", "true")
            db.commit()
            print("Zarinpal enabled using the existing saved Merchant ID.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect or restore saved SMS.ir and Zarinpal switches without exposing secrets")
    parser.add_argument("--enable-sms", action="store_true")
    parser.add_argument("--enable-zarinpal", action="store_true")
    args = parser.parse_args()
    with SessionLocal() as session:
        run(session, args.enable_sms, args.enable_zarinpal)
