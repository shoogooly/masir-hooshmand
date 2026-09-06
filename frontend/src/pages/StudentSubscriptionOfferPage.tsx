import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CreditCard } from 'lucide-react'
import { api } from '../api'
import { faNumber, formatJalali } from '../utils/jalali'

type Offer={order_id:string;amount:number;expires_at:string;signature:string}|null

export default function StudentSubscriptionOfferPage(){
  const qc=useQueryClient()
  const offer=useQuery({queryKey:['pending-subscription-offer'],queryFn:()=>api<Offer>('/subscriptions/pending-offer')})
  const pay=useMutation({mutationFn:(value:Exclude<Offer,null>)=>api('/payments/callback',{method:'POST',body:JSON.stringify({order_id:value.order_id,success:true,signature:value.signature})}),onSuccess:()=>{qc.invalidateQueries({queryKey:['me']});qc.invalidateQueries({queryKey:['pending-subscription-offer']});qc.invalidateQueries({queryKey:['notifications']})}})
  if(offer.isLoading)return <div className="page-state">در حال بررسی پیشنهاد تمدید...</div>
  return <div className="content-page"><div className="section-head"><div><h1>اشتراک من</h1><p>تمدیدهای پیشنهادشده توسط مدیریت را اینجا مشاهده و پرداخت کنید.</p></div></div>
    {offer.data?<section className="panel subscription-offer"><CreditCard/><h2>پیشنهاد تمدید اشتراک</h2><p>پس از پرداخت <b>{faNumber(offer.data.amount.toLocaleString('en-US'))} تومان</b>، اشتراک شما تا <b>{formatJalali(offer.data.expires_at)}</b> تمدید می‌شود.</p><button className="btn btn-primary" disabled={pay.isPending} onClick={()=>offer.data&&pay.mutate(offer.data)}>{pay.isPending?'در حال پرداخت...':'پرداخت و فعال‌سازی اشتراک'}</button>{pay.isSuccess&&<div className="success-note">پرداخت انجام شد و اشتراک شما فعال شد.</div>}{pay.error&&<div className="error-box">پرداخت ناموفق بود؛ دوباره تلاش کنید.</div>}</section>:<section className="panel empty-state"><CalendarClock/><h2>درخواست پرداختی ندارید</h2><p>در حال حاضر تمدید در انتظار پرداختی برای شما ثبت نشده است.</p></section>}
  </div>
}
