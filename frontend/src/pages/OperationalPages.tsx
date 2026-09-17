import BooksPage, {type LibraryBook} from './BooksPage'
import {softTimelinePositions} from '../utils/softTimeline'
import {detectSubjectColor,detectSubjects,subjectBlockStyle} from '../utils/subjectColors'
import AdvisorEvaluationPage from './AdvisorEvaluationPage'
import TimeFields from '../components/TimeFields'
import StudyReportPlan from './StudyReportPlan'
import AdvisorPlanArchive from './AdvisorPlanArchive'
import AIPlanDesigner from './AIPlanDesigner'
import PasswordChange from '../components/PasswordChange'
import { exportPlanPdf } from '../utils/planPdf'
import '../styles/planner-readable.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Camera, CheckCircle2, Clock3, Download, MessageSquare, Plus, Save, Search, Send, Trash2, TrendingUp, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { ExamListItem, Message, PlanActivity, Profile, ProfilePhoto, ReportData, User, WeeklyPlan } from '../types'
import { photoUrl, prepareProfilePhoto } from '../utils/profilePhoto'

import { jalaaliMonthLength, jalaaliToDateObject, toJalaali } from 'jalaali-js'
import StudentAssignedExamsPage from './StudentAssignedExamsPage'
import AdvisorAssignedExamsPage from './AdvisorAssignedExamsPage'
import {formatIranDateTime} from '../utils/jalali'
const days=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه']
const fmt=(date?:string)=>date?formatIranDateTime(date):''
function PageHead({title,subtitle,back}:{title:string;subtitle:string;back?:()=>void}){return <div className="section-head">{back&&<button className="icon-btn" onClick={back}><ArrowRight/></button>}<div><h1>{title}</h1><p>{subtitle}</p></div></div>}
function State({text='در حال دریافت اطلاعات...'}:{text?:string}){return <div className="page-state">{text}</div>}
function ErrorBox({error}:{error:unknown}){return <div className="error-box">{error instanceof Error?error.message:'خطایی رخ داد'}</div>}

function LegacyStudentPlanPage(){
  const qc=useQueryClient();const {data,isLoading,error}=useQuery({queryKey:['plans'],queryFn:()=>api<WeeklyPlan[]>('/plans')})
  const update=useMutation({mutationFn:({item,form}:{item:PlanActivity;form:FormData})=>api(`/activities/${item.id}`,{method:'PATCH',body:JSON.stringify({status:form.get('status'),actual_minutes:Number(form.get('actual_minutes')),test_count:Number(form.get('test_count')),note:form.get('note'),idempotency_key:crypto.randomUUID()})}),onSuccess:()=>qc.invalidateQueries({queryKey:['plans']})})
  if(isLoading)return <State/>;if(error)return <ErrorBox error={error}/>;const plan=data?.[0]
  return <div className="content-page"><PageHead title="برنامه من" subtitle="برنامه منتشرشده مشاور و ثبت عملکرد واقعی"/>{!plan?<State text="هنوز برنامه‌ای برای شما منتشر نشده است."/>:<><div className="plan-banner"><div><b>{plan.title}</b><span>{plan.week_label} · نسخه {plan.version}</span></div><CheckCircle2/> منتشرشده</div><div className="week-board">{days.map(day=><section key={day}><h3>{day}</h3>{plan.activities.filter(a=>a.day===day).map(item=><form key={item.id} className="schedule-card" onSubmit={e=>{e.preventDefault();update.mutate({item,form:new FormData(e.currentTarget)})}}><div className="schedule-time"><Clock3/>{item.start_time} تا {item.end_time}</div><b>{item.title}</b><small>{item.subject} · {item.planned_minutes} دقیقه</small><div className="inline-fields"><select name="status" defaultValue={item.status}><option value="pending">انجام نشده</option><option value="in_progress">در حال انجام</option><option value="completed">انجام شد</option></select><input name="actual_minutes" type="number" min="0" defaultValue={item.actual_minutes} aria-label="زمان واقعی"/><input name="test_count" type="number" min="0" defaultValue={item.test_count} aria-label="تعداد تست"/></div><input name="note" defaultValue={item.note} placeholder="یادداشت عملکرد..."/><button className="small-primary" disabled={update.isPending}><Save/> ثبت عملکرد</button></form>)}</section>)}</div></>}</div>
}

export function ProgressPage({studentId}:{studentId?:string}){
  const path=studentId?`/advisors/students/${studentId}/report`:'/students/report';const {data,isLoading,error}=useQuery({queryKey:['report',studentId],queryFn:()=>api<ReportData&{student?:User;profile?:Record<string,string>}>(path)})
  if(isLoading)return <State/>;if(error)return <ErrorBox error={error}/>;if(!data)return null
  return <div className="content-page"><PageHead title={data.student?`گزارش ${data.student.full_name}`:'گزارش پیشرفت'} subtitle="مقایسه برنامه‌ریزی و عملکرد واقعی"/><div className="summary-cards"><article><TrendingUp/><span>اجرای برنامه</span><b>{data.summary.progress}٪</b></article><article><Clock3/><span>مطالعه واقعی</span><b>{data.summary.actual_minutes} دقیقه</b></article><article><BookOpen/><span>تعداد تست</span><b>{data.summary.test_count}</b></article><article><CheckCircle2/><span>فعالیت کامل</span><b>{data.summary.completed} از {data.summary.total}</b></article></div><div className="two-col"><section className="panel"><h2>عملکرد درسی</h2><div className="subject-bars">{data.subjects.map(s=><div key={s.subject}><p><b>{s.subject}</b><span>{s.actual_minutes} از {s.planned_minutes} دقیقه · {s.tests} تست</span></p><i><b style={{width:`${Math.min(100,s.planned_minutes?s.actual_minutes/s.planned_minutes*100:0)}%`}}/></i></div>)}</div></section><section className="panel"><h2>نتایج آزمون‌ها</h2>{data.results.length?data.results.map(r=><div className="result-row" key={r.id}><div><b>{r.title}</b><small>{r.correct} درست · {r.wrong} غلط</small></div><strong>{r.score}٪</strong></div>):<State text="نتیجه آزمونی ثبت نشده است."/>}</section><section className="panel span-2"><h2>فعالیت‌های اخیر</h2><div className="report-table">{data.activities.slice(-12).reverse().map(a=><div key={a.id}><span>{a.day}، {a.start_time}</span><b>{a.title}</b><span>{a.actual_minutes}/{a.planned_minutes} دقیقه</span><em className={a.status}>{a.status==='completed'?'انجام شد':a.status==='in_progress'?'در حال انجام':'انجام نشده'}</em></div>)}</div></section></div></div>
}

export function SettingsPageLegacy(){
  const qc=useQueryClient();const {data,isLoading,error}=useQuery({queryKey:['profile'],queryFn:()=>api<Profile>('/profile')});const save=useMutation({mutationFn:(form:FormData)=>api('/profile',{method:'PATCH',body:JSON.stringify(Object.fromEntries(form))}),onSuccess:()=>{qc.invalidateQueries({queryKey:['profile']});qc.invalidateQueries({queryKey:['me']})}})
  if(isLoading)return <State/>;if(error||!data)return <ErrorBox error={error}/>
  return <div className="content-page narrow"><PageHead title="تنظیمات" subtitle="اطلاعات حساب و پروفایل تحصیلی"/><form className="settings-form panel" onSubmit={e=>{e.preventDefault();save.mutate(new FormData(e.currentTarget))}}><label>نام و نام خانوادگی<input name="full_name" defaultValue={data.full_name} required/></label><label>شماره ورود<input value={data.phone} disabled/></label>{data.role==='student'&&<><label>پایه<input name="grade" defaultValue={data.grade}/></label><label>رشته<input name="major" defaultValue={data.major}/></label><label>مدرسه<input name="school" defaultValue={data.school}/></label><label className="full">هدف تحصیلی<textarea name="goal" defaultValue={data.goal}/></label></>}<button className="btn btn-primary" disabled={save.isPending}><Save/> ذخیره تغییرات</button>{save.isSuccess&&<span className="success-note">تغییرات ذخیره شد.</span>}</form></div>
}

