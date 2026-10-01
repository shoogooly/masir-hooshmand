"""Inspect or restore saved integration switches from the service terminal.

Never prints credentials, connection strings, or OTPs.
"""
import argparse

from fastapi import HTTPException
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.core.config import settings
from app.integration_service import get, get_secret, send_otp, set_value
from app.models import User


def credential_readable(db, key):
    try:
        return bool(get_secret(db, key))
    except HTTPException:
        return False


def run(db, enable_sms=False, enable_zarinpal=False, sms_template=None, sms_parameter=None, send_admin_code=False):
    if sms_template is not None:
        if not sms_template.strip().isdigit():
            raise ValueError("Verify template ID must contain only digits")
        set_value(db, "sms_template", sms_template.strip())
    if sms_parameter is not None:
        if not sms_parameter.strip():
            raise ValueError("Verify parameter name cannot be empty")
        set_value(db, "sms_parameter", sms_parameter.strip())
    if sms_template is not None or sms_parameter is not None:
        db.commit()
        print("Saved SMS.ir Verify template settings; API key was unchanged.")
    users = db.scalar(select(func.count(User.id))) or 0
    sms_key = credential_readable(db, "sms_key")
    sms_template = get(db, "sms_template").strip()
    merchant = credential_readable(db, "zarinpal_merchant")
    public_url = get(db, "public_url").strip()
    print(f"users={users}")
    print(f"sms_enabled={get(db, 'sms_enabled', 'false') == 'true'} sms_key_readable={sms_key} verify_template_id={sms_template or 'none'} verify_parameter={get(db, 'sms_parameter', 'Code')}")
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
    if send_admin_code:
        try:
            send_otp(db, settings.bootstrap_admin_phone, "staff")
        except HTTPException as exc:
            print(f"SMS.ir test failed: {exc.detail}")
            raise SystemExit(1) from exc
        print("SMS.ir accepted a real login code for the primary administrator. Check the phone.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect or restore saved SMS.ir and Zarinpal switches without exposing secrets")
    parser.add_argument("--enable-sms", action="store_true")
    parser.add_argument("--enable-zarinpal", action="store_true")
    parser.add_argument("--sms-template", help="approved SMS.ir Verify template ID")
    parser.add_argument("--sms-parameter", help="Verify template parameter name, usually Code")
    parser.add_argument("--send-admin-code", action="store_true", help="send a real, usable login code to the primary administrator")
    args = parser.parse_args()
    with SessionLocal() as session:
        run(session, args.enable_sms, args.enable_zarinpal, args.sms_template, args.sms_parameter, args.send_admin_code)
