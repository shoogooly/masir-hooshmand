import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Brand from '../components/Brand'

type Challenge = { challenge_id: string; dev_code?: string; retry_after: number; message: string }
export default function PasswordRecoveryPage() {
  const [phone, setPhone] = useState(''), [challenge, setChallenge] = useState<Challenge | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false)
  const [remaining, setRemaining] = useState(0)
  useEffect(() => { if (!remaining) return; const id = setTimeout(() => setRemaining(remaining - 1), 1000); return () => clearTimeout(id) }, [remaining])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget, values = new FormData(form)
    if (challenge && values.get('password') !== values.get('password_confirm')) { setError('رمز جدید و تکرار آن یکسان نیستند'); return }
    setBusy(true); setError('')
    try {
      if (!challenge) {
        const result = await api<Challenge>('/auth/password-recovery/request', { method: 'POST', body: JSON.stringify({ phone }) })
        setChallenge(result); setRemaining(result.retry_after)
      } else {
        await api('/auth/password-recovery/complete', { method: 'POST', body: JSON.stringify({ ...Object.fromEntries(values), challenge_id: challenge.challenge_id }) })
        form.reset(); setChallenge(null); setDone(true)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'بازیابی رمز ناموفق بود') }
    finally { setBusy(false) }
  }
  return <div className="login-page"><div className="login-visual"><Link className="back-link" to="/login">بازگشت به ورود</Link><div><h1>بازیابی دسترسی<br/>به حساب شما</h1><p>تأیید شماره موبایل و انتخاب رمز جدید</p></div></div>
    <main className="login-card"><Brand/><div className="login-heading"><h2>فراموشی رمز ورود</h2><p>برای همه کاربران مسیر هوشمند</p></div>
      {done ? <div role="status"><p>رمز با موفقیت تغییر کرد. با شماره موبایل و رمز جدید وارد شوید.</p><Link className="btn btn-primary" to="/login">ورود به حساب</Link></div> :
      <form onSubmit={submit}>
        <label>شماره موبایل ثبت‌شده<div className="field"><input aria-label="شماره موبایل ثبت‌شده" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" pattern="09[0-9]{9}" required disabled={Boolean(challenge)} dir="ltr"/></div></label>
        {challenge && <>
          <p role="status">{challenge.message}</p>
          {challenge.dev_code && <p className="staff-login-note">حالت آزمایشی؛ پیامکی ارسال نمی‌شود. کد آزمایشی: <b dir="ltr">{challenge.dev_code}</b></p>}
          <label>کد تأیید<div className="field"><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required dir="ltr"/></div></label>
          <small>کد تا ۳ دقیقه معتبر است و حداکثر ۵ بار می‌توانید آن را امتحان کنید.</small>
          <label>رمز جدید<div className="field"><input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/></div></label>
          <label>تکرار رمز جدید<div className="field"><input name="password_confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/></div></label>
          <small>رمز حداقل ۸ کاراکتر باشد. پس از ثبت، نشست‌های قبلی بسته می‌شوند.</small>
        </>}
        {error && <div role="alert" className="form-error">{error}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'کمی صبر کنید…' : challenge ? 'تأیید کد و ثبت رمز جدید' : 'دریافت کد بازیابی'}</button>
        {challenge && <button type="button" className="text-button" disabled={busy || remaining > 0} onClick={() => { setChallenge(null); setError('') }}>{remaining ? `دریافت مجدد یا اصلاح شماره پس از ${remaining} ثانیه` : 'دریافت کد جدید یا اصلاح شماره'}</button>}
      </form>}
      <p><Link to="/login">بازگشت به صفحه ورود</Link></p>
    </main></div>
}
