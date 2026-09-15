import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {BrainCircuit,CalendarDays,Plus,Save,Trash2} from 'lucide-react'
import {api} from '../api'
import '../styles/advisor-evaluation.css'

type Milestone={date:string;subject:string;topic:string;status:'pending'|'learning'|'practiced'|'mastered'}
type Evaluation={assessment:string;calendar_notes:string;milestones:Milestone[];version:number;updated_at:string}
const statusLabels={pending:'شروع نشده',learning:'در حال یادگیری',practiced:'تمرین شده',mastered:'مسلط'}
const digits=(text:string)=>text.replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))

function EvaluationForm({studentId,initial}:{studentId:string;initial:Evaluation}){
 const qc=useQueryClient()
 const [assessment,setAssessment]=useState(initial.assessment),[notes,setNotes]=useState(initial.calendar_notes)
 const [milestones,setMilestones]=useState(initial.milestones.map(m=>({...m,key:crypto.randomUUID()})))
 const [version,setVersion]=useState(initial.version),[dirty,setDirty]=useState(false),[saved,setSaved]=useState(false)
 const save=useMutation({mutationFn:()=>api<Evaluation>('/advisors/students/'+studentId+'/evaluation',{method:'PUT',body:JSON.stringify({
  assessment,calendar_notes:notes,version,milestones:milestones.map(({date,subject,topic,status})=>({date,subject,topic,status}))
 })}),onSuccess:data=>{setVersion(data.version);setDirty(false);setSaved(true);qc.setQueryData(['advisor-evaluation',studentId],data)}})
 const change=()=>{setDirty(true);setSaved(false)}
 return <form className="advisor-evaluation" onSubmit={e=>{e.preventDefault();save.mutate()}}>
  <header className="evaluation-intro"><BrainCircuit/><div><h2>شناخت دقیق‌تر، برنامه‌ای متناسب‌تر</h2><p>ارزیابی شما یکی از منابع هوش مصنوعی برای طراحی برنامهٔ اختصاصی این دانش‌آموز است. لطفاً شناخت خود از توانایی‌ها، نیازها و شیوهٔ یادگیری او را دقیق و روشن بنویسید؛ این یادداشت در برنامه‌ریزی‌های بعدی نیز در نظر گرفته می‌شود.</p></div></header>
  <fieldset disabled={save.isPending}>
   <section className="evaluation-card"><label htmlFor="advisor-assessment">ارزیابی کلی شما از دانش‌آموز</label><p>نقاط قوت، دشواری‌ها، عادت‌های مطالعه، ظرفیت واقعی و نکاتی که برنامه باید با آن‌ها هماهنگ باشد.</p><textarea id="advisor-assessment" rows={8} maxLength={8000} value={assessment} onChange={e=>{setAssessment(e.target.value);change()}} placeholder="مثلاً در حل مفهومی ریاضی قوی است، اما برای تست زمان‌دار به تمرین تدریجی نیاز دارد…"/><small>این ارزیابی نزد مشاور می‌ماند و با پایان هفته پاک نمی‌شود. هر زمان می‌توانید آن را اصلاح کنید.</small></section>
   <section className="evaluation-card"><h3><CalendarDays/> تقویم آموزشی سال تحصیلی</h3><p>برنامهٔ کلی سال را بنویسید و برای مباحث مهم تاریخ هدف بگذارید. هوش مصنوعی تاریخ هفتهٔ مورد نظر و وضعیت مباحث را هنگام طراحی بررسی می‌کند.</p>
    <label htmlFor="academic-notes">توضیحات تقویم آموزشی (اختیاری)</label><textarea id="academic-notes" rows={5} maxLength={15000} value={notes} onChange={e=>{setNotes(e.target.value);change()}} placeholder="تقویم آموزشی مدرسه یا برنامهٔ سالانه را اینجا بنویسید یا کپی کنید. تاریخ‌ها را با سال شمسی کامل ذکر کنید."/>
    <div className="evaluation-milestones">{milestones.map((m,i)=><article className="evaluation-milestone" key={m.key}><header><b>هدف آموزشی {(i+1).toLocaleString('fa-IR')}</b><button type="button" className="small-secondary" aria-label={'حذف هدف آموزشی '+(i+1)} onClick={()=>{setMilestones(all=>all.filter(x=>x.key!==m.key));change()}}><Trash2 size={17}/> حذف</button></header><div className="evaluation-fields">
     <label>تاریخ هدف (شمسی)<input required dir="ltr" placeholder="1405/09/30" pattern="[0-9]{4}/[0-9]{2}/[0-9]{2}" maxLength={10} value={m.date} onChange={e=>{setMilestones(all=>all.map(x=>x.key===m.key?{...x,date:digits(e.target.value)}:x));change()}}/></label>
     <label>درس<input required maxLength={120} value={m.subject} onChange={e=>{setMilestones(all=>all.map(x=>x.key===m.key?{...x,subject:e.target.value}:x));change()}} placeholder="مثلاً ریاضی"/></label>
     <label>وضعیت فعلی<select value={m.status} onChange={e=>{setMilestones(all=>all.map(x=>x.key===m.key?{...x,status:e.target.value as Milestone['status']}:x));change()}}>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
     <label className="evaluation-topic">مبحث و هدف مورد انتظار<textarea required rows={2} maxLength={800} value={m.topic} onChange={e=>{setMilestones(all=>all.map(x=>x.key===m.key?{...x,topic:e.target.value}:x));change()}} placeholder="مثلاً تا این تاریخ تابع را یاد بگیرد و تست‌های پایهٔ آن را تمرین کند."/></label>
    </div></article>)}</div>
    {!milestones.length&&<p className="evaluation-empty">هنوز هدف تاریخ‌داری ثبت نشده است. ثبت این بخش اختیاری است.</p>}
    <button type="button" className="small-secondary" disabled={milestones.length>=120} onClick={()=>{setMilestones(all=>[...all,{key:crypto.randomUUID(),date:'',subject:'',topic:'',status:'pending'}]);change()}}><Plus size={18}/> افزودن هدف به تقویم</button>
   </section>
   <footer className="evaluation-actions"><span>{dirty?'تغییرات هنوز ذخیره نشده‌اند.':'اطلاعات ذخیره‌شده در برنامه‌ریزی‌های بعدی استفاده می‌شود.'}</span><button className="btn btn-primary" disabled={save.isPending}>{save.isPending?'در حال ذخیره…':<><Save size={18}/> ذخیره ارزیابی و تقویم</>}</button></footer>
  </fieldset>
  {saved&&<p className="success-note" role="status">ارزیابی و تقویم آموزشی ذخیره شد.</p>}
  {save.error&&<p className="evaluation-error" role="alert">{save.error instanceof Error?save.error.message:'ذخیره انجام نشد؛ دوباره تلاش کنید.'}</p>}
 </form>
}
export default function AdvisorEvaluationPage({studentId}:{studentId:string}){
 const query=useQuery({queryKey:['advisor-evaluation',studentId],queryFn:()=>api<Evaluation>('/advisors/students/'+studentId+'/evaluation')})
 if(query.isLoading)return <p>در حال دریافت ارزیابی…</p>
 if(query.error)return <p role="alert">{query.error instanceof Error?query.error.message:'دریافت ارزیابی ناموفق بود.'}</p>
 return query.data?<EvaluationForm key={studentId} studentId={studentId} initial={query.data}/>:null
}
