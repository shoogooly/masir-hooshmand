import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormEvent, ReactNode, useState } from 'react'
import { Check, Clock3, CreditCard, LogOut, UserCheck } from 'lucide-react'
import { api, auth } from '../api'
import Brand from '../components/Brand'
import type { RegistrationOptions, User } from '../types'
import { AdvisorProfileForm, StudentProfileForm } from './OnboardingForms'

import TermsStep from './TermsStep'
type StatusData = { user: User; step: string; profile?: Record<string, unknown>; referred_advisor?: User | null; payment?: { order_id: string; amount: number; signature: string } }

export default function OnboardingPage({ user }: { user: User }) {
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey: ['onboarding'], queryFn: () => api<StatusData>('/onboarding/status'), refetchInterval: ['lead_review', 'manager_review', 'advisor_confirmation', 'advisor_assignment', 'dual_approval'].includes(user.onboarding_step || '') ? 15000 : false })
  async function logout() { await auth.logout(); queryClient.clear(); location.href = '/login' }
  if (status.isLoading) return <div className="screen-loader">در حال دریافت وضعیت ثبت‌نام...</div>
  if (status.isError || !status.data) return <div className="page-state error">دریافت وضعیت ناموفق بود. <button onClick={() => status.refetch()}>تلاش دوباره</button></div>
  const data = status.data
  const refresh = () => { status.refetch(); queryClient.invalidateQueries({ queryKey: ['me'] }) }
  return <div className="onboarding-page"><header><Brand /><button className="btn btn-outline" onClick={logout}><LogOut /> خروج</button></header><main><Progress role={data.user.role} step={data.step} />{data.user.role === 'student' ? <StudentStep data={data} refresh={refresh} /> : <AdvisorStep data={data} refresh={refresh} />}</main></div>
}

function Progress({ role, step }: { role: string; step: string }) {
  const student = [['account', 'ساخت حساب'], ['profile', 'اطلاعات فردی'], ['profile_correction', 'اصلاح اطلاعات'], ['terms', 'پذیرش شرایط'], ['selection', 'طرح و مشاور'], ['payment', 'پرداخت'], ['dual_approval', 'تأیید مدیر و مشاور'], ['completed', 'تکمیل ثبت‌نام']]
  const advisor = [['account', 'ساخت حساب'], ['profile', 'اطلاعات و مدارک'], ['rejected', 'اصلاح مدارک'], ['terms', 'پذیرش شرایط'], ['lead_review', 'تأیید مسئول مقطع'], ['manager_review', 'تأیید مدیر سایت'], ['completed', 'تکمیل ثبت‌نام']]
  const stages = role === 'student' ? student : advisor
  const current = Math.max(0, stages.findIndex(item => item[0] === step))
  return <section className="onboarding-progress"><div><span>فرایند تکمیل ثبت‌نام</span><h1>مرحله فعلی: {stages[current]?.[1] || 'در حال بررسی'}</h1><p>پس از ورود دوباره نیز از همین مرحله ادامه می‌دهید.</p></div><ol>{stages.map(([key, label], index) => <li key={key} className={index < current || step === 'completed' ? 'done' : index === current ? 'active' : ''}><i>{index < current || step === 'completed' ? <Check /> : index + 1}</i><span>{label}</span></li>)}</ol></section>
}

