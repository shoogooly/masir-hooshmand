import { ArrowRight, KeyRound, Phone, ShieldCheck, Users } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { auth } from '../api'
import Brand from '../components/Brand'

export default function LoginPage() {
  const [mode, setMode] = useState<'password' | 'staff'>('password')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('123456')
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate(); const queryClient = useQueryClient()

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'staff' && !codeSent) { await auth.requestOtp(phone); setCodeSent(true); return }
      const result = mode === 'staff' ? await auth.staffLogin(phone, code) : await auth.login(phone, password)
      queryClient.setQueryData(['me'], result.user); navigate('/app', { replace: true })
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'ورود ناموفق بود.') }
    finally { setBusy(false) }
  }

  function switchMode(next: 'password' | 'staff') { setMode(next); setError(''); setCodeSent(false) }
  return <div className="login-page"><div className="login-visual"><Link to="/" className="back-link"><ArrowRight /> بازگشت به خانه</Link><div><span className="floating-shield"><ShieldCheck /></span><h1>مسیر هوشمند<br />موفقیت شما</h1><p>برنامه، آزمون، تحلیل و ارتباط امن اعضای مجموعه.</p></div></div><main className="login-card"><Brand /><div className="login-heading"><h2>ورود به مسیر هوشمند</h2><p>{mode === 'staff' ? 'ورود منشی و مسئولان مقاطع با کد یکبار مصرف' : 'ورود دانش‌آموز، مشاور و مدیر با رمز عبور'}</p></div>
    <div className="login-mode-tabs"><button className={mode === 'password' ? 'active' : ''} onClick={() => switchMode('password')}><KeyRound /> ورود با رمز</button><button className={mode === 'staff' ? 'active' : ''} onClick={() => switchMode('staff')}><Users /> ورود کارکنان</button></div>
    <form onSubmit={submit}><label>شماره موبایل<div className="field"><Phone /><input value={phone} onChange={event => setPhone(event.target.value)} inputMode="tel" required pattern="09[0-9]{9}" placeholder="09123456789" /></div></label>
      {mode === 'password' ? <label>رمز عبور<div className="field"><KeyRound /><input value={password} onChange={event => setPassword(event.target.value)} type="password" minLength={8} required /></div></label> : codeSent ? <label>کد یکبار مصرف<div className="field"><ShieldCheck /><input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" required /></div><small>کد آزمایشی فعلی: ۱۲۳۴۵۶</small></label> : <div className="staff-login-note">شماره باید قبلاً توسط مدیر سایت به‌عنوان منشی یا مسئول مقطع ثبت شده باشد.</div>}
      {error && <div className="form-error">{error}</div>}<button disabled={busy} className="btn btn-primary btn-lg">{busy ? 'کمی صبر کنید...' : mode === 'staff' && !codeSent ? 'دریافت کد ورود' : 'ورود به حساب'}</button>{mode === 'staff' && codeSent && <button type="button" className="text-button" onClick={() => setCodeSent(false)}>اصلاح شماره موبایل</button>}
    </form><p className="login-register-link">حساب دانش‌آموز یا مشاور ندارید؟ <Link to="/register">ثبت‌نام</Link></p></main></div>
}
