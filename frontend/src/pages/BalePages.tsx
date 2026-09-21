import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Download, ShieldCheck } from 'lucide-react'
import type { WeeklyPlan } from '../types'
import type { StudyReports } from './studyReportTypes'
import { exportPlanPdf } from '../utils/planPdf'
import { exportStudyReportPdf } from '../utils/studyReportPdf'

type DownloadData={kind:'plan'|'report';plan:WeeklyPlan;reports:StudyReports|null;student_name:string;advisor_name:string}
async function request<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch('/api/v1'+path,{...init,credentials:'include',headers:{'Content-Type':'application/json',...(init?.headers||{})}})
 const body=await response.json();if(!response.ok||!body.success)throw new Error(body.error?.message||'دریافت اطلاعات ناموفق بود')
 return body.data
}
export function BaleDownloadPage(){
 const {token=''}=useParams(),[data,setData]=useState<DownloadData>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),source=useRef<HTMLDivElement>(null)
 useEffect(()=>{request<DownloadData>('/bale/download/'+encodeURIComponent(token)).then(setData).catch(e=>setError(e.message))},[token])
 const download=async()=>{if(!data||!source.current)return;setBusy(true);try{if(data.kind==='plan')await exportPlanPdf(source.current,data.plan,false);else if(data.reports)await exportStudyReportPdf(data.plan,data.reports,data.student_name,data.advisor_name)}finally{setBusy(false)}}
 useEffect(()=>{if(data&&source.current)void download()},[data])
 return <main className="bale-public"><div className="bale-download-card"><img src="/brand/mahyaad-logo.png" alt="مهیاد"/><h1>{error?'دریافت فایل ممکن نشد':'فایل شما آماده است'}</h1><p>{error||'اگر دانلود به‌صورت خودکار آغاز نشد، دکمه زیر را بزنید.'}</p>{data&&<button className="btn btn-primary" disabled={busy} onClick={download}><Download/>{busy?'در حال ساخت PDF…':'دانلود دوباره PDF'}</button>}<small>این پیوند زمان‌دار و مخصوص حساب شماست.</small></div>
  {data&&<div ref={source} className="bale-pdf-source"><div className="pdf-reference-header"><h1>{data.plan.title}</h1><p>{data.student_name} · مشاور: {data.advisor_name}</p></div></div>}</main>
}
export function BaleAccessPage(){
 const {token=''}=useParams(),[params]=useSearchParams(),nav=useNavigate(),[error,setError]=useState('')
 useEffect(()=>{request('/bale/session/'+encodeURIComponent(token),{method:'POST'}).then(()=>{const next=params.get('next')||'/app';nav(next.startsWith('/app/')?next:'/app',{replace:true})}).catch(e=>setError(e.message))},[token])
 return <main className="bale-public"><div className="bale-download-card"><ShieldCheck/><h1>{error?'ورود امن انجام نشد':'در حال ورود امن به مهیاد'}</h1><p>{error||'لطفاً چند لحظه صبر کنید…'}</p>{error&&<button className="btn btn-primary" onClick={()=>nav('/login')}>ورود از سایت</button>}</div></main>
}
