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
   items:[],nodes:[{id:'node-1',parent_id:null,subject:'زیست‌شناسی',title:'زیست‌شناسی',month:null,day:null,depth:1},{id:'node-2',parent_id:'node-1',subject:'زیست‌شناسی',title:'فصل یک',month:8,day:15,depth:2}]}]} as never
 })
 setup(<AcademicCalendarPage mode="advisor" user={user} studentId="student"/>)
 expect(await screen.findByText(/پایه دوازدهم و رشته تجربی/)).toBeTruthy()
 expect(screen.getByText(/کارشناس نمونه/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'مشاهده کامل'}))
 expect(screen.getByText('فصل یک')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'انتخاب برای دانش‌آموز'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/students/student/academic-calendar/calendar-1',{method:'PUT'}))
})

test('management saves multiple tree lessons on one date for a custom major',async()=>{
 const manager={id:'manager',full_name:'مدیر نمونه',role:'super_admin'} as User
 vi.mocked(api).mockImplementation(async(_path,options)=>options?.method==='POST'?{id:'new'} as never:[] as never)
 setup(<AcademicCalendarPage mode="management" user={manager}/>)
 fireEvent.change(screen.getByLabelText('پایه تحصیلی'),{target:{value:'پشت کنکوری'}})
 fireEvent.change(screen.getByLabelText('رشته تحصیلی'),{target:{value:'سایر'}})
 fireEvent.change(screen.getByLabelText('نام رشته دیگر'),{target:{value:'علوم و معارف'}})
 fireEvent.click(screen.getByRole('button',{name:/طراحی تقویم جدید/}))
 fireEvent.change(screen.getByLabelText('عنوان تقویم آموزشی'),{target:{value:'تقویم معارف'}})
 fireEvent.click(screen.getByRole('button',{name:'افزودن درس'}))
 fireEvent.click(screen.getByRole('button',{name:'افزودن درس'}))
 const subjects=screen.getAllByPlaceholderText('مثلاً فیزیک')
 fireEvent.change(subjects[0],{target:{value:'فلسفه'}})
 fireEvent.change(subjects[1],{target:{value:'عربی'}})
 for(const select of screen.getAllByLabelText('مهلت ماه'))fireEvent.change(select,{target:{value:'8'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره تقویم'}))
 await waitFor(()=>expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==='POST')).toBe(true))
 const call=vi.mocked(api).mock.calls.find(([,options])=>options?.method==='POST')!
 const body=JSON.parse(call[1]!.body as string)
 expect(body).toMatchObject({grade:'پشت کنکوری',major:'علوم و معارف'})
 expect(body.items).toHaveLength(0)
 expect(body.nodes).toHaveLength(2)
 expect(body.nodes[0]).toMatchObject({subject:'فلسفه',month:8,day:body.nodes[1].day})
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

test('manager edits the shared tree and title with its current version',async()=>{
 const manager={id:'manager',full_name:'مدیر نمونه',role:'super_admin'} as User
 const root='11111111-1111-4111-8111-111111111111',leaf='22222222-2222-4222-8222-222222222222'
 vi.mocked(api).mockImplementation(async(_path,options)=>options?.method==='PUT'?{id:'calendar-edit'} as never:[{
  id:'calendar-edit',version:3,grade:'دوازدهم',major:'تجربی',title:'تقویم اولیه',designer_name:'مدیر',designer_role_label:'مدیر',selected:false,items:[],
  nodes:[{id:root,parent_id:null,subject:'فیزیک',title:'فیزیک',month:null,day:null,depth:1},
   {id:leaf,parent_id:root,subject:'فیزیک',title:'حرکت‌شناسی',month:8,day:10,depth:2}]}] as never)
 setup(<AcademicCalendarPage mode="management" user={manager}/> )
 fireEvent.click(await screen.findByRole('button',{name:'ویرایش تقویم'}))
 fireEvent.change(screen.getByLabelText('عنوان تقویم آموزشی'),{target:{value:'تقویم به‌روز'}})
 fireEvent.change(screen.getByDisplayValue('حرکت‌شناسی'),{target:{value:'حرکت‌شناسی و سرعت'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره تغییرات تقویم'}))
 await waitFor(()=>expect(vi.mocked(api).mock.calls.some(([path,options])=>path==='/academic-calendars/calendar-edit'&&options?.method==='PUT')).toBe(true))
 const call=vi.mocked(api).mock.calls.find(([path,options])=>path==='/academic-calendars/calendar-edit'&&options?.method==='PUT')!
 expect(JSON.parse(call[1]!.body as string)).toMatchObject({title:'تقویم به‌روز',version:3,nodes:[{id:root},{id:leaf,title:'حرکت‌شناسی و سرعت'}]})
})
