// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'
import {api} from '../api'
import type {User} from '../types'
import AcademicCalendarPage from './AcademicCalendarPage'

vi.mock('../api',()=>({api:vi.fn()}))
let client:QueryClient
const user={id:'advisor',full_name:'مشاور نمونه',role:'advisor'} as User
afterEach(()=>{cleanup();client?.clear();vi.clearAllMocks()})
function setup(node:React.ReactNode){client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)}

test('advisor sees only the student grade-major catalog and selects a full calendar',async()=>{
 vi.mocked(api).mockImplementation(async(path,options)=>{
  if(options?.method==='PUT')return {} as never
  return {student_id:'student',grade:'دوازدهم',major:'تجربی',selected_id:null,calendars:[{
   id:'calendar-1',grade:'دوازدهم',major:'تجربی',title:'تقویم جامع',designer_name:'کارشناس نمونه',designer_role_label:'کارشناس',selected:false,created_at:'',
   items:[{month:8,day:15,subject:'زیست‌شناسی',topics:'فصل یک'}]}]} as never
 })
 setup(<AcademicCalendarPage mode="advisor" user={user} studentId="student"/>)
 expect(await screen.findByText(/پایه دوازدهم و رشته تجربی/)).toBeTruthy()
 expect(screen.getByText(/کارشناس نمونه/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'مشاهده کامل'}))
 expect(screen.getByText('فصل یک')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'انتخاب برای دانش‌آموز'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/students/student/academic-calendar/calendar-1',{method:'PUT'}))
})

test('management supports post-exam grade, custom majors and multiple lessons on one date',async()=>{
 const manager={id:'manager',full_name:'مدیر نمونه',role:'super_admin'} as User
 vi.mocked(api).mockImplementation(async(_path,options)=>options?.method==='POST'?{id:'new'} as never:[] as never)
 setup(<AcademicCalendarPage mode="management" user={manager}/>)
 fireEvent.change(screen.getByLabelText('پایه تحصیلی'),{target:{value:'پشت کنکوری'}})
 fireEvent.change(screen.getByLabelText('رشته تحصیلی'),{target:{value:'سایر'}})
 fireEvent.change(screen.getByLabelText('نام رشته دیگر'),{target:{value:'علوم و معارف'}})
 fireEvent.click(screen.getByRole('button',{name:/طراحی تقویم جدید/}))
 fireEvent.change(screen.getByLabelText('عنوان تقویم آموزشی'),{target:{value:'تقویم معارف'}})
 fireEvent.change(screen.getByPlaceholderText('مثلاً ریاضی'),{target:{value:'فلسفه'}})
 fireEvent.change(screen.getByPlaceholderText('مباحث و فصل‌ها'),{target:{value:'مبحث اول'}})
 fireEvent.click(screen.getByRole('button',{name:/درس دیگر در همین تاریخ/}))
 const subjects=screen.getAllByPlaceholderText('مثلاً ریاضی')
 const topics=screen.getAllByPlaceholderText('مباحث و فصل‌ها')
 fireEvent.change(subjects[1],{target:{value:'عربی'}});fireEvent.change(topics[1],{target:{value:'ترجمه'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره تقویم'}))
 await waitFor(()=>expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==='POST')).toBe(true))
 const call=vi.mocked(api).mock.calls.find(([,options])=>options?.method==='POST')!
 const body=JSON.parse(call[1]!.body as string)
 expect(body).toMatchObject({grade:'پشت کنکوری',major:'علوم و معارف'})
 expect(body.items).toHaveLength(2)
 expect(body.items[0]).toMatchObject({month:body.items[1].month,day:body.items[1].day})
})

test('manager can permanently delete a calendar after confirmation',async()=>{
 const manager={id:'manager',full_name:'مدیر نمونه',role:'super_admin'} as User
 vi.spyOn(window,'confirm').mockReturnValue(true)
 vi.mocked(api).mockImplementation(async(_path,options)=>options?.method==='DELETE'?{deleted:true,student_selections_removed:2} as never:[{
  id:'calendar-delete',grade:'دوازدهم',major:'تجربی',title:'تقویم قابل حذف',designer_name:'مدیر',designer_role_label:'مدیر',selected:false,created_at:'',items:[]} ] as never)
 setup(<AcademicCalendarPage mode="management" user={manager}/>)
 fireEvent.click(await screen.findByRole('button',{name:'حذف تقویم'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/academic-calendars/calendar-delete?confirmed=true',{method:'DELETE'}))
 expect(await screen.findByText(/۲ دانش‌آموز/)).toBeTruthy()
})
