import GroupExamsPage from './GroupExamsPage'
import ExternalResultsPage from './ExternalResultsPage'
import AcademicCalendarPage from './AcademicCalendarPage'
import BooksPage from './BooksPage'
import { Activity as ActivityIcon, ArrowRight, Bell, BellRing, BookOpen, Bot, BrainCircuit, CalendarDays, Check, ChevronLeft, ClipboardCheck, CreditCard, FilePenLine, FileQuestion, GraduationCap, Home, LogOut, Mail, Menu, MessageSquare, Search, Settings, ShieldCheck, Sparkles, TrendingUp, UserCheck, UserPlus, UserRound, Users, X } from 'lucide-react'
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, auth } from '../api'
import Brand from '../components/Brand'
import ChartCard from '../components/ChartCard'
import type { Activity, Insight, User, WeeklyPlan } from '../types'
import NotificationBell, { useNotificationSummary } from '../components/NotificationBell'
import AdvisorReferralPage from './AdvisorReferralPage'
import AdminTermsPage from './AdminTermsPage'
import AdminSubscriptionsPage from './AdminSubscriptionSettingsPage'
import PasswordChange from '../components/PasswordChange'
import { StudentAIPage, AdvisorAIPage, AdminAIPage } from './AIPages'
import AdminStudentControlPage from './AdminStudentManagementPage'
import AdminFinancialLedgerPage from './AdminFinancialLedgerPage'
import StudentSubscriptionOfferPage from './StudentSubscriptionOfferPage'
import { AdvisorMessagesPage, AdvisorStudentsPage, ExamsPage, ProgressPage, SettingsPage, StudentChatPage, StudentFilePage, StudentPlanPage } from './OperationalPages'
import { AdminAccessPage, AdminAdvisorsPage, AdminCatalogPage } from './AdminPages'
import AdminUserDirectoryPage from './AdminUserDirectoryPage'
import AdminProfilePhotoReviewsPage from './AdminProfilePhotoReviewsPage'
import AdminStaffControlPage from './AdminStaffControlPage'
import UniversalChatPage from './UniversalChatPage'
import StudentSubscriptionPage from './StudentSubscriptionPage'
import { formatJalali } from '../utils/jalali'
import { AdminStaffPage, AdvisorRequestsPage, ConversationMonitorPage, ManagerAdvisorsPage, ProgramsAccessPage, StaffMessagesPage } from './ManagementPages'
import { AdminBroadcastPage, ArticlesManagementPage } from './ContentManagementPages'
import { photoUrl } from '../utils/profilePhoto'
import AdminBalePage from './AdminBalePage'
import AdminIntegrationsPage from './AdminIntegrationsPage'
import AdminMotivationalQuotesPage from './AdminMotivationalQuotesPage'
import LoadingOverlay from '../components/LoadingOverlay'
import AdvisorSearch from '../components/AdvisorSearch'
import { normalizeAdvisorSearch } from '../utils/advisorSections'
import { advisorMessengerThread } from '../utils/chatRoutes'
import '../styles/advisor-dashboard.css'
import '../styles/student-dashboard.css'
import '../styles/campus.css'
import '../styles/workspace-interiors.css'
import '../styles/advisor-tools.css'

type StudentData={user:User;profile:{grade:string;major:string;goal:string};progress:number;study_minutes:number;today_activity_count?:number;progress_history?:{date:string;total:number;completed:number;actual_minutes:number}[];activities:Activity[];exams:{id:string;title:string;duration_minutes:number}[];insights:Insight[]}
type AdvisorProgressPoint={week_start:string;total:number;completed:number}
type AdvisorData={
  user:User
  students:(User&{progress:number;plan_days_remaining:number|null;yesterday_report_submitted:boolean})[]
  pending_insights:number
  alerts:number
  weekly_plans:number
  progress_history:AdvisorProgressPoint[]
}
type AdminData={user:User;counts:Record<string,number>;service:{status:string;database:string;jobs:string}}

const roleLabels:Record<string,string>={student:'دانش‌آموز',advisor:'مشاور',secretary:'منشی',expert:'کارشناس',content_editor:'کارشناس محتوا',reviewer:'بازبین علمی',exam_designer:'طراح آزمون',support:'پشتیبان',finance:'مدیر مالی',operations_admin:'مدیر عملیات',super_admin:'مدیر سیستم'}

