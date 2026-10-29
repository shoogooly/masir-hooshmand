// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'
import {PlanBuilder} from './OperationalPages'
import GroupExamsPage from './GroupExamsPage'
import AdvisorPlanArchive from './AdvisorPlanArchive'
import ExternalResultsPage from './ExternalResultsPage'
import {api} from '../api'
import {exportArchivedPlans} from '../utils/planPdf'
vi.mock('../api',()=>({api:vi.fn()}))
vi.mock('../utils/planPdf',()=>({exportArchivedPlans:vi.fn(async()=>{})}))
vi.mock('./AIPlanDesigner',()=>({default:()=>null}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear();vi.clearAllMocks()})
function setup(node:React.ReactNode){client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)}
test('volume ranges copy to another day and save incomplete drafts without publication',async()=>{
 vi.mocked(api).mockImplementation(async(path)=>path==='/plan-drafts'?{id:'draft'} as never:path.endsWith('/report')?{profile:{school_schedule:{'شنبه':['ریاضی','فیزیک']}}} as never:[] as never)
 setup(<PlanBuilder studentId="s"/>)
 fireEvent.click(screen.getByRole('button',{name:'برنامه حجمی'}))
 expect(screen.queryByLabelText('شروع کل روز ساعت')).toBeNull()
 const addButtons=screen.getAllByRole('button',{name:/افزودن بازه برای/})
 const firstDay=addButtons[0].getAttribute('aria-label')!.replace('افزودن بازه برای ','')
 const secondDay=addButtons[1].getAttribute('aria-label')!.replace('افزودن بازه برای ','')
 fireEvent.change(screen.getByLabelText(`مدت بازه جدید ${firstDay}`),{target:{value:'90'}})
 fireEvent.click(addButtons[0])
 fireEvent.change(screen.getByRole('textbox',{name:'توضیحات بازه'}),{target:{value:'ریاضی'}})
 fireEvent.click(screen.getByRole('button',{name:`کپی برنامه ${firstDay}`}))
 fireEvent.click(screen.getByRole('button',{name:`جایگذاری برنامه ${secondDay}`}))
 expect(screen.getAllByRole('button',{name:/ویرایش بازه/}).map(block=>block.getAttribute('aria-label'))).toEqual(['ویرایش بازه ریاضی','ویرایش بازه ریاضی'])
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[2])
 await waitFor(()=>expect(vi.mocked(api).mock.calls.some(([p])=>p==='/plan-drafts')).toBe(true),{timeout:3000})
 const call=vi.mocked(api).mock.calls.find(([p])=>p==='/plan-drafts')!
 const body=JSON.parse(call[1]!.body as string)
 expect(body.plan_mode).toBe('volume')
 expect(body.draft_state.items).toHaveLength(3)
 expect(body.draft_state.items.slice(0,2).map((a:any)=>a.duration)).toEqual([90,90])
 expect(vi.mocked(api).mock.calls.some(([p])=>p.endsWith('/publish'))).toBe(false)
})
test('stored drafts reopen with their fields and are published using the existing ID',async()=>{
 vi.mocked(api).mockImplementation(async(path)=>path==='/plans/existing'?{id:'existing'} as never:[] as never)
 setup(<PlanBuilder studentId="s" initialPlan={{id:'existing',student_id:'s',title:'تمرین حجمی',week_label:'هفته',version:2,status:'draft',plan_mode:'volume',days:[],activities:[],time_slots:[],draft_state:{title:'تمرین حجمی',week:'هفته',mission:'مرور',mode:'volume',startDate:{year:1405,month:7,day:18},rangeStart:'08:00',rangeEnd:'24:00',items:[{id:'a',dayId:'day-0',start:'',end:'',duration:90,title:'ریاضی'}]}}}/>)
 expect((screen.getByLabelText('عنوان برنامه') as HTMLInputElement).value).toBe('تمرین حجمی')
 fireEvent.click(screen.getByRole('button',{name:'ذخیره و انتشار برنامه'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/plans/existing/publish',{method:'POST'}))
 const call=vi.mocked(api).mock.calls.find(([p])=>p==='/plans/existing')!
 expect(call[1]!.method).toBe('PUT')
 expect(JSON.parse(call[1]!.body as string).activities[0].planned_minutes).toBe(90)
 expect(vi.mocked(api).mock.calls.some(([p,options])=>p==='/plans'&&options?.method==='POST')).toBe(false)
})
test('group exam selection proceeds with only selected students and uses the shared exam form',async()=>{
 vi.mocked(api).mockResolvedValue([{id:'s1',full_name:'دانش‌آموز یک',phone:'09120000001'},{id:'s2',full_name:'دانش‌آموز دو',phone:'09120000002'}] as never)
 setup(<GroupExamsPage/>)
 fireEvent.click(await screen.findByRole('checkbox',{name:/دانش‌آموز یک/}))
 fireEvent.click(screen.getByRole('button',{name:'مرحله بعد'}))
 expect(screen.getByText('این آزمون برای ۱ دانش‌آموز انتخاب‌شده ارسال می‌شود.')).toBeTruthy()
 expect(screen.getByLabelText('فایل سؤالات PDF')).toBeTruthy()
 expect(screen.getByRole('checkbox',{name:'پاسخنامه آنلاین چهارگزینه‌ای'})).toBeTruthy()
 expect(screen.getByRole('button',{name:'ارسال آزمون برای همه انتخاب‌شده‌ها'})).toBeTruthy()
})
test('archive downloads the selected published plan and exposes editable drafts separately',async()=>{
 const published={id:'p',student_id:'s',title:'برنامه ارسال‌شده نمونه',week_label:'هفته اول',version:1,status:'published',days:[],activities:[],time_slots:[]}
 const draft={...published,id:'d',title:'پیش‌نویس نمونه',status:'draft'}
 vi.mocked(api).mockResolvedValue([published,draft] as never)
 const edit=vi.fn();setup(<AdvisorPlanArchive studentId="s" studentName="دانش‌آموز" advisorName="مشاور" onEditDraft={edit}/>)
 fireEvent.click(await screen.findByRole('button',{name:'دانلود PDF برنامه هفته اول'}))
 await waitFor(()=>expect(exportArchivedPlans).toHaveBeenCalledWith([published],'دانش‌آموز','مشاور'))
 fireEvent.click(screen.getByRole('button',{name:'پیش‌نویس‌ها'}))
 fireEvent.click(screen.getByRole('button',{name:'ادامه ویرایش'}))
 expect(edit).toHaveBeenCalledWith(draft)
 expect(screen.queryByRole('button',{name:/دانلود PDF/})).toBeNull()
})
test('external result edits retain optimistic version and submit entered details',async()=>{
 const result={id:'r',title:'آزمون مدرسه',exam_date:'1405/07/18',organizer:'مدرسه',scaled_score:6200,rank:20,correct_count:60,wrong_count:20,total_questions:100,subjects:[],notes:'',version:3}
 vi.mocked(api).mockResolvedValue([result] as never)
 setup(<ExternalResultsPage studentId="s"/>)
 fireEvent.click(await screen.findByRole('button',{name:'ویرایش'}))
 fireEvent.change(screen.getByLabelText('تراز کل'),{target:{value:'6500'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره نتیجه'}))
 await waitFor(()=>expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==='PUT')).toBe(true))
 const call=vi.mocked(api).mock.calls.find(([,options])=>options?.method==='PUT')!
 expect(call[0]).toBe('/students/s/external-results/r')
 expect(JSON.parse(call[1]!.body as string)).toMatchObject({scaled_score:6500,version:3})
})
