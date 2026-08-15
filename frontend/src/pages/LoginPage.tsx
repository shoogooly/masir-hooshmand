import { ArrowRight, KeyRound, Phone, ShieldCheck } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { auth } from '../api'
import Brand from '../components/Brand'
import type { Role } from '../types'

export default function LoginPage(){
  const [phone,setPhone]=useState('09120000001'); const [code,setCode]=useState(''); const [mfaCode,setMfaCode]=useState('654321'); const [step,setStep]=useState<'phone'|'code'>('phone'); const [role,setRole]=useState<Role>('student'); const [error,setError]=useState(''); const [busy,setBusy]=useState(false)
  const navigate=useNavigate(); const queryClient=useQueryClient()
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{if(step==='phone'){await auth.requestOtp(phone);setCode('12345');setStep('code')}else{const result=await auth.verifyOtp(phone,code,role,mfaCode);queryClient.setQueryData(['me'],result.user);navigate('/app')}}catch(err){setError(err instanceof Error?err.message:'خطا در ورود')}finally{setBusy(false)}}
  return <div className="login-page">
    <div className="login-visual"><Link to="/" className="back-link"><ArrowRight/> بازگشت به خانه</Link><div><span className="floating-shield"><ShieldCheck/></span><h1>مسیر هوشمند<br/>موفقیت شما</h1><p>برنامه، آزمون، تحلیل و ارتباط با مشاور در یک فضای امن و ساده.</p></div></div>
    <main className="login-card"><Brand/><div className="login-heading"><h2>{step==='phone'?'ورود به مسیر هوشمند':'تایید شماره موبایل'}</h2><p>{step==='phone'?'شماره موبایل و نقش خود را وارد کنید.':`کد ارسال‌شده به ${phone} را وارد کنید.`}</p></div>
      <form onSubmit={submit}>
        {step==='phone'?<>
          <label>شماره موبایل<div className="field"><Phone/><input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" required pattern="09[0-9]{9}"/></div></label>
          <label>نوع فضای کار<select value={role} onChange={e=>setRole(e.target.value as Role)}><option value="student">دانش‌آموز</option><option value="advisor">مشاور</option><option value="content_editor">کارشناس محتوا</option><option value="exam_designer">طراح آزمون</option><option value="super_admin">مدیر سیستم</option></select></label>
        </>:<>
          <label>کد یکبار مصرف<div className="field otp"><KeyRound/><input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" maxLength={8}/></div><small>کد محیط توسعه: ۱۲۳۴۵</small></label>
          {role==='super_admin'&&<label>کد دومرحله‌ای مدیر<div className="field otp"><ShieldCheck/><input value={mfaCode} onChange={e=>setMfaCode(e.target.value)} inputMode="numeric" maxLength={6}/></div><small>کد محیط توسعه: ۶۵۴۳۲۱</small></label>}
        </>}
        {error&&<div className="form-error">{error}</div>}
        <button disabled={busy} className="btn btn-primary btn-lg" type="submit">{busy?'کمی صبر کنید...':step==='phone'?'دریافت کد ورود':'ورود به داشبورد'}</button>
        {step==='code'&&<button type="button" className="text-button" onClick={()=>setStep('phone')}>اصلاح شماره موبایل</button>}
      </form><p className="login-terms">ورود شما به معنی پذیرش شرایط استفاده و حریم خصوصی مسیر هوشمند است.</p>
    </main>
  </div>
}
