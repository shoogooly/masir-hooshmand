import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { RenewalBillingMode } from '../types'

const options = [
  {
    mode: 'full',
    title: 'پرداخت کامل از طریق مهیاد',
    description: 'دانش‌آموز برای تمدید اشتراک، تعرفه عادی مهیاد را به‌طور کامل پرداخت می‌کند. شما حق‌الزحمه مشاوره را از مدیریت مهیاد دریافت می‌کنید.',
  },
  {
    mode: 'site_only',
    title: 'پرداخت هزینه اشتراک به مهیاد و حق‌الزحمه به مشاور',
    description: 'شما حق‌الزحمه مشاوره را مستقیماً از دانش‌آموز دریافت می‌کنید. دانش‌آموز برای تمدید حساب، فقط تعرفه اشتراک ویژه دانش‌آموزان معرفی‌شده را به مهیاد می‌پردازد.',
  },
] as const

export default function AdvisorRenewalBilling({ studentId, mode }: { studentId: string; mode: RenewalBillingMode }) {
  const client = useQueryClient()
  const [selection, setSelection] = useState<RenewalBillingMode | null>(null)
  const save = useMutation({
    mutationFn: (next: RenewalBillingMode) => api(`/advisors/students/${studentId}/renewal-billing`, {
      method: 'PUT', body: JSON.stringify({ mode: next }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['student-file', studentId] })
      setSelection(null)
    },
  })

  return <section className="panel advisor-renewal-billing" aria-labelledby="renewal-billing-heading">
    <h2 id="renewal-billing-heading">نوع محاسبه هزینه</h2>
    <p>روش پرداخت تمدید اشتراک این دانش‌آموز را مشخص کنید. این انتخاب تعیین می‌کند دانش‌آموز هنگام تمدید چه مبلغی به مهیاد بپردازد و شما حق‌الزحمه مشاوره را از چه کسی دریافت کنید.</p>
    <p>پیش‌فرض برای دانش‌آموزان معرفی‌شده توسط مشاور، پرداخت هزینه اشتراک به مهیاد و حق‌الزحمه به مشاور است. برای ثبت‌نام عادی، پیش‌فرض پرداخت کامل از طریق مهیاد است. تغییر این تنظیم برای تمدیدهای بعدی اعمال می‌شود.</p>
    <form onSubmit={event => { event.preventDefault(); if (selection && selection !== mode) save.mutate(selection) }}>
      <fieldset className="advisor-billing-options" disabled={save.isPending}>
        <legend>روش پرداخت این دانش‌آموز</legend>
        {options.map(option => <label key={option.mode}>
          <input type="radio" name="renewal-billing" value={option.mode}
            checked={(selection ?? mode) === option.mode}
            onChange={() => { save.reset(); setSelection(option.mode) }}/>
          <span><strong>{option.title}</strong><span>{option.description}</span></span>
        </label>)}
      </fieldset>
      <button className="btn btn-primary" disabled={save.isPending || !selection || selection === mode}>
        {save.isPending ? 'در حال ذخیره…' : 'ذخیره روش پرداخت'}
      </button>
      {save.isSuccess && <p role="status">روش پرداخت ذخیره شد.</p>}
      {save.isError && <p role="alert" className="form-error">{save.error.message}</p>}
    </form>
  </section>
}
