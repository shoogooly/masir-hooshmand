import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CreditCard, X } from 'lucide-react'
import { api } from '../api'
import type { AdminStudent } from '../types'
import PersianDateInput from './PersianDateInput'
import { faNumber, formatJalali, remainingDays } from '../utils/jalali'

type Result={payment_required:boolean;expires_at:string;amount?:number;order_id?:string}

export default function StudentSubscriptionManager({student,onChanged}:{student:AdminStudent;onChanged?:()=>void}){
  const qc=useQueryClient()
  const [editing,setEditing]=useState(false)
  const [expiresAt,setExpiresAt]=useState(student.subscription?.expires_at||new Date(Date.now()+30*86400000).toISOString())
  const [amount,setAmount]=useState('')
  const [result,setResult]=useState<Result|null>(null)
  useEffect(()=>{setExpiresAt(student.subscription?.expires_at||new Date(Date.now()+30*86400000).toISOString());setResult(null);setEditing(false)},[student.id,student.subscription?.expires_at])
  const mutation=useMutation({
    mutationFn:()=>api<Result>(`/admin/students/${student.id}/subscription-change`,{method:'PATCH',body:JSON.stringify({expires_at:expiresAt,amount:amount.trim()?Number(amount):null})}),
    onSuccess:data=>{setResult(data);setEditing(false);qc.invalidateQueries({queryKey:['admin-students']});qc.invalidateQueries({queryKey:['admin-financial-ledger']});onChanged?.()}
  })
  const shownExpiry=result&&!result.payment_required?result.expires_at:student.subscription?.expires_at
  const days=remainingDays(shownExpiry)
  return <div className="subscription-manager">
    <CalendarClock/>
    <h3>وضعیت اشتراک</h3>
    {shownExpiry?<div className="subscription-summary"><strong>{faNumber(days)} روز از اشتراک باقی مانده است</strong><p>پایان اشتراک دانش‌آموز تا تاریخ {formatJalali(shownExpiry)}</p></div>:<p>برای این دانش‌آموز اشتراک فعالی ثبت نشده است.</p>}
    {!editing&&<button type="button" className="btn btn-primary" onClick={()=>setEditing(true)}>اعمال تغییرات در اشتراک</button>}
    {editing&&<form className="subscription-change-form" onSubmit={e=>{e.preventDefault();mutation.mutate()}}>
      <div className="form-title"><CreditCard/><b>تغییر مدت و مبلغ</b><button type="button" aria-label="بستن" onClick={()=>setEditing(false)}><X/></button></div>
      <PersianDateInput value={expiresAt} onChange={setExpiresAt} label="تاریخ پایان جدید اشتراک"/>
      <label>مبلغ قابل پرداخت دانش‌آموز (تومان)<input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0" placeholder="اختیاری؛ خالی یعنی رایگان"/></label>
      <small>اگر مبلغ وارد شود، تغییر پس از پرداخت دانش‌آموز اعمال می‌شود. بدون مبلغ، اشتراک همان لحظه و رایگان تغییر می‌کند.</small>
      <button className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending?'در حال ثبت...':'ثبت تغییرات اشتراک'}</button>
    </form>}
    {result?.payment_required&&<div className="success-note">درخواست پرداخت {faNumber((result.amount||0).toLocaleString('en-US'))} تومان برای دانش‌آموز ارسال شد و پس از پرداخت، اشتراک تا {formatJalali(result.expires_at)} تمدید می‌شود.</div>}
    {result&&!result.payment_required&&<div className="success-note">مدت اشتراک بدون نیاز به پرداخت تغییر کرد.</div>}
    {mutation.error&&<div className="error-box">ثبت تغییرات اشتراک ناموفق بود. تاریخ و مبلغ را بررسی کنید.</div>}
  </div>
}
