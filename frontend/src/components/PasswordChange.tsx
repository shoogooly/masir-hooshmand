import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function PasswordChange() {
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const navigate = useNavigate(), qc = useQueryClient()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget, values = new FormData(form)
    if (values.get('password') !== values.get('password_confirm')) { setError('رمز جدید و تکرار آن یکسان نیستند'); return }
    setBusy(true); setError('')
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify(Object.fromEntries(values)) })
      form.reset(); setDone(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'تغییر رمز ناموفق بود') }
    finally { setBusy(false) }
  }
  return <section className="panel" style={{ padding: 24, marginTop: 24 }}>
    <h3>امنیت حساب</h3>
    {done ? <div role="status"><p>رمز تغییر کرد و نشست‌های قبلی بسته شدند. با رمز جدید وارد شوید.</p><button className="btn btn-primary" onClick={() => { qc.clear(); navigate('/login', { replace: true }) }}>ورود با رمز جدید</button></div> :
      <><button className="btn btn-outline" onClick={() => setOpen(!open)} aria-expanded={open}>تغییر رمز ورود</button>
      {open && <form className="settings-form" onSubmit={submit}>
        <label>رمز فعلی<input name="old_password" type="password" autoComplete="current-password" required maxLength={128}/></label>
        <label>رمز جدید<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/></label>
        <label>تکرار رمز جدید<input name="password_confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/></label>
        <p className="full">رمز حداقل ۸ کاراکتر باشد. پس از تغییر رمز، ورود دوباره در همه دستگاه‌ها لازم است.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ثبت رمز جدید'}</button>
      </form>}</>}
  </section>
}
