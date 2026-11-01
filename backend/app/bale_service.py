from __future__ import annotations
import base64, hashlib, json, logging, re, secrets
from datetime import timedelta, timezone
from urllib.parse import urlencode
import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import active_subscription, hash_token, verify_password
from app.models import (AdvisorAssignment, BaleAccessGrant, BaleAccountLink, BaleProcessedUpdate, Order, SiteSetting,
    Activity, StudentProfile, StudyReport, Subscription, SubscriptionPlan, User, WeeklyPlan, utcnow)

logger=logging.getLogger("mahyaad-bale")

KEYS={"enabled":"bale_enabled","bot_token":"bale_bot_token","payment_token":"bale_payment_token",
      "public_url":"bale_public_url","webhook_secret":"bale_webhook_secret","webhook_active":"bale_webhook_active"}

def _cipher():
    key=hashlib.sha256(("mahyaad-bale-v1:"+settings.secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))
def encrypt(raw): return _cipher().encrypt(raw.encode()).decode()
def decrypt(raw):
    try: return _cipher().decrypt(raw.encode()).decode()
    except (InvalidToken,ValueError) as exc: raise HTTPException(503,"توکن بازوی بله قابل خواندن نیست؛ دوباره آن را ذخیره کنید") from exc
def value(db,key,default=""):
    row=db.get(SiteSetting,KEYS.get(key,key)); return row.value if row else default
def secret_value(db,key):
    raw=value(db,key); return decrypt(raw) if raw else ""
def save_value(db,key,val,user_id=None,secret=False):
    name=KEYS.get(key,key); row=db.get(SiteSetting,name) or SiteSetting(key=name)
    row.value=encrypt(val) if secret and val else val; row.updated_by=user_id; row.version=(row.version or 0)+1; db.add(row)
def configured(db):
    public=value(db,"public_url").strip()
    enabled=value(db,"enabled","false")=="true"
    return {"enabled":enabled,"bot_token_configured":bool(value(db,"bot_token")),
      "payment_token_configured":bool(value(db,"payment_token")),"public_url":value(db,"public_url"),
      "webhook_configured":value(db,"webhook_active","false")=="true",
      "delivery_mode":"webhook" if public.startswith("https://") else ("polling" if enabled else "disabled")}

def api(db,method,payload=None,timeout=15):
    token=secret_value(db,"bot_token")
    if not token: raise HTTPException(503,"توکن بازوی بله وارد نشده است")
    try:
        response=httpx.post(f"https://tapi.bale.ai/bot{token}/{method}",json=payload or {},timeout=timeout)
        data=response.json()
    except (httpx.HTTPError,ValueError) as exc: raise HTTPException(502,"ارتباط با بازوی بله برقرار نشد") from exc
    if not response.is_success or not data.get("ok",False): raise HTTPException(502,data.get("description","پاسخ بازوی بله معتبر نبود"))
    return data.get("result")
def send(db,chat_id,text,keyboard=None):
    body={"chat_id":chat_id,"text":text}
    if keyboard: body["reply_markup"]={"keyboard":[[{"text":x} for x in row] for row in keyboard],"resize_keyboard":True}
    return api(db,"sendMessage",body)
def inline(db,chat_id,text,rows): return api(db,"sendMessage",{"chat_id":chat_id,"text":text,"reply_markup":{"inline_keyboard":rows}})
def delete_message(db,chat_id,message_id):
    try: api(db,"deleteMessage",{"chat_id":chat_id,"message_id":message_id})
    except HTTPException: pass