function StudentStep({ data, refresh }: { data: StatusData; refresh: () => void }) {
  if (data.step === 'profile') return <StudentProfileForm refresh={refresh} />
  if (data.step === 'profile_correction') return <><RejectionReason text={String(data.profile?.registration_review_note || 'اطلاعات پرونده نیازمند اصلاح است.')} /><StudentProfileForm refresh={refresh} /></>
  if (data.step === 'selection') return <StudentSelection refresh={refresh} educationLevel={String(data.profile?.education_level || 'upper_secondary')} referredAdvisorId={data.user.referred_by_advisor_id} referredAdvisorName={data.referred_advisor?.full_name} />
  if (data.step === 'payment' && data.payment) return <Payment payment={data.payment} refresh={refresh} />
  if (data.step === 'terms') return <TermsStep role="student" refresh={refresh}/>
  if (data.step === 'advisor_assignment') return <Waiting icon={<Clock3 />} title="پرداخت انجام شد" text="پرونده شما در صف تخصیص مشاور مدیریت قرار دارد." />
  if (data.step === 'advisor_confirmation') return <Waiting icon={<Clock3 />} title="در انتظار تأیید مشاور" text="مشاور انتخابی باید درخواست شما را بپذیرد. اگر درخواست رد شود، پرونده برای تخصیص مدیر آماده خواهد بود." />
  if (data.step === 'dual_approval') return <DualApproval profile={data.profile||{}} />
  return <Waiting icon={<UserCheck />} title="ثبت‌نام تکمیل شد" text="حساب شما فعال است؛ صفحه را تازه‌سازی کنید." />
}

function StudentSelection({ refresh, educationLevel, referredAdvisorId, referredAdvisorName }: { refresh: () => void; educationLevel: string; referredAdvisorId?:string; referredAdvisorName?:string }) {
  const referred = Boolean(referredAdvisorId)
  const options = useQuery({ queryKey: ['registration-options', educationLevel], queryFn: () => api<RegistrationOptions>('/registrations/options') })
  const [mode, setMode] = useState<'self' | 'admin'>(referred ? 'self' : 'admin')
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => api('/onboarding/student/selection', { method: 'POST', body: JSON.stringify(body) }), onSuccess: refresh })
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); save.mutate({ plan_id: form.get('plan_id'), advisor_selection_mode: referred ? 'self' : mode, advisor_id: referred ? referredAdvisorId : mode === 'self' ? form.get('advisor_id') : null }) }
  if (options.isLoading) return <div className="page-state">در حال دریافت طرح‌ها...</div>
  const referredAdvisor = options.data?.advisors.find(advisor => advisor.id === referredAdvisorId)
  return <form className="registration-form onboarding-card" onSubmit={submit}><Title title="انتخاب طرح و مشاور" text={referred?'این شماره توسط یک مشاور به مسیر هوشمند معرفی شده است؛ تعرفه ویژه برای شما اعمال می‌شود و مشاور معرفی‌کننده قابل تغییر نیست.':'می‌توانید یک مشاور فعال و تأییدشده در مقطع خود را انتخاب کنید یا انتخاب را به مدیر سایت بسپارید. انتخاب مستقیم شما باید پس از پرداخت توسط مشاور تأیید شود؛ تخصیص مدیر فوری است. مشاور تکمیل‌ظرفیت قابل انتخاب نیست.'} /><div className="choice-cards">{options.data?.plans.map(plan => <label key={plan.id}><input type="radio" name="plan_id" value={plan.id} required /><b>{plan.name}</b><span>{(referred?plan.referral_price||plan.price:plan.price).toLocaleString('fa-IR')} تومان</span><small>{plan.features.join(' · ')}</small></label>)}</div><div className="advisor-selection-field"><b>انتخاب مشاور:</b>{referred?<select value={referredAdvisorId} disabled aria-label="مشاور معرفی‌کننده"><option value={referredAdvisorId}>{referredAdvisor?.full_name || referredAdvisorName || 'مشاور معرفی‌کننده'} — انتخاب ثابت</option></select>:<><div className="advisor-choice"><label><input type="radio" checked={mode === 'admin'} onChange={() => setMode('admin')} /> انتخاب توسط مدیریت</label><label><input type="radio" checked={mode === 'self'} onChange={() => setMode('self')} /> انتخاب توسط من (نیازمند تأیید مشاور)</label></div>{mode === 'self' && <select name="advisor_id" required defaultValue=""><option value="">انتخاب مشاور...</option>{options.data?.advisors.filter(advisor => advisor.education_level === educationLevel).map(advisor => <option key={advisor.id} value={advisor.id} disabled={advisor.is_full}>{advisor.full_name} — {advisor.is_full ? 'تکمیل ظرفیت' : `${advisor.remaining_capacity} ظرفیت باقی‌مانده`}</option>)}</select>}</>}</div>{save.error && <ErrorText error={save.error} />}<button className="btn btn-primary btn-lg" disabled={save.isPending}>ادامه به پرداخت</button></form>
}

