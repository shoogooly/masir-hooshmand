// @vitest-environment jsdom
import {useState} from 'react'
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'
import OnlineExamSheet,{AnswerKeyBuilder,QuestionChoices,validateAnswerKey,ExamResult} from './OnlineExamSheet'
import {api} from '../api'
import type {AnswerSectionDraft,OnlineSheet,OnlineResult} from './onlineExamTypes'
vi.mock('../api',()=>({api:vi.fn()}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear();vi.resetAllMocks();localStorage.clear()})
const initial:OnlineSheet={exam_id:'exam1',sections:[{title:'ریاضی',question_count:2,start_number:1},{title:'فیزیک',question_count:1,start_number:3}],answers:[null,null,null],version:0,negative_marking:false,started_at:new Date(Date.now()-60000).toISOString(),server_time:new Date().toISOString()}
const result:OnlineResult={sections:[{title:'ریاضی',total:2,correct:1,wrong:0,unanswered:1,percentage:50,accuracy:100},{title:'فیزیک',total:1,correct:0,wrong:1,unanswered:0,percentage:0,accuracy:0}],questions:[{number:1,subject:'ریاضی',answer:2,correct_answer:2,status:'correct'},{number:2,subject:'ریاضی',answer:null,correct_answer:3,status:'unanswered'},{number:3,subject:'فیزیک',answer:1,correct_answer:4,status:'wrong'}],total:3,correct:1,wrong:1,unanswered:1,percentage:33.33,accuracy:50,negative_marking:false,elapsed_seconds:90,elapsed_minutes:1.5,overtime_seconds:0,average_seconds_per_question:30}
function setup(advisor=false){client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});render(<QueryClientProvider client={client}><OnlineExamSheet examId="exam1" advisor={advisor}/></QueryClientProvider>)}
test('builder numbers continuously and never permits an incomplete key',()=>{
 function Builder(){const [sections,setSections]=useState<AnswerSectionDraft[]>([{id:'math',title:'ریاضی',correct_answers:[2,3,1,4]},{id:'physics',title:'فیزیک',correct_answers:[null,null]}]);return <AnswerKeyBuilder sections={sections} setSections={setSections} negative={false} setNegative={()=>{}}/>}
 render(<Builder/>)
 expect(screen.getByRole('radiogroup',{name:'پاسخ سؤال 5'})).toBeTruthy()
 const sixth=screen.getByRole('radiogroup',{name:'پاسخ سؤال 6'})
 fireEvent.click(within(sixth).getByRole('radio',{name:'گزینه 2'}))
 expect(within(sixth).getByRole('radio',{name:'گزینه 2'}).getAttribute('aria-checked')).toBe('true')
 expect(()=>validateAnswerKey({sections:[{title:'ریاضی',correct_answers:[null]}],negative_marking:false})).toThrow()
 expect(()=>validateAnswerKey({sections:[{title:'ریاضی',correct_answers:[2]}],negative_marking:false})).not.toThrow()
})
test('student can clear a choice, persist answers and finish with blanks',async()=>{
 let data={...initial}
 vi.mocked(api).mockImplementation(async(path,options)=>{
  if(options?.method==='PUT'){const body=JSON.parse(String(options.body));data={...data,answers:body.answers,version:body.version+1};return data as never}
  if(path.endsWith('/finish'))return {...data,submitted_at:new Date().toISOString(),result} as never
  return data as never
 })
 setup()
 const first=await screen.findByRole('radiogroup',{name:'پاسخ سؤال 1'})
 const secondChoice=within(first).getByRole('radio',{name:'گزینه 2'})
 fireEvent.click(secondChoice);fireEvent.click(secondChoice)
 expect(secondChoice.getAttribute('aria-checked')).toBe('false')
 fireEvent.click(secondChoice)
 fireEvent.click(within(screen.getByRole('radiogroup',{name:'پاسخ سؤال 3'})).getByRole('radio',{name:'گزینه 1'}))
 fireEvent.click(screen.getByRole('button',{name:'ذخیره پاسخ‌ها'}))
 await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('پاسخ‌ها ذخیره شده‌اند.'))
 expect(data.answers).toEqual([2,null,1])
 fireEvent.click(screen.getByRole('button',{name:'اتمام آزمون'}))
 expect(screen.getByRole('alert').textContent).toContain('۱ سؤال بی‌پاسخ')
 fireEvent.click(screen.getByRole('button',{name:'تأیید و ثبت نهایی آزمون'}))
 expect(await screen.findByRole('heading',{name:'نتیجه پاسخنامه آنلاین'})).toBeTruthy()
 expect(screen.queryByRole('radiogroup')).toBeNull()
 expect(localStorage.getItem('online-exam-draft:exam1')).toBeNull()
})
test('answer sheet is unavailable until question download',async()=>{
 vi.mocked(api).mockResolvedValue({...initial,started_at:undefined} as never)
 setup()
 expect(await screen.findByText(/ابتدا فایل سؤالات را دانلود کنید/)).toBeTruthy()
 expect(screen.queryByRole('radiogroup')).toBeNull()
})
test('local unsaved answers survive remount without replacing a newer server version',async()=>{
 localStorage.setItem('online-exam-draft:exam1',JSON.stringify({version:0,answers:[3,null,null]}))
 vi.mocked(api).mockResolvedValue(initial as never)
 setup()
 expect((await screen.findByRole('radiogroup',{name:'پاسخ سؤال 1'})).textContent).toContain('✓')
 expect(screen.getAllByRole('radio',{name:'گزینه 3'})[0].getAttribute('aria-checked')).toBe('true')
})
test('advisor sees key but no student controls; final report includes every question',async()=>{
 vi.mocked(api).mockResolvedValue({...initial,answer_key:[2,3,4]} as never)
 setup(true)
 expect(await screen.findByRole('heading',{name:'کلید پاسخنامه ثبت‌شده'})).toBeTruthy()
 expect(screen.queryByRole('button',{name:'اتمام آزمون'})).toBeNull()
 await act(async()=>{client.setQueryData(['online-sheet','exam1'],{...initial,result,submitted_at:new Date().toISOString()})})
 expect(await screen.findByRole('heading',{name:'نتیجه پاسخنامه آنلاین'})).toBeTruthy()
 expect(screen.getByText('بی‌پاسخ',{selector:'td'})).toBeTruthy()
})
