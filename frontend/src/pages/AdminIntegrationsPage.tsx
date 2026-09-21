import { useEffect,useState } from 'react'
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import { CreditCard,MessageSquareText,Save,ShieldCheck } from 'lucide-react'
import { api } from '../api'
type Data={sms_enabled:boolean;sms_key_configured:boolean;zarinpal_enabled:boolean;zarinpal_merchant_configured:boolean;zarinpal_sandbox:boolean;public_url:string}
export default function AdminIntegrationsPage(){
 const qc=useQueryClient(),query=useQuery({queryKey:['integration-settings'],queryFn:()=>api<Data>('/integrations/admin/settings')})
 const [form,setForm]=useState({sms_enabled:false,sms_api_key:'',sms_template_id:'',sms_parameter_name:'Code',zarinpal_enabled:false,zarinpal_merchant_id:'',zarinpal_sandbox:false,public_url:''}),[message,setMessage]=useState('')
 useEffect(()=>{if(query.data)setForm(x=>({...x,sms_enabled:query.data!.sms_enabled,zarinpal_enabled:query.data!.zarinpal_enabled,zarinpal_sandbox:query.data!.zarinpal_sandbox,public_url:query.data!.public_url}))},[query.data])
 const save=useMutation({mutationFn:()=>api<Data>('/integrations/admin/settings',{method:'PUT',body:JSON.stringify(form)}),onSuccess:data=>{qc.setQueryData(['integration-settings'],data);setForm(x=>({...x,sms_api_key:'',zarinpal_merchant_id:''}));setMessage('تنظیمات پیامک و پرداخت ذخیره شد.')},onError:e=>setMessage((e as Error).message)})
 if(query.isLoading)return <div className="page-state">در حال دریافت تنظیمات…</div>
 return <div className="content-page"><div className="section-head"><div><h1>پیامک و درگاه پرداخت</h1><p>اتصال SMS.ir برای کدهای یک‌بارمصرف و زرین‌پال برای پرداخت واقعی سایت.</p></div></div>
  <div className="integration-grid"><section className="panel integration-card"><header><MessageSquareText/><div><h2>SMS.ir</h2><small>{query.data?.sms_key_configured?'کلید ذخیره شده':'کلید تنظیم نشده'}</small></div></header>
   <label className="bale-switch"><input type="checkbox" checked={form.sms_enabled} onChange={e=>setForm({...form,sms_enabled:e.target.checked})}/>فعال‌سازی پیامک واقعی</label>
   <label>API Key<input type="password" value={form.sms_api_key} onChange={e=>setForm({...form,sms_api_key:e.target.value})} placeholder={query.data?.sms_key_configured?'برای حفظ کلید فعلی خالی بگذارید':'کلید SMS.ir'}/></label>
   <small>کد ورود با متن پیش‌فرض مهیاد و خط ارسال پیش‌فرض حساب SMS.ir فرستاده می‌شود و نیازی به ساخت قالب ندارد.</small>
  </section>
  <section className="panel integration-card"><header><CreditCard/><div><h2>زرین‌پال</h2><small>{query.data?.zarinpal_merchant_configured?'مرچنت ذخیره شده':'مرچنت تنظیم نشده'}</small></div></header>
   <label className="bale-switch"><input type="checkbox" checked={form.zarinpal_enabled} onChange={e=>setForm({...form,zarinpal_enabled:e.target.checked})}/>فعال‌سازی پرداخت واقعی</label>
   <label>Merchant ID<input type="password" value={form.zarinpal_merchant_id} onChange={e=>setForm({...form,zarinpal_merchant_id:e.target.value})} placeholder={query.data?.zarinpal_merchant_configured?'برای حفظ مقدار فعلی خالی بگذارید':'مرچنت آیدی ۳۶ کاراکتری'}/></label>
   <label>نشانی عمومی HTTPS سایت<input value={form.public_url} onChange={e=>setForm({...form,public_url:e.target.value})} placeholder="https://mahyaad.ir"/></label>
   <label className="bale-switch"><input type="checkbox" checked={form.zarinpal_sandbox} onChange={e=>setForm({...form,zarinpal_sandbox:e.target.checked})}/>حالت آزمایشی زرین‌پال</label>
  </section></div>
  <div className="bale-note"><ShieldCheck/><p><b>حفاظت از کلیدها و تراکنش‌ها</b><span>کلیدها رمزنگاری می‌شوند. مبلغ و Authority در بازگشت از درگاه دوباره در سرور کنترل می‌شود.</span></p></div>
  {message&&<p className="bale-message">{message}</p>}<button className="btn btn-primary" disabled={save.isPending} onClick={()=>save.mutate()}><Save/>ذخیره تنظیمات</button>
 </div>
}