export function SettingsPage({user:_user}:{user?:User}={}){
  const qc=useQueryClient(),[schedule,setSchedule]=useState<Record<string,string[]>>({}),[extras,setExtras]=useState<Record<string,string>>({}),[advisorLevels,setAdvisorLevels]=useState<string[]>([]),[newPhoto,setNewPhoto]=useState<ProfilePhoto>(),[photoError,setPhotoError]=useState('')
  const {data,isLoading,error}=useQuery({queryKey:['profile'],queryFn:()=>api<Profile>('/profile')})
  useEffect(()=>{if(data?.role==='student'){setSchedule(data.school_schedule||{});setExtras(data.extra_classes||{})}if(data?.role==='advisor')setAdvisorLevels(data.work_levels||[data.education_level||'upper_secondary'])},[data])
  const save=useMutation({mutationFn:(body:Record<string,unknown>)=>api('/profile',{method:'PATCH',body:JSON.stringify(body)}),onSuccess:()=>{setNewPhoto(undefined);qc.invalidateQueries({queryKey:['profile']});qc.invalidateQueries({queryKey:['me']})}})
  if(isLoading)return <State/>;if(error||!data)return <ErrorBox error={error}/>
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget),body:Record<string,unknown>={full_name:form.get('full_name'),profile_photo:newPhoto}
    if(data.role==='student')Object.assign(body,{grade:form.get('grade'),major:form.get('major'),school:form.get('school'),goal:form.get('goal'),average_grade9:form.get('average_grade9')?Number(form.get('average_grade9')):null,average_grade10:form.get('average_grade10')?Number(form.get('average_grade10')):null,average_grade11:form.get('average_grade11')?Number(form.get('average_grade11')):null,average_grade12:form.get('average_grade12')?Number(form.get('average_grade12')):null,school_schedule:schedule,extra_classes:extras})
    if(data.role==='advisor')Object.assign(body,{work_levels:advisorLevels,education_degree:form.get('education_degree'),education_field:form.get('education_field'),experience_years:Number(form.get('experience_years')),support_capacity:Number(form.get('support_capacity')),academic_year:form.get('academic_year'),bio:form.get('bio')})
    save.mutate(body)}
  const displayedPhoto=newPhoto||data.pending_profile_photo||data.profile_photo
  return <div className="content-page"><PageHead title="تنظیمات" subtitle={data.role==='advisor'?'اطلاعات حرفه‌ای و ظرفیت پذیرش سال تحصیلی':'اطلاعات حساب، سوابق و برنامه مدرسه'}/><form className="settings-form panel expanded" onSubmit={submit}><div className="settings-photo full"><div className={'profile-photo-preview '+(data.profile_photo_pending&&!newPhoto?'pending':'')}>{displayedPhoto?<img src={photoUrl(displayedPhoto)} alt="عکس پرسنلی"/>:<UserRound/>}</div><div><b>عکس پرسنلی</b><p>عکس جدید پس از تأیید مدیر جایگزین عکس فعلی می‌شود.</p>{data.profile_photo_pending&&!newPhoto&&<small>این عکس در انتظار بررسی مدیر است و پس از تأیید در پروفایل نمایش داده می‌شود.</small>}<label className="btn btn-outline"><Camera/> {newPhoto||data.profile_photo_pending?'انتخاب عکس دیگر':'تغییر عکس'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setPhotoError('');try{setNewPhoto(await prepareProfilePhoto(file))}catch(error){setPhotoError(error instanceof Error?error.message:'عکس معتبر نیست')}e.target.value=''}}/></label>{photoError&&<em>{photoError}</em>}</div></div><label>نام و نام خانوادگی<input name="full_name" defaultValue={data.full_name} required/></label><label>شماره ورود<input value={data.phone} disabled/></label>
    {data.role==='student'&&<><label>پایه<select name="grade" defaultValue={data.grade}><option>دهم</option><option>یازدهم</option><option>دوازدهم</option><option>پشت کنکوری</option></select></label><label>رشته<input name="major" defaultValue={data.major}/></label><label>مدرسه<input name="school" defaultValue={data.school}/></label><label className="full">هدف تحصیلی<textarea name="goal" defaultValue={data.goal}/></label><div className="settings-averages full">{[['average_grade9','معدل نهم'],['average_grade10','معدل دهم'],['average_grade11','معدل یازدهم'],['average_grade12','معدل دوازدهم']].map(([name,label])=><label key={name}>{label}<input name={name} type="number" min="0" max="20" step=".01" defaultValue={String(data[name as keyof Profile]??'')}/></label>)}</div><div className="school-settings full"><h3>برنامه مدرسه و کلاس‌های فوق‌العاده</h3>{days.slice(0,5).map(day=>{const periods=schedule[day]||['','','',''];return <section key={day}><b>{day}</b>{periods.map((value,index)=><input key={index} value={value} placeholder={`زنگ ${index+1}`} onChange={e=>setSchedule({...schedule,[day]:periods.map((item,i)=>i===index?e.target.value:item)})}/>)}<textarea value={extras[day]||''} placeholder="کلاس فوق‌العاده یا توضیحات" onChange={e=>setExtras({...extras,[day]:e.target.value})}/></section>})}</div></>}
    {data.role==='advisor'&&<><div className="work-levels full"><span>مقطع کاری</span><label><input type="checkbox" checked={advisorLevels.includes('lower_secondary')} onChange={e=>setAdvisorLevels(e.target.checked?[...advisorLevels,'lower_secondary']:advisorLevels.filter(level=>level!=='lower_secondary'))}/> متوسطه اول <small>پایه‌های هفتم، هشتم و نهم</small></label><label><input type="checkbox" checked={advisorLevels.includes('upper_secondary')} onChange={e=>setAdvisorLevels(e.target.checked?[...advisorLevels,'upper_secondary']:advisorLevels.filter(level=>level!=='upper_secondary'))}/> متوسطه دوم <small>پایه‌های دهم، یازدهم و دوازدهم</small></label>{advisorLevels.length===0&&<small>حداقل یک مقطع را انتخاب کنید.</small>}</div><label>مدرک تحصیلی<input name="education_degree" defaultValue={data.education_degree}/></label><label>رشته تحصیلی<input name="education_field" defaultValue={data.education_field}/></label><label>سابقه کاری (سال)<input name="experience_years" type="number" min="0" defaultValue={data.experience_years}/></label><label>ظرفیت سال تحصیلی<input name="support_capacity" type="number" min={data.assigned_students||1} max="500" defaultValue={data.support_capacity}/><small>{data.assigned_students||0} دانش‌آموز فعال؛ {data.remaining_capacity||0} ظرفیت باقی‌مانده</small></label><label>سال تحصیلی<input name="academic_year" defaultValue={data.academic_year}/></label><label className="full">معرفی و سوابق<textarea name="bio" defaultValue={data.bio}/></label></>}
    <button className="btn btn-primary" disabled={save.isPending||(data.role==='advisor'&&advisorLevels.length===0)}><Save/> ذخیره تغییرات</button>{save.isSuccess&&<span className="success-note">تغییرات ذخیره شد.</span>}{save.error&&<ErrorBox error={save.error}/>}</form><PasswordChange/></div>
}

export function ChatPanel({counterpart,currentUser}:{counterpart:User;currentUser:User}){
  const qc=useQueryClient();const {data=[],isLoading,error}=useQuery({queryKey:['messages',counterpart.id],queryFn:()=>api<Message[]>(`/messages?counterpart_id=${counterpart.id}`),refetchInterval:5000})
  useEffect(()=>{if(data.length)api(`/messages/${counterpart.id}/read`,{method:'POST'}).then(()=>{qc.invalidateQueries({queryKey:['messages',counterpart.id]});qc.invalidateQueries({queryKey:['notification-summary']});qc.invalidateQueries({queryKey:['notifications']})}).catch(()=>{})},[data.length,counterpart.id,qc])
  const send=useMutation({mutationFn:(body:string)=>api('/messages',{method:'POST',body:JSON.stringify({recipient_id:counterpart.id,body})}),onSuccess:()=>qc.invalidateQueries({queryKey:['messages',counterpart.id]})})
  if(isLoading)return <State/>;if(error)return <ErrorBox error={error}/>
  return <div className="chat-shell"><header><span className="avatar">{counterpart.full_name[0]}</span><div><b>{counterpart.full_name}</b><small>{counterpart.role==='advisor'?'مشاور شما':'دانش‌آموز'}</small></div><i>به‌روزرسانی خودکار</i></header><div className="message-list">{!data.length&&<State text="هنوز پیامی ردوبدل نشده است."/>}{data.map(m=><article key={m.id} className={m.sender_id===currentUser.id?'mine':''}><p>{m.body}</p><small>{fmt(m.created_at)} {m.sender_id===currentUser.id&&(m.read_at?'· خوانده شد':'· ارسال شد')}</small></article>)}</div><form onSubmit={e=>{e.preventDefault();const input=e.currentTarget.elements.namedItem('message') as HTMLInputElement;if(input.value.trim()){send.mutate(input.value.trim());input.value=''}}}><input name="message" maxLength={3000} autoComplete="off" placeholder="پیام خود را بنویسید..."/><button disabled={send.isPending}><Send/></button></form></div>
}

