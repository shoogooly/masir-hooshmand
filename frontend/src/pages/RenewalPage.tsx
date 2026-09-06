import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, LockKeyhole, LogOut } from 'lucide-react'
import { api, auth } from '../api'
import Brand from '../components/Brand'
import type { SubscriptionPlanOption, User } from '../types'

export default function RenewalPage({user}:{user:User}){
  const qc=useQueryClient();const plans=useQuery({queryKey:['renewal-plans'],queryFn:()=>api<SubscriptionPlanOption[]>('/subscriptions/plans')})
  const pay=useMutation({mutationFn:async(planId:string)=>{const order=await api<{order_id:string;signature:string}>('/payments/orders',{method:'POST',body:JSON.stringify({plan_id:planId,idempotency_key:crypto.randomUUID()})});return api('/payments/callback',{method:'POST',body:JSON.stringify({order_id:order.order_id,success:true,signature:order.signature})})},onSuccess:()=>qc.invalidateQueries({queryKey:['me']})})
  async function logout(){await auth.logout();qc.clear();location.href='/login'}
  return <div className="renewal-page"><header><Brand/><button className="btn btn-outline" onClick={logout}><LogOut/> خروج</button></header><main><LockKeyhole/><h1>اشتراک شما به پایان رسیده است</h1><p>{user.full_name} عزیز، برای دسترسی دوباره به برنامه، آزمون‌ها، گزارش و گفت‌وگو اشتراک خود را تمدید کنید.</p><div className="renewal-plans">{plans.data?.map(plan=><article key={plan.id}><CreditCard/><h2>{plan.name}</h2><b>{(user.referred_by_advisor_id?plan.referral_price||plan.price:plan.price).toLocaleString('fa-IR')} تومان</b><small>{plan.features.join(' · ')}</small><button className="btn btn-primary" disabled={pay.isPending} onClick={()=>pay.mutate(plan.id)}>پرداخت آزمایشی و فعال‌سازی</button></article>)}</div>{pay.error&&<div className="error-box">{pay.error instanceof Error?pay.error.message:'پرداخت ناموفق بود'}</div>}</main></div>
}
