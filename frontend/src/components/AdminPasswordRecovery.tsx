import { useMutation, useQuery } from '@tanstack/react-query'
import { api, auth } from '../api'
export default function AdminPasswordRecovery({ userId, role }: { userId: string; role: string }) {
  const me = useQuery({ queryKey: ['me'], queryFn: auth.me })
  const send = useMutation({ mutationFn: () => api<{message:string}>('/admin/users/' + userId + '/password-recovery', { method: 'POST' }) })
  if (!['student', 'advisor'].includes(role)) return null
  return <section><h3>رمز ورود</h3><p>رمز به‌صورت هش ذخیره شده و قابل نمایش نیست. صاحب حساب می‌تواند از «فراموشی رمز ورود» رمز جدید تعیین کند.</p>
    {me.data?.role === 'super_admin' && <button className="btn btn-outline" disabled={send.isPending || send.isSuccess} onClick={() => send.mutate()}>ارسال کد بازیابی به موبایل کاربر</button>}
    {send.data && <p role="status">{send.data.message}</p>}
    {send.error && <p role="alert">{send.error.message}</p>}
  </section>
}