export function StudentChatPage({user}:{user:User}){const {data,isLoading,error}=useQuery({queryKey:['my-advisor'],queryFn:()=>api<User|null>('/students/advisor')});if(isLoading)return <State/>;if(error)return <ErrorBox error={error}/>;return <div className="content-page narrow"><PageHead title="گفت‌وگو با مشاور" subtitle="ارتباط مستقیم با مشاور اختصاصی"/>{data?<ChatPanel counterpart={data} currentUser={user}/>:<State text="هنوز مشاوری به شما تخصیص داده نشده است."/>}</div>}

type ExamRun={session_id:string;duration_minutes:number;questions:{id:string;text:string;options:string[]}[]}
export function ExamsPage(){
  const qc=useQueryClient();const [run,setRun]=useState<ExamRun>();const [answers,setAnswers]=useState<Record<string,number>>({});const [left,setLeft]=useState(0);const {data,isLoading,error}=useQuery({queryKey:['exams'],queryFn:()=>api<ExamListItem[]>('/exams')})
  useEffect(()=>{if(!run)return;setLeft(run.duration_minutes*60);const timer=setInterval(()=>setLeft(v=>Math.max(0,v-1)),1000);return()=>clearInterval(timer)},[run])
  const start=useMutation({mutationFn:(id:string)=>api<ExamRun>(`/exam-sessions/${id}/start`,{method:'POST'}),onSuccess:r=>setRun(r)})
  const submit=useMutation({mutationFn:async()=>{if(!run)return;for(const [question_id,selected_index] of Object.entries(answers))await api(`/exam-sessions/${run.session_id}/answers`,{method:'PUT',body:JSON.stringify({question_id,selected_index,elapsed_seconds:0,client_version:1,idempotency_key:crypto.randomUUID()})});return api(`/exam-sessions/${run.session_id}/submit`,{method:'POST'})},onSuccess:()=>{setRun(undefined);setAnswers({});qc.invalidateQueries({queryKey:['exams']})}})
  if(isLoading)return <State/>;if(error)return <ErrorBox error={error}/>
  if(run)return <div className="content-page exam-run"><div className="exam-top"><PageHead title="در حال برگزاری آزمون" subtitle={`${run.questions.length} سؤال`}/><b><Clock3/>{Math.floor(left/60).toString().padStart(2,'0')}:{(left%60).toString().padStart(2,'0')}</b></div>{run.questions.map((q,i)=><section className="question-card" key={q.id}><h3>{i+1}. {q.text}</h3>{q.options.map((o,j)=><label key={j} className={answers[q.id]===j?'chosen':''}><input type="radio" name={q.id} onChange={()=>setAnswers(a=>({...a,[q.id]:j}))}/>{o}</label>)}</section>)}<button className="btn btn-primary" disabled={submit.isPending} onClick={()=>submit.mutate()}>ثبت و پایان آزمون</button></div>
  return <div className="content-page"><StudentAssignedExamsPage/><PageHead title="آزمون‌های آنلاین" subtitle="آزمون‌های فعال و نتایج ثبت‌شده"/><div className="exam-grid">{data?.map(exam=><article className="panel" key={exam.id}><BookOpen/><div><h2>{exam.title}</h2><p>{exam.question_count} سؤال · {exam.duration_minutes} دقیقه</p></div>{exam.session?.status==='submitted'?<strong className="exam-score">{exam.session.score}٪</strong>:<button className="small-primary" onClick={()=>start.mutate(exam.id)}>شروع آزمون</button>}</article>)}</div></div>
}

type AdvisorStudent=User&{risk:string;progress:number;last_activity?:string;last_message?:string;last_message_at?:string}
export function AdvisorStudentsPage(){const nav=useNavigate();const [search,setSearch]=useState('');const {data,isLoading,error}=useQuery({queryKey:['advisor-dashboard'],queryFn:()=>api<{students:AdvisorStudent[]}>('/advisors/dashboard')});const {data:alerts}=useQuery({queryKey:['notification-summary'],queryFn:()=>api<{expired_student_ids:string[]}>('/notifications/summary'),refetchInterval:5000});const rows=useMemo(()=>data?.students.filter(s=>s.full_name.includes(search))||[],[data,search]);if(isLoading)return <State/>;if(error)return <ErrorBox error={error}/>;return <div className="content-page"><PageHead title="دانش‌آموزان" subtitle="پرونده، عملکرد، برنامه و پیام‌های دانش‌آموزان شما"/><div className="list-search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجوی نام دانش‌آموز..."/></div><div className="student-cards">{rows.map(s=><button key={s.id} onClick={()=>nav(`/app/advisor/students/${s.id}/report`)}><span className="avatar">{s.full_name[0]}</span><div><b>{s.full_name}{alerts?.expired_student_ids.includes(s.id)&&<i className="inline-alert-dot"/>}</b><small>{alerts?.expired_student_ids.includes(s.id)?'برنامه تمام شده؛ نیازمند برنامه جدید':s.last_activity||'بدون فعالیت اخیر'}</small><p>{s.last_message||'بدون پیام اخیر'}</p></div><em className={s.risk==='بالا'?'high':''}>{s.risk}</em><strong>{s.progress}٪</strong></button>)}</div></div>}

type DraftActivity={day:string;subject:string;title:string;start_time:string;end_time:string}
function LegacyPlanBuilder({studentId}:{studentId:string}){const qc=useQueryClient();const [title,setTitle]=useState('برنامه هفتگی');const [week,setWeek]=useState('هفته جاری');const [items,setItems]=useState<DraftActivity[]>([{day:'شنبه',subject:'',title:'',start_time:'08:00',end_time:'09:00'}]);const {data}=useQuery({queryKey:['plans','advisor'],queryFn:()=>api<WeeklyPlan[]>('/plans')});const create=useMutation({mutationFn:async()=>{const plan=await api<{id:string}>('/plans',{method:'POST',body:JSON.stringify({student_id:studentId,title,week_label:week,activities:items})});await api(`/plans/${plan.id}/publish`,{method:'POST'});return plan},onSuccess:()=>qc.invalidateQueries({queryKey:['plans','advisor']})});const update=(i:number,key:keyof DraftActivity,value:string)=>setItems(all=>all.map((x,n)=>n===i?{...x,[key]:value}:x));return <div className="planner"><div className="planner-meta"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان برنامه"/><input value={week} onChange={e=>setWeek(e.target.value)} placeholder="بازه هفته"/></div>{items.map((item,i)=><div className="planner-row" key={i}><select value={item.day} onChange={e=>update(i,'day',e.target.value)}>{days.map(d=><option key={d}>{d}</option>)}</select><input type="time" step="900" value={item.start_time} onChange={e=>update(i,'start_time',e.target.value)}/><input type="time" step="900" value={item.end_time} onChange={e=>update(i,'end_time',e.target.value)}/><input value={item.subject} onChange={e=>update(i,'subject',e.target.value)} placeholder="درس"/><input value={item.title} onChange={e=>update(i,'title',e.target.value)} placeholder="عنوان فعالیت"/><button onClick={()=>setItems(a=>a.filter((_,n)=>n!==i))}><Trash2/></button></div>)}<div className="planner-actions"><button className="small-secondary" onClick={()=>setItems(a=>[...a,{day:'شنبه',subject:'',title:'',start_time:'08:00',end_time:'09:00'}])}><Plus/> افزودن بازه</button><button className="btn btn-primary" disabled={create.isPending||items.some(x=>!x.subject||!x.title)} onClick={()=>create.mutate()}><Save/> ذخیره و انتشار</button></div>{create.error&&<ErrorBox error={create.error}/>}<h2>نسخه‌های قبلی</h2>{data?.filter(p=>p.student_id===studentId).map(p=><div className="version-row" key={p.id}><b>{p.title}</b><span>{p.week_label} · نسخه {p.version}</span><em>{p.status==='published'?'منتشرشده':'پیش‌نویس'}</em></div>)}</div>}

export function StudentFilePage({user,studentId,tab}:{user:User;studentId:string;tab:string}){
 const nav=useNavigate()
 const {data,isLoading,error}=useQuery({queryKey:['student-file',studentId],queryFn:()=>api<ReportData&{student:User}>(`/advisors/students/${studentId}/report`)})
 if(isLoading)return <State/>
 if(error||!data)return <ErrorBox error={error}/>
 const tabs=[['report','گزارش عملکرد'],['plan','برنامه هفتگی'],['study-reports','گزارش کار برنامه'],['exams','آزمون‌ها'],['chat','گفت‌وگو'],['evaluation','ارزیابی مشاور از دانش‌آموز'],['books','کتاب‌ها']]
 return <div className="content-page"><PageHead back={()=>nav('/app/advisor/students')} title={data.student.full_name} subtitle="پرونده اختصاصی دانش‌آموز"/>
  <div className="file-tabs">{tabs.map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>nav(`/app/advisor/students/${studentId}/${key}`)}>{label}</button>)}</div>
  {tab==='report'?<ProgressPage studentId={studentId}/>:tab==='plan'?<AdvisorPlanWorkspace key={studentId} studentId={studentId} studentName={data.student.full_name} advisorName={user.full_name}/>:tab==='study-reports'?<AdvisorPlanArchive key={studentId} studentId={studentId} studentName={data.student.full_name} advisorName={user.full_name} reports/>:tab==='books'?<BooksPage mode="advisor" studentId={studentId}/>:tab==='evaluation'?<AdvisorEvaluationPage key={studentId} studentId={studentId}/>:tab==='exams'?<AdvisorAssignedExamsPage studentId={studentId}/>:<ChatPanel counterpart={data.student} currentUser={user}/>}
 </div>
}

