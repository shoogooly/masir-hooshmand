import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, X, Sparkles, Save } from 'lucide-react'
import { api } from '../api'
import type { PlanActivity } from '../types'
import { activityLines, type ActivityValues, type ReportRecord, type StudyReports } from './studyReportTypes'

export default function StudentActivityReport({item,planId,volume,record,canEdit}:{item:PlanActivity;planId:string;volume:boolean;record?:ReportRecord<ActivityValues>;canEdit:boolean}){
 const qc=useQueryClient()
 const [values,setValues]=useState<ActivityValues>(record?.values||{}),[version,setVersion]=useState(record?.version||0)
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false)
 useEffect(()=>{if(!dirty){setValues(record?.values||{});setVersion(record?.version||0)}},[record,dirty])
 const change=(patch:Partial<ActivityValues>)=>{setValues(v=>({...v,...patch}));setDirty(true);setSaved(false);setError('')}
 const number=(name:'question_count'|'correct'|'wrong'|'unanswered',label:string)=><label>{label}<input type="number" min={0} max={10000} step={1} inputMode="numeric" value={values[name]??''} onChange={e=>change({[name]:e.target.value===''?null:Number(e.target.value)})}/></label>
 async function submit(e:FormEvent){
  e.preventDefault();if(!canEdit||busy)return
  setBusy(true);setError('')
  try{
   const payload={...values,version}
   if(values.status==='done'){payload.not_done_reason=null;if(values.question_count==null){payload.correct=null;payload.wrong=null;payload.unanswered=null}}
   else{payload.actual_minutes=null;payload.question_count=null;payload.correct=null;payload.wrong=null;payload.unanswered=null;payload.quality=null}
   const result=await api<StudyReports>(`/plans/${planId}/study-reports/activities/${encodeURIComponent(item.id)}`,{method:'PUT',body:JSON.stringify(payload)})
   qc.setQueryData(['study-reports',planId],result);setValues(result.activities[item.id]?.values||{});setVersion(result.activities[item.id]?.version||0);setDirty(false);setSaved(true)
   void qc.invalidateQueries({queryKey:['plans']});void qc.invalidateQueries({queryKey:['report']})
  }catch(e){setError(e instanceof Error?e.message:'ذخیره نشد؛ دوباره تلاش کن.')}
  finally{setBusy(false)}
 }
 return <article className={'student-activity '+(values.status||'pending')} aria-label={item.title}>
  <div className="student-activity-line"><div className="student-activity-copy"><b>{item.title}</b><small>{volume?`${item.planned_minutes.toLocaleString('fa-IR')} دقیقه`:item.start_time+' تا '+item.end_time}</small></div>
   <div className="activity-choices"><button type="button" className="choice-done" aria-label="انجام شد" aria-pressed={values.status==='done'} disabled={!canEdit||busy} onClick={()=>change({status:'done'})}><Check aria-hidden="true"/></button><button type="button" className="choice-skipped" aria-label="انجام نشد" aria-pressed={values.status==='not_done'} disabled={!canEdit||busy} onClick={()=>change({status:'not_done'})}><X aria-hidden="true"/></button></div>
   {values.status&&<strong className="activity-cheer" key={values.status}>{values.status==='done'?<><Sparkles aria-hidden="true"/> آفرین!</>:'فرصت جبران هست!'}</strong>}
  </div>
  {values.status&&canEdit&&<form className="activity-inline-form" onSubmit={submit}><fieldset disabled={busy}>
   {values.status==='done'?<>{number('question_count','چند سؤال حل کردی؟')}{values.question_count!=null&&<div className="activity-question-split">{number('correct','درست')}{number('wrong','غلط')}{number('unanswered','حل‌نشده')}</div>}<label className="activity-note">توضیحات<textarea rows={1} maxLength={2000} value={values.quality||''} placeholder="از تجربه‌ات بگو…" onChange={e=>change({quality:e.target.value})}/></label></>:<label className="activity-note">چرا انجامش ندادی؟<textarea rows={1} maxLength={2000} value={values.not_done_reason||''} placeholder="دلیلش رو بنویس…" onChange={e=>change({not_done_reason:e.target.value})}/></label>}
   <div className="activity-save"><button type="submit" disabled={!dirty||busy} className="btn btn-primary"><Save aria-hidden="true"/>{busy?'در حال ذخیره…':'ثبت گزارش'}</button><small role="status">{dirty?'ذخیره نشده':saved?'گزارشت ثبت شد ✨':'ذخیره‌شده'}</small></div>
  </fieldset></form>}
  {!canEdit&&<div className="activity-readonly">{activityLines(record?.values).map(line=><p key={line}>{line}</p>)}</div>}
  {error&&<div role="alert" className="form-error">{error}<button type="button" className="text-button" onClick={()=>{setDirty(false);setError('');void qc.invalidateQueries({queryKey:['study-reports',planId]})}}>کنار گذاشتن تغییرات و دریافت گزارش ذخیره‌شده</button></div>}
 </article>
}