def normalize_phone(text):
    converted=str(text or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩","01234567890123456789"))
    digits=re.sub(r"\D","",converted)
    return "0"+digits[2:] if digits.startswith("98") and len(digits)==12 else digits
def _context(link):
    try: return json.loads(link.context_json or "{}")
    except (TypeError, ValueError): return {}
def _set_context(link, **values):
    link.context_json=json.dumps(values,ensure_ascii=False)
def _buttons(*labels):
    return [[{"text":label,"callback_data":data}] for label,data in labels]
def _main_menu(role):
    if role=="student": return [["دانلود برنامه","ثبت گزارش کار"],["خروج از حساب"]]
    if role=="advisor": return [["دانش‌آموزان من"],["خروج از حساب"]]
    return [["دانلود برنامه","دریافت گزارش کار"],["خروج از حساب"]]
def _main_inline(role):
    if role=="student": return _buttons(("📥 دانلود برنامه","svc:plan"),("📝 ثبت گزارش کار","svc:report"))
    if role=="advisor": return _buttons(("👥 دانش‌آموزان من","svc:students"))
    return _buttons(("📥 دانلود برنامه","svc:plan"),("📊 دریافت گزارش کار","svc:report"))
def _published_plans(db,student_id,limit=5):
    return db.scalars(select(WeeklyPlan).where(WeeklyPlan.student_id==student_id,WeeklyPlan.status=="published")
        .order_by(WeeklyPlan.published_at.desc(),WeeklyPlan.created_at.desc()).limit(limit)).all()
def _plan_dates(plan):
    try:
        days=json.loads(plan.schedule_days_json or "[]")
        dates=[str(day.get("date") or "") for day in days if day.get("date")]
    except (TypeError,ValueError): dates=[]
    return (dates[0],dates[-1]) if dates else ("نامشخص","نامشخص")
def _plan_label(plan):
    start,end=_plan_dates(plan)
    number=plan.publication_number or plan.version
    return f"برنامه {number} · {start} تا {end}"
def _plan_rows(plans,prefix):
    return [[{"text":_plan_label(plan),"callback_data":prefix+plan.id}] for plan in plans]
def _assigned_student(db,advisor_id,student_id):
    return db.scalar(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id==advisor_id,
        AdvisorAssignment.student_id==student_id,AdvisorAssignment.active.is_(True),
        AdvisorAssignment.approval_status=="approved")) is not None
def _student_for_link(db,link,user=None):
    if link.access_role=="student" and user and user.role=="student": return user
    if link.access_role=="parent" and link.student_id: return db.get(User,link.student_id)
    return None
def _authorized_plan(db,link,user,plan_id):
    plan=db.get(WeeklyPlan,plan_id)
    if not plan or plan.status!="published": return None
    if link.access_role=="student" and user and plan.student_id==user.id: return plan
    if link.access_role=="parent" and plan.student_id==link.student_id: return plan
    if link.access_role=="advisor" and user and _assigned_student(db,user.id,plan.student_id): return plan
    return None
def create_grant(db,user_id,kind,resource_id="",minutes=15):
    raw=secrets.token_urlsafe(32)
    db.add(BaleAccessGrant(token_hash=hash_token(raw),user_id=user_id,kind=kind,resource_id=resource_id,expires_at=utcnow()+timedelta(minutes=minutes)))
    return raw
def public_link(db,path,params=None):
    root=value(db,"public_url").strip().rstrip("/") or settings.frontend_origin.rstrip("/")
    return root+path+("?"+urlencode(params) if params else "")
def _link(db,chat_id):
    row=db.get(BaleAccountLink,str(chat_id))
    if not row: row=BaleAccountLink(chat_id=str(chat_id)); db.add(row); db.flush()
    return row
def _latest_plan(db,student_id,status="published"):
    return db.scalar(select(WeeklyPlan).where(WeeklyPlan.student_id==student_id,WeeklyPlan.status==status).order_by(WeeklyPlan.created_at.desc()))
def begin_login(db,chat_id):
    link=_link(db,chat_id);link.user_id=None;link.student_id=None;link.pending_phone="";link.access_role="";link.state="choose_role";_set_context(link)
    return inline(db,chat_id,"به بازوی مهیاد خوش آمدید 🌱\nنوع ورود خود را انتخاب کنید:",_buttons(
        ("🎓 ورود دانش‌آموز","role:student"),("👨‍👩‍👧 ورود والدین","role:parent"),("🧑‍🏫 ورود مشاور","role:advisor")))

def _finish_login(db,chat_id,link,user,role):
    if role in {"student","advisor"}:
        old=db.scalar(select(BaleAccountLink).where(BaleAccountLink.user_id==user.id,BaleAccountLink.chat_id!=chat_id))
        if old: old.user_id=None;old.access_role="";old.state="choose_role"
        link.user_id=user.id
        if role=="student": link.student_id=user.id
    link.access_role=role;link.state="linked";link.pending_phone="";link.failed_attempts=0;link.linked_at=utcnow();_set_context(link)
    send(db,chat_id,f"{user.full_name} عزیز، اتصال با موفقیت انجام شد ✅",_main_menu(role))
    return inline(db,chat_id,"چه کاری می‌خواهید انجام دهید؟",_main_inline(role))

