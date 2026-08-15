# مسیر هوشمند — پلتفرم آموزشی هوشمند

یک پیاده‌سازی فارسی و RTL با FastAPI، SQLite و React. پروژه «مسیر هوشمند» تمام حوزه‌های اصلی دانش‌آموز، مشاور، برنامه‌ریزی، پیام، بانک سؤال، آزمون، تحلیل، پیشنهاد هوشمند، اشتراک و مدیریت را در یک مونولیت ماژولار ارائه می‌کند.

## اجرای سریع با Docker

```bash
docker compose up --build
```

- وب‌سایت: `http://localhost:5173`
- مستندات API: `http://localhost:8000/docs`
- سلامت سرویس: `http://localhost:8000/health`

## اجرای توسعه‌ای بدون Docker

### بک‌اند

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### فرانت‌اند

```powershell
cd frontend
npm install
npm run dev
```

در محیط توسعه، پس از درخواست OTP کد `12345` در پاسخ API و صفحه ورود نمایش داده می‌شود. برای دیدن داشبوردهای مختلف می‌توان شماره‌های نمونه را وارد کرد:

| نقش | شماره |
|---|---|
| دانش‌آموز | `09120000001` |
| مشاور | `09120000002` |
| مدیر | `09120000003` |

کد دومرحله‌ای مدیر در محیط توسعه `654321` است. در محیط production، TOTP واقعی با secret کاربر بررسی می‌شود.

## ساختار

- `backend/app/models.py`: مدل‌های دامنه و جداول نسخه‌بندی‌شده
- `backend/app/api/router.py`: APIهای نسخه اول، RBAC و گردش‌های عملیاتی
- `backend/app/services.py`: OTP، AI، پرداخت، اعلان و Seed
- `frontend/src/pages`: هوم‌پیج، ورود و Workspace نقش‌محور
- `frontend/src/styles`: Design Tokenها و رابط واکنش‌گرا

SQLite با Foreign Key و WAL فعال می‌شود. زمان‌ها در UTC ذخیره و در رابط فارسی نمایش داده می‌شوند. Adapterهای خارجی عمداً Mock هستند و قرارداد جایگزینی آن‌ها در `services.py` قرار دارد.
