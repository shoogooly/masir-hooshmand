import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, Link2, ShieldCheck } from 'lucide-react'
import { api } from '../api'

type Settings={enabled:boolean;bot_token_configured:boolean;payment_token_configured:boolean;public_url:string;webhook_configured:boolean;delivery_mode:'disabled'|'polling'|'webhook'}
export default function AdminBalePage(){
 const qc=useQueryClient(),query=useQuery({queryKey:['bale-settings'],queryFn:()=>api<Settings>('/bale/admin/settings')})
 const [form,setForm]=useState({enabled:false,public_url:'',bot_token:'',payment_token:''}),[message,setMessage]=useState('')
 useEffect(()=>{if(query.data)setForm(x=>({...x,enabled:query.data!.enabled,public_url:query.data!.public_url}))},[query.data])
 const save=useMutation({mutationFn:()=>api<Settings>('/bale/admin/settings',{method:'PUT',body:JSON.stringify(form)}),onSuccess:data=>{qc.setQueryData(['bale-settings'],data);setForm(x=>({...x,bot_token:'',payment_token:''}));setMessage('تنظیمات با امنیت کامل ذخیره شد.')},onError:e=>setMessage((e as Error).message)})
 const test=useMutation({mutationFn:()=>api<{bot:{username?:string;first_name?:string}}>('/bale/admin/test',{method:'POST'}),onSuccess:d=>setMessage('ارتباط با بازوی '+(d.bot.first_name||d.bot.username||'بله')+' برقرار است.'),onError:e=>setMessage((e as Error).message)})
 const hook=useMutation({mutationFn:()=>api<{configured:boolean}>('/bale/admin/webhook',{method:'POST'}),onSuccess:()=>{setMessage('وب‌هوک بازوی بله فعال شد.');void qc.invalidateQueries({queryKey:['bale-settings']})},onError:e=>setMessage((e as Error).message)})
 if(query.isLoading)return <div className="screen-loader">در حال دریافت تنظیمات بله…</div>
 return <div className="content-page bale-admin"><header className="bale-hero"><span><Bot/></span><div><small>یکپارچه‌سازی پیام‌رسان</small><h1>بازوی بله مهیاد</h1><p>دانش‌آموز و مشاور با همان شماره موبایل و رمز سایت وارد می‌شوند و خدمات مجاز نقش خود را دریافت می‌کنند.</p></div></header>
  <section className="panel bale-settings"><div className="bale-status">
   <Status ok={!!query.data?.bot_token_configured} text="توکن بازو"/><Status ok={!!query.data?.payment_token_configured} text="توکن پرداخت"/><Status ok={query.data?.delivery_mode!=='disabled'} text="دریافت پیام" readyText={query.data?.delivery_mode==='polling'?'حالت محلی':query.data?.webhook_configured?'وب‌هوک فعال':'آماده وب‌هوک'}/>
  </div>
  <label className="bale-switch"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/><span>فعال‌سازی خدمات بازوی بله</span></label>
  <div className="form-grid">
   <label className="wide">نشانی عمومی HTTPS سایت<input value={form.public_url} onChange={e=>setForm({...form,public_url:e.target.value})} placeholder="روی لوکال خالی بگذارید؛ پس از استقرار: https://mahyaad.ir"/><small>اگر خالی باشد، دریافت پیام برای آزمایش روی همین رایانه به‌صورت خودکار فعال می‌شود.</small></label>
   <label>توکن بازوی بله<input type="password" value={form.bot_token} onChange={e=>setForm({...form,bot_token:e.target.value})} placeholder={query.data?.bot_token_configured?'برای حفظ توکن فعلی خالی بگذارید':'توکن را وارد کنید'}/></label>
   <label>توکن پرداخت بله<input type="password" value={form.payment_token} onChange={e=>setForm({...form,payment_token:e.target.value})} placeholder={query.data?.payment_token_configured?'برای حفظ توکن فعلی خالی بگذارید':'توکن پرداخت را وارد کنید'}/></label>
  </div>
  <div className="bale-note"><ShieldCheck/><p><b>ورود امن با حساب مهیاد</b><span>رمز واردشده در بله ذخیره نمی‌شود، پیام رمز حذف می‌شود و پس از چند تلاش ناموفق ورود موقتاً قفل خواهد شد.</span></p></div>
  {query.data?.delivery_mode==='polling'&&<div className="bale-note"><Bot/><p><b>حالت آزمایش محلی فعال است</b><span>بدون وب‌هوک می‌توانید در بله دستور /start را بفرستید و تمام منوهای بازو را بررسی کنید.</span></p></div>}
  {message&&<p className="bale-message">{message}</p>}
  <div className="bale-actions"><button className="btn btn-primary" disabled={save.isPending} onClick={()=>save.mutate()}>ذخیره تنظیمات</button><button className="btn btn-soft" disabled={test.isPending||!query.data?.bot_token_configured} onClick={()=>test.mutate()}><CheckCircle2/>آزمایش اتصال</button><button className="btn btn-soft" disabled={hook.isPending||!query.data?.bot_token_configured||!form.public_url.startsWith('https://')} onClick={()=>hook.mutate()}><Link2/>فعال‌سازی وب‌هوک روی هاست</button></div>
  </section></div>
}
function Status({ok,text,readyText='آماده'}:{ok:boolean;text:string;readyText?:string}){return <span className={ok?'ready':''}><i/>{text}<small>{ok?readyText:'تنظیم نشده'}</small></span>}
