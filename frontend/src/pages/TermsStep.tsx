import { useMutation, useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'

export default function TermsStep({role,refresh}:{role:'student'|'advisor';refresh:()=>void}){
  const terms=useQuery({queryKey:['terms',role],queryFn:()=>api<{text:string;version:number}>(`/terms/${role}`)})
  const [accepted,setAccepted]=useState(false)
  const save=useMutation({mutationFn:()=>api('/onboarding/terms/accept',{method:'POST',body:JSON.stringify({version:terms.data?.version,accepted})}),onSuccess:refresh})
  if(!terms.data)return <div className="page-state">در حال دریافت شرایط...</div>
  return <section className="registration-form onboarding-card terms-step"><ScrollText/><h2>شرایط استفاده و ثبت‌نام</h2><div className="terms-text">{terms.data.text}</div><label className="terms-accept"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> متن شرایط را مطالعه کردم و می‌پذیرم.</label>{save.error&&<div className="form-error">{save.error instanceof Error?save.error.message:'خطایی رخ داد'}</div>}<button className="btn btn-primary btn-lg" disabled={!accepted||save.isPending} onClick={()=>save.mutate()}>پذیرش و ادامه</button></section>
}