def _number(text,minimum=0,maximum=10000):
    converted=normalize_phone(text) if str(text).strip().startswith(("+","0")) else str(text).translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹","0123456789")).strip()
    try: result=int(converted)
    except ValueError: return None
    return result if minimum<=result<=maximum else None
def _decimal(text,minimum=0,maximum=24):
    converted=str(text).translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٫","0123456789.")).strip().replace(",",".")
    try: result=float(converted)
    except ValueError: return None
    return result if minimum<=result<=maximum else None

def _save_activity(db,user,activity,values):
    from app.api.study_reports import ActivityReportInput, persist
    plan=db.get(WeeklyPlan,activity.plan_id)
    row=db.get(StudyReport,(plan.id,"activity:"+activity.id))
    payload=ActivityReportInput(version=row.version if row else 0,**values)
    persist(plan,"activity:"+activity.id,payload,db,user,activity)

def _save_day(db,user,plan,day,values):
    from app.api.study_reports import DayReportInput, persist
    row=db.get(StudyReport,(plan.id,"day:"+day))
    persist(plan,"day:"+day,DayReportInput(version=row.version if row else 0,**values),db,user)

def _continue_report_input(db,chat_id,link,user,text):
    context=_context(link);state=link.state
    activity=db.get(Activity,context.get("activity_id")) if context.get("activity_id") else None
    if state=="activity_reason":
        if not activity:return begin_login(db,chat_id)
        _save_activity(db,user,activity,{"status":"not_done","not_done_reason":text[:2000]})
        link.state="linked";_set_context(link);return send(db,chat_id,"دلیل انجام‌نشدن ثبت شد. ممنون که صادقانه گزارش دادی 🌱",_main_menu("student"))
    if state.startswith("activity_q_"):
        number=_number(text)
        if number is None:return send(db,chat_id,"لطفاً یک عدد بین ۰ تا ۱۰۰۰۰ وارد کنید.")
        if not activity:return begin_login(db,chat_id)
        values=context.get("values",{})
        if state=="activity_q_total":
            values={"status":"done","question_count":number}
            if number==0:
                _save_activity(db,user,activity,values);link.state="linked";_set_context(link)
                return send(db,chat_id,"آفرین! گزارش فعالیت ثبت شد ✅",_main_menu("student"))
            context["values"]=values;link.state="activity_q_correct";link.context_json=json.dumps(context,ensure_ascii=False)
            return send(db,chat_id,"تعداد پاسخ‌های درست را وارد کنید:")
        total=values.get("question_count",0);used=sum(values.get(k,0) for k in ("correct","wrong","unanswered"))
        if number>total-used:return send(db,chat_id,f"این عدد نمی‌تواند بیشتر از {total-used} باشد.")
        if state=="activity_q_correct":
            values["correct"]=number;link.state="activity_q_wrong";context["values"]=values;link.context_json=json.dumps(context,ensure_ascii=False)
            return send(db,chat_id,"تعداد پاسخ‌های غلط را وارد کنید:")
        if state=="activity_q_wrong":
            values["wrong"]=number;link.state="activity_q_unanswered";context["values"]=values;link.context_json=json.dumps(context,ensure_ascii=False)
            return send(db,chat_id,"تعداد سؤال‌های حل‌نشده را وارد کنید:")
        values["unanswered"]=number;_save_activity(db,user,activity,values);link.state="linked";_set_context(link)
        return send(db,chat_id,"آفرین! گزارش کامل فعالیت ثبت شد ✅",_main_menu("student"))
    if state.startswith("day_"):
        plan=db.get(WeeklyPlan,context.get("plan_id"));day=context.get("day");values=context.get("values",{})
        if not plan or not day:return begin_login(db,chat_id)
        steps=[("day_focus","focus","میزان انرژی را از ۱ تا ۵ وارد کنید:","day_energy"),
               ("day_energy","energy","میزان خواب شب قبل را به ساعت وارد کنید (۰ تا ۲۴):","day_sleep"),
               ("day_sleep","sleep_hours","میزان استرس را از ۱ تا ۵ وارد کنید:","day_stress")]
        for current,key,prompt,next_state in steps:
            if state==current:
                maximum=24 if key=="sleep_hours" else 5;minimum=0 if key=="sleep_hours" else 1
                number=_decimal(text,minimum,maximum) if key=="sleep_hours" else _number(text,minimum,maximum)
                if number is None:return send(db,chat_id,f"لطفاً عددی بین {minimum} تا {maximum} وارد کنید.")
                values[key]=number;context["values"]=values;link.context_json=json.dumps(context,ensure_ascii=False);link.state=next_state
                return send(db,chat_id,prompt)
        if state=="day_stress":
            number=_number(text,1,5)
            if number is None:return send(db,chat_id,"لطفاً عددی بین ۱ تا ۵ وارد کنید.")
            values["stress"]=number;context["values"]=values;link.context_json=json.dumps(context,ensure_ascii=False);link.state="day_distractions"
            return send(db,chat_id,"چه چیزهایی حواستان را پرت کرد؟ اگر موردی نبود، «نداشتم» بنویسید.")
        if state=="day_distractions":
            values["distractions"]="" if text=="نداشتم" else text[:2000];context["values"]=values;link.context_json=json.dumps(context,ensure_ascii=False);link.state="day_stress_source"
            return send(db,chat_id,"چه چیزی باعث استرس شد؟ اگر موردی نبود، «نداشتم» بنویسید.")
        values["stress_source"]="" if text=="نداشتم" else text[:2000];_save_day(db,user,plan,day,values);link.state="linked";_set_context(link)
        return send(db,chat_id,"جمع‌بندی روز با موفقیت ثبت شد ✨",_main_menu("student"))

