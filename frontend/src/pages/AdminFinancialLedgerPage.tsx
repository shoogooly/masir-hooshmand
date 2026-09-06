import { useQuery } from '@tanstack/react-query'
import { BadgeDollarSign, CalendarDays, CreditCard } from 'lucide-react'
import { api } from '../api'
import { faNumber, formatJalali, formatJalaliDateTime } from '../utils/jalali'

type Ledger={
  orders:{id:string;user_id:string;user_name:string;amount:number;status:string;created_at:string;custom_expires_at?:string|null}[]
  subscriptions:{id:string;user_id:string;user_name:string;starts_at:string;expires_at:string;status:string;remaining_days:number}[]
}
const statusLabel:Record<string,string>={paid:'پرداخت‌شده',pending:'در انتظار پرداخت',failed:'ناموفق',active:'فعال',expired:'پایان‌یافته',cancelled:'لغوشده'}

export default function AdminFinancialLedgerPage(){
  const {data,isLoading,error}=useQuery({queryKey:['admin-financial-ledger'],queryFn:()=>api<Ledger>('/admin/financial-ledger')})
  if(isLoading)return <div className="page-state">در حال دریافت واریزی‌ها و اشتراک‌ها...</div>
  if(error||!data)return <div className="error-box">دریافت گزارش مالی ناموفق بود.</div>
  return <div className="content-page"><div className="section-head"><div><h1>واریزی‌ها و اشتراک‌ها</h1><p>گزارش کامل پرداخت‌ها، تاریخ پایان و مانده اشتراک همه دانش‌آموزان.</p></div></div>
    <section className="panel"><div className="section-head compact"><div><h2><BadgeDollarSign/> تمام واریزی‌ها</h2><p>{faNumber(data.orders.length)} تراکنش ثبت شده</p></div></div>
      <div className="admin-table"><div className="admin-table-head ledger"><span>دانش‌آموز</span><span>مبلغ</span><span>وضعیت</span><span>تاریخ واریز</span><span>تمدید تا</span></div>{data.orders.length?data.orders.map(order=><div className="admin-table-row ledger" key={order.id}><b>{order.user_name}</b><span>{faNumber(order.amount.toLocaleString('en-US'))} تومان</span><span>{statusLabel[order.status]||order.status}</span><span>{formatJalaliDateTime(order.created_at)}</span><span>{order.custom_expires_at?formatJalali(order.custom_expires_at):'طبق تعرفه'}</span></div>):<div className="empty-state">هنوز واریزی ثبت نشده است.</div>}</div>
    </section>
    <section className="panel"><div className="section-head compact"><div><h2><CalendarDays/> اشتراک دانش‌آموزان</h2><p>مانده اشتراک بر اساس تاریخ امروز محاسبه می‌شود.</p></div></div>
      <div className="admin-table"><div className="admin-table-head ledger"><span>دانش‌آموز</span><span>شروع</span><span>پایان</span><span>روز باقی‌مانده</span><span>وضعیت</span></div>{data.subscriptions.length?data.subscriptions.map(item=><div className="admin-table-row ledger" key={item.id}><b>{item.user_name}</b><span>{formatJalali(item.starts_at)}</span><span>{formatJalali(item.expires_at)}</span><strong>{faNumber(item.remaining_days)} روز</strong><span>{item.remaining_days>0?'فعال':'پایان‌یافته'}</span></div>):<div className="empty-state">هنوز اشتراکی ثبت نشده است.</div>}</div>
    </section>
  </div>
}
