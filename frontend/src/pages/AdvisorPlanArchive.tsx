import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Download, Trash2 } from 'lucide-react'
import { api } from '../api'
import type { WeeklyPlan } from '../types'
import type { StudyReports } from './studyReportTypes'
import StudyReportPlan from './StudyReportPlan'
import '../styles/advisor-plan-sections.css'

export default function AdvisorPlanArchive({studentId,studentName,advisorName,reports=false,renderPlan,onEditDraft,onDraftDeleted}:{studentId:string;studentName:string;advisorName:string;reports?:boolean;renderPlan?:(plan:WeeklyPlan)=>ReactNode;onEditDraft?:(plan:WeeklyPlan)=>void;onDraftDeleted?:(id:string)=>void}){
 const {data=[],isLoading,error,refetch}=useQuery({queryKey:['plans','advisor'],queryFn:()=>api<WeeklyPlan[]>('/plans')})
 const [open,setOpen]=useState(''),[busy,setBusy]=useState(''),[failure,setFailure]=useState<{id:string;message:string}|null>(null)
 const [deleting,setDeleting]=useState('')
 const [category,setCategory]=useState<'published'|'draft'>('published')
 const [readyFile,setReadyFile]=useState<{url:string;filename:string}|null>(null)
 useEffect(()=>()=>{if(readyFile)URL.revokeObjectURL(readyFile.url)},[readyFile])
 const qc=useQueryClient()
 const plans=(Array.isArray(data)?data:[]).filter(plan=>plan.student_id===studentId&&(reports?plan.status==='published':plan.status===category))
 async function downloadPlans(selected:WeeklyPlan[]){
  const id=selected.length===1?selected[0].id:'all';setBusy(id);setFailure(null)
  try{const {exportArchivedPlans}=await import('../utils/planPdf');const file=await exportArchivedPlans(selected,studentName,advisorName);if(file)setReadyFile({url:URL.createObjectURL(file.blob),filename:file.filename})}
  catch(e){setFailure({id,message:e instanceof Error?e.message:'ساخت فایل ناموفق بود'})}finally{setBusy('')}
 }
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
 async function deleteDraft(plan:WeeklyPlan){
  if(!window.confirm(`پیش‌نویس «${plan.title}» حذف شود؟ این کار قابل بازگشت نیست.`))return
  setDeleting(plan.id);setFailure(null)
  try{await api(`/plan-drafts/${plan.id}`,{method:'DELETE'});setOpen('');onDraftDeleted?.(plan.id);await qc.invalidateQueries({queryKey:['plans','advisor']})}
  catch(e){setFailure({id:plan.id,message:e instanceof Error?e.message:'حذف پیش‌نویس ناموفق بود'})}
  finally{setDeleting('')}
 }
 if(isLoading)return <p className="page-state">در حال دریافت برنامه‌ها…</p>
 if(error)return <div role="alert">دریافت برنامه‌ها ناموفق بود. <button onClick={()=>void refetch()}>تلاش دوباره</button></div>
 return <div className="advisor-plan-archive">
  {readyFile&&<p className="success-note" role="status">فایل PDF آماده است. <a className="btn btn-outline" href={readyFile.url} download={readyFile.filename}>دریافت فایل آماده</a></p>}
  {!reports&&<div className="file-tabs" role="group" aria-label="تاریخچه برنامه‌ها"><button className={category==='published'?'active':''} onClick={()=>{setCategory('published');setOpen('')}}>برنامه‌های ارسال‌شده</button><button className={category==='draft'?'active':''} onClick={()=>{setCategory('draft');setOpen('')}}>پیش‌نویس‌ها</button></div>}
  {!reports&&category==='published'&&plans.length>1&&<button className="btn btn-outline" disabled={Boolean(busy)} onClick={()=>void downloadPlans(plans)}><Download/>{busy==='all'?'در حال ساخت…':'دانلود همه برنامه‌ها در یک PDF'}</button>}
  {failure?.id==='all'&&<p role="alert">{failure.message}</p>}
  {!plans.length&&<p className="page-state">هنوز برنامه‌ای برای این دانش‌آموز ثبت نشده است.</p>}
  {plans.map(plan=><article className={'advisor-plan-entry'+(open===plan.id?' expanded':'')} key={plan.id}>
   <div className="advisor-plan-entry-heading">
    <button className="advisor-plan-toggle" aria-expanded={open===plan.id} aria-controls={'plan-content-'+plan.id} onClick={()=>{if(category==='draft'&&onEditDraft)onEditDraft(plan);else setOpen(open===plan.id?'':plan.id)}}>
     <ChevronDown aria-hidden="true"/><span><b>{plan.title}</b><small>{plan.week_label} · نسخه {plan.version.toLocaleString('fa-IR')} · {plan.status==='published'?'منتشرشده':'پیش‌نویس'}</small></span>
    </button>
    {!reports&&category==='published'&&<button className="btn btn-outline" aria-label={'دانلود PDF برنامه '+plan.week_label} disabled={Boolean(busy)} onClick={()=>void downloadPlans([plan])}><Download/>{busy===plan.id?'در حال ساخت…':'دانلود PDF برنامه'}</button>}
    {!reports&&category==='draft'&&<><button className="btn btn-primary" onClick={()=>onEditDraft?.(plan)} disabled={Boolean(deleting)||!onEditDraft}>ادامه ویرایش</button><button className="btn btn-outline advisor-draft-delete" aria-label={'حذف پیش‌نویس '+plan.title} disabled={Boolean(deleting)} onClick={()=>void deleteDraft(plan)}><Trash2/>{deleting===plan.id?'در حال حذف…':'حذف پیش‌نویس'}</button></>}
    {reports&&<button className="btn btn-outline advisor-report-download" aria-label={'دانلود PDF گزارش کار '+plan.week_label} disabled={Boolean(busy)} onClick={()=>void download(plan)}><Download/>{busy===plan.id?'در حال ساخت…':'دانلود PDF گزارش کار'}</button>}
   </div>
   {failure?.id===plan.id&&<p role="alert">{failure.message}</p>}
   {open===plan.id&&<div className="advisor-plan-expanded" id={'plan-content-'+plan.id}>
    {reports?<StudyReportPlan plan={plan} studentName={studentName} advisorName={advisorName} showDownload={false}/>:renderPlan?.(plan)}
   </div>}
  </article>)}
 </div>
}
