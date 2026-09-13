import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { isValidJalaaliDate, jalaaliToDateObject } from 'jalaali-js'
import { daysInJalali, faNumber, persianMonths, todayJalali, type JalaliDate } from '../utils/jalali'

export const normalizeBirthDate = (value:string) => value.replace(/[۰-۹٠-٩]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.includes(c) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(c) : '٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/-/g,'/')
function parse(value:string):JalaliDate|null {
  const parts=normalizeBirthDate(value).split('/').map(Number)
  if(parts.length!==3 || !isValidJalaaliDate(parts[0],parts[1],parts[2])) return null
  return {year:parts[0],month:parts[1],day:parts[2]}
}
export default function BirthDateInput({value,onChange,initialYear=1388}:{value:string;onChange:(value:string)=>void;initialYear?:number}) {
  const id=useId()
  const [open,setOpen]=useState(false)
  const [view,setView]=useState<JalaliDate>(()=>parse(value)||{year:initialYear,month:1,day:1})
  const input=useRef<HTMLInputElement>(null)
  const trigger=useRef<HTMLButtonElement>(null)
  const today=todayJalali()
  const future=(d:JalaliDate)=>d.year*10000+d.month*100+d.day>today.year*10000+today.month*100+today.day
  useEffect(()=>{
    const date=parse(value)
    input.current?.setCustomValidity(value && (!date || date.year<1300 || future(date))?'تاریخ تولد شمسی معتبر و غیرآینده وارد کنید.':'')
  },[value])
  const offset=(jalaaliToDateObject(view.year,view.month,1).getDay()+1)%7
  function move(delta:number) {
    const month=view.month+delta
    const next={year:view.year+(month>12?1:month<1?-1:0),month:month>12?1:month<1?12:month,day:1}
    if(next.year>=1300 && next.year<=today.year)setView(next)
  }
  function close(){setOpen(false);trigger.current?.focus()}
  return <div className="birth-date-field"><label htmlFor={id}>تاریخ تولد</label><div className="birth-date-control">
    <input ref={input} id={id} name="birth_date" value={value} onChange={e=>onChange(normalizeBirthDate(e.target.value))} required inputMode="numeric" placeholder="۱۳۸۸/۰۵/۱۲" dir="ltr" autoComplete="bday" />
    <button ref={trigger} type="button" aria-label="انتخاب تاریخ تولد از تقویم شمسی" aria-expanded={open} aria-controls={id+'-calendar'} onClick={()=>{setView(parse(value)||{year:initialYear,month:1,day:1});setOpen(!open)}}><CalendarDays size={21}/></button>
  </div>{open&&<div id={id+'-calendar'} className="birth-calendar" role="dialog" aria-label="تقویم شمسی تاریخ تولد" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close()}}}>
    <div className="birth-calendar-head"><button type="button" aria-label="ماه قبل" onClick={()=>move(-1)}><ChevronRight size={18}/></button>
    <select aria-label="ماه تولد" value={view.month} onChange={e=>setView({...view,month:Number(e.target.value),day:1})}>{persianMonths.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select>
    <select aria-label="سال تولد" value={view.year} onChange={e=>setView({...view,year:Number(e.target.value),day:1})}>{Array.from({length:today.year-1300+1},(_,i)=>today.year-i).map(y=><option key={y} value={y}>{faNumber(y)}</option>)}</select>
    <button type="button" aria-label="ماه بعد" onClick={()=>move(1)}><ChevronLeft size={18}/></button><button type="button" aria-label="بستن تقویم" onClick={close}><X size={17}/></button></div>
    <div className="birth-calendar-grid">{['ش','ی','د','س','چ','پ','ج'].map((d,i)=><span key={i}>{d}</span>)}{Array.from({length:offset},(_,i)=><i key={'empty'+i}/>)}{Array.from({length:daysInJalali(view)},(_,i)=>i+1).map(day=><button type="button" key={day} disabled={future({...view,day})} aria-label={faNumber(day)+' '+persianMonths[view.month-1]+' '+faNumber(view.year)} onClick={()=>{onChange(view.year+'/'+String(view.month).padStart(2,'0')+'/'+String(day).padStart(2,'0'));close()}}>{faNumber(day)}</button>)}</div>
  </div>}</div>
}
