import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { BrainCircuit, CheckCircle2 } from 'lucide-react'
import { api } from '../api'
import '../styles/ai-plan-designer.css'

export type AIPlanDraft={student_id:string;student_name:string;start_date:string;title:string;weekly_mission:string;rationale:string;cautions:string[];days:{label:string;date:string}[];day_start_time:string;day_end_time:string;activities:{book_topic_id?:string;book_question_count?:number;day:string;title:string;start_time:string;end_time:string}[]}
export default function AIPlanDesigner({studentId,startDate,rangeStart,rangeEnd,hasDraft,onApply}:{studentId:string;startDate:string;rangeStart:string;rangeEnd:string;hasDraft:boolean;onApply:(draft:AIPlanDraft)=>void}){
 const [instructions,setInstructions]=useState(''),[applied,setApplied]=useState(false)
 const generate=useMutation({mutationFn:async(requestedInstructions:string)=>{
  const result=await api<AIPlanDraft>('/ai/students/'+studentId+'/plan-draft',{method:'POST',body:JSON.stringify({start_date:startDate,day_start_time:rangeStart,day_end_time:rangeEnd,instructions:requestedInstructions})})
  if(result.student_id!==studentId)throw new Error('پیش‌نویس متعلق به این دانش‌آموز نیست؛ دوباره تلاش کنید.')
  return result
 },onSuccess:()=>setApplied(false)})
 const draft=generate.data
 const stale=draft&&(generate.variables!==instructions||draft.start_date!==startDate||draft.day_start_time!==rangeStart||draft.day_end_time!==rangeEnd)
 return <section className="ai-plan-designer">
  <header><div><h3><BrainCircuit/> طراحی برنامه با هوش مصنوعی</h3><p>با توجه به برنامه‌ها، گزارش کار، آزمون‌ها و گفت‌وگوهای همین دانش‌آموز، یک پیش‌نویس قابل ویرایش بسازید.</p></div><button className="btn btn-primary" disabled={generate.isPending} onClick={()=>generate.mutate(instructions)}><BrainCircuit size={18}/>{generate.isPending?'در حال طراحی برنامه…':'طراحی برنامه با هوش مصنوعی'}</button></header>
  <label>راهنمای مشاور برای طراحی (اختیاری)<textarea rows={4} maxLength={1500} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="مثلاً: هر روز از ساعت ۱۲ تا ۱۳ استراحت باشد. این هفته تست ریاضی بیشتر و جمعه برنامه سبک‌تر باشد."/></label>
  <small>ابتدا تاریخ شروع و ساعت‌های کل روز را در فرم زیر تنظیم کنید. طراحی با هوش مصنوعی سهمیهٔ پیام دانش‌آموز را مصرف نمی‌کند.</small>
  {generate.isPending&&<p role="status">در حال بررسی اطلاعات و چیدن بازه‌های هفته؛ برنامهٔ فعلی شما حفظ می‌شود…</p>}
  {generate.error&&<p className="ai-plan-error" role="alert">{generate.error instanceof Error?generate.error.message:'طراحی برنامه ناموفق بود'}</p>}
  {draft&&!generate.isPending&&<div className="ai-plan-preview">
   <strong>این پیش‌نویس مربوط به دانش‌آموز {draft.student_name} است.</strong><p>{draft.rationale}</p>
   <div className="ai-plan-day-summaries">{draft.days.map(day=>{const rows=draft.activities.filter(a=>a.day===day.label);return <article key={day.label}><b>{day.label}</b><small>{day.date}</small><span>{rows.length.toLocaleString('fa-IR')} بازه</span><small>{rows.map(a=>a.title.split('\n')[0]).join(' · ')||'روز سبک / بدون فعالیت پیشنهادی'}</small></article>})}</div>
   {draft.cautions.length>0&&<details open><summary>مواردی که مشاور باید بررسی کند</summary><ul>{draft.cautions.map((text,i)=><li key={i}>{text}</li>)}</ul></details>}
   {stale?<p className="ai-plan-error">توضیحات مشاور، تاریخ یا بازهٔ روزانه تغییر کرده است؛ برای تنظیمات جدید دوباره طراحی کنید.</p>:applied?<p className="ai-plan-success"><CheckCircle2 size={18}/> پیش‌نویس در فرم زیر قرار گرفت؛ تمام بازه‌ها قابل ویرایش‌اند. پس از بررسی، «ذخیره و انتشار برنامه» را بزنید.</p>:<><p>{hasDraft?'با زدن دکمه زیر، عنوان، مأموریت و بازه‌های پیشنهادی جایگزین پیش‌نویس فعلی فرم می‌شوند.':'پیشنهاد را وارد فرم کنید، بازه‌ها را ببینید و هر قسمت را که لازم است تغییر دهید.'}</p><button className="btn btn-primary" onClick={()=>{onApply(draft);setApplied(true)}}>{hasDraft?'جایگزینی پیش‌نویس فعلی با پیشنهاد':'قرار دادن پیشنهاد در برنامه‌ساز'}</button></>}
  </div>}
 </section>
}