def handle_message(db,message):
    chat_id=str(message.get("chat",{}).get("id",""));text=str(message.get("text","")).strip()
    if not chat_id:return
    link=_link(db,chat_id)
    if text in {"/start","/login","ورود"}:return begin_login(db,chat_id)
    if link.locked_until:
        locked=link.locked_until if link.locked_until.tzinfo else link.locked_until.replace(tzinfo=timezone.utc)
        if locked>utcnow():return send(db,chat_id,"به‌دلیل چند تلاش ناموفق، ورود ۱۵ دقیقه قفل شده است.")
        link.locked_until=None;link.failed_attempts=0
    user=db.get(User,link.user_id) if link.user_id else None
    if link.access_role=="student" and user and link.state.startswith(("activity_","day_")):
        return _continue_report_input(db,chat_id,link,user,text)
    linked=bool((link.access_role in {"student","advisor"} and user) or (link.access_role=="parent" and link.student_id))
    if not linked:
        if link.state=="await_parent_phone":
            phone=normalize_phone(text)
            student=db.scalar(select(User).join(StudentProfile,StudentProfile.user_id==User.id).where(
                User.phone==phone,User.role=="student",User.status.notin_(["deleted","suspended"])))
            if not student:return send(db,chat_id,"دانش‌آموز فعالی با این شماره پیدا نشد. شماره ثبت‌شده در سایت را دوباره وارد کنید.")
            link.pending_phone=phone;link.student_id=student.id;link.state="confirm_parent"
            return inline(db,chat_id,f"دانش‌آموز «{student.full_name}» با این شماره پیدا شد.\nآیا مورد تأیید است؟",
                [[{"text":"✅ بله، تأیید می‌کنم","callback_data":"parent:confirm"},{"text":"❌ خیر","callback_data":"parent:cancel"}]])
        if link.state=="await_phone":
            phone=normalize_phone(text);role=_context(link).get("role")
            if not re.fullmatch(r"09\d{9}",phone):return send(db,chat_id,"شماره موبایل معتبر ۱۱ رقمی وارد کنید؛ نمونه: 09123456789")
            user=db.scalar(select(User).where(User.phone==phone,User.role==role,User.status.notin_(["deleted","suspended"])))
            if not user:return send(db,chat_id,f"حساب فعال {'دانش‌آموز' if role=='student' else 'مشاور'} با این شماره پیدا نشد.")
            link.pending_phone=phone;link.state="await_password"
            return send(db,chat_id,"رمز ورود سایت مهیاد را وارد کنید. پیام رمز بلافاصله حذف می‌شود.")
        if link.state=="await_password":
            delete_message(db,chat_id,message.get("message_id"));role=_context(link).get("role")
            user=db.scalar(select(User).where(User.phone==link.pending_phone))
            if not user or user.role!=role or user.status in {"deleted","suspended"} or not verify_password(text,user.password_hash):
                link.failed_attempts+=1
                if link.failed_attempts>=5:link.locked_until=utcnow()+timedelta(minutes=15);link.failed_attempts=0
                return send(db,chat_id,"شماره موبایل یا رمز ورود صحیح نیست.")
            return _finish_login(db,chat_id,link,user,role)
        return begin_login(db,chat_id)
    if text=="خروج از حساب":
        link.user_id=None;link.student_id=None;link.access_role="";link.state="choose_role";_set_context(link)
        return send(db,chat_id,"اتصال حساب قطع شد. برای ورود دوباره /start را بفرستید.")
    if text in {"دانلود برنامه","دریافت برنامه هفتگی"}:return _show_plan_list(db,chat_id,link,user)
    if text in {"ثبت گزارش کار","دریافت گزارش کار"}:return _show_report_list(db,chat_id,link,user)
    if text=="دانش‌آموزان من":return _show_students(db,chat_id,user)
    send(db,chat_id,"یکی از خدمات منو را انتخاب کنید.",_main_menu(link.access_role))