export function WorkspacePageLegacy({user}:{user:User}){
  const [mobile,setMobile]=useState(false);const nav=useNavigate();const location=useLocation();const qc=useQueryClient()
  const logout=async()=>{await auth.logout();qc.clear();nav('/')}
  const go=(path:string)=>{nav(path);setMobile(false)};const active=(path:string)=>location.pathname===path||location.pathname.startsWith(`${path}/`)
  const studentBase='/app/student',advisorBase='/app/advisor'
  let content:React.ReactNode
  if(user.role==='student'){
    const path=location.pathname
    content=path.includes('/plan')?<StudentPlanPage/>:path.includes('/exams')?<ExamsPage/>:path.includes('/progress')?<ProgressPage/>:path.includes('/chat')?<StudentChatPage user={user}/>:path.includes('/settings')?<SettingsPage/>:<StudentDashboard/>
  }else if(user.role==='advisor'){
    const match=location.pathname.match(/\/students\/([^/]+)\/(report|plan|study-reports|exams|chat|evaluation|books|external-results)/)
    content=location.pathname==='/app/advisor/ai'?<AdvisorHomeSubpage><AdvisorAIPage/></AdvisorHomeSubpage>:match?.[2]==='chat'?<Navigate to={advisorMessengerThread(match[1])} replace/>:match?<StudentFilePage user={user} studentId={match[1]} tab={match[2]}/>:location.pathname.includes('/students')||location.pathname.includes('/planner')?<AdvisorStudentsPage/>:location.pathname.includes('/messages')?<AdvisorMessagesPage user={user}/>:location.pathname.includes('/settings')?<SettingsPage/>:<AdvisorDashboard/>
  }else content=<AdminDashboard user={user}/>
  return <div className="workspace"><aside className={`app-sidebar ${mobile?'open':''}`}><button className="sidebar-close" onClick={()=>setMobile(false)}><X/></button><Brand light/><nav><button className={active(`${user.role==='student'?studentBase:advisorBase}/overview`)?'selected':''} onClick={()=>go(`${user.role==='student'?studentBase:advisorBase}/overview`)}><Home/>نمای کلی</button>{user.role==='student'&&<><button className={active(`${studentBase}/plan`)?'selected':''} onClick={()=>go(`${studentBase}/plan`)}><ClipboardCheck/>برنامه من</button><button className={active(`${studentBase}/exams`)?'selected':''} onClick={()=>go(`${studentBase}/exams`)}><BookOpen/>آزمون‌ها</button><button className={active(`${studentBase}/progress`)?'selected':''} onClick={()=>go(`${studentBase}/progress`)}><TrendingUp/>گزارش پیشرفت</button><button className={active(`${studentBase}/chat`)?'selected':''} onClick={()=>go(`${studentBase}/chat`)}><MessageSquare/>گفت‌وگو با مشاور</button></>}{user.role==='advisor'&&<><button className={active(`${advisorBase}/students`)?'selected':''} onClick={()=>go(`${advisorBase}/students`)}><Users/>دانش‌آموزان</button><button className={active(`${advisorBase}/planner`)?'selected':''} onClick={()=>go(`${advisorBase}/planner`)}><ClipboardCheck/>برنامه‌ساز</button><button className={active(`${advisorBase}/messages`)?'selected':''} onClick={()=>go(`${advisorBase}/messages`)}><MessageSquare/>پیامرسان مهیاد</button></>}{!['student','advisor'].includes(user.role)&&<><button><Users/>کاربران</button><button><FileQuestion/>بانک سؤال</button><button><BookOpen/>آزمون‌ها</button><button><CreditCard/>اشتراک و مالی</button><button><ShieldCheck/>ممیزی</button></>}<button className={active(`${user.role==='student'?studentBase:advisorBase}/settings`)?'selected':''} onClick={()=>go(`${user.role==='student'?studentBase:advisorBase}/settings`)}><Settings/>تنظیمات</button></nav><button className="sidebar-logout" onClick={logout}><LogOut/>خروج</button></aside><main className="app-main"><header className="app-header"><button className="app-menu" onClick={()=>setMobile(true)}><Menu/></button><div className="app-search"><Search/><input placeholder="جست‌وجو در مهیاد..."/></div><div className="app-user"><button><Bell/><i/></button><span className="avatar">{user.full_name[0]}</span><p><b>{user.full_name}</b><small>{roleLabels[user.role]}</small></p></div></header>{content}</main></div>
}

