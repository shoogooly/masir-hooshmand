import { subscriptionPlanName } from '../utils/subscriptions'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, LockKeyhole, LogOut } from 'lucide-react'
import { api, auth } from '../api'
import Brand from '../components/Brand'
import type { SubscriptionPlanOption, User } from '../types'

export default function RenewalPage({user}:{user:User}){
  const qc=useQueryClient()
  const plans=useQuery({queryKey:['renewal-plans'],queryFn:()=>api<SubscriptionPlanOption[]>('/subscriptions/plans')})
  const siteOnly = (user.renewal_billing_mode ?? (user.referred_by_advisor_id ? 'site_only' : 'full')) === 'site_only'
  const pay=useMutation({
    mutationFn: async ({planId, amount}: {planId: string; amount: number}) => {
      const order = await api<{order_id:string;signature?:string;redirect_url?:string}>('/payments/orders', {
        method: 'POST',
        body: JSON.stringify({plan_id: planId, expected_amount: amount, idempotency_key: crypto.randomUUID()}),
      })
      if (order.redirect_url) { window.location.assign(order.redirect_url); return }
      return api('/payments/callback', {
        method: 'POST', body: JSON.stringify({order_id: order.order_id, success: true, signature: order.signature}),
      })
    },
    onSuccess:()=>qc.invalidateQueries({queryKey:['me']}),
    onError:()=>Promise.all([
      qc.invalidateQueries({queryKey:['me']}),
      qc.invalidateQueries({queryKey:['renewal-plans']}),
    ]),
  })
  async function logout(){await auth.logout();qc.clear();location.href='/login'}
  return <div className="renewal-page">
    <header><Brand/><button className="btn btn-outline" onClick={logout}><LogOut/> خروج</button></header>
    <main><LockKeyhole/><h1>اشتراک شما به پایان رسیده است</h1>
      <p>{user.full_name} عزیز، برای دسترسی دوباره به برنامه، آزمون‌ها، گزارش و گفت‌وگو اشتراک خود را تمدید کنید.</p>
      <div className="renewal-plans">{plans.data?.map(plan => {
        const amount = siteOnly ? plan.referral_price || plan.price : plan.price
        return <article key={plan.id} className={plan.active === false ? 'subscription-unavailable' : ''}>
          <CreditCard/><h2>{subscriptionPlanName(plan)}</h2>
          <b>{amount > 0 ? amount.toLocaleString('fa-IR') + ' تومان' : 'تعرفه اعلام نشده'}</b>
          <small>{plan.features.join(' · ')}</small>
          {plan.active === false && <span className="subscription-unavailable-note">این طرح فعلاً در دسترس نیست</span>}
          <button className="btn btn-primary" disabled={pay.isPending || plan.active === false}
            onClick={()=>pay.mutate({planId: plan.id, amount})}>پرداخت و فعال‌سازی</button>
        </article>
      })}</div>
      {pay.error&&<div className="error-box">{pay.error instanceof Error?pay.error.message:'پرداخت ناموفق بود'}</div>}
    </main>
  </div>
}