def _show_students(db,chat_id,user):
    assignments=db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id==user.id,
        AdvisorAssignment.active.is_(True),AdvisorAssignment.approval_status=="approved")).all()
    rows=[]
    for assignment in assignments:
        student=db.get(User,assignment.student_id)
        if student:rows.append([{"text":"🎓 "+student.full_name,"callback_data":"student:"+student.id}])
    return inline(db,chat_id,"دانش‌آموز موردنظر را انتخاب کنید:",rows) if rows else send(db,chat_id,"دانش‌آموز فعالی به شما تخصیص داده نشده است.")

def _target_student(db,link,user):
    if link.access_role=="advisor":
        student_id=_context(link).get("student_id")
        return db.get(User,student_id) if student_id and _assigned_student(db,user.id,student_id) else None
    return _student_for_link(db,link,user)

def _show_plan_list(db,chat_id,link,user):
    student=_target_student(db,link,user)
    if not student:return _show_students(db,chat_id,user) if link.access_role=="advisor" else send(db,chat_id,"دانش‌آموز در دسترس نیست.")
    plans=_published_plans(db,student.id)
    return inline(db,chat_id,"یکی از ۵ برنامه آخر را انتخاب کنید:",_plan_rows(plans,"plan:")) if plans else send(db,chat_id,"هنوز برنامه منتشرشده‌ای وجود ندارد.")

def _show_report_list(db,chat_id,link,user):
    student=_target_student(db,link,user)
    if not student:return _show_students(db,chat_id,user) if link.access_role=="advisor" else send(db,chat_id,"دانش‌آموز در دسترس نیست.")
    plans=_published_plans(db,student.id)
    return inline(db,chat_id,"برنامه موردنظر را برای گزارش کار انتخاب کنید:",_plan_rows(plans,"report:")) if plans else send(db,chat_id,"هنوز برنامه منتشرشده‌ای وجود ندارد.")

def _show_days(db,chat_id,plan,prefix):
    try:days=json.loads(plan.schedule_days_json or "[]")
    except (TypeError,ValueError):days=[]
    rows=[[{"text":f"{day.get('label','روز')} · {day.get('date','') or 'بدون تاریخ'}","callback_data":f"{prefix}:{plan.id}:{index}"}] for index,day in enumerate(days[:7])]
    return inline(db,chat_id,"روز موردنظر را انتخاب کنید:",rows) if rows else send(db,chat_id,"روزی در این برنامه ثبت نشده است.")

def _day_at(plan,index):
    try:days=json.loads(plan.schedule_days_json or "[]");return days[index] if 0<=index<len(days) else None
    except (TypeError,ValueError,IndexError):return None