export function AdvisorPlanWorkspace({studentId,studentName,advisorName}:{studentId:string;studentName:string;advisorName:string}){
 const [section,setSection]=useState<'new'|'history'|null>(null)
 const [started,setStarted]=useState(false)
 return <div className="advisor-plan-workspace">
  <div className="advisor-plan-choices">
   <button className="advisor-plan-choice" aria-expanded={section==='new'} aria-controls="advisor-new-plan" onClick={()=>{setStarted(true);setSection(section==='new'?null:'new')}}><Plus/><span>نوشتن برنامه جدید</span></button>
   <button className="advisor-plan-choice" aria-expanded={section==='history'} aria-controls="advisor-plan-history" onClick={()=>setSection(section==='history'?null:'history')}><BookOpen/><span>نسخه‌های قبلی برنامه</span></button>
  </div>
  <div className="advisor-plan-section" id="advisor-new-plan" hidden={section!=='new'}>{started&&<PlanBuilder studentId={studentId}/>}</div>
  {section==='history'&&<div className="advisor-plan-section" id="advisor-plan-history"><AdvisorPlanArchive studentId={studentId} studentName={studentName} advisorName={advisorName} renderPlan={plan=><ReadOnlyPlanTable plan={plan} studentName={studentName} advisorName={advisorName}/>}/></div>}
 </div>
}

export function AdvisorMessagesPage({user}:{user:User}){const [selected,setSelected]=useState<User>();const {data,isLoading,error}=useQuery({queryKey:['advisor-dashboard'],queryFn:()=>api<{students:AdvisorStudent[]}>('/advisors/dashboard')});const {data:alerts}=useQuery({queryKey:['notification-summary'],queryFn:()=>api<{unread_by_sender:Record<string,number>}>('/notifications/summary'),refetchInterval:5000});if(isLoading)return <State/>;if(error)return <ErrorBox error={error}/>;return <div className="content-page"><PageHead title="پیام‌ها" subtitle="گفت‌وگوهای شما با دانش‌آموزان"/><div className="messages-layout"><aside>{data?.students.map(s=><button className={selected?.id===s.id?'active':''} onClick={()=>setSelected(s)} key={s.id}><span className="avatar">{s.full_name[0]}</span><div><b>{s.full_name}</b><small>{s.last_message||'شروع گفت‌وگو'}</small></div>{!!alerts?.unread_by_sender[s.id]&&<i className="conversation-alert-dot"/>}</button>)}</aside><main>{selected?<ChatPanel counterpart={selected} currentUser={user}/>:<State text="یک دانش‌آموز را برای گفت‌وگو انتخاب کنید."/>}</main></div></div>}

type TableDay={id:string;label:string;date:string}
type TableSlot={id:string;start:string;end:string}

const defaultTableDays=()=>days.map(label=>({id:crypto.randomUUID(),label,date:''}))
const defaultTableSlots=()=>[['08:00','10:00'],['10:00','12:00'],['12:00','14:00'],['14:00','16:00'],['16:00','18:00'],['18:00','20:00']].map(([start,end])=>({id:crypto.randomUUID(),start,end}))
const cellKey=(dayId:string,slotId:string)=>`${dayId}|${slotId}`
const activityAt=(plan:WeeklyPlan,day:string,start:string,end:string)=>plan.activities.find(item=>item.day===day&&item.start_time===start&&item.end_time===end)

function LegacyReadOnlyPlanTable({plan,onUpdate,updating=false,tableRef}:{plan:WeeklyPlan;onUpdate?:(item:PlanActivity,form:FormData)=>void;updating?:boolean;tableRef?:{current:HTMLDivElement|null}}){
  return <div className="plan-table-document" ref={tableRef} dir="rtl">
    <div className="plan-document-head"><div><h2>{plan.title}</h2><p>{plan.week_label} · نسخه {plan.version}</p></div><span>مسیر هوشمند</span></div>
    <div className="schedule-table-scroll"><table className="schedule-grid readonly-grid"><thead><tr><th className="day-column">روز و تاریخ</th>{plan.time_slots.map(slot=><th key={`${slot.start}-${slot.end}`}><b>{slot.start}</b><span>تا {slot.end}</span></th>)}</tr></thead><tbody>{plan.days.map(day=><tr key={day.label}><th className="day-column"><b>{day.label}</b><span>{day.date||'بدون تاریخ'}</span></th>{plan.time_slots.map(slot=>{const item=activityAt(plan,day.label,slot.start,slot.end);return <td key={`${day.label}-${slot.start}`} className={item?'filled':''}>{item?<><p>{item.title}</p>{onUpdate&&<details data-html2canvas-ignore="true"><summary>{item.status==='completed'?'انجام شد':'ثبت عملکرد'}</summary><form onSubmit={event=>{event.preventDefault();onUpdate(item,new FormData(event.currentTarget))}}><select name="status" defaultValue={item.status}><option value="pending">انجام نشده</option><option value="in_progress">در حال انجام</option><option value="completed">انجام شد</option></select><input name="actual_minutes" type="number" min="0" defaultValue={item.actual_minutes} placeholder="دقیقه واقعی"/><input name="test_count" type="number" min="0" defaultValue={item.test_count} placeholder="تعداد تست"/><input name="note" defaultValue={item.note} placeholder="یادداشت"/><button disabled={updating}><Save/> ذخیره</button></form></details>}</>:<span className="empty-cell">—</span>}</td>})}</tr>)}</tbody></table></div>
  </div>
}

export function StudentPlanPage(){
  const qc=useQueryClient(),tableRef=useRef<HTMLDivElement|null>(null)
  const [selectedId,setSelectedId]=useState(''),[exporting,setExporting]=useState(false)
  const {data=[],isLoading,error}=useQuery({queryKey:['plans'],queryFn:()=>api<WeeklyPlan[]>('/plans')})
  useEffect(()=>{if(data.length&&!selectedId)setSelectedId(data[0].id)},[data,selectedId])
  const {data:studentProfile}=useQuery({queryKey:['profile'],queryFn:()=>api<Profile>('/profile')})
  const {data:advisor}=useQuery({queryKey:['my-advisor'],queryFn:()=>api<User|null>('/students/advisor')})
  const selected=data.find(plan=>plan.id===selectedId)||data[0]
  useEffect(()=>{if(selected)api(`/plans/${selected.id}/view`,{method:'POST'}).then(()=>{qc.invalidateQueries({queryKey:['notification-summary']});qc.invalidateQueries({queryKey:['notifications']})}).catch(()=>{})},[selected?.id,qc])
  const download=async(colored=false)=>{if(!selected||!tableRef.current)return;setExporting(true);try{await exportPlanPdf(tableRef.current,selected,colored)}finally{setExporting(false)}}
  if(isLoading)return <State/>;if(error)return <ErrorBox error={error}/>
  return <div className="content-page"><PageHead title="برنامه من" subtitle="برنامه‌های هفتگی منتشرشده و آرشیو هفته‌های گذشته"/>{!selected?<State text="هنوز برنامه‌ای برای شما منتشر نشده است."/>:<><div className="plan-toolbar"><label>انتخاب هفته<select value={selected.id} onChange={event=>setSelectedId(event.target.value)}>{data.map(plan=><option value={plan.id} key={plan.id}>{plan.week_label} - نسخه {plan.version}</option>)}</select></label><button className="btn btn-primary" disabled={exporting} onClick={()=>void download()}><Download/>{exporting?'در حال ساخت PDF...':'دانلود PDF · نسخه ساده'}</button><button className="btn btn-outline" disabled={exporting} onClick={()=>void download(true)}><Download/>دانلود PDF · نسخه رنگی</button></div><StudyReportPlan key={selected.id} plan={selected} student studentName={studentProfile?.full_name||'—'} advisorName={advisor?.full_name||'—'} tableRef={tableRef}/></>}</div>
}

function addMinutes(time:string,minutes:number){const [hour,minute]=time.split(':').map(Number);const total=Math.min(23*60+45,hour*60+minute+minutes);return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}

