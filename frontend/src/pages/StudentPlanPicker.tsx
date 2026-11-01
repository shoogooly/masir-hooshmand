import { useRef } from 'react'
import { CalendarDays, ChevronDown, Check } from 'lucide-react'
import type { WeeklyPlan } from '../types'

export default function StudentPlanPicker({plans,selected,onChange}:{plans:WeeklyPlan[];selected:WeeklyPlan;onChange:(id:string)=>void}){
 const ref=useRef<HTMLDetailsElement>(null)
 return <details className="student-plan-picker" ref={ref} onKeyDown={e=>{if(e.key==='Escape'){ref.current?.removeAttribute('open');ref.current?.querySelector('summary')?.focus()}}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))ref.current?.removeAttribute('open')}}>
  <summary><span className="plan-picker-icon"><CalendarDays/></span><span><small>یک هفته، یک شروع تازه</small><b>{selected.week_label} · نسخه {selected.version}</b></span><ChevronDown className="picker-chevron"/></summary>
  <div className="plan-picker-options" aria-label="انتخاب برنامه">{plans.map(plan=><button type="button" key={plan.id} aria-pressed={plan.id===selected.id} onClick={()=>{onChange(plan.id);ref.current?.removeAttribute('open');ref.current?.querySelector('summary')?.focus()}}><CalendarDays/><span><b>{plan.week_label}</b><small>{plan.title} · نسخه {plan.version}</small></span>{plan.id===selected.id&&<Check/>}</button>)}</div>
 </details>
}