def _daily_report_text(db,plan,day):
    from app.api.study_reports import snapshot
    from app.study_reporting import legacy_report
    data=snapshot(plan,db);label=day.get("label","روز");date=day.get("date","")
    lines=[f"📅 گزارش {label} · {date}"]
    activities=sorted((item for item in plan.activities if item.day==label),key=lambda item:item.start_time)
    if not activities:lines.append("\nفعالیتی برای این روز ثبت نشده است.")
    for item in activities:
        values=data["activities"].get(item.id,{}).get("values",legacy_report(item))
        status={"done":"✅ انجام شد","not_done":"❌ انجام نشد"}.get(values.get("status"),"⏳ تعیین نشده")
        lines.append(f"\n• {item.title} ({item.start_time} تا {item.end_time})\n  {status}")
        if values.get("question_count") is not None:lines.append(f"  سؤال: {values['question_count']} · درست: {values.get('correct',0)} · غلط: {values.get('wrong',0)} · حل‌نشده: {values.get('unanswered',0)}")
        if values.get("not_done_reason"):lines.append("  دلیل: "+values["not_done_reason"])
        if values.get("quality"):lines.append("  توضیحات: "+values["quality"])
    day_values=data["days"].get(label,{}).get("values",{})
    lines.append("\n✨ جمع‌بندی روز")
    summaries=[("تمرکز","focus"," از ۵"),("انرژی","energy"," از ۵"),("خواب","sleep_hours"," ساعت"),("استرس","stress"," از ۵")]
    details=[f"{title}: {day_values[key]}{suffix}" for title,key,suffix in summaries if day_values.get(key) is not None]
    if day_values.get("distractions"):details.append("حواس‌پرتی: "+day_values["distractions"])
    if day_values.get("stress_source"):details.append("عامل استرس: "+day_values["stress_source"])
    lines.extend(details or ["هنوز جمع‌بندی ثبت نشده است."])
    return "\n".join(lines)

def _answer(db,query_id,text="انجام شد"):
    if query_id:api(db,"answerCallbackQuery",{"callback_query_id":query_id,"text":text})

