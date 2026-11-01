import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { dayLines, type DayValues, type ReportRecord, type StudyReports } from './studyReportTypes'

export default function StudentDayReport({day,planId,record,canEdit}:{day:string;planId:string;record?:ReportRecord<DayValues>;canEdit:boolean}){
 const qc=useQueryClient()
 const [values,setValues]=useState<DayValues>(record?.values||{}),[version,setVersion]=useState(record?.version||0)
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false)
 useEffect(()=>{if(!dirty){setValues(record?.values||{});setVersion(record?.version||0)}},[record,dirty])
 function change(patch:Partial<DayValues>){setValues(v=>({...v,...patch}));setDirty(true);setSaved(false);setError('')}
 const rating=(key:'focus'|'energy'|'stress',label:string,emoji:string)=><label className={'day-rating '+key}><span>{emoji} {label}</span><select aria-label={'میزان '+label} value={values[key]??''} onChange={e=>change({[key]:e.target.value?Number(e.target.value):null})}><option value="">انتخاب کن</option>{[1,2,3,4,5].map(n=><option value={n} key={n}>{n.toLocaleString('fa-IR')} از ۵</option>)}</select></label>
 async function submit(e:FormEvent){
  e.preventDefault();if(!canEdit||busy)return;setBusy(true);setError('')
  try{
   const result=await api<StudyReports>(`/plans/${planId}/study-reports/days/${encodeURIComponent(day)}`,{method:'PUT',body:JSON.stringify({...values,version})})
   qc.setQueryData(['study-reports',planId],result);setValues(result.days[day]?.values||{});setVersion(result.days[day]?.version||0);setDirty(false);setSaved(true)
   void qc.invalidateQueries({queryKey:['report']})
  }catch(e){setError(e instanceof Error?e.message:'ذخیره نشد؛ دوباره تلاش کن.')}
  finally{setBusy(false)}
 }
 return <section className="study-day-report inline-day-report" aria-label={'جمع‌بندی روز '+day}>
  <header><h4>✨ جمع‌بندی روز {day}</h4><small>امروزت چطور گذشت؟</small></header>
  {canEdit?<form onSubmit={submit}><fieldset disabled={busy}>
   {rating('focus','تمرکز','🎯')}{rating('energy','انرژی','⚡')}
   <label className="day-rating sleep"><span>🌙 خواب (ساعت)</span><input aria-label="خواب شب قبل (ساعت)" type="number" min={0} max={24} step="any" value={values.sleep_hours??''} onChange={e=>change({sleep_hours:e.target.value===''?null:Number(e.target.value)})}/></label>
   {rating('stress','استرس','🍃')}
   <label className="day-note"><span>💭 چه چیزهایی حواست را پرت کرد؟</span><input maxLength={2000} value={values.distractions||''} placeholder="اختیاری…" onChange={e=>change({distractions:e.target.value})}/></label>
   <label className="day-note"><span>🌦 چه چیزی باعث استرس شد؟</span><input maxLength={2000} value={values.stress_source||''} placeholder="اختیاری…" onChange={e=>change({stress_source:e.target.value})}/></label>
   <div className="day-save"><button className="btn btn-primary" disabled={busy||!dirty}>{busy?'در حال ذخیره…':'ثبت جمع‌بندی'}</button><small role="status">{dirty?'ذخیره نشده':saved?'ثبت شد ✨':record?'ذخیره‌شده':'اختیاری'}</small></div>
  </fieldset></form>:<div className="study-summary">{dayLines(record?.values).map(line=><p key={line}>{line}</p>)}</div>}
  {error&&<div role="alert" className="form-error">{error}<button type="button" className="text-button" onClick={()=>{setDirty(false);setError('');void qc.invalidateQueries({queryKey:['study-reports',planId]})}}>کنار گذاشتن تغییرات و دریافت گزارش ذخیره‌شده</button></div>}
 </section>
}
