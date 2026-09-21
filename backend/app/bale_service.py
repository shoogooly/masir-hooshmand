from __future__ import annotations
import base64, hashlib, logging, re, secrets
from datetime import timedelta, timezone
from urllib.parse import urlencode
import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import active_subscription, hash_token, verify_password
from app.models import (AdvisorAssignment, BaleAccessGrant, BaleAccountLink, BaleProcessedUpdate, Order, SiteSetting,
    Subscription, SubscriptionPlan, User, WeeklyPlan, utcnow)

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
def menu(role):
    return ([["دریافت برنامه هفتگی","ثبت گزارش کار"],["وضعیت اشتراک","تمدید اشتراک"],["خروج از حساب"]]
      if role=="student" else [["گزارش کار دانش‌آموزان"],["برنامه‌ریزی دانش‌آموزان","انتشار برنامه‌های آماده"],["خروج از حساب"]])
def create_grant(db,user_id,kind,resource_id="",minutes=10):
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
    link=_link(db,chat_id); link.user_id=None; link.pending_phone=""; link.state="await_phone"
    send(db,chat_id,"برای اتصال امن حساب مهیاد، شماره موبایلی را که در سایت ثبت کرده‌اید وارد کنید.")

def handle_message(db,message):
    chat_id=str(message.get("chat",{}).get("id","")); text=str(message.get("text","")).strip()
    if not chat_id: return
    link=_link(db,chat_id)
    if text in {"/start","/login","ورود"}: return begin_login(db,chat_id)
    if link.locked_until:
        locked=link.locked_until if link.locked_until.tzinfo else link.locked_until.replace(tzinfo=timezone.utc)
        if locked>utcnow(): return send(db,chat_id,"به‌دلیل چند تلاش ناموفق، ورود ۱۵ دقیقه قفل شده است.")
        link.locked_until=None; link.failed_attempts=0
    if not link.user_id:
        if link.state=="await_phone":
            phone=normalize_phone(text)
            if not re.fullmatch(r"09\d{9}",phone): return send(db,chat_id,"شماره موبایل معتبر ۱۱ رقمی وارد کنید؛ نمونه: 09123456789")
            user=db.scalar(select(User).where(User.phone==phone,User.role.in_(["student","advisor"]),User.status.notin_(["deleted","suspended"])))
            if not user: return send(db,chat_id,"حساب فعال دانش‌آموز یا مشاور با این شماره پیدا نشد.")
            link.pending_phone=phone; link.state="await_password"
            return send(db,chat_id,"رمز عبور فعلی سایت مهیاد را وارد کنید. پیام رمز پس از دریافت حذف می‌شود.")
        if link.state=="await_password":
            delete_message(db,chat_id,message.get("message_id"))
            user=db.scalar(select(User).where(User.phone==link.pending_phone))
            if not user or user.role not in {"student","advisor"} or user.status in {"deleted","suspended"} or not verify_password(text,user.password_hash):
                link.failed_attempts+=1
                if link.failed_attempts>=5: link.locked_until=utcnow()+timedelta(minutes=15); link.failed_attempts=0
                return send(db,chat_id,"شماره موبایل یا رمز عبور صحیح نیست.")
            old=db.scalar(select(BaleAccountLink).where(BaleAccountLink.user_id==user.id,BaleAccountLink.chat_id!=chat_id))
            if old: old.user_id=None; old.state="await_phone"
            link.user_id=user.id; link.state="linked"; link.pending_phone=""; link.failed_attempts=0; link.linked_at=utcnow()
            return send(db,chat_id,f"{user.full_name} عزیز، حساب شما با موفقیت به بازوی مهیاد متصل شد.",menu(user.role))
        return begin_login(db,chat_id)
    user=db.get(User,link.user_id)
    if not user or user.status in {"deleted","suspended"}: link.user_id=None; return begin_login(db,chat_id)
    if text=="خروج از حساب": link.user_id=None; link.state="await_phone"; return send(db,chat_id,"اتصال حساب قطع شد. برای ورود دوباره /login را بفرستید.")
    return student_action(db,chat_id,user,text) if user.role=="student" else advisor_action(db,chat_id,user,text)