def handle_callback(db,query):
    query_id=query.get("id");chat_id=str(query.get("message",{}).get("chat",{}).get("id",""));data=str(query.get("data",""))
    link=_link(db,chat_id);user=db.get(User,link.user_id) if link.user_id else None
    if data.startswith("role:"):
        role=data.split(":",1)[1]
        if role=="parent":
            link.access_role="parent";link.state="await_parent_phone";link.user_id=None;link.student_id=None;_set_context(link);_answer(db,query_id)
            return send(db,chat_id,"شماره موبایل دانش‌آموز را که در سایت ثبت شده وارد کنید.")
        link.access_role=role;link.state="await_phone";link.user_id=None;link.student_id=None;_set_context(link,role=role);_answer(db,query_id)
        return send(db,chat_id,f"شماره موبایل ثبت‌شده {'دانش‌آموز' if role=='student' else 'مشاور'} در سایت را وارد کنید.")
    if data=="parent:cancel":
        _answer(db,query_id);return begin_login(db,chat_id)
    if data=="parent:confirm" and link.state=="confirm_parent":
        student=db.get(User,link.student_id)
        if not student:_answer(db,query_id,"دانش‌آموز یافت نشد");return begin_login(db,chat_id)
        _answer(db,query_id);return _finish_login(db,chat_id,link,student,"parent")
    linked=bool((link.access_role in {"student","advisor"} and user) or (link.access_role=="parent" and link.student_id))
    if not linked:_answer(db,query_id,"ابتدا وارد شوید");return begin_login(db,chat_id)
    if data=="svc:students" and link.access_role=="advisor":_answer(db,query_id);return _show_students(db,chat_id,user)
    if data.startswith("student:") and link.access_role=="advisor":
        student_id=data.split(":",1)[1]
        if not _assigned_student(db,user.id,student_id):return _answer(db,query_id,"دسترسی مجاز نیست")
        student=db.get(User,student_id);_set_context(link,student_id=student_id);_answer(db,query_id)
        return inline(db,chat_id,f"خدمات «{student.full_name}» را انتخاب کنید:",_buttons(("📥 دانلود برنامه","svc:plan"),("📊 دریافت گزارش کار","svc:report")))
    if data=="svc:plan":_answer(db,query_id);return _show_plan_list(db,chat_id,link,user)
    if data=="svc:report":_answer(db,query_id);return _show_report_list(db,chat_id,link,user)
    if data.startswith("plan:"):
        plan=_authorized_plan(db,link,user,data.split(":",1)[1])
        if not plan:return _answer(db,query_id,"برنامه در دسترس نیست")
        _answer(db,query_id)
        return inline(db,chat_id,_plan_label(plan)+"\nنسخه موردنظر را انتخاب کنید:",_buttons(
            ("🌈 نسخه رنگی","format:color:"+plan.id),("⚫ نسخه سیاه و سفید","format:mono:"+plan.id)))
    if data.startswith("format:"):
        _,mode,plan_id=data.split(":",2);plan=_authorized_plan(db,link,user,plan_id)
        if not plan:return _answer(db,query_id,"دسترسی مجاز نیست")
        owner=user.id if user else link.student_id;raw=create_grant(db,owner,"plan_color" if mode=="color" else "plan_mono",plan.id)
        _answer(db,query_id,"لینک آماده شد")
        return send(db,chat_id,f"{'نسخه رنگی' if mode=='color' else 'نسخه سیاه و سفید'} آماده است (اعتبار لینک ۱۵ دقیقه):\n"+public_link(db,f"/bale-download/{raw}"))
    if data.startswith("report:"):
        plan=_authorized_plan(db,link,user,data.split(":",1)[1])
        if not plan:return _answer(db,query_id,"برنامه در دسترس نیست")
        _answer(db,query_id)
        if link.access_role=="student":return _show_days(db,chat_id,plan,"entryday")
        return inline(db,chat_id,_plan_label(plan),_buttons(("📄 دانلود PDF گزارش کل هفته","weekpdf:"+plan.id),("📅 دریافت گزارش کار روزانه","viewdays:"+plan.id)))
    if data.startswith("weekpdf:"):
        plan=_authorized_plan(db,link,user,data.split(":",1)[1])
        if not plan:return _answer(db,query_id,"دسترسی مجاز نیست")
        owner=user.id if user else link.student_id;raw=create_grant(db,owner,"report",plan.id);_answer(db,query_id,"لینک آماده شد")
        return send(db,chat_id,"PDF گزارش کار کل هفته آماده است (اعتبار لینک ۱۵ دقیقه):\n"+public_link(db,f"/bale-download/{raw}"))
    if data.startswith("viewdays:"):
        plan=_authorized_plan(db,link,user,data.split(":",1)[1]);_answer(db,query_id)
        return _show_days(db,chat_id,plan,"viewday") if plan else send(db,chat_id,"برنامه در دسترس نیست.")
    if data.startswith(("viewday:","entryday:")):
        prefix,plan_id,index=data.split(":",2);plan=_authorized_plan(db,link,user,plan_id);day=_day_at(plan,int(index)) if plan else None
        if not day:return _answer(db,query_id,"روز در دسترس نیست")
        _answer(db,query_id)
        if prefix=="viewday":return send(db,chat_id,_daily_report_text(db,plan,day))
        rows=[]
        for activity in sorted((x for x in plan.activities if x.day==day["label"]),key=lambda x:x.start_time):
            rows.append([{"text":f"{activity.start_time} · {activity.title}","callback_data":"activity:"+activity.id}])
        rows.append([{"text":"✨ گزارش جمع‌بندی روز","callback_data":f"daysummary:{plan.id}:{index}"}])
        return inline(db,chat_id,f"فعالیت‌های {day['label']} · {day.get('date','')}",rows)
    if data.startswith("activity:") and link.access_role=="student":
        activity=db.get(Activity,data.split(":",1)[1])
        if not activity or not _authorized_plan(db,link,user,activity.plan_id):return _answer(db,query_id,"فعالیت در دسترس نیست")
        _answer(db,query_id);return inline(db,chat_id,activity.title,_buttons(("✅ انجام شد","done:"+activity.id),("❌ انجام نشد","skip:"+activity.id)))
    if data.startswith("done:") and link.access_role=="student":
        activity=db.get(Activity,data.split(":",1)[1])
        if not activity or not _authorized_plan(db,link,user,activity.plan_id):return _answer(db,query_id,"فعالیت در دسترس نیست")
        link.state="activity_q_total";_set_context(link,activity_id=activity.id);_answer(db,query_id)
        return send(db,chat_id,"چند سؤال حل کردی؟ عدد را وارد کن (اگر سؤال نداشتی ۰ بفرست).")
    if data.startswith("skip:") and link.access_role=="student":
        activity=db.get(Activity,data.split(":",1)[1])
        if not activity or not _authorized_plan(db,link,user,activity.plan_id):return _answer(db,query_id,"فعالیت در دسترس نیست")
        link.state="activity_reason";_set_context(link,activity_id=activity.id);_answer(db,query_id)
        return send(db,chat_id,"دلیل انجام‌نشدن فعالیت را بنویس:")
    if data.startswith("daysummary:") and link.access_role=="student":
        _,plan_id,index=data.split(":",2);plan=_authorized_plan(db,link,user,plan_id);day=_day_at(plan,int(index)) if plan else None
        if not day:return _answer(db,query_id,"روز در دسترس نیست")
        link.state="day_focus";_set_context(link,plan_id=plan.id,day=day["label"],values={});_answer(db,query_id)
        return send(db,chat_id,"میزان تمرکز امروز را از ۱ تا ۵ وارد کنید:")
    _answer(db,query_id,"گزینه معتبر نیست")

