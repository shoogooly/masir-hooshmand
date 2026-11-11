from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.curriculum_catalog import DEFAULT_SOURCE, build_catalog, ensure_curriculum_catalog, summarize
from app.db.session import SessionLocal
from app.models import User


def main() -> None:
    parser = argparse.ArgumentParser(description="ورود کنترل‌شده سرفصل‌های درس‌چین به تقویم آموزشی مهیاد")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--admin-phone", help="شماره مدیر ثبت‌کننده؛ فقط همراه --apply لازم است")
    parser.add_argument("--apply", action="store_true", help="ثبت تغییرات؛ بدون این گزینه فقط پیش‌نمایش نمایش داده می‌شود")
    args = parser.parse_args()

    source = args.source.resolve()
    catalog = build_catalog(source)
    report = {
        "mode": "apply" if args.apply else "dry-run",
        "source": str(source),
        "calendars": summarize(catalog),
    }
    if not args.apply:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return
    if not args.admin_phone:
        parser.error("برای ثبت نهایی، --admin-phone الزامی است")

    with SessionLocal() as db:
        admin = db.scalar(select(User).where(User.phone == args.admin_phone, User.status == "active"))
        if admin is None or admin.role not in {"super_admin", "operations_admin", "upper_secondary_manager"}:
            raise ValueError("مدیر فعال و مجاز برای ثبت تقویم پیدا نشد")
        report["changes"] = ensure_curriculum_catalog(db, admin, source)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
