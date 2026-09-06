import { useEffect, useState } from 'react'
import { daysInJalali, faNumber, formatJalali, isoToJalali, jalaliToIso, persianMonths, type JalaliDate } from '../utils/jalali'
export default function PersianDateInput({value,onChange,minYear=1400,maxYear=1420,label}:{value?:string|null;onChange:(iso:string)=>void;minYear?:number;maxYear?:number;label?:string}){
  const [date,setDate]=useState<JalaliDate>(()=>isoToJalali(value))
  useEffect(()=>{onChange(jalaliToIso(date))},[date.year,date.month,date.day])
  function update(key:keyof JalaliDate,next:number){const draft={...date,[key]:next};draft.day=Math.min(draft.day,daysInJalali(draft));setDate(draft)}
  return <div className="jalali-input"><span>{label||'تاریخ شمسی'}</span><div><select aria-label="سال" value={date.year} onChange={e=>update('year',Number(e.target.value))}>{Array.from({length:maxYear-minYear+1},(_,i)=>minYear+i).map(y=><option key={y} value={y}>{faNumber(y)}</option>)}</select><select aria-label="ماه" value={date.month} onChange={e=>update('month',Number(e.target.value))}>{persianMonths.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select><select aria-label="روز" value={date.day} onChange={e=>update('day',Number(e.target.value))}>{Array.from({length:daysInJalali(date)},(_,i)=>i+1).map(d=><option key={d} value={d}>{faNumber(d)}</option>)}</select></div><small>{formatJalali(jalaliToIso(date),true)}</small></div>
}