function Payment({ payment, refresh }: { payment: NonNullable<StatusData['payment']>; refresh: () => void }) {
  const pay = useMutation({ mutationFn: () => api('/payments/callback', { method: 'POST', body: JSON.stringify({ order_id: payment.order_id, success: true, signature: payment.signature }) }), onSuccess: refresh })
  return <section className="registration-form onboarding-card payment-step"><CreditCard /><h2>پرداخت طرح انتخابی</h2><p>مبلغ: <b>{payment.amount.toLocaleString('fa-IR')} تومان</b></p><small>درگاه فعلی آزمایشی است.</small>{pay.error && <ErrorText error={pay.error} />}<button className="btn btn-primary btn-lg" disabled={pay.isPending} onClick={() => pay.mutate()}>پرداخت آزمایشی و ادامه</button></section>
}

function AdvisorStep({ data, refresh }: { data: StatusData; refresh: () => void }) {
  if (data.step === 'profile') return <AdvisorProfileForm refresh={refresh} />
  if (data.step === 'rejected') return <><RejectionReason text={String(data.profile?.review_note || 'مدارک پرونده نیازمند اصلاح است.')} /><AdvisorProfileForm refresh={refresh} /></>
  if (data.step === 'manager_review') return <Waiting icon={<Clock3 />} title="در انتظار تأیید مدیریت" text="مدارک شما ثبت شده و نتیجه در همین صفحه نمایش داده می‌شود." />
  if (data.step === 'terms') return <TermsStep role="advisor" refresh={refresh}/>
  if (data.step === 'lead_review') return <Waiting icon={<Clock3 />} title="در انتظار تأیید مسئول مقطع" text="پس از تأیید مسئول مقطع، پرونده برای تأیید نهایی مدیر سایت ارسال خواهد شد." />
  return <Waiting icon={<UserCheck />} title="حساب فعال شد" text="صفحه را تازه‌سازی کنید تا وارد پنل مشاور شوید." />
}

function Waiting({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <section className="registration-form onboarding-card registration-success">{icon}<h2>{title}</h2><p>{text}</p></section> }
function DualApproval({profile}:{profile:Record<string,unknown>}){const label=(value:unknown)=>value==='approved'?'تأیید شده':value==='rejected'?'رد شده':'در انتظار تأیید';return <section className="registration-form onboarding-card dual-approval"><UserCheck/><h2>در انتظار تکمیل دو تأیید</h2><p>پرداخت شما ثبت شده است؛ دوره اشتراک فقط پس از تأیید مدیر و مشاور آغاز می‌شود و هیچ روزی از اشتراک در این مرحله کم نخواهد شد.</p><div><article className={String(profile.admin_approval_status)}><b>تأیید مدیر سایت</b><span>{label(profile.admin_approval_status)}</span></article><article className={String(profile.advisor_approval_status)}><b>تأیید مشاور</b><span>{label(profile.advisor_approval_status)}</span></article></div></section>}

function Title({ title, text }: { title: string; text: string }) { return <div className="form-title"><div><h2>{title}</h2><p>{text}</p></div></div> }
function ErrorText({ error }: { error: unknown }) { return <div className="form-error">{error instanceof Error ? error.message : 'خطایی رخ داد'}</div> }
function RejectionReason({ text }: { text: string }) { return <section className="registration-rejection"><b>علت رد پرونده</b><p>{text}</p><small>موارد اعلام‌شده را در فرم زیر اصلاح و دوباره ارسال کنید.</small></section> }
