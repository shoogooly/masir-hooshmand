import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, MessageSquareText, Save, ShieldCheck } from 'lucide-react'
import { api } from '../api'

type Data = {sms_enabled:boolean;sms_key_configured:boolean;sms_template:string;sms_parameter:string;temporary_admin_code_active:boolean;zarinpal_enabled:boolean;zarinpal_merchant_configured:boolean;zarinpal_sandbox:boolean;public_url:string}

export default function AdminIntegrationsPage(){
 const qc=useQueryClient()
 const query=useQuery({queryKey:['integration-settings'],queryFn:()=>api<Data>('/integrations/admin/settings')})
 const [sms,setSms]=useState({sms_enabled:false,sms_api_key:'',sms_template_id:'',sms_parameter_name:'Code'})
 const [zarinpal,setZarinpal]=useState({zarinpal_enabled:false,zarinpal_merchant_id:'',zarinpal_sandbox:false,public_url:''})
 const [smsMessage,setSmsMessage]=useState('')
 const [zarinpalMessage,setZarinpalMessage]=useState('')
 useEffect(()=>{if(query.data){setSms(current=>({...current,sms_enabled:query.data!.sms_enabled,sms_template_id:query.data!.sms_template,sms_parameter_name:query.data!.sms_parameter||'Code'}));setZarinpal(current=>({...current,zarinpal_enabled:query.data!.zarinpal_enabled,zarinpal_sandbox:query.data!.zarinpal_sandbox,public_url:query.data!.public_url}))}},[query.data])
 const saveSms=useMutation({mutationFn:()=>api<Data>('/integrations/admin/sms',{method:'PUT',body:JSON.stringify(sms)}),onSuccess:data=>{qc.setQueryData(['integration-settings'],data);setSms(current=>({...current,sms_api_key:''}));setSmsMessage('تنظیمات پیامک ذخیره شد.')},onError:error=>setSmsMessage((error as Error).message)})
 const disableTemporaryCode=useMutation({mutationFn:()=>api<Data>('/integrations/admin/temporary-code/disable',{method:'POST'}),onSuccess:data=>{qc.setQueryData(['integration-settings'],data);setSmsMessage('کد ورود موقت غیرفعال شد.')},onError:error=>setSmsMessage((error as Error).message)})
 const saveZarinpal=useMutation({mutationFn:()=>api<Data>('/integrations/admin/zarinpal',{method:'PUT',body:JSON.stringify(zarinpal)}),onSuccess:data=>{qc.setQueryData(['integration-settings'],data);setZarinpal(current=>({...current,zarinpal_merchant_id:''}));setZarinpalMessage('تنظیمات زرین‌پال ذخیره شد.')},onError:error=>setZarinpalMessage((error as Error).message)})
 if(query.isLoading)return <div className="page-state">در حال دریافت تنظیمات…</div>
 if(query.isError||!query.data)return <div className="error-box">دریافت تنظیمات ناموفق بود. <button className="btn btn-outline" onClick={()=>void query.refetch()}>تلاش دوباره</button></div>
 return <div className="content-page"><div className="section-head"><div><h1>پیامک و درگاه پرداخت</h1><p>تنظیمات هر سرویس مستقل ذخیره می‌شود.</p></div></div>
  <div className="integration-grid"><section className="panel integration-card"><header><MessageSquareText/><div><h2>SMS.ir</h2><small>{query.data.sms_key_configured?'کلید ذخیره شده':'کلید تنظیم نشده'}</small></div></header>
   <label className="bale-switch"><input type="checkbox" checked={sms.sms_enabled} onChange={e=>setSms({...sms,sms_enabled:e.target.checked})}/>فعال‌سازی پیامک واقعی</label>
   <label>API Key<input type="password" value={sms.sms_api_key} onChange={e=>setSms({...sms,sms_api_key:e.target.value})} placeholder={query.data.sms_key_configured?'برای حفظ کلید فعلی خالی بگذارید':'کلید SMS.ir'}/></label>
   <label>شناسه قالب Verify<input value={sms.sms_template_id} onChange={e=>setSms({...sms,sms_template_id:e.target.value.replace(/\D/g,'')})} inputMode="numeric" placeholder="مثلاً 123456"/></label>
   <label>نام پارامتر کد<input value={sms.sms_parameter_name} onChange={e=>setSms({...sms,sms_parameter_name:e.target.value})} dir="ltr" placeholder="Code"/></label>
   <small>شناسه قالب و نام پارامتر باید مطابق قالب Verify در SMS.ir باشند.</small>
   {smsMessage&&<p className="bale-message" role="status">{smsMessage}</p>}
   <button className="btn btn-primary" disabled={saveSms.isPending} onClick={()=>saveSms.mutate()}><Save/>ذخیره تنظیمات پیامک</button>
   <small>{query.data.temporary_admin_code_active?'کد ورود موقت مدیر فعال است و خودکار منقضی می‌شود.':'کد ورود موقت مدیر غیرفعال است.'}</small>
   <button className="btn btn-outline" disabled={!query.data.temporary_admin_code_active||disableTemporaryCode.isPending} onClick={()=>disableTemporaryCode.mutate()}>غیرفعال کردن کد ورود موقت</button>
  </section>
  <section className="panel integration-card"><header><CreditCard/><div><h2>زرین‌پال</h2><small>{query.data.zarinpal_merchant_configured?'مرچنت ذخیره شده':'مرچنت تنظیم نشده'}</small></div></header>
   <label className="bale-switch"><input type="checkbox" checked={zarinpal.zarinpal_enabled} onChange={e=>setZarinpal({...zarinpal,zarinpal_enabled:e.target.checked})}/>فعال‌سازی پرداخت واقعی</label>
   <label>Merchant ID<input type="password" value={zarinpal.zarinpal_merchant_id} onChange={e=>setZarinpal({...zarinpal,zarinpal_merchant_id:e.target.value})} placeholder={query.data.zarinpal_merchant_configured?'برای حفظ مقدار فعلی خالی بگذارید':'مرچنت آیدی ۳۶ کاراکتری'}/></label>
   <label>نشانی عمومی HTTPS سایت<input value={zarinpal.public_url} onChange={e=>setZarinpal({...zarinpal,public_url:e.target.value})} placeholder="https://mahyaad.ir"/></label>
   <label className="bale-switch"><input type="checkbox" checked={zarinpal.zarinpal_sandbox} onChange={e=>setZarinpal({...zarinpal,zarinpal_sandbox:e.target.checked})}/>حالت آزمایشی زرین‌پال</label>
   {zarinpalMessage&&<p className="bale-message" role="status">{zarinpalMessage}</p>}
   <button className="btn btn-primary" disabled={saveZarinpal.isPending} onClick={()=>saveZarinpal.mutate()}><Save/>ذخیره تنظیمات زرین‌پال</button>
  </section></div>
  <div className="bale-note"><ShieldCheck/><p><b>حفاظت از کلیدها و تراکنش‌ها</b><span>کلیدها رمزنگاری می‌شوند. مبلغ و شناسه تراکنش در بازگشت از درگاه دوباره در سرور کنترل می‌شود.</span></p></div>
 </div>
}
