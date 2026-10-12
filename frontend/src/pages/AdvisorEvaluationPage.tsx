import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {BrainCircuit,Save} from 'lucide-react'
import {api} from '../api'
import '../styles/advisor-evaluation.css'

type Milestone={date:string;subject:string;topic:string;status:'pending'|'learning'|'practiced'|'mastered'}
type Evaluation={assessment:string;calendar_notes:string;milestones:Milestone[];version:number;updated_at:string}
function EvaluationForm({studentId,initial}:{studentId:string;initial:Evaluation}){
 const qc=useQueryClient()
 const [assessment,setAssessment]=useState(initial.assessment)
 const [version,setVersion]=useState(initial.version),[dirty,setDirty]=useState(false),[saved,setSaved]=useState(false)
 const save=useMutation({mutationFn:()=>api<Evaluation>('/advisors/students/'+studentId+'/evaluation',{method:'PUT',body:JSON.stringify({
  assessment,calendar_notes:initial.calendar_notes,version,milestones:initial.milestones
 })}),onSuccess:data=>{setVersion(data.version);setDirty(false);setSaved(true);qc.setQueryData(['advisor-evaluation',studentId],data)}})
 const change=()=>{setDirty(true);setSaved(false)}
 return <form className="advisor-evaluation" onSubmit={e=>{e.preventDefault();save.mutate()}}>
  <header className="evaluation-intro"><BrainCircuit/><div><h2>شناخت دقیق‌تر، برنامه‌ای متناسب‌تر</h2><p>ارزیابی شما یکی از منابع هوش مصنوعی برای طراحی برنامهٔ اختصاصی این دانش‌آموز است. لطفاً شناخت خود از توانایی‌ها، نیازها و شیوهٔ یادگیری او را دقیق و روشن بنویسید؛ این یادداشت در برنامه‌ریزی‌های بعدی نیز در نظر گرفته می‌شود.</p></div></header>
  <fieldset disabled={save.isPending}>
   <section className="evaluation-card"><label htmlFor="advisor-assessment">ارزیابی کلی شما از دانش‌آموز</label><p>نقاط قوت، دشواری‌ها، عادت‌های مطالعه، ظرفیت واقعی و نکاتی که برنامه باید با آن‌ها هماهنگ باشد.</p><textarea id="advisor-assessment" rows={8} maxLength={8000} value={assessment} onChange={e=>{setAssessment(e.target.value);change()}} placeholder="مثلاً در حل مفهومی ریاضی قوی است، اما برای تست زمان‌دار به تمرین تدریجی نیاز دارد…"/><small>این ارزیابی نزد مشاور می‌ماند و با پایان هفته پاک نمی‌شود. هر زمان می‌توانید آن را اصلاح کنید.</small></section>
   <footer className="evaluation-actions"><span>{dirty?'تغییرات هنوز ذخیره نشده‌اند.':'اطلاعات ذخیره‌شده در برنامه‌ریزی‌های بعدی استفاده می‌شود.'}</span><button className="btn btn-primary" disabled={save.isPending}>{save.isPending?'در حال ذخیره…':<><Save size={18}/> ذخیره ارزیابی</>}</button></footer>
  </fieldset>
  {saved&&<p className="success-note" role="status">ارزیابی مشاور ذخیره شد.</p>}
  {save.error&&<p className="evaluation-error" role="alert">{save.error instanceof Error?save.error.message:'ذخیره انجام نشد؛ دوباره تلاش کنید.'}</p>}
 </form>
}
export default function AdvisorEvaluationPage({studentId}:{studentId:string}){
 const query=useQuery({queryKey:['advisor-evaluation',studentId],queryFn:()=>api<Evaluation>('/advisors/students/'+studentId+'/evaluation')})
 if(query.isLoading)return <p>در حال دریافت ارزیابی…</p>
 if(query.error)return <p role="alert">{query.error instanceof Error?query.error.message:'دریافت ارزیابی ناموفق بود.'}</p>
 return query.data?<EvaluationForm key={studentId} studentId={studentId} initial={query.data}/>:null
}
