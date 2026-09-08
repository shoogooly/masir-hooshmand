import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {BookOpen,ChevronDown,Download,FileCheck2,Link2,Send} from 'lucide-react'
import {api} from '../api'
import {AssignedExam,dateTime,ExamError,FileResult,pdfPayload,saveFile} from './examFiles'

export default function AdvisorAssignedExamsPage({studentId}:{studentId:string}){
  const qc=useQueryClient()
  const [selected,setSelected]=useState<string>()
  const [createSent,setCreateSent]=useState(false)
  const exams=useQuery({queryKey:['assigned-exams',studentId],queryFn:()=>api<AssignedExam[]>(`/assigned-exams?student_id=${studentId}`)})
  const create=useMutation({
    mutationFn:async(form:HTMLFormElement)=>{
      const data=new FormData(form),file=data.get('question') as File
      if(!file?.size)throw new Error('فایل سؤال را انتخاب کنید.')
      return api<AssignedExam>(`/advisors/students/${studentId}/assigned-exams`,{method:'POST',body:JSON.stringify({title:data.get('title'),duration_minutes:data.get('duration')?Number(data.get('duration')):null,instructions:data.get('instructions'),question_file:await pdfPayload(file)})})
    },
    onMutate:()=>setCreateSent(false),
    onSuccess:(item,form)=>{form.reset();setCreateSent(true);setSelected(item.id);qc.invalidateQueries({queryKey:['assigned-exams',studentId]})},
  })
  const download=useMutation({mutationFn:(id:string)=>api<FileResult>(`/assigned-exams/${id}/answer-file`),onSuccess:saveFile})
  const analyze=useMutation({
    mutationFn:async({id,form}:{id:string;form:HTMLFormElement})=>{
      const data=new FormData(form),lesson=data.get('lesson') as File
      const links=String(data.get('links')||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean)
      return api(`/assigned-exams/${id}/analysis`,{method:'PATCH',body:JSON.stringify({analysis_text:data.get('analysis'),resource_links:links,lesson_file:lesson?.size?await pdfPayload(lesson):null})})
    },
    onSuccess:()=>qc.invalidateQueries({queryKey:['assigned-exams',studentId]}),
  })
  return <div className="advisor-exam-page">
    <form className="panel exam-create-form" onSubmit={event=>{event.preventDefault();create.mutate(event.currentTarget)}}>
      <div className="full"><h2>ارسال آزمون جدید</h2><p>فایل سؤال، زمان پیشنهادی و توضیحات را برای دانش‌آموز ثبت کنید.</p></div>
      <label>عنوان آزمون<input name="title" required maxLength={180} placeholder="مثلاً آزمون فصل حرکت‌شناسی"/></label>
      <label>مدت زمان آزمون (اختیاری، دقیقه)<input name="duration" type="number" min="1" max="1440" placeholder="مثلاً ۹۰"/></label>
      <label className="full">توضیحات برای دانش‌آموز<textarea name="instructions" maxLength={5000} placeholder="شرایط اجرا، منابع مجاز و نکات لازم..."/></label>
      <label className="full">فایل سؤالات PDF<input name="question" type="file" accept="application/pdf,.pdf" required/></label>
      <button className="btn btn-primary" disabled={create.isPending}><Send/> ارسال آزمون</button><ExamError error={create.error}/>
    {createSent&&<div className="success-note exam-send-success"><FileCheck2/><b>ارسال شد</b><span>فرم پاک شد و آزمون برای دانش‌آموز ارسال گردید.</span></div>}
    </form>
    {exams.isLoading?<div className="page-state">در حال دریافت آزمون‌ها...</div>:<div className="advisor-exam-history"><h2>سوابق آزمون‌های دانش‌آموز</h2>{exams.data?.map(exam=><article className={`panel exam-history-item ${selected===exam.id?'open':''}`} key={exam.id}>
      <button type="button" className="exam-history-row" onClick={()=>setSelected(current=>current===exam.id?undefined:exam.id)}><span><BookOpen/></span><div><b>{exam.title}</b><small>{dateTime(exam.created_at)}{exam.duration_minutes>0?` · ${exam.duration_minutes.toLocaleString('fa-IR')} دقیقه`:''}</small></div><em>{exam.analyzed_at?'تکمیل‌شده':exam.answer_uploaded_at?'نیازمند تحلیل':'در انتظار پاسخ'}</em><ChevronDown/></button>
      {selected===exam.id&&<div className="exam-history-details">
        {exam.instructions&&<div className="exam-note"><b>توضیحات آزمون</b><p>{exam.instructions}</p></div>}
        <div className="exam-timeline"><p><b>دانلود سؤال به وقت ایران</b><span>{dateTime(exam.question_downloaded_at)}</span></p><p><b>بارگذاری پاسخنامه به وقت ایران</b><span>{dateTime(exam.answer_uploaded_at)}</span></p><p><b>فاصله زمانی اجرا</b><span>{exam.elapsed_minutes==null?'قابل محاسبه نیست':`${exam.elapsed_minutes.toLocaleString('fa-IR')} دقیقه`}</span></p></div>
        {exam.answer_uploaded_at&&<><div className="exam-submission"><FileCheck2/><div><b>{exam.answer_filename}</b><p>{exam.student_notes||'دانش‌آموز توضیحی ثبت نکرده است.'}</p></div><button className="btn btn-outline" onClick={()=>download.mutate(exam.id)}><Download/> دانلود پاسخنامه</button></div>
        {exam.analyzed_at?<div className="exam-analysis-complete"><div className="success-note"><FileCheck2/><b>ارسال شد</b><span>تحلیل و منابع برای دانش‌آموز ارسال شده است.</span></div>{exam.analysis_text&&<p>{exam.analysis_text}</p>}{exam.resource_links.length>0&&<div className="exam-links">{exam.resource_links.map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer"><Link2/> منبع {index+1}</a>)}</div>}{exam.lesson_filename&&<small>فایل درسنامه: {exam.lesson_filename}</small>}</div>:
        <form className="exam-analysis-form" onSubmit={event=>{event.preventDefault();analyze.mutate({id:exam.id,form:event.currentTarget})}}><h3>تحلیل آزمون و منابع پیشنهادی</h3><p className="optional-note">تمام موارد این بخش اختیاری هستند؛ در صورت نداشتن تحلیل یا منبع نیز می‌توانید پرونده آزمون را تکمیل کنید.</p><label>تحلیل و نقاط نیازمند مطالعه<textarea name="analysis" maxLength={10000} placeholder="نقاط ضعف، مباحث نیازمند مرور و پیشنهاد شما..."/></label><label>لینک درسنامه یا ویدیو؛ هر لینک در یک خط<textarea name="links" dir="ltr" placeholder={'https://...\nhttps://...'}/></label><label>فایل درسنامه PDF (اختیاری)<input name="lesson" type="file" accept="application/pdf,.pdf"/></label><button className="btn btn-primary" disabled={analyze.isPending}><Send/> ارسال تحلیل و منابع</button><ExamError error={analyze.error}/></form>}</>}
      </div>}
    </article>)}{!exams.data?.length&&<div className="panel empty-state">هنوز آزمونی برای این دانش‌آموز ارسال نشده است.</div>}</div>}
  </div>
}