def answer_pre_checkout(db,query):
    payload=query.get("invoice_payload","")
    order=db.get(Order,payload.removeprefix("mahyaad-order:")) if payload.startswith("mahyaad-order:") else None
    valid=bool(order and order.status=="pending" and query.get("total_amount")==order.amount*10 and query.get("currency")=="IRR")
    body={"pre_checkout_query_id":query.get("id"),"ok":valid}
    if not valid: body["error_message"]="اطلاعات پرداخت با سفارش مطابقت ندارد."
    api(db,"answerPreCheckoutQuery",body)
def complete_payment(db,message):
    pay=message.get("successful_payment") or {}; payload=pay.get("invoice_payload","")
    order=db.get(Order,payload.removeprefix("mahyaad-order:")) if payload.startswith("mahyaad-order:") else None
    link=db.get(BaleAccountLink,str(message.get("chat",{}).get("id","")))
    if not order or not link or order.user_id!=link.user_id or pay.get("currency")!="IRR" or pay.get("total_amount")!=order.amount*10 or order.status=="paid": return
    plan=db.get(SubscriptionPlan,order.plan_id); now=utcnow(); current=active_subscription(db,order.user_id)
    start=max(now,current.expires_at if current.expires_at.tzinfo else current.expires_at.replace(tzinfo=timezone.utc)) if current else now
    months={"monthly":1,"quarterly":3,"yearly":12,"1_month":1,"3_month":3,"12_month":12}.get(plan.period,1)
    expires=start+timedelta(days=30*months)
    order.status="paid"; order.provider_reference=str(pay.get("telegram_payment_charge_id") or pay.get("provider_payment_charge_id") or "bale")
    db.add(Subscription(user_id=order.user_id,plan_id=plan.id,order_id=order.id,starts_at=start,expires_at=expires,status="active"))
    send(db,str(message.get("chat",{}).get("id")),f"پرداخت موفق بود و اشتراک شما تا {expires.date().isoformat()} فعال شد.")
def handle_update(db,update):
    if update.get("pre_checkout_query"): return answer_pre_checkout(db,update["pre_checkout_query"])
    if update.get("callback_query"): return handle_callback(db,update["callback_query"])
    message=update.get("message") or update.get("edited_message")
    if message and message.get("successful_payment"): return complete_payment(db,message)
    if message: return handle_message(db,message)

def process_update(db,update):
    update_id=str(update.get("update_id","")).strip()
    if not update_id:return False
    if db.get(BaleProcessedUpdate,update_id):return False
    db.add(BaleProcessedUpdate(update_id=update_id))
    try:db.flush()
    except IntegrityError:
        db.rollback();return False
    if value(db,"enabled","false")=="true":handle_update(db,update)
    db.commit();return True

def poll_once(db,offset=None,prepare=False):
    if prepare:
        api(db,"deleteWebhook",{"drop_pending_updates":False})
        save_value(db,"webhook_active","false")
        db.commit()
    payload={"timeout":20,"allowed_updates":["message","edited_message","callback_query","pre_checkout_query"]}
    if offset is not None:payload["offset"]=offset
    updates=api(db,"getUpdates",payload,timeout=30) or []
    next_offset=offset
    for update in updates:
        process_update(db,update)
        try:next_offset=max(next_offset or 0,int(update.get("update_id",0))+1)
        except (TypeError,ValueError):pass
    return next_offset

def polling_worker(stop_event):
    from app.db.session import SessionLocal
    offset=None;prepared_token=""
    while not stop_event.is_set():
        try:
            with SessionLocal() as db:
                enabled=value(db,"enabled","false")=="true"
                token_marker=value(db,"bot_token")
                public=value(db,"public_url").strip()
                if not enabled or not token_marker or public.startswith("https://"):
                    offset=None;prepared_token="";stop_event.wait(3);continue
                prepare=prepared_token!=token_marker
                offset=poll_once(db,offset,prepare)
                prepared_token=token_marker
        except HTTPException as exc:
            logger.warning("Bale polling failed: %s",exc.detail);stop_event.wait(3)
        except Exception:
            logger.exception("Unexpected Bale polling failure");stop_event.wait(3)
