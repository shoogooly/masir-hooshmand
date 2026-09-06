import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, UserMinus, UserPlus, UserRoundCog } from 'lucide-react'
import { api } from '../api'
import type { AdminStudent, RegistrationOptions } from '../types'
import PersianDateInput from '../components/PersianDateInput'
import StudentSubscriptionManager from '../components/StudentSubscriptionManager'
import { formatJalali } from '../utils/jalali'

export default function AdminStudentManagementPage(){
  const qc=useQueryClient()
  const [search,setSearch]=useState('')
  const [selected,setSelected]=useState<AdminStudent>()
  const [inviteExpiry,setInviteExpiry]=useState<string>(new Date(Date.now()+30*86400000).toISOString())
  const students=useQuery({queryKey:['admin-students'],queryFn:()=>api<AdminStudent[]>('/admin/students')})
  const options=useQuery({queryKey:['registration-options'],queryFn:()=>api<RegistrationOptions>('/registrations/options')})
  const refresh=()=>{qc.invalidateQueries({queryKey:['admin-students']});qc.invalidateQueries({queryKey:['admin-advisors']})}
  const invite=useMutation({mutationFn:(body:object)=>api('/admin/students/invite',{method:'POST',body:JSON.stringify(body)}),onSuccess:refresh})
  const assign=useMutation({mutationFn:({id,advisor_id}:{id:string;advisor_id:string})=>api('/admin/students/'+id+'/force-advisor',{method:'POST',body:JSON.stringify({advisor_id})}),onSuccess:refresh})
  const disconnect=useMutation({mutationFn:(id:string)=>api('/admin/students/'+id+'/advisor',{method:'DELETE'}),onSuccess:refresh})
  const status=useMutation({mutationFn:({id,status}:{id:string;status:string})=>api('/admin/users/'+id+'/status',{method:'PATCH',body:JSON.stringify({status})}),onSuccess:refresh})
  const rows=useMemo(()=>(students.data||[]).filter(item=>item.full_name.includes(search)||item.phone.includes(search)),[students.data,search])
  function add(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);invite.mutate({phone:form.get('phone'),advisor_id:form.get('advisor_id')||null,amount:Number(form.get('amount')||0),expires_at:inviteExpiry||null})}
  if(students.isLoading)return <div className="page-state">در حال دریافت دانش‌آموزان...</div>
  return <div className="content-page"><div className="section-head"><div><h1>مدیریت کامل دانش‌آموزان</h1><p>افزودن، تغییر مشاور، کنترل دسترسی و مدیریت رایگان یا مبلغ‌دار اشتراک.</p></div></div>
    <form className="panel admin-student-invite" onSubmit={add}><UserPlus/><h2>معرفی دانش‌آموز جدید</h2><input name="phone" dir="ltr" pattern="09[0-9]{9}" placeholder="شماره موبایل" required/><select name="advisor_id" defaultValue=""><option value="">فعلاً بدون مشاور</option>{options.data?.advisors.map(item=><option key={item.id} value={item.id}>{item.full_name}{item.is_full?' — تکمیل ظرفیت (مدیر مجاز است)':''}</option>)}</select><input name="amount" type="number" min="0" placeholder="مبلغ دلخواه (تومان)"/><PersianDateInput value={inviteExpiry} onChange={setInviteExpiry} label="تاریخ پایان اشتراک (شمسی)"/><button className="btn btn-primary" disabled={invite.isPending}>افزودن دانش‌آموز</button></form>
    <div className="list-search"><Search/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="نام یا شماره موبایل..."/></div>
    <div className="admin-card-list">{rows.map(item=><button key={item.id} onClick={()=>setSelected(item)}><span className="avatar">{item.full_name[0]}</span><div><b>{item.full_name}</b><small>{item.phone} · {item.profile.grade||'اطلاعات تکمیل نشده'}</small><p>{item.advisor?'مشاور: '+item.advisor.full_name:'بدون مشاور'}</p></div><em>{item.status==='active'?'فعال':'غیرفعال/در حال ثبت‌نام'}</em><strong>{item.subscription?.expires_at?formatJalali(item.subscription.expires_at):'بدون اشتراک'}</strong></button>)}</div>
    {selected&&<section className="panel admin-student-control"><header><div><h2>{selected.full_name}</h2><p>{selected.phone}</p></div><button onClick={()=>setSelected(undefined)}>بستن</button></header><div className="student-control-grid">
      <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);assign.mutate({id:selected.id,advisor_id:String(form.get('advisor_id'))})}}><UserRoundCog/><h3>مشاور مرتبط</h3><select name="advisor_id" defaultValue={selected.advisor?.id||''} required><option value="">انتخاب مشاور...</option>{options.data?.advisors.map(item=><option key={item.id} value={item.id}>{item.full_name}</option>)}</select><button className="btn btn-primary">تخصیص یا انتقال</button><button type="button" className="btn btn-outline danger" onClick={()=>disconnect.mutate(selected.id)}><UserMinus/> قطع ارتباط مشاور</button></form>
      <StudentSubscriptionManager student={selected} onChanged={refresh}/>
      <div><h3>دسترسی حساب</h3><p>غیرفعال‌سازی مانند حذف امن است و تمام سوابق را نگه می‌دارد.</p><button className="btn btn-primary" onClick={()=>status.mutate({id:selected.id,status:'active'})}>فعال‌کردن</button><button className="btn btn-outline danger" onClick={()=>status.mutate({id:selected.id,status:'suspended'})}>غیرفعال‌کردن دانش‌آموز</button></div>
    </div></section>}
    {[invite,assign,disconnect,status].some(item=>item.error)&&<div className="error-box">انجام عملیات ناموفق بود؛ اطلاعات را بررسی کنید.</div>}
  </div>
}