function LegacyDatedPlanBuilder({studentId}:{studentId:string}){
  const qc=useQueryClient();const [title,setTitle]=useState('برنامه هفتگی'),[week,setWeek]=useState('هفته جاری')
  const [tableDays,setTableDays]=useState<TableDay[]>(defaultTableDays),[slots,setSlots]=useState<TableSlot[]>(defaultTableSlots),[cells,setCells]=useState<Record<string,string>>({}),[dragged,setDragged]=useState<number|null>(null)
  const {data=[]}=useQuery({queryKey:['plans','advisor'],queryFn:()=>api<WeeklyPlan[]>('/plans')})
  const moveDay=(from:number,to:number)=>{if(to<0||to>=tableDays.length)return;setTableDays(current=>{const next=[...current];const [row]=next.splice(from,1);next.splice(to,0,row);return next})}
  const updateSlot=(id:string,key:'start'|'end',value:string)=>setSlots(current=>current.map(slot=>slot.id===id?{...slot,[key]:value}:slot))
  const addSlot=()=>setSlots(current=>{const start=current.at(-1)?.end||'08:00';return [...current,{id:crypto.randomUUID(),start,end:addMinutes(start,60)}]})
  const create=useMutation({mutationFn:async()=>{
    const activities=tableDays.flatMap(day=>slots.flatMap(slot=>{const text=cells[cellKey(day.id,slot.id)]?.trim();return text?[{day:day.label,subject:'برنامه',title:text,start_time:slot.start,end_time:slot.end}]:[]}))
    const plan=await api<{id:string}>('/plans',{method:'POST',body:JSON.stringify({student_id:studentId,title,week_label:week,days:tableDays.map(({label,date})=>({label,date})),time_slots:slots.map(({start,end})=>({start,end})),activities})})
    await api(`/plans/${plan.id}/publish`,{method:'POST'});return plan
  },onSuccess:()=>qc.invalidateQueries({queryKey:['plans','advisor']})})
  return <div className="table-planner"><div className="planner-meta"><label>عنوان برنامه<input value={title} onChange={event=>setTitle(event.target.value)}/></label><label>عنوان یا بازه هفته<input value={week} onChange={event=>setWeek(event.target.value)}/></label></div><div className="table-planner-hint"><p>روزها را با کشیدن ردیف یا فلش‌ها جابه‌جا کنید و داخل هر خانه توضیحات برنامه را بنویسید.</p><button className="small-secondary" onClick={addSlot}><Plus/> افزودن بازه زمانی</button></div><div className="schedule-table-scroll"><table className="schedule-grid editor-grid"><thead><tr><th className="day-column">روز و تاریخ</th>{slots.map(slot=><th key={slot.id}><input type="time" step="900" value={slot.start} onChange={event=>updateSlot(slot.id,'start',event.target.value)}/><span>تا</span><input type="time" step="900" value={slot.end} onChange={event=>updateSlot(slot.id,'end',event.target.value)}/><button aria-label="حذف بازه" disabled={slots.length===1} onClick={()=>setSlots(current=>current.filter(item=>item.id!==slot.id))}><Trash2/></button></th>)}</tr></thead><tbody>{tableDays.map((day,index)=><tr key={day.id} draggable onDragStart={()=>setDragged(index)} onDragOver={event=>event.preventDefault()} onDrop={()=>{if(dragged!==null)moveDay(dragged,index);setDragged(null)}}><th className="day-column"><div className="day-order"><button onClick={()=>moveDay(index,index-1)} disabled={index===0}><ArrowUp/></button><button onClick={()=>moveDay(index,index+1)} disabled={index===tableDays.length-1}><ArrowDown/></button></div><b>{day.label}</b><input type="date" value={day.date} onChange={event=>setTableDays(current=>current.map(item=>item.id===day.id?{...item,date:event.target.value}:item))}/></th>{slots.map(slot=><td key={slot.id}><textarea value={cells[cellKey(day.id,slot.id)]||''} onChange={event=>setCells(current=>({...current,[cellKey(day.id,slot.id)]:event.target.value}))} placeholder="توضیحات برنامه..."/></td>)}</tr>)}</tbody></table></div><div className="planner-actions"><span>{slots.length} بازه زمانی · {tableDays.length} روز</span><button className="btn btn-primary" disabled={create.isPending||!Object.values(cells).some(value=>value.trim())} onClick={()=>create.mutate()}><Save/> ذخیره و انتشار جدول</button></div>{create.isSuccess&&<div className="success-note">جدول برنامه با موفقیت منتشر شد.</div>}{create.error&&<ErrorBox error={create.error}/>}<h2>نسخه‌های قبلی</h2>{data.filter(plan=>plan.student_id===studentId).map(plan=><div className="version-row" key={plan.id}><b>{plan.title}</b><span>{plan.week_label} · نسخه {plan.version}</span><em>{plan.status==='published'?'منتشرشده':'پیش‌نویس'}</em></div>)}</div>
}

