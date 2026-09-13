import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { ArrowRight, Check, Clock3, CreditCard, LogOut, UserCheck } from 'lucide-react'
import { api, auth } from '../api'
import Brand from '../components/Brand'
import type { RegistrationOptions, SubscriptionPlanOption, User } from '../types'
import { AdvisorProfileForm, StudentProfileForm } from './OnboardingForms'
import TermsStep from './TermsStep'

type StatusData={user:User;step:string;profile?:Record<string,unknown>;referred_advisor?:User|null;paid?:boolean;paid_plan?:SubscriptionPlanOption;rejected_advisor_ids?:string[];selection?:{plan_id:string;advisor_selection_mode:'self'|'admin';advisor_id?:string};payment?:{order_id:string;amount:number;signature:string}}
export default function OnboardingPage({user}:{user:User}){
 const qc=useQueryClient()
 const [part,setPart]=useState(1)
 const status=useQuery({queryKey:['onboarding',user.id],queryFn:()=>api<StatusData>('/onboarding/status'),refetchInterval:query=>['lead_review','manager_review','advisor_confirmation','advisor_assignment','dual_approval'].includes(query.state.data?.step||'')?10000:false})
 const refresh=()=>{setPart(1);void status.refetch();void qc.invalidateQueries({queryKey:['me']})}
 const back=useMutation({mutationFn:()=>api('/onboarding/back',{method:'POST'}),onSuccess:refresh})
 useEffect(()=>{if(status.data?.user.status==='active')void qc.invalidateQueries({queryKey:['me']})},[status.data?.user.status,qc])
 async function logout(){await auth.logout();qc.clear();location.href='/login'}
 if(status.isLoading)return <div className="screen-loader">در حال دریافت وضعیت ثبت‌نام…</div>
 if(status.isError||!status.data)return <div className="page-state error">دریافت وضعیت ناموفق بود. <button onClick={()=>void status.refetch()}>تلاش دوباره</button></div>
 const data=status.data
 const canBack=!['account','profile','completed'].includes(data.step)
 return <div className="onboarding-page"><header><Brand/><button className="btn btn-outline" onClick={logout}><LogOut/> خروج</button></header><main><Progress role={data.user.role} step={data.step} part={part}/>
 {canBack&&<button className="btn btn-outline onboarding-back" disabled={back.isPending} onClick={()=>back.mutate()}><ArrowRight/> مرحله قبل</button>}{back.error&&<ErrorText error={back.error}/>}
 {data.user.role==='student'?<StudentStep key={data.step} data={data} refresh={refresh} onPartChange={setPart}/>:<AdvisorStep key={data.step} data={data} refresh={refresh} onPartChange={setPart}/>}
 </main></div>
}
function Progress({role,step,part}:{role:string;step:string;part:number}){
 const student=[['account','ساخت حساب'],['profile','اطلاعات فردی'],['education','سوابق تحصیلی'],['terms','پذیرش شرایط'],['selection','طرح و مشاور'],['advisor_confirmation','تأیید مشاور'],['payment','پرداخت'],['manager_review','تأیید مدیر'],['completed','تکمیل ثبت‌نام']]
 const advisor=[['account','ساخت حساب'],['profile','اطلاعات فردی'],['education','سوابق و مدارک'],['terms','پذیرش شرایط'],['lead_review','تأیید مسئول مقطع'],['manager_review','تأیید مدیر'],['completed','تکمیل ثبت‌نام']]
 const stages=role==='student'?student:advisor
 const normalized=['profile_correction','rejected'].includes(step)?'profile':step==='advisor_assignment'?'advisor_confirmation':step==='dual_approval'?'manager_review':step
 const effective=normalized==='profile'&&part===2?'education':normalized
 const current=Math.max(0,stages.findIndex(([key])=>key===effective))
 return <section className="onboarding-progress"><div><span>فرایند تکمیل ثبت‌نام</span><h1>مرحله فعلی: {stages[current][1]}</h1><p>اطلاعات ذخیره می‌شود و پس از ورود دوباره از همین مرحله ادامه می‌دهید.</p></div><ol>{stages.map(([key,label],index)=><li key={key} className={index<current||step==='completed'?'done':index===current?'active':''}><i>{index<current||step==='completed'?<Check/>:index+1}</i><span>{label}</span></li>)}</ol></section>
}
function StudentStep({data,refresh,onPartChange}:{data:StatusData;refresh:()=>void;onPartChange:(part:number)=>void}){
 const initial={...data.profile,full_name:data.user.full_name}
 if(['profile','profile_correction'].includes(data.step))return <>{data.step==='profile_correction'&&<Rejection text={String(data.profile?.registration_review_note||'اطلاعات نیاز به اصلاح دارد.')}/>}<StudentProfileForm initial={initial} refresh={refresh} onPartChange={onPartChange}/></>
 if(data.step==='terms')return <TermsStep role="student" refresh={refresh}/>
 if(data.step==='selection')return <>{Boolean(data.profile?.approval_note&&data.rejected_advisor_ids?.length)&&<Rejection title="مشاور درخواست شما را نپذیرفت؛ لطفاً به مشاور دیگری درخواست دهید." text={String(data.profile?.approval_note||'لطفاً مشاور دیگری انتخاب کنید.')}/>}<StudentSelection data={data} refresh={refresh}/></>
 if(data.step==='advisor_assignment')return <Waiting title="در انتظار انتخاب مشاور توسط مدیریت" text="پس از تخصیص، درخواست برای تأیید مشاور ارسال می‌شود. پرداخت بعد از پذیرش مشاور است."/>
 if(data.step==='advisor_confirmation')return data.profile?.advisor_approval_status==='approved'?<Continue title="مشاور درخواست شما را پذیرفت" text="می‌توانید به مرحله پرداخت بروید." refresh={refresh}/>:<Waiting title="در انتظار تأیید مشاور" text="درخواست شما ارسال شده است. پس از پذیرش مشاور، مرحله پرداخت باز می‌شود."/>
 if(data.step==='payment')return data.paid?<Continue title="پرداخت شما قبلاً ثبت شده است" text="نیازی به پرداخت دوباره نیست؛ برای بررسی مدیر ادامه دهید." refresh={refresh}/>:data.payment?<Payment payment={data.payment} refresh={refresh}/>:<Waiting title="در حال آماده‌سازی پرداخت" text="برای دریافت وضعیت تازه، صفحه را تازه‌سازی کنید."/>
 if(['manager_review','dual_approval'].includes(data.step))return <Waiting title="در انتظار تأیید مدیر" text="تأیید مشاور و پرداخت تکمیل شده است. دوره اشتراک پس از تأیید نهایی مدیر آغاز می‌شود."/>
 return <Waiting title={data.step==='completed'?'ثبت‌نام تکمیل شد':'در حال بررسی ثبت‌نام'} text="وضعیت حساب شما در حال به‌روزرسانی است."/>
}
function StudentSelection({data,refresh}:{data:StatusData;refresh:()=>void}){
 const rejected=data.rejected_advisor_ids||[]
 const referred=Boolean(data.user.referred_by_advisor_id&&!rejected.includes(data.user.referred_by_advisor_id))
 const level=String(data.profile?.education_level||'upper_secondary')
 const options=useQuery({queryKey:['registration-options',level],queryFn:()=>api<RegistrationOptions>('/registrations/options')})
 const [mode,setMode]=useState<'self'|'admin'>(referred?'self':data.selection?.advisor_selection_mode||'admin')
 const [planId,setPlanId]=useState(data.selection?.plan_id||'')
 const [advisorId,setAdvisorId]=useState(rejected.includes(data.selection?.advisor_id||'')?'':data.selection?.advisor_id||'')
 const save=useMutation({mutationFn:()=>api('/onboarding/student/selection',{method:'POST',body:JSON.stringify({plan_id:planId,advisor_selection_mode:referred?'self':mode,advisor_id:referred?data.user.referred_by_advisor_id:mode==='self'?advisorId:null})}),onSuccess:refresh})
 if(options.isLoading)return <div className="page-state">در حال دریافت طرح‌ها…</div>
 if(options.isError)return <ErrorText error={options.error}/>
 return <form className="registration-form onboarding-card" onSubmit={e=>{e.preventDefault();save.mutate()}}><h2>انتخاب طرح و مشاور</h2><p>پس از پذیرش مشاور، پرداخت انجام می‌شود و سپس پرونده برای تأیید مدیر ارسال خواهد شد.</p>
 {data.paid&&<p className="registration-selection-notice">پرداخت قبلی محفوظ است و دوباره دریافت نمی‌شود. طرح پرداخت‌شده ثابت می‌ماند؛ مشاور و اطلاعات پرونده قابل ویرایش است.</p>}
 <div className="choice-cards">{(data.paid&&data.paid_plan?[data.paid_plan]:options.data?.plans)?.map(plan=><label key={plan.id}><input type="radio" name="plan_id" value={plan.id} checked={planId===plan.id} onChange={()=>setPlanId(plan.id)} disabled={data.paid&&plan.id!==data.selection?.plan_id} required/><b>{plan.name}</b><span>{(data.user.referred_by_advisor_id?plan.referral_price||plan.price:plan.price).toLocaleString('fa-IR')} تومان</span><small>{plan.features.join(' · ')}</small></label>)}</div>
 <div className="advisor-selection-field"><b>انتخاب مشاور:</b>{referred?<p>{data.referred_advisor?.full_name||'مشاور معرفی‌کننده'}؛ تعرفه معرفی برای شما اعمال می‌شود.</p>:<><div className="advisor-choice"><label><input type="radio" checked={mode==='admin'} onChange={()=>setMode('admin')}/> انتخاب توسط مدیریت</label><label><input type="radio" checked={mode==='self'} onChange={()=>setMode('self')}/> انتخاب توسط من</label></div>{mode==='self'&&<select aria-label="انتخاب مشاور" value={advisorId} onChange={e=>setAdvisorId(e.target.value)} required><option value="">انتخاب مشاور…</option>{options.data?.advisors.filter(a=>a.education_level===level&&!rejected.includes(a.id)).map(a=><option key={a.id} value={a.id} disabled={a.is_full}>{a.full_name} — {a.is_full?'تکمیل ظرفیت':a.remaining_capacity+' ظرفیت باقی‌مانده'}</option>)}</select>}</>}</div>
 {save.error&&<ErrorText error={save.error}/>}<button className="btn btn-primary btn-lg" disabled={save.isPending||!planId}>ارسال درخواست برای تأیید مشاور</button></form>
}
function AdvisorStep({data,refresh,onPartChange}:{data:StatusData;refresh:()=>void;onPartChange:(part:number)=>void}){
 if(['profile','rejected'].includes(data.step))return <>{data.step==='rejected'&&<Rejection text={String(data.profile?.review_note||'مدارک نیاز به اصلاح دارد.')}/>}<AdvisorProfileForm refresh={refresh} initial={{...data.profile,full_name:data.user.full_name}} onPartChange={onPartChange}/></>
 if(data.step==='terms')return <TermsStep role="advisor" refresh={refresh}/>
 if(data.step==='lead_review')return data.profile?.lead_approval_status==='approved'?<Continue title="مسئول مقطع تأیید کرده است" text="برای بررسی نهایی مدیر ادامه دهید." refresh={refresh}/>:<Waiting title="در انتظار تأیید مسئول مقطع" text="پس از تأیید مسئول مقطع، پرونده برای مدیر سایت ارسال می‌شود."/>
 return <Waiting title={data.step==='completed'?'ثبت‌نام تکمیل شد':'در انتظار تأیید مدیر'} text="نتیجه بررسی در همین صفحه نمایش داده می‌شود."/>
}
function Continue({title,text,refresh}:{title:string;text:string;refresh:()=>void}){
 const next=useMutation({mutationFn:()=>api('/onboarding/continue',{method:'POST'}),onSuccess:refresh})
 return <section className="registration-form onboarding-card registration-success"><UserCheck/><h2>{title}</h2><p>{text}</p>{next.error&&<ErrorText error={next.error}/>}<button className="btn btn-primary" disabled={next.isPending} onClick={()=>next.mutate()}>ادامه به مرحله بعد</button></section>
}
function Payment({payment,refresh}:{payment:NonNullable<StatusData['payment']>;refresh:()=>void}){
 const pay=useMutation({mutationFn:()=>api('/payments/callback',{method:'POST',body:JSON.stringify({order_id:payment.order_id,success:true,signature:payment.signature})}),onSuccess:refresh})
 return <section className="registration-form onboarding-card payment-step"><CreditCard/><h2>پرداخت طرح انتخابی</h2><p>مبلغ: <b>{payment.amount.toLocaleString('fa-IR')} تومان</b></p><small>درگاه فعلی آزمایشی است.</small>{pay.error&&<ErrorText error={pay.error}/>}<button className="btn btn-primary btn-lg" disabled={pay.isPending} onClick={()=>pay.mutate()}>پرداخت آزمایشی و ادامه</button></section>
}
function Waiting({title,text}:{title:string;text:string}){return <section className="registration-form onboarding-card registration-success"><Clock3/><h2>{title}</h2><p>{text}</p></section>}
function Rejection({title='علت رد پرونده',text}:{title?:string;text:string}){return <section className="registration-rejection" role="alert"><b>{title}</b><p>{text}</p></section>}
function ErrorText({error}:{error:unknown}){return <div className="form-error" role="alert">{error instanceof Error?error.message:'خطایی رخ داد'}</div>}