export default function WorkspacePage({user}:{user:User}){
  const [mobile,setMobile]=useState(false);const nav=useNavigate();const location=useLocation();const qc=useQueryClient()
  const logout=async()=>{await auth.logout();qc.clear();nav('/')}
  const alerts=useNotificationSummary().data
  const go=(path:string)=>{nav(path);setMobile(false)}
  const active=(path:string)=>location.pathname===path||location.pathname.startsWith(`${path}/`)
  const studentBase='/app/student',advisorBase='/app/advisor',adminBase='/app/admin',managementBase='/app/management'
  const adminManager=['super_admin','operations_admin'].includes(user.role)
  const staffRole=['secretary','expert'].includes(user.role)
  const staffAccess=useQuery({queryKey:['management-access'],queryFn:()=>api<{levels:Record<string,'none'|'view'|'edit'>}>('/management/access'),enabled:staffRole}).data?.levels||{}
  const base=user.role==='student'?studentBase:user.role==='advisor'?advisorBase:staffRole?managementBase:adminBase
  let content:React.ReactNode
  if(user.role==='student'){
    const path=location.pathname
    content=path.includes('/academic-calendar')?<AcademicCalendarPage mode="student" user={user}/>:path.includes('/external-results')?<ExternalResultsPage studentId={user.id}/>:path.includes('/books')?<BooksPage mode="student"/>:path.includes('/ai-chat')?<StudentHomeSubpage><StudentAIPage/></StudentHomeSubpage>:path.includes('/subscription')?<StudentSubscriptionPage/>:path.includes('/plan')?<StudentHomeSubpage><StudentPlanPage/></StudentHomeSubpage>:path.includes('/exams')?<StudentHomeSubpage><ExamsPage/></StudentHomeSubpage>:path.includes('/progress')?<ProgressPage/>:path.includes('/chat')?<UniversalChatPage user={user}/>:path.includes('/settings')?<SettingsPage user={user}/>:<StudentDashboard/>
  }else if(user.role==='advisor'){
    const match=location.pathname.match(/\/students\/([^/]+)\/(report|plan|school-schedule|study-reports|exams|chat|evaluation|books|external-results|academic-calendar|renewal-billing)\/?$/)
    content=location.pathname==='/app/advisor/group-exams'?<GroupExamsPage/>:location.pathname==='/app/advisor/articles'?<ArticlesManagementPage/>:location.pathname==='/app/advisor/ai'?<AdvisorHomeSubpage><AdvisorAIPage/></AdvisorHomeSubpage>:match?.[2]==='chat'?<Navigate to={advisorMessengerThread(match[1])} replace/>:match?<StudentFilePage user={user} studentId={match[1]} tab={match[2]}/>:location.pathname.includes('/add-student')?<AdvisorHomeSubpage><AdvisorReferralPage/></AdvisorHomeSubpage>:location.pathname.includes('/requests')?<AdvisorHomeSubpage><AdvisorRequestsPage/></AdvisorHomeSubpage>:location.pathname.includes('/students')||location.pathname.includes('/planner')?<AdvisorHomeSubpage><AdvisorStudentsPage/></AdvisorHomeSubpage>:location.pathname.includes('/messages')?<UniversalChatPage user={user}/>:location.pathname.includes('/settings')?<SettingsPage user={user}/>:<AdvisorDashboard/>
  }else if(staffRole){
    const path=location.pathname
    content=path.includes('/academic-calendars')&&user.role==='expert'?<AcademicCalendarPage mode="management" user={user}/>:path.includes('/settings')?<div className="content-page"><h1>تنظیمات حساب</h1><PasswordChange/></div>:path.includes('/advisors')?<ManagerAdvisorsPage/>:path.includes('/chats')?<ConversationMonitorPage/>:path.includes('/messages')?<UniversalChatPage user={user}/>:<ProgramsAccessPage user={user}/>
  }else{
    const path=location.pathname
    content=path==='/app/admin/motivational-quotes'&&adminManager?<AdminMotivationalQuotesPage/>:path.includes('/academic-calendars')&&adminManager?<AcademicCalendarPage mode="management" user={user}/>:path==='/app/admin/integrations'&&user.role==='super_admin'?<AdminIntegrationsPage/>:path==='/app/admin/bale'&&user.role==='super_admin'?<AdminBalePage/>:path==='/app/admin/photo-reviews'&&adminManager?<AdminProfilePhotoReviewsPage/>:path==='/app/admin/notifications'&&user.role==='super_admin'?<AdminBroadcastPage/>:path==='/app/admin/articles'&&user.role==='super_admin'?<ArticlesManagementPage admin/>:path==='/app/admin/books'&&user.role==='super_admin'?<BooksPage mode="admin"/>:path==='/app/admin/ai'&&user.role==='super_admin'?<AdminAIPage/>:path.includes('/staff')&&user.role==='super_admin'?<AdminStaffControlPage/>:path.includes('/programs')&&user.role==='super_admin'?<ProgramsAccessPage user={user}/>:path.includes('/chats')&&user.role==='super_admin'?<ConversationMonitorPage/>:path.includes('/messages')&&user.role==='super_admin'?<UniversalChatPage user={user}/>:path.includes('/terms')&&user.role==='super_admin'?<AdminTermsPage/>:path.includes('/users')&&adminManager?<AdminUserDirectoryPage/>:path.includes('/students')&&adminManager?<AdminStudentControlPage/>:path.includes('/advisors')&&adminManager?<AdminAdvisorsPage canReview={user.role==='super_admin'}/>:path.includes('/questions')?<AdminCatalogPage kind="questions"/>:path.includes('/exams')?<AdminCatalogPage kind="exams"/>:path.includes('/ledger')?<AdminFinancialLedgerPage/>:path.includes('/finance')?<AdminSubscriptionsPage/>:path.includes('/settings')?<AdminAccessPage/>:<AdminDashboard user={user}/>
  }
  return <div className="workspace" data-campus={['student','advisor'].includes(user.role)?user.role:'admin'}><aside className={`app-sidebar ${mobile?'open':''}`}><button className="sidebar-close" onClick={()=>setMobile(false)}><X/></button><Brand light/><nav>
    <button className={active(`${base}/overview`)?'selected':''} onClick={()=>go(`${base}/overview`)}><Home/>{['advisor','student'].includes(user.role)?'صفحه اصلی':'نمای کلی'}</button>
{user.role==='student'&&<button className={active(`${studentBase}/chat`)?'selected':''} onClick={()=>go(`${studentBase}/chat`)}><MessageSquare/>پیامرسان مهیاد{!!alerts?.unread_messages&&<i className="nav-alert-dot"/>}</button>}
    {['student','super_admin'].includes(user.role)&&<button className={active(base+'/books')?'selected':''} onClick={()=>go(base+'/books')}><BookOpen/>کتاب‌ها</button>}
    {user.role==='student'&&<button className={active(`${studentBase}/external-results`)?'selected':''} onClick={()=>go(`${studentBase}/external-results`)}><FilePenLine/>کارنامه آزمون‌های آزمایشی</button>}
    {user.role==='student'&&<button className={active(`${studentBase}/academic-calendar`)?'selected':''} onClick={()=>go(`${studentBase}/academic-calendar`)}><CalendarDays/>تقویم آموزشی</button>}
    {user.role==='advisor'&&<button className={active(`${advisorBase}/group-exams`)?'selected':''} onClick={()=>go(`${advisorBase}/group-exams`)}><BookOpen/>آزمون گروهی</button>}
    {user.role==='super_admin'&&<button className={active(`${adminBase}/ai`)?'selected':''} onClick={()=>go(`${adminBase}/ai`)}><BrainCircuit/>مدیریت هوش مصنوعی</button>}
    {user.role==='student'&&<button className={active(`${studentBase}/subscription`)?'selected':''} onClick={()=>go(`${studentBase}/subscription`)}><CreditCard/>اشتراک و پرداخت‌ها</button>}
    {user.role==='advisor'&&<><button className={active(`${advisorBase}/articles`)?'selected':''} onClick={()=>go(`${advisorBase}/articles`)}><FilePenLine/>مقالات من</button><button className={active(`${advisorBase}/messages`)?'selected':''} onClick={()=>go(`${advisorBase}/messages`)}><MessageSquare/>پیامرسان مهیاد{!!alerts?.unread_messages&&<i className="nav-alert-dot"/>}</button></>}
    {staffRole&&<>{user.role==='expert'&&<button className={active(`${managementBase}/academic-calendars`)?'selected':''} onClick={()=>go(`${managementBase}/academic-calendars`)}><CalendarDays/>تقویم‌های آموزشی</button>}{staffAccess.plans!=='none'&&<button className={active(`${managementBase}/programs`)?'selected':''} onClick={()=>go(`${managementBase}/programs`)}><ClipboardCheck/>برنامه‌های دانش‌آموزان</button>}{staffAccess.advisors!=='none'&&<button className={active(`${managementBase}/advisors`)?'selected':''} onClick={()=>go(`${managementBase}/advisors`)}><UserCheck/>مشاوران تحت نظر</button>}{staffAccess.chats!=='none'&&<button className={active(`${managementBase}/chats`)?'selected':''} onClick={()=>go(`${managementBase}/chats`)}><ShieldCheck/>نظارت بر چت‌ها</button>}{staffAccess.messages==='edit'&&<button className={active(`${managementBase}/messages`)?'selected':''} onClick={()=>go(`${managementBase}/messages`)}><MessageSquare/>پیام‌ها{!!alerts?.unread_messages&&<i className="nav-alert-dot"/>}</button>}</>}
    {adminManager&&<><button className={active(`${adminBase}/motivational-quotes`)?'selected':''} onClick={()=>go(`${adminBase}/motivational-quotes`)}><Sparkles/>جملات انگیزشی</button><button className={active(`${adminBase}/academic-calendars`)?'selected':''} onClick={()=>go(`${adminBase}/academic-calendars`)}><CalendarDays/>تقویم‌های آموزشی</button><button className={active(`${adminBase}/users`)?'selected':''} onClick={()=>go(`${adminBase}/users`)}><Users/>کاربران</button><button className={active(`${adminBase}/photo-reviews`)?'selected':''} onClick={()=>go(`${adminBase}/photo-reviews`)}><UserCheck/>تأیید اطلاعات جدید</button><button className={active(`${adminBase}/students`)?'selected':''} onClick={()=>go(`${adminBase}/students`)}><GraduationCap/>دانش‌آموزان</button><button className={active(`${adminBase}/advisors`)?'selected':''} onClick={()=>go(`${adminBase}/advisors`)}><UserRound/>مشاوران و تأیید</button></>}
    {user.role==='super_admin'&&<><button className={active(`${adminBase}/notifications`)?'selected':''} onClick={()=>go(`${adminBase}/notifications`)}><BellRing/>ارسال اعلان</button><button className={active(`${adminBase}/articles`)?'selected':''} onClick={()=>go(`${adminBase}/articles`)}><FilePenLine/>مقالات</button><button className={active(`${adminBase}/staff`)?'selected':''} onClick={()=>go(`${adminBase}/staff`)}><UserPlus/>مدیران و کارکنان</button><button className={active(`${adminBase}/programs`)?'selected':''} onClick={()=>go(`${adminBase}/programs`)}><ClipboardCheck/>همه برنامه‌ها</button><button className={active(`${adminBase}/chats`)?'selected':''} onClick={()=>go(`${adminBase}/chats`)}><ShieldCheck/>همه گفت‌وگوها</button><button className={active(`${adminBase}/messages`)?'selected':''} onClick={()=>go(`${adminBase}/messages`)}><MessageSquare/>پیام‌ها{!!alerts?.unread_messages&&<i className="nav-alert-dot"/>}</button><button className={active(`${adminBase}/terms`)?'selected':''} onClick={()=>go(`${adminBase}/terms`)}><FileQuestion/>شرایط ثبت‌نام</button></>}
    {!['student','advisor','support'].includes(user.role)&&<><button className={active(`${adminBase}/questions`)?'selected':''} onClick={()=>go(`${adminBase}/questions`)}><FileQuestion/>بانک سؤال</button><button className={active(`${adminBase}/exams`)?'selected':''} onClick={()=>go(`${adminBase}/exams`)}><BookOpen/>آزمون‌ها</button></>}
    {['finance','operations_admin','super_admin'].includes(user.role)&&<><button className={active(`${adminBase}/finance`)?'selected':''} onClick={()=>go(`${adminBase}/finance`)}><CreditCard/>تعرفه‌ها و اشتراک</button><button className={active(`${adminBase}/ledger`)?'selected':''} onClick={()=>go(`${adminBase}/ledger`)}><CreditCard/>واریزی‌ها و مانده اشتراک</button></>}
    {user.role==='super_admin'&&<button className={active(`${adminBase}/integrations`)?'selected':''} onClick={()=>go(`${adminBase}/integrations`)}><CreditCard/>پیامک و پرداخت</button>}{user.role==='super_admin'&&<button className={active(`${adminBase}/bale`)?'selected':''} onClick={()=>go(`${adminBase}/bale`)}><Bot/>بازوی بله</button>}
    <button className={active(`${base}/settings`)?'selected':''} onClick={()=>go(`${base}/settings`)}><Settings/>تنظیمات</button>
  </nav><button className="sidebar-logout" onClick={logout}><LogOut/>خروج</button></aside><main className="app-main"><header className="app-header"><button className="app-menu" onClick={()=>setMobile(true)}><Menu/></button>{user.role==='advisor'?<AdvisorSearch key={user.id}/>:<div className="app-search"><Search/><input placeholder="جست‌وجو در مهیاد..."/></div>}<div className="app-user"><NotificationBell/><span className="avatar profile-avatar">{user.profile_photo?<img src={photoUrl(user.profile_photo)} alt="عکس پروفایل"/>:<UserRound/>}</span><p><b>{user.full_name}</b><small>{roleLabels[user.role]}</small></p></div></header>{content}</main><WorkspaceNavigationFeedback/></div>
}

