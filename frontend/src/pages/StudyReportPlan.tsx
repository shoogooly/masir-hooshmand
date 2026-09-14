import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { WeeklyPlan } from '../types'
import { activityLines, dayLines, type ActivityValues, type DayValues, type StudyReports } from './studyReportTypes'
import '../styles/study-reports.css'

export function ReportSummary({lines,compact=false}:{lines:string[];compact?:boolean}){
 return <div className={'study-summary'+(compact?' compact':'')}>{lines.length?lines.map((line,i)=><p key={i}>{line}</p>):<p className="study-muted">هنوز گزارشی ثبت نشده است.</p>}</div>
}
type Editing={kind:'activity'|'day';id:string;title:string}
function Editor({editing,data,planId,canEdit,onClose}:{editing:Editing;data:StudyReports;planId:string;canEdit:boolean;onClose:()=>void}){
 const record=editing.kind==='activity'?data.activities[editing.id]:data.days[editing.id]
 const initial=useRef(record)
 const [status,setStatus]=useState((record?.values as ActivityValues)?.status||'')
 const [questions,setQuestions]=useState(String((record?.values as ActivityValues)?.question_count??''))
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const qc=useQueryClient(),dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[])
 const values=initial.current?.values||{}
 function number(name:string,label:string,max:number,step:number|string=1){return <label>{label}<input name={name} type="number" min="0" max={max} step={step} defaultValue={String((values as Record<string,unknown>)[name]??'')} inputMode="decimal"/></label>}
 function text(name:string,label:string){return <label className="study-full">{label}<textarea name={name} rows={3} maxLength={2000} defaultValue={String((values as Record<string,unknown>)[name]??'')}/></label>}
 function rating(name:string,label:string){return <label>{label}<select name={name} defaultValue={String((values as Record<string,unknown>)[name]??'')}><option value="">انتخاب نشده</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n.toLocaleString('fa-IR')} از ۵</option>)}</select></label>}
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('')
  const fields=Object.fromEntries(new FormData(e.currentTarget))
  const numeric=['actual_minutes','question_count','correct','wrong','unanswered','focus','energy','sleep_hours','stress']
  const payload:Record<string,unknown>={version:initial.current?.version||0}
  for(const [key,value] of Object.entries(fields))payload[key]=value===''?null:numeric.includes(key)?Number(value):value
  try{
   const result=await api<StudyReports>(`/plans/${planId}/study-reports/${editing.kind==='activity'?'activities':'days'}/${encodeURIComponent(editing.id)}`,{method:'PUT',body:JSON.stringify(payload)})
   qc.setQueryData(['study-reports',planId],result)
   qc.invalidateQueries({queryKey:['plans']});qc.invalidateQueries({queryKey:['report']})
   onClose()
  }catch(e){setError(e instanceof Error?e.message:'ذخیره گزارش ناموفق بود')}
  finally{setBusy(false)}
 }
 return <dialog ref={dialog} className="study-dialog" onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>
  <header><h2>{editing.title}</h2><button type="button" aria-label="بستن گزارش" disabled={busy} onClick={onClose}>×</button></header>
  {!canEdit?<><p>این گزارش فقط قابل مشاهده است.</p><ReportSummary lines={editing.kind==='activity'?activityLines(values as ActivityValues):dayLines(values as DayValues)}/></>:
   <form onSubmit={submit}><p className="study-muted">همه فیلدها اختیاری‌اند. با زدن «تأیید و ذخیره»، اطلاعات در حساب شما نگه داشته می‌شود.</p>
    <fieldset disabled={busy} className="study-fields">
     {editing.kind==='activity'?<>
      <label className="study-full">وضعیت انجام فعالیت<select name="status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">انتخاب نشده</option><option value="done">انجام شد</option><option value="not_done">انجام نشد</option></select></label>
      {status==='done'&&<>{number('actual_minutes','مدت انجام فعالیت (دقیقه)',1440)}
       <label>تعداد سؤال‌ها<input name="question_count" type="number" min="0" max="10000" step="1" value={questions} onChange={e=>setQuestions(e.target.value)}/></label>
       {questions!==''&&<div className="study-question-counts study-full">{number('correct','تعداد پاسخ‌های درست',10000)}{number('wrong','تعداد پاسخ‌های غلط',10000)}{number('unanswered','تعداد سؤال‌های بی‌پاسخ',10000)}</div>}
       {text('quality','ارزیابی شما از کیفیت انجام فعالیت')}</>}
      {status==='not_done'&&text('not_done_reason','دلیل انجام نشدن فعالیت')}
     </>:<>{rating('focus','میزان تمرکز')}{rating('energy','میزان انرژی')}{number('sleep_hours','خواب شب قبل (ساعت)',24,'any')}{rating('stress','میزان استرس')}{text('distractions','چه چیزهایی حواس شما را پرت کرد؟')}{text('stress_source','چه چیزی باعث استرس شما شد؟')}</>}
    </fieldset>
    {error&&<div role="alert" className="form-error">{error}<button type="button" className="text-button" onClick={()=>{qc.invalidateQueries({queryKey:['study-reports',planId]});onClose()}}>بستن و دریافت آخرین نسخه گزارش</button></div>}
    <div className="study-dialog-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy?'در حال ذخیره…':'تأیید و ذخیره'}</button><button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>انصراف</button></div>
   </form>}
 </dialog>
}
export default function StudyReportPlan({plan,student=false,studentName='دانش‌آموز',advisorName='مشاور',tableRef,showDownload=true}:{plan:WeeklyPlan;student?:boolean;studentName?:string;advisorName?:string;tableRef?:{current:HTMLDivElement|null};showDownload?:boolean}){
 const {data,isLoading,error}=useQuery({queryKey:['study-reports',plan.id],queryFn:()=>api<StudyReports>(`/plans/${plan.id}/study-reports`),refetchInterval:30000})
 const [editing,setEditing]=useState<Editing|null>(null),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState('')
 const [,setTick]=useState(0)
 useEffect(()=>{const id=setInterval(()=>setTick(x=>x+1),30000);return()=>clearInterval(id)},[])
 const observed=useRef({server:'',offset:0})
 if(data&&observed.current.server!==data.server_time)observed.current={server:data.server_time,offset:Date.parse(data.server_time)-Date.now()}
 const now=Date.now()+observed.current.offset
 const canEdit=student&&Boolean(data?.editable)&&now<Date.parse(data?.editable_until||'')
 async function download(){
  if(!data)return;setExporting(true);setExportError('')
  try{const {exportStudyReportPdf}=await import('../utils/studyReportPdf');await exportStudyReportPdf(plan,data,studentName,advisorName)}
  catch(e){setExportError(e instanceof Error?e.message:'ساخت PDF ناموفق بود')}
  finally{setExporting(false)}
 }
 return <section className="study-plan" ref={tableRef} dir="rtl">
  <div className="pdf-reference-header"><h1>برنامه هفتگی {studentName}</h1><p>مشاور و برنامه‌ریز: {advisorName}</p></div>
  <header className="study-plan-heading"><div><h2>{plan.title}</h2><p>{plan.week_label}</p></div>{!student&&showDownload&&<button className="btn btn-primary" disabled={!data||exporting} onClick={download}>{exporting?'در حال ساخت PDF…':'دانلود برنامه و گزارش‌ها (A4)'}</button>}</header>
  <p className="study-mission"><b>مأموریت هفته: </b>{plan.weekly_mission||'ثبت نشده است.'}</p>
  {isLoading&&<p>در حال دریافت گزارش‌ها…</p>}{error&&<p role="alert">دریافت گزارش‌ها ناموفق بود؛ صفحه را تازه کنید.</p>}
  {data&&student&&<p className="study-edit-note">{canEdit?'برای ثبت یا ویرایش گزارش، روی هر بازه کلیک کنید.':'گزارش این برنامه فعلاً فقط قابل مشاهده است.'} مهلت ویرایش: {new Date(Date.parse(data.editable_until)-1).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})}</p>}
  {exportError&&<p role="alert">{exportError}</p>}
  {plan.days.map(day=>{
   const items=plan.activities.filter(x=>x.day===day.label).sort((a,b)=>a.start_time.localeCompare(b.start_time))
   return <section className="study-day" key={day.label}><h3>{day.label} <small>{day.date}</small></h3>
    <div className="study-activities">{items.map(item=><article className="study-activity" key={item.id}>
     <button className="study-activity-heading" disabled={!student||!data} onClick={()=>setEditing({kind:'activity',id:item.id,title:`${day.label} · ${item.start_time} تا ${item.end_time}`})}><b>{item.title}</b><span>{item.start_time} تا {item.end_time}</span></button>
     <div className="study-activity-report"><b>گزارش فعالیت</b><ReportSummary compact={student} lines={activityLines(data?.activities[item.id]?.values)}/>{student&&data&&<button className="text-button" onClick={()=>setEditing({kind:'activity',id:item.id,title:`${day.label} · ${item.start_time} تا ${item.end_time}`})}>{canEdit?'ثبت / ویرایش گزارش':'مشاهده گزارش'}</button>}</div>
    </article>)}</div>
    {!items.length&&<p className="study-muted">برای این روز فعالیتی ثبت نشده است.</p>}
    <section className="study-day-report"><header><h4>جمع‌بندی روز {day.label}</h4>{student&&data&&<button className="btn btn-outline" onClick={()=>setEditing({kind:'day',id:day.label,title:'گزارش روز '+day.label})}>{canEdit?'ثبت / ویرایش گزارش روز':'مشاهده گزارش روز'}</button>}</header><ReportSummary compact={student} lines={dayLines(data?.days[day.label]?.values)}/></section>
   </section>
  })}
  {editing&&data&&<Editor key={plan.id+editing.kind+editing.id} editing={editing} data={data} planId={plan.id} canEdit={canEdit} onClose={()=>setEditing(null)}/>}
 </section>
}
export function AdvisorReportArchive({plans,studentName}:{plans:WeeklyPlan[];studentName?:string}){
 const [selected,setSelected]=useState('')
 const plan=plans.find(p=>p.id===selected)||plans[0]
 const {data:me}=useQuery({queryKey:['me'],queryFn:()=>api<{full_name:string}>('/auth/me')})
 if(!plan)return null
 return <section className="advisor-report-archive"><h2>برنامه‌ها و گزارش کار دانش‌آموز</h2><label>انتخاب هفته<select value={plan.id} onChange={e=>setSelected(e.target.value)}>{plans.map(p=><option key={p.id} value={p.id}>{p.week_label} · نسخه {p.version}</option>)}</select></label><StudyReportPlan key={plan.id} plan={plan} studentName={studentName} advisorName={me?.full_name}/></section>
}
