import { FormEvent, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { api } from '../api'

export default function AdvisorReferralPage(){
  const [phone,setPhone]=useState('');const invite=useMutation({mutationFn:()=>api<{message:string}>('/advisors/referrals',{method:'POST',body:JSON.stringify({phone})})})
  function submit(e:FormEvent){e.preventDefault();invite.mutate()}
  return <div className="content-page"><div className="section-head"><div><h1>افزودن دانش‌آموز</h1><p>شماره ورود دانش‌آموز خود را ثبت کنید؛ او با تعرفه ویژه معرفی‌شده توسط مشاور ثبت‌نام و اشتراک تهیه می‌کند.</p></div></div><form className="panel referral-form" onSubmit={submit}><UserPlus/><label>شماره موبایل دانش‌آموز<input dir="ltr" value={phone} onChange={e=>setPhone(e.target.value)} pattern="09[0-9]{9}" placeholder="09123456789" required/></label><button className="btn btn-primary" disabled={invite.isPending}>ثبت و ارسال دعوت</button>{invite.isSuccess&&<p className="success-note">{invite.data.message}</p>}{invite.error&&<div className="error-box">{invite.error instanceof Error?invite.error.message:'ثبت ناموفق بود'}</div>}</form></div>
}
