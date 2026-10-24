import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save } from 'lucide-react'
import { api } from '../api'
import type { ExtraClasses, ReportData, SchoolSchedule, User } from '../types'
import '../styles/school-schedule.css'

const weekDays=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه']
type StudentFile=ReportData&{student:User;profile:{school_schedule?:SchoolSchedule;extra_classes?:ExtraClasses}}

export default function SchoolSchedulePage({studentId}:{studentId:string}){
  const qc=useQueryClient(),[schedule,setSchedule]=useState<SchoolSchedule>({}),[extras,setExtras]=useState<ExtraClasses>({}),[periodCount,setPeriodCount]=useState(4)
  const {data,isLoading,error}=useQuery({queryKey:['student-file-school',studentId],queryFn:()=>api<StudentFile>(`/advisors/students/${studentId}/report`)})
  useEffect(()=>{if(!data)return;const next=data.profile.school_schedule||{};setSchedule(next);setExtras(data.profile.extra_classes||{});setPeriodCount(Math.max(4,...Object.values(next).map(row=>row.length)))},[data])
  const save=useMutation({mutationFn:()=>api(`/advisors/students/${studentId}/school-schedule`,{method:'PUT',body:JSON.stringify({school_schedule:Object.fromEntries(weekDays.map(day=>[day,(schedule[day]||[]).slice(0,periodCount).map(value=>value.trim())])),extra_classes:extras})}),onSuccess:()=>{qc.invalidateQueries({queryKey:['student-file',studentId]});qc.invalidateQueries({queryKey:['student-file-school',studentId]})}})
  const columns=useMemo(()=>Array.from({length:periodCount},(_,index)=>index),[periodCount])
  if(isLoading)return <div className="page-state">در حال دریافت برنامه مدرسه...</div>
  if(error||!data)return <div className="error-box">دریافت برنامه مدرسه ناموفق بود.</div>
  const change=(day:string,index:number,value:string)=>setSchedule(current=>({...current,[day]:Array.from({length:periodCount},(_,i)=>i===index?value:(current[day]?.[i]||''))}))
  return <section className="school-schedule-editor-page"><div className="section-head"><div><h2>برنامه مدرسه</h2><p>برنامه ثبت‌شده دانش‌آموز را ببینید و در صورت نیاز اصلاح کنید.</p></div><button type="button" className="btn btn-outline" disabled={periodCount>=10} onClick={()=>setPeriodCount(value=>value+1)}><Plus/> افزودن زنگ</button></div>
    <div className="school-schedule-table-wrap"><table className="school-schedule-table"><thead><tr><th>روز</th>{columns.map(index=><th key={index}>زنگ {index+1}</th>)}<th>کلاس فوق‌العاده یا توضیحات</th></tr></thead><tbody>{weekDays.map(day=><tr key={day}><th>{day}</th>{columns.map(index=><td key={index}><input value={schedule[day]?.[index]||''} onChange={event=>change(day,index,event.target.value)} placeholder="نام درس"/></td>)}<td><textarea value={extras[day]||''} onChange={event=>setExtras(current=>({...current,[day]:event.target.value}))} placeholder="توضیحات روز"/></td></tr>)}</tbody></table></div>
    <div className="planner-actions"><span>{save.isSuccess?'برنامه مدرسه ذخیره شد.':''}</span><button className="btn btn-primary" disabled={save.isPending} onClick={()=>save.mutate()}><Save/> ذخیره برنامه مدرسه</button></div>{save.error&&<div className="error-box">ذخیره برنامه مدرسه ناموفق بود.</div>}</section>
}