def student_action(db,chat_id,user,text):
    if text=="دریافت برنامه هفتگی":
        plan=_latest_plan(db,user.id)
        if not plan: return send(db,chat_id,"هنوز برنامه منتشرشده‌ای برای شما وجود ندارد.")
        raw=create_grant(db,user.id,"plan",plan.id,15)
        return send(db,chat_id,"نسخه PDF برنامه هفتگی شما آماده است (پیوند ۱۵ دقیقه اعتبار دارد):\n"+public_link(db,f"/bale-download/{raw}"))
    if text=="ثبت گزارش کار":
        plan=_latest_plan(db,user.id)
        if not plan: return send(db,chat_id,"برای ثبت گزارش، ابتدا باید برنامه هفتگی منتشرشده داشته باشید.")
        raw=create_grant(db,user.id,"session",plan.id,10)
        return send(db,chat_id,"برای ثبت یا ویرایش گزارش کار وارد صفحه امن مهیاد شوید (پیوند یک‌بارمصرف است):\n"+public_link(db,f"/bale-access/{raw}",{"next":"/app/student/plan"}))
    if text=="وضعیت اشتراک":
        sub=active_subscription(db,user.id)
        if not sub: return send(db,chat_id,"در حال حاضر اشتراک فعالی ندارید.")
        expiry=sub.expires_at if sub.expires_at.tzinfo else sub.expires_at.replace(tzinfo=timezone.utc)
        return send(db,chat_id,f"اشتراک شما فعال است.\nمانده: {max(0,(expiry-utcnow()).days)} روز\nتاریخ پایان: {expiry.date().isoformat()}")
    if text=="تمدید اشتراک":
        plans=db.scalars(select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True)).order_by(SubscriptionPlan.price)).all()
        rows=[[{"text":f"{p.name} · {p.price:,} تومان","callback_data":"renew:"+p.id}] for p in plans]
        return inline(db,chat_id,"طرح موردنظر را انتخاب کنید:",rows) if rows else send(db,chat_id,"در حال حاضر تعرفه فعالی ثبت نشده است.")
    send(db,chat_id,"یکی از خدمات منو را انتخاب کنید.",menu(user.role))

def advisor_action(db,chat_id,user,text):
    assignments=db.scalars(select(AdvisorAssignment).where(AdvisorAssignment.advisor_id==user.id,
      AdvisorAssignment.active.is_(True),AdvisorAssignment.approval_status=="approved")).all()
    if text=="گزارش کار دانش‌آموزان":
        sent=0
        for assignment in assignments:
            plan=_latest_plan(db,assignment.student_id); student=db.get(User,assignment.student_id)
            if plan and student:
                raw=create_grant(db,user.id,"report",plan.id,15)
                send(db,chat_id,f"گزارش {student.full_name} · {plan.week_label}\n"+public_link(db,f"/bale-download/{raw}")); sent+=1
        if not sent: send(db,chat_id,"گزارش قابل دانلودی برای دانش‌آموزان شما وجود ندارد.")
        return
    if text=="برنامه‌ریزی دانش‌آموزان":
        raw=create_grant(db,user.id,"session","",10)
        return send(db,chat_id,"برای ساخت و انتشار برنامه وارد برنامه‌ساز امن مهیاد شوید:\n"+public_link(db,f"/bale-access/{raw}",{"next":"/app/advisor/planner"}))
    if text=="انتشار برنامه‌های آماده":
        drafts=db.scalars(select(WeeklyPlan).where(WeeklyPlan.advisor_id==user.id,WeeklyPlan.status=="draft").order_by(WeeklyPlan.created_at.desc()).limit(20)).all()
        rows=[[{"text":p.title+" · "+p.week_label,"callback_data":"publish:"+p.id}] for p in drafts]
        return inline(db,chat_id,"برنامه‌ای را برای انتشار انتخاب کنید:",rows) if rows else send(db,chat_id,"برنامه پیش‌نویسی برای انتشار وجود ندارد.")
    send(db,chat_id,"یکی از خدمات منو را انتخاب کنید.",menu(user.role))

def handle_callback(db,query):
    query_id=query.get("id"); chat_id=str(query.get("message",{}).get("chat",{}).get("id","")); data=query.get("data","")
    link=db.get(BaleAccountLink,chat_id); user=db.get(User,link.user_id) if link and link.user_id else None
    if not user: api(db,"answerCallbackQuery",{"callback_query_id":query_id,"text":"ابتدا وارد حساب شوید","show_alert":True}); return
    if data.startswith("publish:") and user.role=="advisor":
        plan=db.get(WeeklyPlan,data[8:])
        if not plan or plan.advisor_id!=user.id or plan.status!="draft":
            api(db,"answerCallbackQuery",{"callback_query_id":query_id,"text":"برنامه معتبر نیست","show_alert":True}); return
        plan.status="published"; plan.published_at=utcnow()
        api(db,"answerCallbackQuery",{"callback_query_id":query_id,"text":"برنامه منتشر شد","show_alert":True}); return
    if data.startswith("renew:") and user.role=="student":
        plan=db.get(SubscriptionPlan,data[6:])
        if not plan or not plan.active:
            api(db,"answerCallbackQuery",{"callback_query_id":query_id,"text":"تعرفه در دسترس نیست","show_alert":True}); return
        order=Order(user_id=user.id,plan_id=plan.id,amount=plan.price,status="pending",idempotency_key="bale:"+secrets.token_urlsafe(18)); db.add(order); db.flush()
        token=secret_value(db,"payment_token")
        if not token:
            api(db,"answerCallbackQuery",{"callback_query_id":query_id,"text":"درگاه بله هنوز تنظیم نشده است","show_alert":True}); return
        api(db,"sendInvoice",{"chat_id":chat_id,"title":"تمدید اشتراک مهیاد","description":plan.name,
            "payload":"mahyaad-order:"+order.id,"provider_token":token,"currency":"IRR",
            "prices":[{"label":plan.name,"amount":plan.price*10}]})
        api(db,"answerCallbackQuery",{"callback_query_id":query_id,"text":"صورت‌حساب ارسال شد"})

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
