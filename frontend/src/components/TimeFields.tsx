import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react'
export const clockDigits=(value:string)=>value.replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
export default function TimeFields({value,onChange,label,onComplete,hourInputRef}:{value:string;onChange:(value:string)=>void;label:string;onComplete?:()=>void;hourInputRef?:Ref<HTMLInputElement>}){
 const [parts,setParts]=useState(()=>value.split(':'))
 const currentParts=useRef(parts),emitted=useRef(value),minute=useRef<HTMLInputElement>(null)
 const pendingAdvance=useRef<'minute'|'complete'|null>(null)
 useEffect(()=>{if(value!==emitted.current){const next=value.split(':');currentParts.current=next;setParts(next);emitted.current=value}},[value])
 useLayoutEffect(()=>{
  const target=pendingAdvance.current
  pendingAdvance.current=null
  if(target==='minute'){minute.current?.focus();minute.current?.select()}
  if(target==='complete')onComplete?.()
 },[parts,onComplete])
 function update(index:number,raw:string,blur=false){
  const text=clockDigits(raw).replace(/\D/g,'').slice(0,2)
  if(!blur&&text.length===2)pendingAdvance.current=index===0?'minute':onComplete?'complete':null
  const next=[...currentParts.current];next[index]=blur&&text?text.padStart(2,'0'):text;currentParts.current=next;setParts(next)
  const nextValue=next.map(part=>part?part.padStart(2,'0'):'').join(':');emitted.current=nextValue;onChange(nextValue)
 }
 return <div className="time-field"><span>{label}</span><div className="split-clock" dir="ltr" role="group" aria-label={label}>
 <input ref={hourInputRef} aria-label={label+' ساعت'} value={parts[0]||''} inputMode="numeric" maxLength={2} placeholder="ساعت" onFocus={e=>e.currentTarget.select()} onChange={e=>update(0,e.target.value)} onBlur={e=>update(0,e.target.value,true)} onKeyDown={e=>{if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();update(0,e.currentTarget.value,true);minute.current?.focus();minute.current?.select()}}}/><span aria-hidden="true">:</span>
 <input ref={minute} aria-label={label+' دقیقه'} value={parts[1]||''} inputMode="numeric" maxLength={2} placeholder="دقیقه" onFocus={e=>e.currentTarget.select()} onChange={e=>update(1,e.target.value)} onBlur={e=>update(1,e.target.value,true)} onKeyDown={e=>{if(e.key==='Tab'&&!e.shiftKey&&onComplete){e.preventDefault();update(1,e.currentTarget.value,true);onComplete()}}}/>
 </div></div>
}
