// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { api } from '../api'
import StudyReportPlan from './StudyReportPlan'
import type { WeeklyPlan } from '../types'
import type { StudyReports } from './studyReportTypes'
vi.mock('../api',()=>({api:vi.fn()}))
beforeAll(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
})
let qc:QueryClient
afterEach(()=>{cleanup();qc?.clear();vi.resetAllMocks()})
const plan={id:'p',title:'هفته',week_label:'هفته جاری',days:[{label:'شنبه',date:'۱۴۰۵/۰۶/۲۱'}],activities:[{id:'a',day:'شنبه',title:'مطالعه زیست',start_time:'08:00',end_time:'09:00'}]} as WeeklyPlan
const initial=():StudyReports=>({activities:{a:{values:{},version:0}},days:{},editable:true,starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+86400000).toISOString(),editable_until:new Date(Date.now()+86400000).toISOString(),server_time:new Date().toISOString()})
function setup(data:StudyReports,student=true){
 vi.mocked(api).mockResolvedValue(data)
 qc=new QueryClient({defaultOptions:{queries:{retry:false}}})
 return render(<QueryClientProvider client={qc}><StudyReportPlan plan={plan} student={student}/></QueryClientProvider>)
}
test('conditional activity form saves optional values and restores saved report',async()=>{
 const data=initial();setup(data)
 fireEvent.click(await screen.findByRole('button',{name:'ثبت / ویرایش گزارش'}))
 const dialog=screen.getByRole('dialog')
 expect(within(dialog).queryByLabelText('مدت انجام فعالیت (دقیقه)')).toBeNull()
 fireEvent.change(within(dialog).getByLabelText('وضعیت انجام فعالیت'),{target:{value:'done'}})
 expect(within(dialog).queryByLabelText('تعداد پاسخ‌های درست')).toBeNull()
 fireEvent.change(within(dialog).getByLabelText('تعداد سؤال‌ها'),{target:{value:'10'}})
 fireEvent.change(within(dialog).getByLabelText('تعداد پاسخ‌های درست'),{target:{value:'6'}})
 fireEvent.change(within(dialog).getByLabelText('ارزیابی شما از کیفیت انجام فعالیت'),{target:{value:'با تمرکز مطالعه کردم'}})
 data.activities.a={version:1,values:{status:'done',question_count:10,correct:6,quality:'با تمرکز مطالعه کردم'}}
 fireEvent.click(within(dialog).getByRole('button',{name:'تأیید و ذخیره'}))
 expect(await screen.findByText(/ارزیابی کیفیت: با تمرکز/)).toBeTruthy()
 const call=vi.mocked(api).mock.calls.find(([,opts])=>opts?.method==='PUT')!
 const body=JSON.parse(String(call[1]?.body))
 expect(body.actual_minutes).toBeNull()
 expect(body.correct).toBe(6)
 fireEvent.click(screen.getByRole('button',{name:'ثبت / ویرایش گزارش'}))
 expect((screen.getByLabelText('تعداد پاسخ‌های درست') as HTMLInputElement).value).toBe('6')
})
test('not done shows only reason and daily report can save just one field',async()=>{
 const data=initial();setup(data)
 fireEvent.click(await screen.findByRole('button',{name:'ثبت / ویرایش گزارش'}))
 fireEvent.change(screen.getByLabelText('وضعیت انجام فعالیت'),{target:{value:'not_done'}})
 expect(screen.getByLabelText('دلیل انجام نشدن فعالیت')).toBeTruthy()
 expect(screen.queryByLabelText('تعداد سؤال‌ها')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'بستن گزارش'}))
 fireEvent.click(screen.getByRole('button',{name:'ثبت / ویرایش گزارش روز'}))
 fireEvent.change(screen.getByLabelText('میزان تمرکز'),{target:{value:'4'}})
 data.days['شنبه']={version:1,values:{focus:4}}
 fireEvent.click(screen.getByRole('button',{name:'تأیید و ذخیره'}))
 expect(await screen.findByText('تمرکز: ۴ از ۵')).toBeTruthy()
})
test('expired reports remain visible with no edit form and advisor sees full text',async()=>{
 const data=initial();data.editable=false;data.activities.a.values={status:'not_done',not_done_reason:'بیماری'}
 setup(data)
 fireEvent.click(await screen.findByRole('button',{name:'مشاهده گزارش'}))
 expect(screen.queryByRole('button',{name:'تأیید و ذخیره'})).toBeNull()
 expect(within(screen.getByRole('dialog')).getByText('دلیل انجام نشدن: بیماری')).toBeTruthy()
 cleanup();qc.clear();setup(data,false)
 expect(await screen.findByText('دلیل انجام نشدن: بیماری')).toBeTruthy()
 expect(screen.queryByRole('button',{name:'ثبت / ویرایش گزارش'})).toBeNull()
 expect(screen.getByRole('button',{name:'دانلود برنامه و گزارش‌ها (A4)'})).toBeTruthy()
})