type JalaliSelection={year:number;month:number;day:number}
const persianMonths=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']
const jsWeekdays=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه']
const faDigits=(value:string|number)=>String(value).replace(/\d/g,digit=>'۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
const padDate=(value:number)=>String(value).padStart(2,'0')
const initialJalali=():JalaliSelection=>{const value=toJalaali(new Date());return {year:value.jy,month:value.jm,day:value.jd}}
export const buildJalaliWeek=(start:JalaliSelection):TableDay[]=>{const first=jalaaliToDateObject(start.year,start.month,start.day);return Array.from({length:7},(_,index)=>{const date=new Date(first);date.setDate(first.getDate()+index);const jalali=toJalaali(date);return {id:`day-${index}`,label:jsWeekdays[date.getDay()],date:faDigits(`${jalali.jy}/${padDate(jalali.jm)}/${padDate(jalali.jd)}`)}})}

function PersianDateSelector({value,onChange}:{value:JalaliSelection;onChange:(value:JalaliSelection)=>void}){
  const update=(key:keyof JalaliSelection,nextValue:number)=>{const next={...value,[key]:nextValue};next.day=Math.min(next.day,jalaaliMonthLength(next.year,next.month));onChange(next)}
  return <div className="persian-date-selector" aria-label="تاریخ شمسی شروع برنامه"><label>سال<select value={value.year} onChange={event=>update('year',Number(event.target.value))}>{Array.from({length:31},(_,index)=>1395+index).map(year=><option value={year} key={year}>{faDigits(year)}</option>)}</select></label><label>ماه<select value={value.month} onChange={event=>update('month',Number(event.target.value))}>{persianMonths.map((month,index)=><option value={index+1} key={month}>{month}</option>)}</select></label><label>روز<select value={value.day} onChange={event=>update('day',Number(event.target.value))}>{Array.from({length:jalaaliMonthLength(value.year,value.month)},(_,index)=>index+1).map(day=><option value={day} key={day}>{faDigits(day)}</option>)}</select></label></div>
}

function LegacyGridPlanBuilder({studentId}:{studentId:string}){
  const qc=useQueryClient();const [title,setTitle]=useState('برنامه هفتگی'),[week,setWeek]=useState('')
  const [startDate,setStartDate]=useState<JalaliSelection>(initialJalali),[slots,setSlots]=useState<TableSlot[]>(defaultTableSlots),[cells,setCells]=useState<Record<string,string>>({})
  const tableDays=useMemo(()=>buildJalaliWeek(startDate),[startDate])
  useEffect(()=>setWeek(`از ${tableDays[0].date} تا ${tableDays[6].date}`),[tableDays])
  const {data=[]}=useQuery({queryKey:['plans','advisor'],queryFn:()=>api<WeeklyPlan[]>('/plans')})
  const updateSlot=(id:string,key:'start'|'end',value:string)=>setSlots(current=>current.map(slot=>slot.id===id?{...slot,[key]:value}:slot))
  const addSlot=()=>setSlots(current=>{const start=current.at(-1)?.end||'08:00';return [...current,{id:crypto.randomUUID(),start,end:addMinutes(start,60)}]})
  const create=useMutation({mutationFn:async()=>{
    const activities=tableDays.flatMap(day=>slots.flatMap(slot=>{const text=cells[cellKey(day.id,slot.id)]?.trim();return text?[{day:day.label,subject:'برنامه',title:text,start_time:slot.start,end_time:slot.end}]:[]}))
    const plan=await api<{id:string}>('/plans',{method:'POST',body:JSON.stringify({student_id:studentId,title,week_label:week,days:tableDays.map(({label,date})=>({label,date})),time_slots:slots.map(({start,end})=>({start,end})),activities})})
    await api(`/plans/${plan.id}/publish`,{method:'POST'});return plan
  },onSuccess:()=>qc.invalidateQueries({queryKey:['plans','advisor']})})
  return <div className="table-planner"><div className="planner-meta"><label>عنوان برنامه<input value={title} onChange={event=>setTitle(event.target.value)}/></label><label>عنوان یا بازه هفته<input value={week} onChange={event=>setWeek(event.target.value)}/></label></div><div className="planner-calendar-row"><div><b>تاریخ شمسی شروع برنامه</b><p>هفت روز جدول بر اساس این تاریخ به‌صورت خودکار تنظیم می‌شوند.</p><PersianDateSelector value={startDate} onChange={setStartDate}/></div><button className="small-secondary" onClick={addSlot}><Plus/> افزودن بازه زمانی</button></div><div className="schedule-table-scroll"><table className="schedule-grid editor-grid"><thead><tr><th className="day-column">روز و تاریخ</th>{slots.map(slot=><th key={slot.id}><input type="time" step="900" value={slot.start} onChange={event=>updateSlot(slot.id,'start',event.target.value)}/><span>تا</span><input type="time" step="900" value={slot.end} onChange={event=>updateSlot(slot.id,'end',event.target.value)}/><button aria-label="حذف بازه" disabled={slots.length===1} onClick={()=>setSlots(current=>current.filter(item=>item.id!==slot.id))}><Trash2/></button></th>)}</tr></thead><tbody>{tableDays.map(day=><tr key={day.id}><th className="day-column"><b>{day.label}</b><span>{day.date}</span></th>{slots.map(slot=><td key={slot.id}><textarea value={cells[cellKey(day.id,slot.id)]||''} onChange={event=>setCells(current=>({...current,[cellKey(day.id,slot.id)]:event.target.value}))} placeholder="توضیحات برنامه..."/></td>)}</tr>)}</tbody></table></div><div className="planner-actions"><span>{slots.length} بازه زمانی · از {tableDays[0].label} تا {tableDays[6].label}</span><button className="btn btn-primary" disabled={create.isPending||!Object.values(cells).some(value=>value.trim())} onClick={()=>create.mutate()}><Save/> ذخیره و انتشار جدول</button></div>{create.isSuccess&&<div className="success-note">جدول برنامه با موفقیت منتشر شد.</div>}{create.error&&<ErrorBox error={create.error}/>}<h2>نسخه‌های قبلی</h2>{data.filter(plan=>plan.student_id===studentId).map(plan=><div className="version-row" key={plan.id}><b>{plan.title}</b><span>{plan.week_label} · نسخه {plan.version}</span><em>{plan.status==='published'?'منتشرشده':'پیش‌نویس'}</em></div>)}</div>
}

type TimelineDraft={id:string;dayId:string;start:string;end:string;title:string;subject?:string;color?:string;book_topic_id?:string;book_question_count?:number}
const normalizeClock=(value:string)=>value.replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
const timeToMinutes=(value:string)=>{const normalized=normalizeClock(value);if(!/^\d{2}:\d{2}$/.test(normalized))return Number.NaN;const [hour,minute]=normalized.split(':').map(Number);if(hour===24&&minute===0)return 1440;if(hour>23||minute>59)return Number.NaN;return hour*60+minute}
const minutesToTime=(value:number)=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
export const timelinePosition=(start:string,end:string,rangeStart:string,rangeEnd:string)=>{const base=timeToMinutes(rangeStart),itemStart=timeToMinutes(start),itemEnd=timeToMinutes(end),total=timeToMinutes(rangeEnd)-base;if(![base,itemStart,itemEnd,total].every(Number.isFinite)||total<=0)return {right:'0%',width:'0%'};return {right:`${(itemStart-base)/total*100}%`,width:`${(itemEnd-itemStart)/total*100}%`}}

function TimeSelect({value,onChange,min=0,max=1440,label}:{value:string;onChange:(value:string)=>void;min?:number;max?:number;label:string}){
  return <TimeFields value={value} onChange={onChange} label={label}/>
}

function TimelineTrack({items,rangeStart,rangeEnd,fit=false,onSelect}:{items:{id:string;start_time:string;end_time:string;title:string;subject?:string;color?:string;book_topic_id?:string;book_question_count?:number}[];rangeStart:string;rangeEnd:string;fit?:boolean;onSelect?:(id:string)=>void}){
  const track=useRef<HTMLDivElement>(null)
  const rangeMinutes=timeToMinutes(rangeEnd)-timeToMinutes(rangeStart)
  const valid=items.filter(item=>Number.isFinite(timeToMinutes(item.start_time))&&Number.isFinite(timeToMinutes(item.end_time))&&timeToMinutes(item.end_time)>timeToMinutes(item.start_time))
  const shortest=Math.min(...valid.map(item=>timeToMinutes(item.end_time)-timeToMinutes(item.start_time)))
  const minWidth=Number.isFinite(shortest)&&rangeMinutes>0?Math.max(850,Math.ceil(rangeMinutes/shortest*150)):850
  const hourWidth=rangeMinutes>0?100/(rangeMinutes/60):100
  const softPositions=fit?softTimelinePositions(valid,rangeStart,rangeEnd):null
  useEffect(()=>{
    const element=track.current;if(!element)return
    if(fit){
      let frame=0
      const resize=()=>{
        cancelAnimationFrame(frame)
        frame=requestAnimationFrame(()=>element.querySelectorAll<HTMLElement>('.timeline-block').forEach(block=>{
          const description=block.querySelector<HTMLElement>('b'),time=block.querySelector<HTMLElement>('small')
          const shrink=(node:HTMLElement|null,minimum:number)=>{
            if(!node)return
            node.style.fontSize=''
            let size=parseFloat(getComputedStyle(node).fontSize),attempts=0
            while(size>minimum&&attempts++<40&&(node.scrollHeight>node.clientHeight+1||node.scrollWidth>node.clientWidth+1)){
              size=Math.max(minimum,size-.5)
              node.style.fontSize=size+'px'
            }
          }
          shrink(time,2)
          shrink(description,4)
        }))
      }
      resize()
      void document.fonts?.ready.then(resize)
      if(typeof ResizeObserver==='undefined')return ()=>cancelAnimationFrame(frame)
      const observer=new ResizeObserver(resize)
      observer.observe(element)
      element.querySelectorAll('.timeline-block').forEach(block=>observer.observe(block))
      return ()=>{cancelAnimationFrame(frame);observer.disconnect()}
    }
    const resize=()=>{const height=Math.max(130,...Array.from(element.querySelectorAll<HTMLElement>('.timeline-block'),block=>block.offsetHeight+40));element.style.height=height+'px'}
    resize();if(typeof ResizeObserver==='undefined')return
    const observer=new ResizeObserver(resize)
    element.querySelectorAll('.timeline-block').forEach(block=>observer.observe(block))
    return ()=>observer.disconnect()
  },[items,rangeStart,rangeEnd,fit])
  return <div className={fit?"timeline-scroll timeline-fit":"timeline-scroll"}><div ref={track} className="timeline-track inline-timeline" dir="rtl" style={{minWidth:fit?0:minWidth,backgroundSize:`${hourWidth}% 100%`}}><span className="timeline-edge start">{faDigits(rangeStart)}</span><span className="timeline-edge end">{faDigits(rangeEnd)}</span>{valid.map(item=><article className="timeline-block" key={item.id} role={onSelect?"button":undefined} tabIndex={onSelect?0:undefined} aria-label={onSelect?"ویرایش بازه "+item.title:undefined} onClick={()=>onSelect?.(item.id)} onKeyDown={event=>{if(onSelect&&(event.key==="Enter"||event.key===" ")){event.preventDefault();onSelect(item.id)}}} title={item.title+" · "+faDigits(item.start_time)+" تا "+faDigits(item.end_time)} style={softPositions?.get(item.id)??timelinePosition(item.start_time,item.end_time,rangeStart,rangeEnd)}><b style={fit?{...subjectBlockStyle(item.title,item.subject,item.color),borderColor:'rgba(45,35,55,.55)'}:undefined}>{item.title}</b><small><span>{faDigits(item.start_time)}</span><span>تا</span><span>{faDigits(item.end_time)}</span></small></article>)}</div></div>
}


function EditableDayTimeline({items,rangeStart,rangeEnd,day,books,onAdd,onChange,onDelete}:{items:TimelineDraft[];rangeStart:string;rangeEnd:string;day:string;books:LibraryBook[];onAdd:()=>string;onChange:(id:string,key:'start'|'end'|'title'|'subject'|'color'|'book_topic_id'|'book_question_count',value:string)=>void;onDelete:(id:string)=>void}){
 const [selectedId,setSelectedId]=useState<string|null>(null)
 const selected=items.find(item=>item.id===selectedId)
 const [chooseColor,setChooseColor]=useState(false)
 const candidates=selected?detectSubjects(selected.title):[]
 const host=useRef<HTMLDivElement>(null)
 useEffect(()=>{setChooseColor(false);if(selectedId)host.current?.querySelector<HTMLInputElement>('.on-chart-editor input')?.focus()},[selectedId])
 const incomplete=items.filter(item=>!Number.isFinite(timeToMinutes(item.start))||!Number.isFinite(timeToMinutes(item.end))||timeToMinutes(item.end)<=timeToMinutes(item.start))
 const issue=selected?validateTimeline(items,rangeStart,rangeEnd):null
 return <div ref={host} className="editable-day-chart">
  <div className="editable-chart-surface">
   <TimelineTrack fit items={items.map(item=>({id:item.id,start_time:item.start,end_time:item.end,title:item.title||'برنامه جدید',subject:item.subject,color:item.color}))} rangeStart={rangeStart} rangeEnd={rangeEnd} onSelect={setSelectedId}/>
   {!items.length&&<span className="chart-empty-hint">برای شروع، دکمهٔ افزودن بازه را بزنید.</span>}
   {incomplete.length>0&&<div className="chart-unscheduled">{incomplete.map((item,i)=><button key={item.id} type="button" onClick={()=>setSelectedId(item.id)}>بازهٔ بدون زمان {faDigits(String(i+1))}</button>)}</div>}
   {selected&&<div className="on-chart-editor" role="dialog" aria-label={'ویرایش بازه '+day} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setSelectedId(null)}}}>
    <header><b>ویرایش بازه · {day}</b><button type="button" aria-label="بستن ویرایش بازه" onClick={()=>setSelectedId(null)}>×</button></header>
    <div className="on-chart-times"><TimeSelect key={selected.id+'-start'} label="از" value={selected.start} onChange={value=>onChange(selected.id,'start',value)}/><TimeSelect key={selected.id+'-end'} label="تا" value={selected.end} onChange={value=>onChange(selected.id,'end',value)}/></div>
    <label className="timeline-description">توضیحات (تا ۳ خط)<textarea rows={3} maxLength={180} value={selected.title} onChange={event=>onChange(selected.id,'title',event.target.value.replace(/\r/g,'').split('\n').slice(0,3).join('\n'))} placeholder="درس، فعالیت و هدف این بازه را بنویسید."/></label>
    <small className="detected-subject"><span style={{background:subjectBlockStyle(selected.title,selected.subject,selected.color).background}}/> رنگ بازه: {detectSubjectColor(selected.title,selected.subject).label}</small>
    {issue&&<small className="timeline-error">{issue}</small>}
    <div className="activity-book-fields"><label>منبع سؤال (اختیاری)<select aria-label="منبع سؤال" value={selected.book_topic_id||''} onChange={event=>{onChange(selected.id,'book_topic_id',event.target.value);onChange(selected.id,'book_question_count','0')}}><option value="">بدون اتصال به کتاب</option>{(Array.isArray(books)?books:[]).filter(b=>b.active).map(book=><optgroup key={book.id} label={book.title+' · '+book.publication_year}>{book.topics.map(topic=><option value={topic.id} key={topic.id}>{topic.title} · {topic.question_type==='test'?'تستی':'تشریحی'} · {topic.available} سؤال قابل برنامه‌ریزی</option>)}</optgroup>)}</select></label>{selected.book_topic_id&&<label>تعداد سؤال این بازه<input aria-label="تعداد سؤال این بازه" type="number" min={1} max={10000} value={selected.book_question_count||''} onChange={event=>onChange(selected.id,'book_question_count',event.target.value)}/></label>}</div>
    <div className="manual-color"><label>رنگ دلخواه بازه<input type="color" aria-label="رنگ دلخواه بازه" value={subjectBlockStyle(selected.title,selected.subject,selected.color).background} onChange={event=>{onChange(selected.id,'color',event.target.value);setChooseColor(false)}}/></label>{selected.color&&<button type="button" className="small-secondary" onClick={()=>onChange(selected.id,'color','')}>بازگشت به رنگ خودکار</button>}</div>
    {chooseColor&&<div className="subject-color-choice" role="group" aria-label="انتخاب رنگ درس"><b>رنگ این بازه برای کدام درس باشد؟</b><div>{candidates.map(subject=><button type="button" key={subject.id} style={subjectBlockStyle(subject.label)} onClick={()=>{onChange(selected.id,'subject',subject.label);onChange(selected.id,'color','');setChooseColor(false);setSelectedId(null)}}>{subject.label}</button>)}</div></div>}
    <div className="on-chart-actions"><button type="button" className="small-secondary" onClick={()=>{onDelete(selected.id);setSelectedId(null)}}><Trash2 size={16}/> حذف بازه</button><button type="button" className="btn btn-primary" onClick={()=>{if(candidates.length>1&&!selected.color){setChooseColor(true)}else{onChange(selected.id,'subject',detectSubjectColor(selected.title,selected.subject).label);setSelectedId(null)}}}>ثبت بازه</button></div>
   </div>}
  </div>
  <button type="button" className="add-chart-range" aria-label={'افزودن بازه برای '+day} onClick={()=>setSelectedId(onAdd())}><Plus/><span>افزودن بازه</span></button>
 </div>
}

