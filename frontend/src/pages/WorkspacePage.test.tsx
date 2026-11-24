// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import WorkspacePage from './WorkspacePage'
import type { User } from '../types'

vi.mock('../api',()=>({
  auth:{logout:vi.fn()},
  api:vi.fn((path:string)=>{
    if(path==='/notifications/summary')return Promise.resolve({unread_messages:2,unseen_plans:0,unseen_exams:0,expired_student_ids:[],unread_by_sender:{'student-1':2},pending_advisor_requests:1,unread_ai_analyses:1})
    if(path==='/advisors/dashboard')return Promise.resolve({
      user:advisor,alerts:0,weekly_plans:2,pending_insights:0,
      students:[{...student,id:'student-2',full_name:'دانش‌آموز دوم',plan_days_remaining:4,progress:50,yesterday_report_submitted:false},{...student,plan_days_remaining:1,progress:75,yesterday_report_submitted:true}],
      progress_history:[{week_start:'2026-11-21T00:00:00+03:30',total:4,completed:3}],
    })
    if(path==='/chat/contacts')return Promise.resolve([{...student,locked:false}])
    if(path==='/messages?counterpart_id=student-1')return Promise.resolve([{id:'message-1',sender_id:'student-1',recipient_id:'advisor-1',created_at:'2026-11-23T08:00:00Z',body:'پیام اختصاصی دانش‌آموز'}])
    if(path==='/profile')return Promise.resolve({...student,goal:'پزشکی'})
    if(path==='/students/advisor')return Promise.resolve({id:'advisor-1',phone:'09000000002',full_name:'مشاور نمونه',role:'advisor',status:'active'})
    if(path==='/students/dashboard')return Promise.resolve({user:student,profile:{goal:'پزشکی'},progress:0,study_minutes:0,activities:[],exams:[],insights:[]})
    if(path==='/students/subscription-overview')return Promise.resolve({current:{remaining_days:12}})
    if(path==='/advisors/students/student-1/report')return Promise.resolve({student,profile:{
      grade:'یازدهم',major:'تجربی',school:'دبیرستان نمونه',average_grade10:18.75,average_grade11:19.5,parent_phone:'09000000003',
    },summary:{progress:0,planned_minutes:0,actual_minutes:0,test_count:0,completed:0,total:0},subjects:[],activities:[],results:[],insights:[]})
    if(path==='/assigned-exams?student_id=student-1')return Promise.resolve([])
    if(path==='/plans')return Promise.resolve([{id:'plan-1',student_id:'student-1',title:'برنامه هفتگی',week_label:'هفته جاری',version:2,status:'published',day_start_time:'08:00',day_end_time:'24:00',weekly_mission:'مرور کامل فصل سوم',days:[{label:'شنبه',date:'۱۴۰۵/۰۵/۲۷'}],time_slots:[],activities:[{id:'activity-1',day:'شنبه',subject:'برنامه',title:'مطالعه ریاضی',start_time:'08:00',end_time:'10:00',planned_minutes:120,actual_minutes:0,test_count:0,status:'pending',note:''}]}])
    if(path.endsWith('/study-reports'))return Promise.resolve({activities:{},days:{},editable:true,starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+86400000).toISOString(),editable_until:new Date(Date.now()+86400000).toISOString(),server_time:new Date().toISOString()})
    return Promise.resolve([])
  }),
}))

const student:User={id:'student-1',phone:'09000000001',full_name:'دانش‌آموز نمونه',role:'student',status:'active'}

const advisor:User={id:'advisor-1',phone:'09000000002',full_name:'مشاور نمونه',role:'advisor',status:'active'}
afterEach(cleanup)
function setup(user:User=student,route='/app/student/overview'){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><WorkspacePage user={user}/></MemoryRouter></QueryClientProvider>)
}

test('student home shows the compact plan, subscription and opens the full plan',async()=>{
  setup()
  expect(await screen.findByText(/۱۲ روز تا پایان اشتراک/)).toBeTruthy()
  const summary=await screen.findByRole('region',{name:'آخرین برنامه'})
  expect(within(summary).getAllByRole('columnheader')).toHaveLength(8)
  expect(within(summary).getByText('مطالعه ریاضی')).toBeTruthy()
  expect(within(screen.getByRole('complementary')).queryByRole('button',{name:/^(برنامه من|آزمون‌ها|گزارش پیشرفت|صحبت با هوش مصنوعی)$/})).toBeNull()
  fireEvent.click(screen.getByRole('link',{name:/برنامه من/}))
  expect(screen.getByText('در حال باز کردن بخش…')).toBeTruthy()
  expect(await screen.findByText('مطالعه ریاضی')).toBeTruthy()
  expect(screen.getAllByText('۱۴۰۵/۰۵/۲۷')).toHaveLength(3)
  expect(screen.getByRole('heading',{name:'برنامه هفتگی'})).toBeTruthy()
  const pdfHeader=document.querySelector('.pdf-reference-header')
  await waitFor(()=>expect(pdfHeader?.getAttribute('data-student-name')).toBe('دانش‌آموز نمونه'))
  await waitFor(()=>expect(pdfHeader?.getAttribute('data-advisor-name')).toBe('مشاور نمونه'))
  expect(screen.getByText(/مرور کامل فصل سوم/)).toBeTruthy()
  expect(screen.getByText('مطالعه ریاضی').closest('.student-activity')).toBeTruthy()
  expect(screen.getByRole('button',{name:'دانلود رنگی برنامه'})).toBeTruthy()
  expect(screen.getByRole('button',{name:'دانلود سیاه و سفید'})).toBeTruthy()
  expect(screen.getByRole('link',{name:'بازگشت به صفحه اصلی'})).toBeTruthy()
})

