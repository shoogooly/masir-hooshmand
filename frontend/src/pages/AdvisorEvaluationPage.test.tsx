// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'
import AdvisorEvaluationPage from './AdvisorEvaluationPage'
import {api} from '../api'
vi.mock('../api',()=>({api:vi.fn()}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear();vi.clearAllMocks()})
function setup(){client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}><AdvisorEvaluationPage studentId="s1"/></QueryClientProvider>)}
test('assessment saves without showing the retired calendar form',async()=>{
 let saved={assessment:'یادداشت قبلی',calendar_notes:'تقویم قدیمی',milestones:[{date:'1405/09/30',subject:'ریاضی',topic:'تمرین تابع',status:'practiced'}],version:0,updated_at:''}
 vi.mocked(api).mockImplementation(async(_path,options)=>{
  if(options?.method==='PUT')saved={...saved,...JSON.parse(options.body as string),version:saved.version+1}
  return saved as never
 })
 setup()
 const note=await screen.findByLabelText('ارزیابی کلی شما از دانش‌آموز')
 expect((note as HTMLTextAreaElement).value).toBe('یادداشت قبلی')
 expect(screen.queryByText('تقویم آموزشی سال تحصیلی')).toBeNull()
 fireEvent.change(note,{target:{value:'ارزیابی اصلاح‌شده'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره ارزیابی'}))
 await screen.findByText('ارزیابی مشاور ذخیره شد.')
 expect(saved.calendar_notes).toBe('تقویم قدیمی')
 cleanup();client.clear();setup()
 expect((await screen.findByLabelText('ارزیابی کلی شما از دانش‌آموز') as HTMLTextAreaElement).value).toBe('ارزیابی اصلاح‌شده')
})
test('failed save retains the advisor edits',async()=>{
 vi.mocked(api).mockImplementation(async(_path,options)=>{
  if(options)throw new Error('ذخیره ناموفق')
  return {assessment:'',calendar_notes:'',milestones:[],version:0,updated_at:''} as never
 })
 setup()
 fireEvent.change(await screen.findByLabelText('ارزیابی کلی شما از دانش‌آموز'),{target:{value:'نباید پاک شود'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره ارزیابی'}))
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('ذخیره ناموفق'))
 expect((screen.getByLabelText('ارزیابی کلی شما از دانش‌آموز') as HTMLTextAreaElement).value).toBe('نباید پاک شود')
})
