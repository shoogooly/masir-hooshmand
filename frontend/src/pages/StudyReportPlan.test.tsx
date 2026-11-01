// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../api'
import StudyReportPlan from './StudyReportPlan'
import type { WeeklyPlan } from '../types'
import type { StudyReports } from './studyReportTypes'
vi.mock('../api',()=>({api:vi.fn()}))
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
 await screen.findByText(/بدون محدودیت زمانی/)
 fireEvent.click(screen.getByRole('button',{name:'انجام شد'}))
 expect(screen.getByText('آفرین!')).toBeTruthy()
 expect(screen.queryByLabelText('درست')).toBeNull()
 fireEvent.change(screen.getByLabelText('چند سؤال حل کردی؟'),{target:{value:'10'}})
 fireEvent.change(screen.getByLabelText('درست'),{target:{value:'6'}})
 fireEvent.change(screen.getByLabelText('توضیحات'),{target:{value:'با تمرکز مطالعه کردم'}})
 data.activities.a={version:1,values:{status:'done',question_count:10,correct:6,quality:'با تمرکز مطالعه کردم'}}
 fireEvent.click(screen.getByRole('button',{name:'ثبت گزارش'}))
 expect(await screen.findByText('گزارشت ثبت شد ✨')).toBeTruthy()
 const call=vi.mocked(api).mock.calls.find(([,opts])=>opts?.method==='PUT')!
 const body=JSON.parse(String(call[1]?.body))
 expect(body.status).toBe('done')
 expect(body.correct).toBe(6)
 cleanup();qc.clear();setup(data)
 expect((await screen.findByLabelText('درست') as HTMLInputElement).value).toBe('6')
})
test('not done shows only reason and daily report can save just one field',async()=>{
 const data=initial();setup(data)
 await screen.findByText(/بدون محدودیت زمانی/)
 fireEvent.click(screen.getByRole('button',{name:'انجام نشد'}))
 expect(screen.getByLabelText('چرا انجامش ندادی؟')).toBeTruthy()
 expect(screen.queryByLabelText('چند سؤال حل کردی؟')).toBeNull()
 expect(screen.queryByRole('dialog')).toBeNull()
 fireEvent.change(screen.getByLabelText('میزان تمرکز'),{target:{value:'4'}})
 data.days['شنبه']={version:1,values:{focus:4}}
 fireEvent.click(screen.getByRole('button',{name:'ثبت جمع‌بندی'}))
 expect(await screen.findByText('ثبت شد ✨')).toBeTruthy()
 const call=vi.mocked(api).mock.calls.find(([path,opts])=>path.includes('/days/')&&opts?.method==='PUT')!
 expect(JSON.parse(String(call[1]?.body))).toEqual({version:0,focus:4})
 cleanup();qc.clear();setup(data)
 expect((await screen.findByLabelText('میزان تمرکز') as HTMLSelectElement).value).toBe('4')
 expect(screen.queryByRole('dialog')).toBeNull()
})
test('read-only reports remain visible and advisor sees full text',async()=>{
 const data=initial();data.editable=false;data.activities.a.values={status:'not_done',not_done_reason:'بیماری'}
 setup(data)
 expect(await screen.findByText('دلیل انجام نشدن: بیماری')).toBeTruthy()
 expect((screen.getByRole('button',{name:'انجام شد'}) as HTMLButtonElement).disabled).toBe(true)
 expect(screen.queryByRole('button',{name:'تأیید و ذخیره'})).toBeNull()
 cleanup();qc.clear();setup(data,false)
 expect(await screen.findByText('دلیل انجام نشدن: بیماری')).toBeTruthy()
 expect(screen.queryByRole('button',{name:'ثبت / ویرایش گزارش'})).toBeNull()
 expect(screen.getByRole('button',{name:'دانلود برنامه و گزارش‌ها (A4)'})).toBeTruthy()
})
test('failed saves keep the draft and switching status saves only relevant fields',async()=>{
 const data=initial();setup(data)
 await screen.findByText(/بدون محدودیت زمانی/)
 fireEvent.click(screen.getByRole('button',{name:'انجام شد'}))
 fireEvent.change(screen.getByLabelText('چند سؤال حل کردی؟'),{target:{value:'5'}})
 fireEvent.click(screen.getByRole('button',{name:'انجام نشد'}))
 fireEvent.change(screen.getByLabelText('چرا انجامش ندادی؟'),{target:{value:'نیاز به مرور داشتم'}})
 vi.mocked(api).mockRejectedValueOnce(new Error('ذخیره ناموفق'))
 fireEvent.click(screen.getByRole('button',{name:'ثبت گزارش'}))
 expect(await screen.findByRole('alert')).toBeTruthy()
 expect((screen.getByLabelText('چرا انجامش ندادی؟') as HTMLTextAreaElement).value).toBe('نیاز به مرور داشتم')
 const call=vi.mocked(api).mock.calls.find(([,opts])=>opts?.method==='PUT')!
 expect(JSON.parse(String(call[1]?.body))).toMatchObject({status:'not_done',question_count:null,quality:null,not_done_reason:'نیاز به مرور داشتم'})
})
test('advisor sees complete activity and daily details without editing controls',async()=>{
 const data=initial()
 data.activities.a={version:1,values:{status:'done',actual_minutes:45,question_count:10,correct:6,wrong:3,unanswered:1,quality:'توضیح کامل فعالیت با مرور نکته‌ها'}}
 data.days['شنبه']={version:1,values:{focus:4,energy:3,sleep_hours:7.5,stress:2,distractions:'صدای محیط',stress_source:'آزمون فردا'}}
 setup(data,false)
 expect(await screen.findByText('زمان انجام: ۴۵ دقیقه')).toBeTruthy()
 expect(screen.getByText('تعداد سؤال: ۱۰')).toBeTruthy()
 expect(screen.getByText('درست: ۶ · غلط: ۳ · بی‌پاسخ: ۱')).toBeTruthy()
 expect(screen.getByText('ارزیابی کیفیت: توضیح کامل فعالیت با مرور نکته‌ها')).toBeTruthy()
 for(const line of ['تمرکز: ۴ از ۵','انرژی: ۳ از ۵','خواب شب قبل: ۷٫۵ ساعت','استرس: ۲ از ۵','عوامل حواس‌پرتی: صدای محیط','منشأ استرس: آزمون فردا'])expect(screen.getByText(line)).toBeTruthy()
 expect(document.querySelector('.advisor-study-plan')).toBeTruthy()
 expect(document.querySelector('.study-summary.compact')).toBeNull()
 expect(screen.queryByRole('textbox')).toBeNull()
 expect(screen.queryByRole('button',{name:'ثبت گزارش'})).toBeNull()
})