function WorkspaceNavigationFeedback(){
  const location=useLocation()
  const previousPath=useRef(location.pathname)
  const [pending,setPending]=useState(false)
  const fetching=useIsFetching({predicate:query=>!['notification-summary','notifications','me'].includes(String(query.queryKey[0]))})
  useLayoutEffect(()=>{
    if(previousPath.current!==location.pathname){previousPath.current=location.pathname;setPending(true)}
  },[location.pathname])
  useEffect(()=>{
    if(!pending||fetching)return
    const timer=window.setTimeout(()=>setPending(false),300)
    return ()=>window.clearTimeout(timer)
  },[pending,fetching,location.pathname])
  return pending?<LoadingOverlay message="در حال باز کردن بخش…"/>:null
}

const studentHome='/app/student/overview'

function StudentHomeSubpage({children}:{children:React.ReactNode}){
  return <><div className="student-home-return"><Link className="btn btn-outline" to={studentHome}><ArrowRight aria-hidden="true"/> بازگشت به صفحه اصلی</Link></div>{children}</>
}

function StudentPlanSummary({plan}:{plan:WeeklyPlan}){
  return <section className="panel student-plan-summary" aria-label="آخرین برنامه">
    <div className="student-summary-heading"><h2>آخرین برنامه</h2><span>{plan.title}</span></div>
    <div className="student-plan-scroll"><table><thead><tr><th scope="col">روز</th>{Array.from({length:7},(_,index)=><th scope="col" key={index}>بازه {(index+1).toLocaleString('fa-IR')}</th>)}</tr></thead>
      <tbody>{plan.days.map((day,index)=>{
        const key=day.key??day.label
        const items=plan.activities.filter(activity=>activity.day===key&&activity.title?.trim()&&activity.title.trim()!=='استراحت').sort((a,b)=>a.start_time.localeCompare(b.start_time)).slice(0,7)
        return <tr key={key+'-'+index}><th scope="row">{day.label}<small>{day.date}</small></th>{Array.from({length:7},(_,slot)=>{
          const item=items[slot]
          return <td key={slot}>{item&&<><time dir="ltr">{item.start_time}–{item.end_time}</time><b>{item.title}</b></>}</td>
        })}</tr>
      })}</tbody></table></div>
  </section>
}

