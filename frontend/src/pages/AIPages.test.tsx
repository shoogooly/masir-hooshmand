// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AdminAIPage, AdvisorAIPage, StudentAIPage } from './AIPages'
import { api } from '../api'
vi.mock('../api',()=>({api:vi.fn()}))
let client:QueryClient
const usage={limit:5,used:0,remaining:5,locked:false,enabled:true,override:null,default_limit:5,reset_at:'2026-09-19T00:00:00+03:30'}
const review=(id:string,name:string)=>({id:'r'+id,student_id:id,student_name:name,status:'completed',kind:'weekly',week:'2026-09-12',created_at:'2026-09-14T12:00:00Z',completed_at:'2026-09-14T12:00:00Z',coverage:{plans:1},result:{summary:'شرح حال '+name,risk:'medium',data_quality:'moderate',strengths:[],weaknesses:[],changes:[],next_week_plan:[{day:'شنبه',minutes:60,focus:'ریاضی',reason:'مرور'}],advisor_actions:[],questions:[],data_gaps:[]}})
const students=[{id:'s1',full_name:'پارسا رضایی',status:'active',usage,latest:review('s1','پارسا رضایی')},{id:'s2',full_name:'مریم احمدی',status:'active',usage,latest:review('s2','مریم احمدی')}]
beforeEach(()=>{
 vi.mocked(api).mockImplementation(async(path,init)=>{
  if(path==='/ai/students')return students as never
  if(path.endsWith('/analyses'))return [path.includes('/s1/')?review('s1','پارسا رضایی'):review('s2','مریم احمدی')] as never
  if(path.endsWith('/chat')&&!init)return {turns:[],next_cursor:null,usage} as never
  if(path==='/ai/settings')return {enabled:true,model:'gpt-4o-mini',weekly_limit:5,token_configured:true,provider:'gapgpt',base_url:'https://api.gapgpt.app/v1',providers:{gapgpt:{label:'گپ‌جی‌پی‌تی',model:'gpt-4o-mini',token_configured:true,base_url:'https://api.gapgpt.app/v1'},mistral:{label:'میسترال',model:'mistral-small-latest',token_configured:false,base_url:'https://api.mistral.ai/v1'}}} as never
  return {} as never
 })
})
afterEach(()=>{cleanup();client?.clear();vi.clearAllMocks()})
function setup(el:React.ReactNode){client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}>{el}</QueryClientProvider>)}
test('advisor switches between students without retaining another student report',async()=>{
 setup(<AdvisorAIPage/>)
 fireEvent.click(await screen.findByRole('button',{name:/پارسا رضایی/}))
 expect(await screen.findByText('این بررسی مربوط به دانش‌آموز پارسا رضایی است.')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:/مریم احمدی/}))
 expect(screen.queryByText('شرح حال پارسا رضایی')).toBeNull()
 expect(await screen.findByText('این بررسی مربوط به دانش‌آموز مریم احمدی است.')).toBeTruthy()
 expect(api).toHaveBeenCalledWith('/ai/students/s2/analyses')
})
test('advisor can inspect and lock only selected student conversation',async()=>{
 setup(<AdvisorAIPage/>)
 fireEvent.click(await screen.findByRole('button',{name:/پارسا رضایی/}))
 fireEvent.click(screen.getByRole('button',{name:'گفت‌وگو با هوش مصنوعی'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/ai/students/s1/chat'))
 fireEvent.click(screen.getByRole('button',{name:'قفل کردن گفت‌وگو'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/ai/students/s1/lock',expect.objectContaining({method:'PUT',body:JSON.stringify({locked:true})})))
 expect(screen.queryByLabelText('پیام درسی شما')).toBeNull()
})
test('student sends an educational message and sees persisted reply with remaining quota',async()=>{
 vi.mocked(api).mockImplementation(async(path,init)=>{
  if(init)return {turn:{id:'t',message:'کمک در ریاضی',reply:'از مرور شروع کن',status:'completed'},usage:{...usage,used:1,remaining:4}} as never
  const sent=vi.mocked(api).mock.calls.some(([,options])=>options?.method==='POST')
  return {turns:sent?[{id:'t',message:'کمک در ریاضی',reply:'از مرور شروع کن',status:'completed',created_at:'2026-09-14T12:00:00Z'}]:[],next_cursor:null,usage:sent?{...usage,used:1,remaining:4}:usage} as never
 })
 setup(<StudentAIPage/>)
 await screen.findByText('۵ پیام باقی‌مانده')
 fireEvent.change(screen.getByLabelText('پیام درسی شما'),{target:{value:'کمک در ریاضی'}})
 fireEvent.click(screen.getByRole('button',{name:'ارسال پیام'}))
 expect(await screen.findByText('از مرور شروع کن')).toBeTruthy()
 expect(await screen.findByText('۴ پیام باقی‌مانده')).toBeTruthy()
 expect((screen.getByLabelText('پیام درسی شما') as HTMLTextAreaElement).value).toBe('')
})
test('locked and exhausted student cannot send messages',async()=>{
 vi.mocked(api).mockResolvedValue({turns:[],next_cursor:null,usage:{...usage,locked:true,remaining:0}} as never)
 setup(<StudentAIPage/>)
 await screen.findByText('مشاور شما این گفت‌وگو را قفل کرده است.')
 expect((screen.getByLabelText('پیام درسی شما') as HTMLTextAreaElement).disabled).toBe(true)
 expect((screen.getByRole('button',{name:'ارسال پیام'}) as HTMLButtonElement).disabled).toBe(true)
})
test('admin sees a blank write-only token and can restore inherited student limit',async()=>{
 setup(<AdminAIPage/>)
 expect((await screen.findByLabelText('توکن گپ‌جی‌پی‌تی') as HTMLInputElement).value).toBe('')
 const input=await screen.findByLabelText('سهمیه هفتگی پارسا رضایی')
 fireEvent.change(input,{target:{value:'9'}})
 fireEvent.submit(input.closest('form')!)
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/ai/students/s1/limit',expect.objectContaining({body:JSON.stringify({weekly_limit:9})})))
})

test('switching providers clears unsaved key and submits the selected provider',async()=>{
 setup(<AdminAIPage/>)
 fireEvent.change(await screen.findByLabelText('توکن گپ‌جی‌پی‌تی'),{target:{value:'unsaved-gap-key'}})
 fireEvent.change(screen.getByLabelText('سرویس مورد استفاده'),{target:{value:'mistral'}})
 expect((screen.getByLabelText('توکن میسترال') as HTMLInputElement).value).toBe('')
 expect((screen.getByLabelText('نام مدل') as HTMLInputElement).value).toBe('mistral-small-latest')
 expect((screen.getByRole('button',{name:'آزمایش اتصال ذخیره‌شده'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.change(screen.getByLabelText('توکن میسترال'),{target:{value:'new-mistral-key'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره تنظیمات'}))
 await waitFor(()=>expect(vi.mocked(api).mock.calls.some(([path,options])=>path==='/ai/settings'&&options?.method==='PUT'&&JSON.parse(options.body as string).provider==='mistral'&&JSON.parse(options.body as string).api_key==='new-mistral-key')).toBe(true))
})
