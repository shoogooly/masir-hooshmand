import { useEffect, useRef, useState } from 'react'
export const clockDigits=(value:string)=>value.replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
export default function TimeFields({value,onChange,label}:{value:string;onChange:(value:string)=>void;label:string}){
 const [parts,setParts]=useState(()=>value.split(':'))
 const emitted=useRef(value),minute=useRef<HTMLInputElement>(null)
 useEffect(()=>{if(value!==emitted.current){setParts(value.split(':'));emitted.current=value}},[value])
 function update(index:number,raw:string,blur=false){
  const text=clockDigits(raw).replace(/\D/g,'').slice(0,2)
  const next=[...parts];next[index]=blur&&text?text.padStart(2,'0'):text;setParts(next)
  const nextValue=next.map(part=>part?part.padStart(2,'0'):'').join(':');emitted.current=nextValue;onChange(nextValue)
  if(index===0&&!blur&&text.length===2){minute.current?.focus();minute.current?.select()}
 }
 return <div className="time-field"><span>{label}</span><div className="split-clock" dir="ltr" role="group" aria-label={label}>
 <input aria-label={label+' ساعت'} value={parts[0]||''} inputMode="numeric" maxLength={2} placeholder="ساعت" onFocus={e=>e.currentTarget.select()} onChange={e=>update(0,e.target.value)} onBlur={e=>update(0,e.target.value,true)}/><span aria-hidden="true">:</span>
 <input ref={minute} aria-label={label+' دقیقه'} value={parts[1]||''} inputMode="numeric" maxLength={2} placeholder="دقیقه" onFocus={e=>e.currentTarget.select()} onChange={e=>update(1,e.target.value)} onBlur={e=>update(1,e.target.value,true)}/>
 </div></div>
}