function StudentDashboard(){
  const {data,isLoading,error,refetch}=useQuery({queryKey:['student-dashboard'],queryFn:()=>api<StudentData>('/students/dashboard')})
  const {data:plans=[]}=useQuery({queryKey:['plans'],queryFn:()=>api<WeeklyPlan[]>('/plans')})
  const {data:subscription}=useQuery({queryKey:['student-subscription-overview'],queryFn:()=>api<{current:{remaining_days:number}|null}>('/students/subscription-overview')})
  const alerts=useNotificationSummary().data
  const {data:advisor}=useQuery({queryKey:['my-advisor'],queryFn:()=>api<(User&{education_degree?:string;education_field?:string;experience_years?:number;bio?:string})|null>('/students/advisor')})
  if(isLoading)return <Loading/>
  if(error||!data)return <div className="dashboard-page"><p role="alert">بارگیری صفحه اصلی ناموفق بود.</p><button className="btn btn-outline" onClick={()=>void refetch()}>تلاش دوباره</button></div>
  const today=new Date()
  const parts=Object.fromEntries(dashboardDate.formatToParts(today).map(({type,value})=>[type,value]))
  const latest=[...plans].filter(plan=>plan.status==='published').sort((a,b)=>(b.published_at??'').localeCompare(a.published_at??''))[0]
  return <div className="dashboard-page student-dashboard">
    <header className="dashboard-welcome student-welcome"><div><h1>سلام، {data.user.full_name.split(' ')[0]} عزیز 👋</h1>{subscription?.current&&<p>{subscription.current.remaining_days.toLocaleString('fa-IR')} روز تا پایان اشتراک شما باقی مانده است.</p>}</div><time className="date-chip" dateTime={today.toISOString()}>{[parts.weekday,parts.day,parts.month,parts.year].join(' ')}</time></header>
    <nav className="student-home-actions" aria-label="دسترسی سریع دانش‌آموز">
      <Link className="btn btn-primary" to="/app/student/plan"><ClipboardCheck/>برنامه من / گزارش عملکرد{!!alerts?.unseen_plans&&<i className="student-alert-dot" aria-label="برنامه جدید دیده‌نشده"/>}</Link>
      <Link className="btn btn-primary" to="/app/student/exams"><BookOpen/>آزمون‌ها{!!alerts?.unseen_exams&&<i className="student-alert-dot" aria-label="آزمون انجام‌نشده"/>}</Link>
      <Link className="btn btn-primary" to="/app/student/ai-chat"><BrainCircuit/>صحبت با هوش مصنوعی</Link>
    </nav>
    <div className="metric-grid"><Metric icon={TrendingUp} label="پیشرفت هفتگی" value={`${data.progress}٪`} tone="purple"/><Metric icon={ActivityIcon} label="زمان مطالعه این هفته" value={`${data.study_minutes} دقیقه`} tone="blue"/><Metric icon={ClipboardCheck} label="فعالیت امروز" value={`${data.today_activity_count??0} مورد`} tone="orange"/></div>
    {advisor&&<div className="student-advisor-strip"><span>مشاور شما: <b>{advisor.full_name}</b></span><small>{[advisor.education_degree,advisor.education_field,advisor.experience_years?`${advisor.experience_years.toLocaleString('fa-IR')} سال سابقه`:null].filter(Boolean).join(' · ')||advisor.bio?.split(/\s+/).slice(0,12).join(' ')||'مشاور تحصیلی شما'}</small><Link to={'/app/student/chat?contact='+encodeURIComponent(advisor.id)} aria-label="گفت‌وگو با مشاور شما"><Mail/>{!!alerts?.unread_by_sender?.[advisor.id]&&<i aria-label="پیام خوانده‌نشده مشاور"/>}</Link></div>}
    {latest?<StudentPlanSummary plan={latest}/>:<section className="panel student-plan-summary"><h2>آخرین برنامه</h2><p>هنوز برنامه‌ای برای شما منتشر نشده است.</p></section>}
    <section className="panel student-performance-chart"><PanelTitle title="روند عملکرد"/>{data.progress_history?.some(point=>point.total)?<figure><ol>{data.progress_history.filter(point=>point.total).slice(-14).map(point=><li key={point.date}><small>{Math.round(point.completed/point.total*100).toLocaleString('fa-IR')}٪</small><i style={{height:`${point.completed/point.total*130}px`}}/><small>{new Intl.DateTimeFormat('fa-IR',{month:'short',day:'numeric'}).format(new Date(point.date+'T12:00:00'))}</small></li>)}</ol><figcaption>درصد فعالیت‌های انجام‌شده از برنامهٔ هر روز، بر اساس گزارش‌های ثبت‌شدهٔ شما؛ حداکثر ۱۴ روز دارای فعالیت نمایش داده می‌شود.</figcaption></figure>:<p>هنوز فعالیتی برای نمایش روند عملکرد ثبت نشده است.</p>}</section>
  </div>
}

