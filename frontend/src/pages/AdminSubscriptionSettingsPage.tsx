import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CreditCard, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { AdminStudent } from '../types'
import PersianDateInput from '../components/PersianDateInput'
import { formatJalali } from '../utils/jalali'

type Plan={id:string;name:string;period:string;price:number;referral_price:number;active:boolean;features:string[]}
type Finance={plans:Plan[];orders:{id:string;user_name:string;amount:number;status:string;created_at:string}[]}

export default function AdminSubscriptionSettingsPage(){
  const qc=useQueryClient()
  const [freeExpiry,setFreeExpiry]=useState<string>(new Date(Date.now()+30*86400000).toISOString())
  const finance=useQuery({queryKey:['admin-finance'],queryFn:()=>api<Finance>('/admin/finance')})
  const students=useQuery({queryKey:['admin-students'],queryFn:()=>api<AdminStudent[]>('/admin/students')})
  const update=useMutation({mutationFn:({id,body}:{id:string;body:object})=>api('/admin/subscription-plans/'+id,{method:'PATCH',body:JSON.stringify(body)}),onSuccess:()=>qc.invalidateQueries({queryKey:['admin-finance']})})
  const grant=useMutation({mutationFn:(body:object)=>api('/admin/subscriptions/free',{method:'POST',body:JSON.stringify(body)}),onSuccess:()=>{qc.invalidateQueries({queryKey:['admin-students']});qc.invalidateQueries({queryKey:['admin-financial-ledger']})}})
  function savePlan(event:FormEvent<HTMLFormElement>,id:string){event.preventDefault();const form=new FormData(event.currentTarget);update.mutate({id,body:{price:Number(form.get('price')),referral_price:Number(form.get('referral_price')),active:form.get('active')==='on'}})}
  function free(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);if(freeExpiry)grant.mutate({student_id:form.get('student_id'),expires_at:freeExpiry})}
  if(!finance.data)return <div className="page-state">در حال دریافت تعرفه‌ها...</div>
  return <div className="content-page"><div className="section-head"><div><h1>تعرفه‌ها و مدیریت اشتراک</h1><p>مبلغ سه طرح اصلی و تعرفه ویژه معرفی‌شده توسط مشاور را تعیین کنید.</p></div><Link className="btn btn-outline" to="/app/admin/ledger">مشاهده واریزی‌ها و مانده اشتراک‌ها</Link></div>
    <div className="subscription-admin-grid">{finance.data.plans.map(plan=><form className="panel subscription-editor" key={plan.id} onSubmit={event=>savePlan(event,plan.id)}><CreditCard/><h2>{plan.name}</h2><label>مبلغ عادی (تومان)<input name="price" type="number" min="0" defaultValue={plan.price}/></label><label>مبلغ معرفی توسط مشاور<input name="referral_price" type="number" min="0" defaultValue={plan.referral_price||plan.price}/></label><label className="switch-line"><input name="active" type="checkbox" defaultChecked={plan.active}/> قابل خرید</label><button className="btn btn-primary" disabled={update.isPending}><Save/> ذخیره تعرفه</button></form>)}</div>
    <form className="panel free-subscription" onSubmit={free}><CalendarPlus/><div><h2>اعطای اشتراک رایگان</h2><p>حساب دانش‌آموز تا تاریخ شمسی تعیین‌شده فعال می‌ماند.</p></div><select name="student_id" required defaultValue=""><option value="">انتخاب دانش‌آموز...</option>{students.data?.map(item=><option key={item.id} value={item.id}>{item.full_name} — {item.phone}</option>)}</select><PersianDateInput value={freeExpiry} onChange={setFreeExpiry} label="تاریخ پایان اشتراک"/><button className="btn btn-primary" disabled={grant.isPending}>فعال‌سازی رایگان</button>{grant.isSuccess&&<span className="success-note">اشتراک رایگان تا {formatJalali(freeExpiry)} فعال شد.</span>}</form>
  </div>
}