function ReadOnlyPlanTable({plan,studentName='—',advisorName='—',onUpdate,updating=false,tableRef}:{plan:WeeklyPlan;studentName?:string;advisorName?:string;onUpdate?:(item:PlanActivity,form:FormData)=>void;updating?:boolean;tableRef?:{current:HTMLDivElement|null}}){
  const rangeStart=plan.day_start_time||'08:00',rangeEnd=plan.day_end_time||'24:00'
  return <div className="plan-table-document" ref={tableRef} dir="rtl"><div className="pdf-reference-header"><strong className="pdf-site-name">مسیر هوشمند</strong><blockquote className="pdf-green-quote">«افراد با انگیزه، بهتر از افراد با استعداد را شکست می‌دهند.»</blockquote><div><h1>مباحث هفتگی (آقا/خانم «{studentName}»)</h1><p>مشاور و برنامه‌ریز درسی: «{advisorName}»</p></div></div><div className="plan-document-head"><div><h2>{plan.title}</h2><p>{plan.week_label} · نسخه {plan.version}</p></div><span>بازه روزانه {faDigits(rangeStart)} تا {faDigits(rangeEnd)}</span></div><section className="student-mission-card"><b>ماموریت هفته</b><p>{plan.weekly_mission?.trim()||'برای این هفته ماموریتی ثبت نشده است.'}</p></section><div className="pdf-main-layout"><aside className="pdf-weekly-mission"><h3>ماموریت هفته</h3><p>{plan.weekly_mission?.trim()||'ماموریتی برای این هفته ثبت نشده است.'}</p></aside><div className="daily-timeline-table">{plan.days.map(day=>{const items=plan.activities.filter(item=>item.day===day.label).sort((a,b)=>a.start_time.localeCompare(b.start_time));return <section className="daily-timeline-row" key={day.label}><header><b>{day.label}</b><span>{day.date||'بدون تاریخ'}</span></header><div className="daily-timeline-content"><TimelineTrack items={items} rangeStart={rangeStart} rangeEnd={rangeEnd}/>{onUpdate&&items.length>0&&<div className="timeline-performance" data-html2canvas-ignore="true">{items.map(item=><details key={item.id}><summary>{item.title} · ثبت عملکرد</summary><form onSubmit={event=>{event.preventDefault();onUpdate(item,new FormData(event.currentTarget))}}><select name="status" defaultValue={item.status}><option value="pending">انجام نشده</option><option value="in_progress">در حال انجام</option><option value="completed">انجام شد</option></select><input name="actual_minutes" type="number" min="0" defaultValue={item.actual_minutes} placeholder="دقیقه واقعی"/><input name="test_count" type="number" min="0" defaultValue={item.test_count} placeholder="تعداد تست"/><input name="note" defaultValue={item.note} placeholder="یادداشت"/><button disabled={updating}><Save/> ذخیره</button></form></details>)}</div>}</div></section>})}</div></div><footer className="pdf-site-footer">مسیر هوشمند</footer></div>
}

