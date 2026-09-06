import { useQuery } from '@tanstack/react-query'
import { Check, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { RegistrationOptions } from '../types'

const periodLabel:Record<string,string>={monthly:'ماه',quarterly:'سه ماه',three_months:'سه ماه',yearly:'سال'}
export default function PublicPricing(){
  const {data}=useQuery({queryKey:['public-pricing'],queryFn:()=>api<RegistrationOptions>('/registrations/options')})
  const plans=data?.plans.filter(item=>item.active!==false)||[]
  return <section className="pricing section" id="pricing"><div className="section-title"><h2>اشتراک مناسب خود را انتخاب کنید</h2><p>تعرفه‌های ماهانه، سه‌ماهه و سالانه؛ بدون هزینه پنهان</p></div><div className="pricing-wrap container"><div className="pricing-art"><GraduationCap/><h3>یک سرمایه‌گذاری کوچک<br/>برای یک آینده بزرگ</h3><p>همین امروز شروع کنید</p></div>{plans.map((plan,index)=><article className={'price-card '+(index===1?'featured':'')} key={plan.id}>{index===1&&<span className="discount">انتخاب پیشنهادی</span>}<h3>{plan.name}</h3><div className="price"><b>{plan.price.toLocaleString('fa-IR')}</b><span>تومان / {periodLabel[plan.period]||plan.period}</span></div><ul>{plan.features.map(feature=><li key={feature}><Check/>{feature}</li>)}</ul><Link className={'btn '+(index===1?'btn-primary':'btn-soft')} to="/register">انتخاب این اشتراک</Link></article>)}</div></section>
}
