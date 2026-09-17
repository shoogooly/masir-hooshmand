// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
import AdvisorPlanArchive from './AdvisorPlanArchive'
import { AdvisorPlanWorkspace } from './OperationalPages'
import { api } from '../api'
import { exportStudyReportPdf } from '../utils/studyReportPdf'
const plans=[1,2].map(n=>({id:'p'+n,student_id:'s',title:'برنامه '+n,week_label:'هفته '+n,version:n,status:'published',activities:[],days:[],time_slots:[]}))
vi.mock('../api',()=>({api:vi.fn(async(path:string)=>path==='/plans'||path.startsWith('/plans?')?plans:path.endsWith('/books')?[]:path.endsWith('/report')?{profile:{}}:{activities:{},days:{}})}))
vi.mock('../utils/studyReportPdf',()=>({exportStudyReportPdf:vi.fn(async()=>{})}))
vi.mock('./StudyReportPlan',()=>({default:({plan}:any)=><div>گزارش {plan.id}</div>}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear();vi.clearAllMocks()})
function setup(child:React.ReactNode){client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}>{child}</QueryClientProvider>)}
test('archive expands below the selected heading and keeps reports out of plan history',async()=>{
 setup(<AdvisorPlanArchive studentId="s" studentName="دانش‌آموز" advisorName="مشاور" renderPlan={p=><div>محتوای {p.id}</div>}/>)
 const first=await screen.findByRole('button',{name:/برنامه 1/}),second=screen.getByRole('button',{name:/برنامه 2/})
 fireEvent.click(first)
 expect(first.closest('article')?.textContent).toContain('محتوای p1')
 expect(screen.queryByText('محتوای p2')).toBeNull()
 fireEvent.click(second)
 expect(screen.queryByText('محتوای p1')).toBeNull()
 expect(second.closest('article')?.textContent).toContain('محتوای p2')
 fireEvent.click(second)
 expect(screen.queryByText('محتوای p2')).toBeNull()
 expect(vi.mocked(api).mock.calls.some(([p])=>p.includes('study-reports'))).toBe(false)
 expect(screen.queryByRole('button',{name:/دانلود/})).toBeNull()
})
test('PDF beside a collapsed row downloads that exact plan without opening it',async()=>{
 setup(<AdvisorPlanArchive studentId="s" studentName="دانش‌آموز" advisorName="مشاور" reports/>)
 fireEvent.click(await screen.findByRole('button',{name:'دانلود PDF گزارش کار هفته 2'}))
 await waitFor(()=>expect(exportStudyReportPdf).toHaveBeenCalledWith(plans[1],{activities:{},days:{}},'دانش‌آموز','مشاور'))
 expect(api).toHaveBeenCalledWith('/plans/p2/study-reports')
 expect(screen.queryByText('گزارش p2')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:/برنامه 2/}))
 expect(screen.getByText('گزارش p2')).toBeTruthy()
})
test('new planner starts closed and preserves entered draft when toggled',async()=>{
 setup(<AdvisorPlanWorkspace studentId="s" studentName="دانش‌آموز" advisorName="مشاور"/>)
 const start=screen.getByRole('button',{name:'نوشتن برنامه جدید'})
 expect(start.getAttribute('aria-expanded')).toBe('false')
 expect(screen.queryByRole('button',{name:/افزودن بازه برای/})).toBeNull()
 fireEvent.click(start)
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 const input=screen.getByRole('textbox',{name:'توضیحات (تا ۳ خط)'})
 fireEvent.change(input,{target:{value:'پیش‌نویس حفظ شود'}})
 fireEvent.click(start)
 expect(start.getAttribute('aria-expanded')).toBe('false')
 fireEvent.click(screen.getByRole('button',{name:'نسخه‌های قبلی برنامه'}))
 await screen.findByRole('button',{name:/برنامه 1/})
 fireEvent.click(start)
 expect((screen.getByRole('textbox',{name:'توضیحات (تا ۳ خط)'}) as HTMLTextAreaElement).value).toBe('پیش‌نویس حفظ شود')
})
