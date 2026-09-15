// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { afterEach,expect,test,vi } from 'vitest'
import { PlanBuilder } from './OperationalPages'
import AIPlanDesigner from './AIPlanDesigner'
import { api } from '../api'
vi.mock('../api',()=>({api:vi.fn()}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear();vi.clearAllMocks()})
const draft={student_id:'s',student_name:'پارسا رضایی',start_date:'1405/06/21',day_start_time:'08:00',day_end_time:'24:00',title:'برنامه پیشنهادی',weekly_mission:'مرور اشکالات',rationale:'بر پایه گزارش‌های دانش‌آموز',cautions:[],days:[{label:'شنبه',date:'1405/06/21'}],activities:[{day:'شنبه',title:'تمرین ریاضی',start_time:'09:00',end_time:'10:00'}]}
function setup(node:React.ReactNode){client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)}
test('AI draft preserves existing edits until applied, then remains editable before publication',async()=>{
 vi.mocked(api).mockImplementation(async(path,options)=>{
  if(path.endsWith('/plan-draft'))return {...draft,...JSON.parse(options!.body as string)} as never
  if(path.endsWith('/report'))return {profile:{}} as never
  if(path==='/plans'&&options?.method==='POST')return {id:'published-id'} as never
  return [] as never
 })
 setup(<PlanBuilder studentId="s"/>)
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 fireEvent.change(screen.getByLabelText('توضیحات (تا ۳ خط)'),{target:{value:'پیش‌نویس دستی'}})
 fireEvent.click(screen.getByRole('button',{name:'طراحی برنامه با هوش مصنوعی'}))
 await screen.findByText('این پیش‌نویس مربوط به دانش‌آموز پارسا رضایی است.')
 expect((screen.getByLabelText('توضیحات (تا ۳ خط)') as HTMLTextAreaElement).value).toBe('پیش‌نویس دستی')
 expect(vi.mocked(api).mock.calls.some(([path,options])=>path==='/plans'&&options?.method==='POST')).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'جایگزینی پیش‌نویس فعلی با پیشنهاد'}))
 fireEvent.click(screen.getByRole('button',{name:'ویرایش بازه تمرین ریاضی'}))
 expect((screen.getByLabelText('توضیحات (تا ۳ خط)') as HTMLTextAreaElement).value).toBe('تمرین ریاضی')
 fireEvent.change(screen.getByLabelText('توضیحات (تا ۳ خط)'),{target:{value:'تمرین و مرور اصلاح‌شده'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره و انتشار برنامه'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/plans/published-id/publish',{method:'POST'}))
 const call=vi.mocked(api).mock.calls.find(([path,options])=>path==='/plans'&&options?.method==='POST')!
 expect(JSON.parse(call[1]!.body as string).activities[0].title).toBe('تمرین و مرور اصلاح‌شده')
 await screen.findByText('برنامه خط زمانی با موفقیت منتشر شد.')
 expect(screen.queryByLabelText('توضیحات (تا ۳ خط)')).toBeNull()
 expect((screen.getByLabelText('ماموریت هفته') as HTMLTextAreaElement).value).toBe('')
 expect(screen.queryByText('این پیش‌نویس مربوط به دانش‌آموز پارسا رضایی است.')).toBeNull()
})
test('a response for another student never reaches the editable form',async()=>{
 vi.mocked(api).mockResolvedValue({...draft,student_id:'other'} as never)
 const apply=vi.fn()
 setup(<AIPlanDesigner studentId="s" startDate="1405/06/21" rangeStart="08:00" rangeEnd="24:00" hasDraft={false} onApply={apply}/>)
 fireEvent.click(screen.getByRole('button',{name:'طراحی برنامه با هوش مصنوعی'}))
 await screen.findByRole('alert')
 expect(apply).not.toHaveBeenCalled()
 expect(screen.queryByRole('button',{name:'قرار دادن پیشنهاد در برنامه‌ساز'})).toBeNull()
})


test('advisor instructions are sent and changing them invalidates an older draft',async()=>{
 vi.mocked(api).mockResolvedValue(draft as never)
 setup(<AIPlanDesigner studentId="s" startDate="1405/06/21" rangeStart="08:00" rangeEnd="24:00" hasDraft={false} onApply={vi.fn()}/>)
 const input=screen.getByLabelText('راهنمای مشاور برای طراحی (اختیاری)')
 fireEvent.change(input,{target:{value:'هر روز ۱۲ تا ۱۳ استراحت باشد'}})
 fireEvent.click(screen.getByRole('button',{name:'طراحی برنامه با هوش مصنوعی'}))
 await screen.findByText('این پیش‌نویس مربوط به دانش‌آموز پارسا رضایی است.')
 expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string).instructions).toBe('هر روز ۱۲ تا ۱۳ استراحت باشد')
 fireEvent.change(input,{target:{value:'تست ریاضی بیشتر باشد'}})
 expect(screen.queryByRole('button',{name:'قرار دادن پیشنهاد در برنامه‌ساز'})).toBeNull()
})

test('clear draft resets activities, mission and AI instructions without publishing',()=>{
 vi.mocked(api).mockResolvedValue([] as never)
 setup(<PlanBuilder studentId="s"/>)
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 fireEvent.change(screen.getByLabelText('ماموریت هفته'),{target:{value:'مرور'}})
 fireEvent.change(screen.getByLabelText('راهنمای مشاور برای طراحی (اختیاری)'),{target:{value:'تست بیشتر'}})
 fireEvent.click(screen.getByRole('button',{name:'پاک کردن پیش‌نویس'}))
 expect(screen.queryByLabelText('توضیحات (تا ۳ خط)')).toBeNull()
 expect((screen.getByLabelText('ماموریت هفته') as HTMLTextAreaElement).value).toBe('')
 expect((screen.getByLabelText('راهنمای مشاور برای طراحی (اختیاری)') as HTMLTextAreaElement).value).toBe('')
 expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==='POST')).toBe(false)
})

test('failed publication keeps the filled draft',async()=>{
 vi.mocked(api).mockImplementation(async(path,options)=>{
  if(path.endsWith('/plan-draft'))return {...draft,...JSON.parse(options!.body as string)} as never
  if(path.endsWith('/report'))return {profile:{}} as never
  if(path==='/plans'&&options?.method==='POST')return {id:'failed-plan'} as never
  if(path.endsWith('/publish'))throw new Error('انتشار ناموفق بود')
  return [] as never
 })
 setup(<PlanBuilder studentId="s"/>)
 fireEvent.click(screen.getByRole('button',{name:'طراحی برنامه با هوش مصنوعی'}))
 fireEvent.click(await screen.findByRole('button',{name:'قرار دادن پیشنهاد در برنامه‌ساز'}))
 fireEvent.click(screen.getByRole('button',{name:'ویرایش بازه تمرین ریاضی'}))
 fireEvent.click(screen.getByRole('button',{name:'ذخیره و انتشار برنامه'}))
 await screen.findByText('انتشار ناموفق بود')
 expect((screen.getByLabelText('توضیحات (تا ۳ خط)') as HTMLTextAreaElement).value).toBe('تمرین ریاضی')
})