export function validateTimeline(items:TimelineDraft[],rangeStart:string,rangeEnd:string){
  const start=timeToMinutes(rangeStart),end=timeToMinutes(rangeEnd)
  if(start>=end)return 'ساعت پایان بازه کلی باید بعد از ساعت شروع باشد.'
  if(!Number.isFinite(start)||!Number.isFinite(end))return 'ساعت‌ها را با قالب درست، مانند 08:00 یا 09:06 وارد کنید.'
  if(!items.length)return 'حداقل یک برنامه برای هفته وارد کنید.'
  for(const item of items){
    const itemStart=timeToMinutes(item.start),itemEnd=timeToMinutes(item.end)
    if(!Number.isFinite(itemStart)||!Number.isFinite(itemEnd))return 'ساعت‌ها را با قالب درست، مانند 08:00 یا 09:06 وارد کنید.'
    if(item.title.split('\n').length>3)return 'توضیحات هر بازه حداکثر سه خط است.'
    if(item.book_topic_id&&(!item.book_question_count||item.book_question_count<1))return 'تعداد سؤال مبحث انتخاب‌شده را وارد کنید.'
    if(!item.title.trim())return 'توضیحات همه بازه‌ها را کامل کنید.'
    const lessons=detectSubjects(item.title)
    if(lessons.length>1&&!item.color&&!lessons.some(lesson=>lesson.label===item.subject))return 'برای بازه‌های چنددرسی، رنگ درس را با زدن «ثبت بازه» انتخاب کنید.'
    if(itemStart>=itemEnd)return 'ساعت پایان هر برنامه باید بعد از ساعت شروع آن باشد.'
    if(itemStart<start||itemEnd>end)return 'همه برنامه‌ها باید داخل بازه کلی روز باشند.'
  }
  for(const dayId of new Set(items.map(item=>item.dayId))){
    const sorted=items.filter(item=>item.dayId===dayId).sort((a,b)=>a.start.localeCompare(b.start))
    if(sorted.some((item,index)=>index>0&&item.start<sorted[index-1].end))return 'بازه‌های یک روز نباید هم‌پوشانی داشته باشند.'
  }
  return ''
}

type AdvisorSchoolProfile={grade?:string;major?:string;school?:string;goal?:string;average_grade9?:number|null;average_grade10?:number|null;average_grade11?:number|null;average_grade12?:number|null;school_schedule?:Record<string,string[]>;extra_classes?:Record<string,string>}

function AdvisorSchoolReference({profile}:{profile:AdvisorSchoolProfile}){
  const schedule=profile.school_schedule||{},extras=profile.extra_classes||{}
  return <section className="advisor-school-reference"><div><h3>برنامه مدرسه دانش‌آموز</h3><p>{profile.grade||'—'} · {profile.major||'—'} · {profile.school||'مدرسه ثبت نشده'}</p><small>معدل‌ها — نهم: {profile.average_grade9??'—'} | دهم: {profile.average_grade10??'—'} | یازدهم: {profile.average_grade11??'—'} | دوازدهم: {profile.average_grade12??'—'}</small></div>{Object.keys(schedule).length?<div className="advisor-school-days">{Object.entries(schedule).map(([day,periods])=><article key={day}><b>{day}</b>{periods.map((item,index)=><span key={index}>{index+1}. {item||'خالی'}</span>)}<small>{extras[day]||'بدون کلاس فوق‌العاده'}</small></article>)}</div>:<p className="empty-school-plan">برنامه مدرسه‌ای ثبت نشده است.</p>}</section>
}
export function PlanBuilder({studentId}:{studentId:string}){
  const qc=useQueryClient();const [title,setTitle]=useState('برنامه هفتگی'),[week,setWeek]=useState(''),[startDate,setStartDate]=useState<JalaliSelection>(initialJalali)
  const [rangeStart,setRangeStart]=useState('08:00'),[rangeEnd,setRangeEnd]=useState('24:00'),[items,setItems]=useState<TimelineDraft[]>([])
  const [mission,setMission]=useState(''),[draftEpoch,setDraftEpoch]=useState(0)
  const resetDraft=()=>{setTitle('برنامه هفتگی');setMission('');setItems([]);setStartDate(initialJalali());setRangeStart('08:00');setRangeEnd('24:00');setDraftEpoch(value=>value+1)}
  const tableDays=useMemo(()=>buildJalaliWeek(startDate),[startDate]);useEffect(()=>setWeek(`از ${tableDays[0].date} تا ${tableDays[6].date}`),[tableDays])
  const {data=[]}=useQuery({queryKey:['plans','advisor'],queryFn:()=>api<WeeklyPlan[]>('/plans')})
  const {data:studentFile}=useQuery({queryKey:['student-file-school',studentId],queryFn:()=>api<ReportData&{student:User;profile:AdvisorSchoolProfile}>(`/advisors/students/${studentId}/report`)})
  const {data:library=[]}=useQuery({queryKey:['books','advisor',studentId],queryFn:()=>api<LibraryBook[]>('/advisors/students/'+studentId+'/books')})
  const addItem=(dayId:string)=>{const id=crypto.randomUUID();setItems(current=>[...current,{id,dayId,start:'',end:'',title:''}]);return id}
  const updateItem=(id:string,key:'start'|'end'|'title'|'subject'|'color'|'book_topic_id'|'book_question_count',value:string)=>setItems(current=>current.map(item=>item.id===id?{...item,[key]:key==='book_question_count'?Number(value):value,...(key==='title'&&!detectSubjects(value).some(lesson=>lesson.label===item.subject)?{subject:undefined}:{})}:item))
  const error=validateTimeline(items,rangeStart,rangeEnd)
  const create=useMutation({mutationFn:async()=>{if(error)throw new Error(error);const activities=items.map(item=>({day:tableDays.find(day=>day.id===item.dayId)!.label,subject:detectSubjectColor(item.title,item.subject).label,color:item.color||'',book_topic_id:item.book_topic_id||'',book_question_count:item.book_question_count||0,title:item.title.trim(),start_time:item.start,end_time:item.end}));const plan=await api<{id:string}>('/plans',{method:'POST',body:JSON.stringify({student_id:studentId,title,week_label:week,weekly_mission:mission,day_start_time:rangeStart,day_end_time:rangeEnd,days:tableDays.map(({label,date})=>({label,date})),time_slots:[],activities})});await api(`/plans/${plan.id}/publish`,{method:'POST'});return plan},onSuccess:()=>{resetDraft();void qc.invalidateQueries({queryKey:['plans','advisor']});void qc.invalidateQueries({queryKey:['books']})}})
  return <fieldset disabled={create.isPending} style={{border:0,padding:0,margin:0,minWidth:0}}><div className="table-planner timeline-planner">{studentFile&&<AdvisorSchoolReference profile={studentFile.profile}/>}<AIPlanDesigner key={draftEpoch} studentId={studentId} startDate={`${startDate.year}/${String(startDate.month).padStart(2,'0')}/${String(startDate.day).padStart(2,'0')}`} rangeStart={rangeStart} rangeEnd={rangeEnd} hasDraft={items.length>0||Boolean(mission)} onApply={draft=>{setTitle(draft.title);setMission(draft.weekly_mission);setItems(draft.activities.map(a=>({id:crypto.randomUUID(),dayId:tableDays.find(d=>d.label===a.day)!.id,start:a.start_time,end:a.end_time,title:a.title,book_topic_id:a.book_topic_id,book_question_count:a.book_question_count})));create.reset()}}/><div className="planner-meta"><label>عنوان برنامه<input value={title} onChange={event=>setTitle(event.target.value)}/></label><label>عنوان یا بازه هفته<input value={week} onChange={event=>setWeek(event.target.value)}/></label><label className="mission-field">ماموریت هفته<textarea value={mission} maxLength={2000} onChange={event=>setMission(event.target.value)} placeholder="ماموریت و هدف اصلی این هفته را بنویسید..."/></label></div><div className="planner-calendar-row"><div><b>تاریخ شمسی شروع برنامه</b><p>روز و تاریخ تمام هفت روز خودکار محاسبه می‌شود.</p><PersianDateSelector value={startDate} onChange={setStartDate}/></div><div className="daily-range-fields"><TimeSelect label="شروع کل روز" value={rangeStart} max={timeToMinutes(rangeEnd)-1} onChange={setRangeStart}/><TimeSelect label="پایان کل روز" value={rangeEnd} min={timeToMinutes(rangeStart)+1} onChange={setRangeEnd}/></div></div><div className="timeline-editor-list">{tableDays.map(day=>{const dayItems=items.filter(item=>item.dayId===day.id);return <section className="timeline-editor-day" key={day.id}><header><b>{day.label}</b><span>{day.date}</span></header><div className="timeline-editor-body"><EditableDayTimeline key={draftEpoch} items={dayItems} books={library||[]} day={day.label} rangeStart={rangeStart} rangeEnd={rangeEnd} onAdd={()=>addItem(day.id)} onChange={updateItem} onDelete={id=>setItems(current=>current.filter(item=>item.id!==id))}/></div></section>})}</div><div className="planner-actions"><span className={error?'timeline-error':''}>{error||`${items.length} برنامه در بازه ${faDigits(rangeStart)} تا ${faDigits(rangeEnd)}`}</span><button className="small-secondary" disabled={create.isPending} onClick={()=>{resetDraft();create.reset()}}><Trash2/> پاک کردن پیش‌نویس</button><button className="btn btn-primary" disabled={create.isPending||Boolean(error)} onClick={()=>create.mutate()}><Save/> ذخیره و انتشار برنامه</button></div>{create.isSuccess&&<div className="success-note">برنامه خط زمانی با موفقیت منتشر شد.</div>}{create.error&&<ErrorBox error={create.error}/>}</div></fieldset>
}