test('advisor student exams route opens the upload form',async()=>{
  setup(advisor,'/app/advisor/students/student-1/exams')
  expect(await screen.findByRole('heading',{name:'ارسال آزمون جدید'})).toBeTruthy()
})

test('advisor home sorts the queue and opens messages and requests from their badges',async()=>{
  setup(advisor,'/app/advisor/overview')
  const table=await screen.findByRole('table')
  const firstStudent=within(table).getAllByRole('row')[1]
  expect(within(firstStudent).getByRole('link',{name:student.full_name}).getAttribute('href')).toBe('/app/advisor/students/student-1/report')
  const chat=within(firstStudent).getByRole('link',{name:/پیام خوانده‌نشده/})
  expect(chat.getAttribute('href')).toBe('/app/advisor/messages?contact=student-1')
  expect(within(firstStudent).getByRole('img',{name:'گزارش کار دیروز ثبت شده'})).toBeTruthy()
  expect(within(table).getByRole('img',{name:'گزارش کار دیروز ثبت نشده'})).toBeTruthy()
  expect(within(table).queryByText('ریسک')).toBeNull()
  expect(within(screen.getByRole('region',{name:'روند پیشرفت گروه'})).getByText('۷۵٪')).toBeTruthy()
  expect(within(screen.getByRole('navigation')).queryByText('افزودن دانش‌آموز')).toBeNull()
  expect(within(screen.getByRole('navigation')).queryByRole('button',{name:'دانش‌آموزان'})).toBeNull()
  expect(screen.queryByRole('heading',{name:'اولویت امروز'})).toBeNull()
  expect(screen.queryByRole('heading',{name:'کنترل هوشمند'})).toBeNull()
  expect(within(screen.getByRole('navigation')).queryByText('پیشنهادهای AI')).toBeNull()
  fireEvent.click(await screen.findByRole('link',{name:/پیشنهادات AI.*تحلیل خوانده‌نشده/}))
  expect(await screen.findByRole('heading',{name:'پیشنهادهای AI'})).toBeTruthy()
  fireEvent.click(screen.getByRole('link',{name:'بازگشت به صفحه اصلی'}))
  const requests=await screen.findByRole('link',{name:/درخواست در انتظار/})
  expect(requests.className).toBe(screen.getByRole('link',{name:'افزودن دانش‌آموز'}).className)
  fireEvent.click(requests)
  fireEvent.click(await screen.findByRole('link',{name:'بازگشت به صفحه اصلی'}))
  fireEvent.click(await screen.findByRole('link',{name:'افزودن دانش‌آموز'}))
  expect(await screen.findByRole('heading',{name:'افزودن دانش‌آموز'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'صفحه اصلی'}))
  expect(await screen.findByRole('table')).toBeTruthy()
  fireEvent.click(screen.getByRole('link',{name:'همه دانش‌آموزان'}))
  expect(await screen.findByRole('heading',{name:'دانش‌آموزان'})).toBeTruthy()
  fireEvent.click(screen.getByRole('link',{name:'بازگشت به صفحه اصلی'}))
  fireEvent.click(await screen.findByRole('link',{name:student.full_name}))
  fireEvent.click(await screen.findByRole('button',{name:'بازگشت به صفحه اصلی'}))
  expect(await screen.findByRole('table')).toBeTruthy()
})

test('the advisor queue and student file both open the same messenger thread',async()=>{
  setup(advisor,'/app/advisor/overview')
  fireEvent.click(await screen.findByRole('link',{name:/گفت‌وگو با دانش‌آموز نمونه/}))
  expect(await screen.findByRole('heading',{name:'پیامرسان مهیاد'})).toBeTruthy()
  expect(await screen.findByText('پیام اختصاصی دانش‌آموز')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'صفحه اصلی'}))
  fireEvent.click(await screen.findByRole('link',{name:student.full_name}))
  fireEvent.click(await screen.findByRole('button',{name:'گفت‌وگو'}))
  expect(await screen.findByRole('heading',{name:'پیامرسان مهیاد'})).toBeTruthy()
  expect(await screen.findByText('پیام اختصاصی دانش‌آموز')).toBeTruthy()
})
test('advisor performance tab opens daily activity reports with optional overall charts',async()=>{
 setup(advisor,'/app/advisor/students/student-1/report')
 const profile=await screen.findByRole('table',{name:'مشخصات دانش‌آموز'})
 for(const value of ['یازدهم','تجربی','دبیرستان نمونه','۱۸٫۷۵',student.phone,'09000000003']){
  expect(within(profile).getByText(value)).toBeTruthy()
 }
 expect(within(profile).queryByText('۱۹٫۵')).toBeNull()
 expect(await screen.findByRole('heading',{name:'گزارش روزبه‌روز و فعالیت‌ها'})).toBeTruthy()
 expect(await screen.findByText('مطالعه ریاضی')).toBeTruthy()
 expect(screen.getByText('نمایش آمار کلی و نمودارهای پیشرفت').closest('details')?.open).toBe(false)
 expect(document.querySelector('.advisor-study-plan')).toBeTruthy()
})
