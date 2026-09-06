import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, CheckCircle2, CreditCard, Download, FileQuestion, Search, ShieldCheck, UserCheck, Users, XCircle } from 'lucide-react'
import { api } from '../api'
import type { AdminAdvisor, AdminAudit, AdminStudent, AdvisorOption, RegistrationOptions, User } from '../types'

const statusLabel:Record<string,string>={active:'فعال',suspended:'غیرفعال',pending_payment:'در انتظار پرداخت',pending_approval:'در انتظار تأیید',pending_assignment:'در انتظار تخصیص',pending:'در انتظار بررسی',approved:'تأییدشده',rejected:'ردشده',paid:'پرداخت‌شده',failed:'ناموفق'}
function Head({title,subtitle}:{title:string;subtitle:string}){return <div className="section-head"><div><h1>{title}</h1><p>{subtitle}</p></div></div>}
function Loading(){return <div className="page-state">در حال دریافت اطلاعات...</div>}
function ErrorBox({error}:{error:unknown}){return <div className="error-box">{error instanceof Error?error.message:'خطایی رخ داد'}</div>}
function Badge({value}:{value:string}){return <span className={`admin-badge ${value}`}>{statusLabel[value]||value}</span>}

export function AdminUsersPage(){
  const qc=useQueryClient(),[search,setSearch]=useState(''),[role,setRole]=useState('all')
  const {data=[],isLoading,error}=useQuery({queryKey:['admin-users'],queryFn:()=>api<(User&{created_at:string})[]>('/admin/users')})
  const update=useMutation({mutationFn:({id,status}:{id:string;status:string})=>api(`/admin/users/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}),onSuccess:()=>qc.invalidateQueries({queryKey:['admin-users']})})
  const rows=useMemo(()=>data.filter(item=>(role==='all'||item.role===role)&&(item.full_name.includes(search)||item.phone.includes(search))),[data,search,role])
  if(isLoading)return <Loading/>;if(error)return <ErrorBox error={error}/>
  return <div className="content-page"><Head title="مدیریت کاربران" subtitle="مشاهده و کنترل وضعیت تمام حساب‌های سامانه"/><div className="admin-toolbar"><div className="list-search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="نام یا شماره موبایل..."/></div><select value={role} onChange={e=>setRole(e.target.value)}><option value="all">همه نقش‌ها</option><option value="student">دانش‌آموزان</option><option value="advisor">مشاوران</option><option value="secretary">منشی</option><option value="lower_secondary_manager">مسئول متوسطه اول</option><option value="upper_secondary_manager">مسئول متوسطه دوم</option><option value="super_admin">مدیران</option></select></div><div className="admin-table"><div className="admin-table-head"><span>کاربر</span><span>نقش</span><span>وضعیت</span><span>شماره</span><span>اقدام</span></div>{rows.map(item=><div className="admin-table-row" key={item.id}><span><i className="avatar">{item.full_name[0]}</i><b>{item.full_name}</b></span><span>{item.role}</span><Badge value={item.status}/><span dir="ltr">{item.phone}</span><select value={item.status} disabled={update.isPending} onChange={e=>update.mutate({id:item.id,status:e.target.value})}><option value="active">فعال</option><option value="suspended">غیرفعال</option><option value="pending_assignment">در انتظار تخصیص</option><option value="pending_approval">در انتظار تأیید</option></select></div>)}</div>{update.error&&<ErrorBox error={update.error}/>}</div>
}

export function AdminStudentsPage(){
  const qc=useQueryClient(),[search,setSearch]=useState(''),[selected,setSelected]=useState<AdminStudent|null>(null)
  const {data=[],isLoading,error}=useQuery({queryKey:['admin-students'],queryFn:()=>api<AdminStudent[]>('/admin/students')})
  const {data:options}=useQuery({queryKey:['registration-options'],queryFn:()=>api<RegistrationOptions>('/registrations/options')})
  const rows=useMemo(()=>data.filter(item=>item.full_name.includes(search)||item.phone.includes(search)),[data,search])
  const assign=useMutation({mutationFn:({studentId,advisorId}:{studentId:string;advisorId:string})=>api(`/admin/students/${studentId}/assign-advisor`,{method:'POST',body:JSON.stringify({advisor_id:advisorId})}),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['admin-students']});setSelected(null)}})
  if(isLoading)return <Loading/>;if(error)return <ErrorBox error={error}/>
  return <div className="content-page"><Head title="پرونده دانش‌آموزان" subtitle="دسترسی مدیریت به اطلاعات ثبت‌نام، تحصیلی، اشتراک و مشاور"/><div className="list-search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجوی دانش‌آموز..."/></div><div className="admin-card-list">{rows.map(item=><button key={item.id} onClick={()=>setSelected(item)}><span className="avatar">{item.full_name[0]}</span><div><b>{item.full_name}</b><small>{item.profile.grade} · {item.profile.major} · {item.profile.school}</small><p>{item.advisor?`مشاور: ${item.advisor.full_name}`:'بدون مشاور'}</p></div><Badge value={item.status}/><strong>{item.subscription?.plan_name||'بدون اشتراک'}</strong></button>)}</div>{selected&&<StudentDetail student={selected} advisors={options?.advisors||[]} onAssign={advisorId=>assign.mutate({studentId:selected.id,advisorId})} close={()=>setSelected(null)} busy={assign.isPending}/>} {assign.error&&<ErrorBox error={assign.error}/>}</div>
}

function StudentDetail({student,advisors,onAssign,close,busy}:{student:AdminStudent;advisors:AdvisorOption[];onAssign:(id:string)=>void;close:()=>void;busy:boolean}){
  const [advisorId,setAdvisorId]=useState(''),p=student.profile,schedule=p.school_schedule||{},extras=p.extra_classes||{}
  const averages=[['هفتم',p.average_grade7],['هشتم',p.average_grade8],['نهم',p.average_grade9],['دهم',p.average_grade10],['یازدهم',p.average_grade11],['دوازدهم',p.average_grade12]].filter(([,value])=>value!==null&&value!==undefined)
  return <div className="admin-detail">
    <button className="detail-close" onClick={close}><XCircle/></button>
    <Head title={student.full_name} subtitle="پرونده کامل دانش‌آموز"/>
    <div className="detail-grid">
      <Info label="شماره موبایل" value={student.phone}/><Info label="کد ملی" value={p.national_code}/>
      <Info label="تاریخ تولد" value={p.birth_date}/><Info label="نام ولی" value={p.parent_name}/>
      <Info label="موبایل ولی" value={p.parent_phone}/><Info label="نشانی" value={p.address}/>
      <Info label="پایه" value={p.grade}/><Info label="رشته" value={p.major||'نیاز ندارد'}/>
      <Info label="مدرسه" value={p.school}/><Info label="هدف" value={p.goal||'ثبت نشده'}/>
      <Info label="معدل‌های ثبت‌شده" value={averages.length?averages.map(([grade,value])=>`${grade}: ${value}`).join(' | '):'بدون معدل موردنیاز'}/>
      <Info label="اشتراک" value={student.subscription?.plan_name||'ثبت نشده'}/>
      <Info label="مشاور فعلی" value={student.advisor?.full_name||'تخصیص داده نشده'}/>
    </div>
    {Object.keys(schedule).length>0&&<SchoolSchedule schedule={schedule} extras={extras}/>} 
    <div className="assign-box"><select value={advisorId} onChange={e=>setAdvisorId(e.target.value)}><option value="">انتخاب مشاور...</option>{advisors.filter(item=>item.education_level===p.education_level).map(item=><option key={item.id} value={item.id} disabled={item.is_full}>{item.full_name} — {item.is_full?'تکمیل ظرفیت':`${item.remaining_capacity} جای خالی`}</option>)}</select><button className="btn btn-primary" disabled={!advisorId||busy} onClick={()=>onAssign(advisorId)}>تخصیص یا انتقال مشاور</button></div>
  </div>
}

function SchoolSchedule({schedule,extras}:{schedule:Record<string,string[]>;extras:Record<string,string>}){
  return <section className="school-schedule-view"><h3>برنامه هفتگی مدرسه</h3><div>{Object.entries(schedule).map(([day,periods])=><article key={day}><b>{day}</b>{periods.map((item,index)=><span key={index}>زنگ {index+1}: {item||'—'}</span>)}<small>{extras[day]||'بدون کلاس فوق‌العاده'}</small></article>)}</div></section>
}

export function AdminAdvisorsPage(){
  const qc=useQueryClient(),[selectedId,setSelectedId]=useState('')
  const {data=[],isLoading,error}=useQuery({queryKey:['admin-advisors'],queryFn:()=>api<AdminAdvisor[]>('/admin/advisors')})
  const {data:detail}=useQuery({queryKey:['admin-advisor',selectedId],queryFn:()=>api<AdminAdvisor>(`/admin/advisors/${selectedId}`),enabled:Boolean(selectedId)})
  const review=useMutation({mutationFn:({status,note}:{status:string;note:string})=>api(`/admin/advisors/${selectedId}/review`,{method:'PATCH',body:JSON.stringify({status,note})}),onSuccess:()=>{qc.invalidateQueries({queryKey:['admin-advisors']});qc.invalidateQueries({queryKey:['admin-advisor',selectedId]})}})
  if(isLoading)return <Loading/>;if(error)return <ErrorBox error={error}/>
  return <div className="content-page"><Head title="مشاوران و تأیید مدارک" subtitle="بررسی هویت، سابقه، ظرفیت و وضعیت همکاری همه مشاوران"/><div className="advisor-admin-grid"><aside>{data.map(item=><button className={selectedId===item.id?'active':''} key={item.id} onClick={()=>setSelectedId(item.id)}><span className="avatar">{item.full_name[0]}</span><div><b>{item.full_name}</b><small>{item.profile.education_field||'رشته ثبت نشده'} · {item.profile.experience_years||0} سال سابقه</small></div><Badge value={item.profile.approval_status||item.status}/><strong>{item.profile.assigned_students||0}/{item.profile.support_capacity||0}</strong></button>)}</aside><main>{detail?<AdvisorDetail item={detail} review={(status,note)=>review.mutate({status,note})} busy={review.isPending}/>:<div className="page-state">یک مشاور را برای بررسی پرونده انتخاب کنید.</div>}</main></div>{review.error&&<ErrorBox error={review.error}/>}</div>
}

function AdvisorDetail({item,review,busy}:{item:AdminAdvisor;review:(status:string,note:string)=>void;busy:boolean}){
  const [note,setNote]=useState(''),p=item.profile
  return <section className="advisor-detail"><h2>{item.full_name}</h2><div className="detail-grid"><Info label="موبایل" value={item.phone}/><Info label="کد ملی" value={p.national_code}/><Info label="تاریخ تولد" value={p.birth_date}/><Info label="مدرک" value={p.education_degree}/><Info label="رشته" value={p.education_field}/><Info label="سابقه" value={`${p.experience_years||0} سال`}/><Info label="ظرفیت سال" value={`${p.assigned_students||0} از ${p.support_capacity||0}`}/><Info label="سال تحصیلی" value={p.academic_year}/><Info label="نشانی" value={p.address}/><Info label="معرفی" value={p.bio}/></div><h3>مدارک بارگذاری‌شده</h3><div className="advisor-documents">{p.documents?.map(doc=><a key={doc.name} download={doc.name} href={`data:${doc.content_type};base64,${doc.content_base64}`}><Download/>{doc.kind}<small>{doc.name}</small></a>)||<span>مدرکی ثبت نشده است.</span>}</div><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="برای رد درخواست، علت دقیق الزامی است"/><div className="review-actions"><button disabled={busy} onClick={()=>review('approved',note)}><CheckCircle2/> تأیید مشاور</button><button disabled={busy||!note.trim()} className="danger" onClick={()=>review('rejected',note)}><XCircle/> رد درخواست</button></div></section>
}

export function AdminFinancePage(){
  const {data,isLoading,error}=useQuery({queryKey:['admin-finance'],queryFn:()=>api<{plans:{id:string;name:string;period:string;price:number;active:boolean;features:string[]}[];orders:{id:string;user_name:string;amount:number;status:string;created_at:string}[]}>('/admin/finance')})
  if(isLoading)return <Loading/>;if(error||!data)return <ErrorBox error={error}/>
  return <div className="content-page"><Head title="اشتراک و امور مالی" subtitle="طرح‌ها و تمام سفارش‌های ثبت‌نام دانش‌آموزان"/><div className="plan-admin-grid">{data.plans.map(plan=><article className="panel" key={plan.id}><CreditCard/><h3>{plan.name}</h3><b>{plan.price.toLocaleString('fa-IR')} تومان</b><p>{plan.features.join(' · ')}</p><Badge value={plan.active?'active':'suspended'}/></article>)}</div><div className="admin-table"><div className="admin-table-head finance"><span>دانش‌آموز</span><span>مبلغ</span><span>وضعیت</span><span>تاریخ</span></div>{data.orders.map(order=><div className="admin-table-row finance" key={order.id}><b>{order.user_name}</b><span>{order.amount.toLocaleString('fa-IR')} تومان</span><Badge value={order.status}/><span>{new Date(order.created_at).toLocaleDateString('fa-IR')}</span></div>)}</div></div>
}

export function AdminAuditsPage(){
  const {data=[],isLoading,error}=useQuery({queryKey:['admin-audits'],queryFn:()=>api<AdminAudit[]>('/admin/audits')})
  if(isLoading)return <Loading/>;if(error)return <ErrorBox error={error}/>
  return <div className="content-page"><Head title="گزارش ممیزی" subtitle="ردیابی عملیات حساس مدیریت و کاربران"/><div className="audit-list">{data.map(item=><article key={item.id}><ShieldCheck/><div><b>{item.action}</b><p>{item.resource_type} · {item.resource_id||'سامانه'}</p><small>{item.reason||'بدون توضیح'} · {new Date(item.created_at).toLocaleString('fa-IR')}</small></div></article>)}</div></div>
}

export function AdminCatalogPage({kind}:{kind:'questions'|'exams'}){
  const endpoint=kind==='questions'?'/questions':'/exams'
  const {data=[],isLoading,error}=useQuery({queryKey:['admin-catalog',kind],queryFn:()=>api<Record<string,unknown>[]>(endpoint)})
  if(isLoading)return <Loading/>;if(error)return <ErrorBox error={error}/>
  const Icon=kind==='questions'?FileQuestion:BookOpen
  return <div className="content-page"><Head title={kind==='questions'?'بانک سؤال':'مدیریت آزمون‌ها'} subtitle="نمای مدیریتی محتوای آموزشی سامانه"/><div className="catalog-grid">{data.map((item,index)=><article className="panel" key={String(item.id||index)}><Icon/><h3>{String(item.title||item.text||'مورد آموزشی')}</h3><p>{String(item.subject||item.status||'فعال')}</p></article>)}</div></div>
}

export function AdminAccessPage(){
  const access=[['مدیر سایت','دسترسی کامل به کاربران، برنامه‌ها، گفت‌وگوها، تخصیص و انتقال، تأیید و امور مالی'],['مسئول متوسطه دوم','مشاوران و دانش‌آموزان متوسطه دوم، تأیید مدارک، برنامه‌ها و نظارت بر گفت‌وگوها'],['مسئول متوسطه اول','مشاوران و دانش‌آموزان متوسطه اول، تأیید مدارک، برنامه‌ها و نظارت بر گفت‌وگوها'],['منشی','مشاهده و چاپ برنامه‌ها و پیام به مشاوران و مدیر سایت'],['مدیر عملیات','کاربران، پرونده‌ها، تخصیص و گزارش‌های عملیاتی'],['مدیر مالی','طرح‌ها، سفارش‌ها و پرداخت‌ها']]
  return <div className="content-page"><Head title="تنظیمات و سطح دسترسی" subtitle="تعریف شفاف مسئولیت نقش‌های مدیریتی"/><div className="access-grid">{access.map(([role,items])=><article className="panel" key={role}><UserCheck/><h3>{role}</h3><p>{items}</p></article>)}</div><section className="panel security-note"><ShieldCheck/><div><h2>کنترل‌های فعال</h2><p>احراز هویت دومرحله‌ای مدیر، جداسازی نقش‌ها، ممیزی تغییرات، محدودسازی مدارک به مدیریت و جلوگیری از تخصیص بیش از ظرفیت فعال است.</p></div></section></div>
}

function Info({label,value}:{label:string;value:unknown}){return <p><small>{label}</small><b>{String(value||'—')}</b></p>}


