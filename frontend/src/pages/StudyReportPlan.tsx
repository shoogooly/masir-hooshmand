import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { WeeklyPlan } from '../types'
import { activityLines, dayLines, type StudyReports } from './studyReportTypes'
import '../styles/study-reports.css'
import '../styles/student-plan.css'
import StudentActivityReport from './StudentActivityReport'
import StudentDayReport from './StudentDayReport'
import StudentPlanPicker from './StudentPlanPicker'
import '../styles/advisor-performance.css'

export function ReportSummary({lines,compact=false}:{lines:string[];compact?:boolean}){
 return <div className={'study-summary'+(compact?' compact':'')}>{lines.length?lines.map((line,i)=><p key={i}>{line}</p>):<p className="study-muted">هنوز گزارشی ثبت نشده است.</p>}</div>
}
export default function StudyReportPlan({plan,student=false,studentName='دانش‌آموز',advisorName='مشاور',tableRef,showDownload=true}:{plan:WeeklyPlan;student?:boolean;studentName?:string;advisorName?:string;tableRef?:{current:HTMLDivElement|null};showDownload?:boolean}){
 const {data,isLoading,error}=useQuery({queryKey:['study-reports',plan.id],queryFn:()=>api<StudyReports>(`/plans/${plan.id}/study-reports`),refetchInterval:30000})
 const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('')
 const canEdit=student&&Boolean(data?.editable)
 async function download(){
  if(!data)return;setExporting(true);setExportError('')
  try{const {exportStudyReportPdf}=await import('../utils/studyReportPdf');await exportStudyReportPdf(plan,data,studentName,advisorName)}
  catch(e){setExportError(e instanceof Error?e.message:'ساخت PDF ناموفق بود')}
  finally{setExporting(false)}
 }
 return <section className={'study-plan'+(student?' student-study-plan':' advisor-study-plan')} ref={tableRef} dir="rtl">
  <div className="pdf-reference-header"><h1>برنامه هفتگی {studentName}</h1><p>مشاور و برنامه‌ریز: {advisorName}</p></div>
  <header className="study-plan-heading"><div><h2>{plan.title}</h2><p>{plan.week_label}</p></div>{!student&&showDownload&&<button className="btn btn-primary" disabled={!data||exporting} onClick={download}>{exporting?'در حال ساخت PDF…':'دانلود برنامه و گزارش‌ها (A4)'}</button>}</header>
  {student?<div className="student-plan-facts"><article><span>🌱 شروع مسیر</span><b>{plan.days[0]?.date||'تعیین نشده'}</b></article><article><span>🏁 پایان برنامه</span><b>{plan.days.at(-1)?.date||'تعیین نشده'}</b></article><article className="weekly-mission"><span>✨ مأموریت هفته</span><b>{plan.weekly_mission||'قدم‌های کوچک، پیشرفت‌های بزرگ؛ این هفته با هم جلو می‌رویم.'}</b></article></div>:<p className="study-mission"><b>مأموریت هفته: </b>{plan.weekly_mission||'ثبت نشده است.'}</p>}
  {isLoading&&<p>در حال دریافت گزارش‌ها…</p>}{error&&<p role="alert">دریافت گزارش‌ها ناموفق بود؛ صفحه را تازه کنید.</p>}
  {data&&student&&<p className="study-edit-note">{canEdit?'هر روز، هر وقت خواستی! گزارش روزهای برنامه‌ات را بدون محدودیت زمانی ثبت یا ویرایش کن. تیک یا ضربدر را انتخاب کن و «ثبت گزارش» را بزن. همه فیلدها اختیاری‌اند.':'گزارش این برنامه فعلاً فقط قابل مشاهده است.'}</p>}
  {exportError&&<p role="alert">{exportError}</p>}
  {plan.days.map(day=>{
   const items=plan.activities.filter(x=>x.day===day.label).sort((a,b)=>a.start_time.localeCompare(b.start_time))
   return <section className="study-day" key={day.label}><h3>{day.label} <small>{day.date}</small></h3>
    <div className="study-activities">{items.map(item=>student?<StudentActivityReport key={item.id} item={item} planId={plan.id} volume={plan.plan_mode==='volume'} record={data?.activities[item.id]} canEdit={canEdit}/>:<article className={'study-activity report-'+(data?.activities[item.id]?.values.status||'pending')} key={item.id} aria-label={item.title}>
     <div className="study-activity-heading"><b>{item.title}</b><span>{plan.plan_mode==='volume'?item.planned_minutes.toLocaleString('fa-IR')+' دقیقه':item.start_time+' تا '+item.end_time}</span>{item.subject&&<small>{item.subject}</small>}</div>
     <div className="study-activity-report"><ReportSummary lines={activityLines(data?.activities[item.id]?.values)}/></div>
    </article>)}</div>
    {!items.length&&<p className="study-muted">برای این روز فعالیتی ثبت نشده است.</p>}
    {student?<StudentDayReport day={day.label} planId={plan.id} record={data?.days[day.label]} canEdit={canEdit}/>:<section className="study-day-report"><header><h4>جمع‌بندی روز {day.label}</h4></header><ReportSummary lines={dayLines(data?.days[day.label]?.values)}/></section>}
   </section>
  })}
 </section>
}
export function AdvisorReportArchive({plans,studentName}:{plans:WeeklyPlan[];studentName?:string}){
 const [selected,setSelected]=useState('')
 const plan=plans.find(p=>p.id===selected)||plans[0]
 const {data:me}=useQuery({queryKey:['me'],queryFn:()=>api<{full_name:string}>('/auth/me')})
 if(!plan)return null
 return <section className="advisor-report-archive"><h2>گزارش روزبه‌روز و فعالیت‌ها</h2><p className="advisor-report-guide">همه جزئیات ثبت‌شده، به ترتیب روز و فعالیت · فقط مشاهده</p><StudentPlanPicker plans={plans} selected={plan} onChange={setSelected}/><StudyReportPlan key={plan.id} plan={plan} studentName={studentName} advisorName={me?.full_name}/></section>
}
