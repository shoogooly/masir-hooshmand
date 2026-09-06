import { useMutation } from '@tanstack/react-query'
import { FormEvent, useState } from 'react'
import { ArrowRight, Eye, EyeOff, GraduationCap, KeyRound, Phone, ShieldCheck, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../api'
import Brand from '../components/Brand'

export default function RegistrationPage() {
  const [role, setRole] = useState<'student' | 'advisor'>('student')
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('123456')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const register = useMutation({ mutationFn: () => auth.register(phone, role, smsCode, password, passwordConfirm) })
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (password !== passwordConfirm) return setError('رمز عبور و تکرار آن یکسان نیستند.')
    try { await register.mutateAsync(); navigate('/login', { replace: true }) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'ساخت حساب ناموفق بود.') }
  }
  return <div className="registration-page account-registration"><header><Link to="/"><Brand /></Link><Link to="/login"><ArrowRight /> ورود اعضا</Link></header><main>
    <section className="registration-intro"><span>ساخت حساب مسیر هوشمند</span><h1>شروع مسیر، فقط با شماره موبایل</h1><p>پس از ساخت حساب و ورود، اطلاعات پرونده را قدم‌به‌قدم تکمیل می‌کنید و همیشه مرحله فعلی را می‌بینید.</p><div><button type="button" className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}><GraduationCap /> دانش‌آموز</button><button type="button" className={role === 'advisor' ? 'active' : ''} onClick={() => setRole('advisor')}><UserRound /> مشاور</button></div></section>
    <form className="registration-form account-form" onSubmit={submit}><div className="form-title"><ShieldCheck /><div><h2>ایجاد حساب {role === 'student' ? 'دانش‌آموز' : 'مشاور'}</h2><p>اطلاعات تکمیلی بعد از ورود دریافت می‌شود.</p></div></div>
      <label><span>شماره موبایل</span><div className="field"><Phone /><input value={phone} onChange={event => setPhone(event.target.value)} inputMode="tel" pattern="09[0-9]{9}" placeholder="09123456789" required /></div></label>
      <label><span>کد پیامکی</span><div className="field"><KeyRound /><input value={smsCode} onChange={event => setSmsCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></div><small className="dev-code-note">کد آزمایشی فعلی: ۱۲۳۴۵۶</small></label>
      <label><span>رمز عبور</span><div className="field"><KeyRound /><input value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} minLength={8} required /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label="نمایش رمز">{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
      <label><span>تکرار رمز عبور</span><div className="field"><KeyRound /><input value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} type={showPassword ? 'text' : 'password'} minLength={8} required /></div></label>
      {(error || register.error) && <div className="form-error">{error || (register.error instanceof Error ? register.error.message : 'خطایی رخ داد')}</div>}<button className="btn btn-primary btn-lg" disabled={register.isPending}>{register.isPending ? 'در حال ساخت حساب...' : 'ساخت حساب و تکمیل پرونده'}</button><p className="login-register-link">قبلاً حساب ساخته‌اید؟ <Link to="/login">ورود با شماره موبایل و رمز</Link></p>
    </form></main></div>
}
