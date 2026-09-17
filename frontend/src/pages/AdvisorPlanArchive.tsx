import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Download } from 'lucide-react'
import { api } from '../api'
import type { WeeklyPlan } from '../types'
import type { StudyReports } from './studyReportTypes'
import StudyReportPlan from './StudyReportPlan'
import '../styles/advisor-plan-sections.css'

export default function AdvisorPlanArchive({studentId,studentName,advisorName,reports=false,renderPlan}:{studentId:string;studentName:string;advisorName:string;reports?:boolean;renderPlan?:(plan:WeeklyPlan)=>ReactNode}){
 const {data=[],isLoading,error,refetch}=useQuery({queryKey:['plans','advisor'],queryFn:()=>api<WeeklyPlan[]>('/plans')})
 const [open,setOpen]=useState(''),[busy,setBusy]=useState(''),[failure,setFailure]=useState<{id:string;message:string}|null>(null)
 const qc=useQueryClient()
 const plans=(Array.isArray(data)?data:[]).filter(plan=>plan.student_id===studentId)
 async function download(plan:WeeklyPlan){
  setBusy(plan.id);setFailure(null)
  try{
   const values=await api<StudyReports>(`/plans/${plan.id}/study-reports`)
   qc.setQueryData(['study-reports',plan.id],values)
   const {exportStudyReportPdf}=await import('../utils/studyReportPdf')
   await exportStudyReportPdf(plan,values,studentName,advisorName)
  }catch(e){setFailure({id:plan.id,message:e instanceof Error?e.message:'دانلود گزارش ناموفق بود'})}
  finally{setBusy('')}
 }
 if(isLoading)return <p className="page-state">در حال دریافت برنامه‌ها…</p>
 if(error)return <div role="alert">دریافت برنامه‌ها ناموفق بود. <button onClick={()=>void refetch()}>تلاش دوباره</button></div>
 return <div className="advisor-plan-archive">
  {!plans.length&&<p className="page-state">هنوز برنامه‌ای برای این دانش‌آموز ثبت نشده است.</p>}
  {plans.map(plan=><article className={'advisor-plan-entry'+(open===plan.id?' expanded':'')} key={plan.id}>
   <div className="advisor-plan-entry-heading">
    <button className="advisor-plan-toggle" aria-expanded={open===plan.id} aria-controls={'plan-content-'+plan.id} onClick={()=>setOpen(open===plan.id?'':plan.id)}>
     <ChevronDown aria-hidden="true"/><span><b>{plan.title}</b><small>{plan.week_label} · نسخه {plan.version.toLocaleString('fa-IR')} · {plan.status==='published'?'منتشرشده':'پیش‌نویس'}</small></span>
    </button>
    {reports&&<button className="btn btn-outline advisor-report-download" aria-label={'دانلود PDF گزارش کار '+plan.week_label} disabled={Boolean(busy)} onClick={()=>void download(plan)}><Download/>{busy===plan.id?'در حال ساخت…':'دانلود PDF گزارش کار'}</button>}
   </div>
   {failure?.id===plan.id&&<p role="alert">{failure.message}</p>}
   {open===plan.id&&<div className="advisor-plan-expanded" id={'plan-content-'+plan.id}>
    {reports?<StudyReportPlan plan={plan} studentName={studentName} advisorName={advisorName} showDownload={false}/>:renderPlan?.(plan)}
   </div>}
  </article>)}
 </div>
}
