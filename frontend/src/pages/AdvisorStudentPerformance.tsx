import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { WeeklyPlan } from '../types'
import { AdvisorReportArchive } from './StudyReportPlan'

export default function AdvisorStudentPerformance({studentId,studentName}:{studentId:string;studentName:string}){
 const {data,isLoading,error,refetch}=useQuery({queryKey:['plans','advisor'],queryFn:()=>api<WeeklyPlan[]>('/plans')})
 if(isLoading)return <p role="status">در حال دریافت گزارش عملکرد…</p>
 if(error)return <div role="alert">دریافت برنامه‌ها ناموفق بود. <button onClick={()=>void refetch()}>تلاش دوباره</button></div>
 const plans=(data||[]).filter(p=>p.student_id===studentId&&p.status==='published')
 if(!plans.length)return <p className="page-state">هنوز برنامه منتشرشده‌ای برای گزارش عملکرد این دانش‌آموز وجود ندارد.</p>
 return <AdvisorReportArchive key={studentId} plans={plans} studentName={studentName}/>
}