const advisorHome='/app/advisor/overview'
const dashboardNumber=new Intl.NumberFormat('fa-IR')
const dashboardDate=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
  weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Tehran',
})
const chartDate=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{day:'numeric',month:'short',timeZone:'Asia/Tehran'})

function AdvisorHomeSubpage({children}:{children:React.ReactNode}){
  return <>
    <div className="advisor-home-return">
      <Link to={advisorHome} className="btn btn-outline"><ArrowRight aria-hidden="true"/> بازگشت به صفحه اصلی</Link>
    </div>
    {children}
  </>
}

function AdvisorDashboard(){
  const [studentSearch, setStudentSearch] = useState('')
  const {data,isLoading,error,refetch}=useQuery({
    queryKey:['advisor-dashboard'],queryFn:()=>api<AdvisorData>('/advisors/dashboard'),refetchInterval:60000,
  })
  const alerts=useNotificationSummary().data
  if(isLoading)return <Loading/>
  if(error||!data)return <div className="content-page"><p role="alert">بارگیری صفحه اصلی مشاور ناموفق بود.</p><button className="btn btn-outline" onClick={()=>void refetch()}>تلاش دوباره</button></div>

  const today=new Date()
  const dateParts=Object.fromEntries(dashboardDate.formatToParts(today).map(({type,value})=>[type,value]))
  const students=[...data.students].sort((a,b)=>
    (a.plan_days_remaining??Infinity)-(b.plan_days_remaining??Infinity)||a.full_name.localeCompare(b.full_name,'fa'),
  )
  const query = normalizeAdvisorSearch(studentSearch)
  const matchingStudents = students.filter(student => normalizeAdvisorSearch(student.full_name).includes(query))
  const pendingRequests=alerts?.pending_advisor_requests??0
  const unreadAnalyses=alerts?.unread_ai_analyses??0
  const unread=alerts?.unread_by_sender??{}

  return <div className="dashboard-page advisor-dashboard">
    <header className="dashboard-welcome advisor-welcome">
      <h1>سلام، {data.user.full_name}</h1>
      <time className="date-chip" dateTime={today.toISOString()}>{[dateParts.weekday,dateParts.day,dateParts.month,dateParts.year].join(' ')}</time>
    </header>
    <div className="advisor-home-actions">
      <Link className="btn btn-primary" to="/app/advisor/requests" aria-label={pendingRequests?'درخواست‌های انتخاب مشاور، درخواست در انتظار':'درخواست‌های انتخاب مشاور'}>
        <UserCheck aria-hidden="true"/> درخواست‌های انتخاب {!!pendingRequests&&<i className="advisor-alert-dot" aria-hidden="true"/>}
      </Link>
      <Link className="btn btn-primary" to="/app/advisor/add-student"><UserPlus aria-hidden="true"/> افزودن دانش‌آموز</Link>
      <Link className="btn btn-primary" to="/app/advisor/ai" aria-label={unreadAnalyses?`پیشنهادات AI، ${dashboardNumber.format(unreadAnalyses)} تحلیل خوانده‌نشده`:'پیشنهادات AI'}>
        <BrainCircuit aria-hidden="true"/> پیشنهادات AI {!!unreadAnalyses&&<i className="advisor-alert-dot" aria-hidden="true"/>}
      </Link>
    </div>
    <div className="metric-grid">
      <Metric icon={Users} label="دانش‌آموز فعال" value={dashboardNumber.format(students.length)} tone="purple"/>
      <Metric icon={Bell} label="هشدار نیازمند بررسی" value={dashboardNumber.format(data.alerts)} tone="orange"/>
      <Metric icon={BrainCircuit} label="پیشنهاد AI" value={dashboardNumber.format(data.pending_insights)} tone="blue"/>
      <Metric icon={ClipboardCheck} label="برنامه این هفته" value={dashboardNumber.format(data.weekly_plans)} tone="green"/>
    </div>
    <section className="panel advisor-followup" aria-labelledby="advisor-followup-title">
      <div className="panel-title advisor-followup-heading">
        <h2 id="advisor-followup-title">صف پیگیری دانش‌آموزان</h2>
        <label className="advisor-followup-search">
          <Search size={17} aria-hidden="true"/>
          <input type="search" aria-label="جست‌وجوی نام دانش‌آموز در صف پیگیری"
            placeholder="جست‌وجوی نام دانش‌آموز…" value={studentSearch}
            onChange={event => setStudentSearch(event.target.value)}/>
        </label>
        <Link to="/app/advisor/students">همه دانش‌آموزان <ChevronLeft aria-hidden="true"/></Link>
      </div>
      {matchingStudents.length===0?<p role="status">{query ? 'دانش‌آموزی با این نام پیدا نشد.' : 'دانش‌آموزی در صف پیگیری نیست.'}</p>:<div className="advisor-table-scroll">
        <table>
          <thead><tr><th scope="col">دانش‌آموز</th><th scope="col" aria-sort="ascending">روزهای باقی‌مانده</th><th scope="col">پیشرفت</th><th scope="col">گزارش کار دیروز</th><th scope="col">پیام</th></tr></thead>
          <tbody>{matchingStudents.map(student=>{
            const profile='/app/advisor/students/'+student.id
            const remaining=student.plan_days_remaining
            const unreadCount=unread[student.id]??0
            return <tr key={student.id}>
              <th scope="row"><Link className="advisor-student-name" to={profile+'/report'}><span className="avatar" aria-hidden="true">{student.full_name[0]}</span>{student.full_name}</Link></th>
              <td><span className={remaining===0?'advisor-plan-expired':undefined}>{remaining==null?'بدون برنامه':dashboardNumber.format(remaining)+' روز'}</span></td>
              <td><div className="advisor-student-progress"><span>{dashboardNumber.format(student.progress)}٪</span><progress value={student.progress} max={100} aria-label={`پیشرفت ${student.full_name}`}/></div></td>
              <td>
                <span className={`advisor-report-status ${student.yesterday_report_submitted?'is-submitted':'is-missing'}`} role="img" aria-label={student.yesterday_report_submitted?'گزارش کار دیروز ثبت شده':'گزارش کار دیروز ثبت نشده'} title={student.yesterday_report_submitted?'گزارش کار دیروز ثبت شده':'گزارش کار دیروز ثبت نشده'}>
                  {student.yesterday_report_submitted?<Check aria-hidden="true"/>:<X aria-hidden="true"/>}
                </span>
              </td>
              <td><Link className="advisor-chat-link" to={advisorMessengerThread(student.id)} aria-label={`گفت‌وگو با ${student.full_name}${unreadCount?`، ${dashboardNumber.format(unreadCount)} پیام خوانده‌نشده`:''}`}>
                <Mail aria-hidden="true"/>{!!unreadCount&&<i className="advisor-alert-dot" aria-hidden="true"/>}
              </Link></td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </section>
    <AdvisorProgressChart points={data.progress_history??[]}/>
  </div>
}

function AdvisorProgressChart({points}:{points:AdvisorProgressPoint[]}){
  return <section className="panel advisor-progress-chart" aria-labelledby="advisor-progress-title">
    <h2 id="advisor-progress-title">روند پیشرفت گروه</h2>
    {points.length?<figure>
      <ol className="advisor-chart-bars">{points.map(({week_start,total,completed})=>{
        const percent=Math.round(100*completed/total)
        const week=chartDate.format(new Date(week_start))
        return <li key={week_start} aria-label={`هفتهٔ ${week}، ${dashboardNumber.format(completed)} از ${dashboardNumber.format(total)} فعالیت انجام شده`}>
          <div className="advisor-chart-track"><div className="advisor-chart-bar" style={{height:percent+'%'}}><b>{dashboardNumber.format(percent)}٪</b></div></div>
          <time dateTime={week_start}>{week}</time>
        </li>
      })}</ol>
      <figcaption>هر ستون درصد فعالیت‌های انجام‌شده در برنامه‌های منتشرشدهٔ آن هفته را نشان می‌دهد. تاریخ زیر ستون، شروع هفته است و هفته‌های بدون فعالیت نمایش داده نمی‌شوند.</figcaption>
    </figure>:<p>هنوز فعالیتی در برنامه‌های منتشرشدهٔ هشت هفتهٔ اخیر ثبت نشده است.</p>}
  </section>
}

function AdminDashboard({user}:{user:User}){const {data,isLoading}=useQuery({queryKey:['admin-dashboard'],queryFn:()=>api<AdminData>('/admin/dashboard')});if(isLoading||!data)return <Loading/>;const c=data.counts;return <div className="dashboard-page"><Welcome name={user.full_name} subtitle="سلامت سامانه، کاربران و عملیات حساس در یک نگاه."/><div className="metric-grid"><Metric icon={Users} label="کل کاربران" value={`${c.users||0}`} tone="purple"/><Metric icon={GraduationCap} label="دانش‌آموزان" value={`${c.students||0}`} tone="blue"/><Metric icon={FileQuestion} label="بانک سؤال" value={`${c.questions||0}`} tone="orange"/><Metric icon={UserCheck} label="مشاوران در انتظار" value={`${c.pending_advisors||0}`} tone="green"/></div><div className="dashboard-grid"><section className="panel span-2"><PanelTitle title="وضعیت عملیاتی" action="مشاهده جزئیات"/><div className="ops-grid"><article><span className="service-ok"/><b>API و دیتابیس</b><p>{data.service.status} · {data.service.database}</p></article><article><span className="service-ok"/><b>پردازش‌های زمان‌بندی</b><p>{data.service.jobs} · بدون خطای معوق</p></article><article><span className="service-ok warning"/><b>یکپارچه‌سازی‌ها</b><p>AI و پرداخت در حالت Mock</p></article></div><ChartCard/></section><section className="panel"><PanelTitle title="دسترسی سریع"/><div className="admin-actions"><button><Users/>مدیریت کاربران<ChevronLeft/></button><button><FileQuestion/>بانک سؤال<ChevronLeft/></button><button><CreditCard/>امور مالی و اشتراک<ChevronLeft/></button><button><UserCheck/>تأیید مشاوران<ChevronLeft/></button></div></section><section className="panel span-3"><PanelTitle title="ماژول‌های سامانه"/><div className="module-grid">{['هویت و دسترسی','دانش‌آموز','میزکار مشاور','برنامه‌ریزی','ارتباطات','بانک سؤال','آزمون آنلاین','تحلیل و گزارش','هوش مصنوعی','اشتراک و پرداخت'].map((m,i)=><article key={m}><span>{i+1}</span><b>{m}</b><small>فعال و متصل</small></article>)}</div></section></div></div>}

function Welcome({name,subtitle}:{name:string;subtitle:string}){return <div className="dashboard-welcome"><div><p>سلام، {name.split(' ')[0]} عزیز 👋</p><h1>روز خوبی برای پیشرفت است</h1><span>{subtitle}</span></div><div className="date-chip">{formatJalali(new Date().toISOString(),true)}</div></div>}
function Metric({icon:Icon,label,value,tone}:{icon:typeof Home;label:string;value:string;tone:string}){return <article className="metric"><span className={tone}><Icon/></span><div><small>{label}</small><b>{value}</b></div><TrendingUp className="metric-trend"/></article>}
function PanelTitle({title,action}:{title:string;action?:string}){return <div className="panel-title"><h2>{title}</h2>{action&&<button>{action}<ChevronLeft/></button>}</div>}
function Loading(){return <div className="screen-loader"><img className="brand-logo" src="/brand/mahyaad-logo.png" alt=""/> در حال دریافت اطلاعات...</div>}
