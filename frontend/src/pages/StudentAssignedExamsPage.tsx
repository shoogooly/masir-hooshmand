import {useEffect,useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {BookOpen,ChevronDown,Clock3,Download,FileCheck2,Link2,Upload} from 'lucide-react'
import {api} from '../api'
import {AssignedExam,dateTime,ExamError,FileResult,pdfPayload,saveFile} from './examFiles'

export default function StudentAssignedExamsPage(){
  const qc=useQueryClient()
  const [selected,setSelected]=useState<string>()
  const [answerSent,setAnswerSent]=useState<string>()
  useEffect(()=>{api('/notifications/exams/read',{method:'POST'}).then(()=>qc.invalidateQueries({queryKey:['notification-summary']})).catch(()=>{})},[qc])
  const exams=useQuery({queryKey:['assigned-exams'],queryFn:()=>api<AssignedExam[]>('/assigned-exams')})
  const download=useMutation({
    mutationFn:({id,kind}:{id:string;kind:'question'|'lesson'})=>api<FileResult>(`/assigned-exams/${id}/${kind}-file`),
    onSuccess:file=>{saveFile(file);qc.invalidateQueries({queryKey:['assigned-exams']})},
  })
  const answer=useMutation({
    mutationFn:async({id,form}:{id:string;form:HTMLFormElement})=>{
      const data=new FormData(form),file=data.get('answer') as File
      if(!file?.size)throw new Error('فایل پاسخنامه را انتخاب کنید.')
      return api(`/assigned-exams/${id}/answer`,{method:'POST',body:JSON.stringify({notes:data.get('notes'),answer_file:await pdfPayload(file)})})
    },
    onSuccess:(_result,{id,form})=>{form.reset();setAnswerSent(id);setSelected(undefined);qc.invalidateQueries({queryKey:['assigned-exams']})},
  })
  if(exams.isLoading)return <div className="page-state">در حال دریافت آزمون‌های ارسالی مشاور...</div>
  if(exams.error)return <ExamError error={exams.error}/>
  return <section className="assigned-exam-section">
    <div className="section-head compact"><div><h1>آزمون‌های ارسالی مشاور</h1><p>فایل سؤال را دانلود کنید و پاسخنامه PDF را همراه توضیحات تحویل دهید.</p></div></div>
    {!exams.data?.length&&<div className="panel empty-state">هنوز آزمون PDF برای شما ثبت نشده است.</div>}
    {answerSent&&<div className="success-note exam-send-success"><FileCheck2/><b>ارسال شد</b><span>پاسخنامه شما با موفقیت برای مشاور ارسال شد.</span></div>}
    <div className="advisor-exam-history student-exam-history">{exams.data?.map(exam=><article className={`panel exam-history-item ${selected===exam.id?'open':''}`} key={exam.id}>
      <button type="button" className="exam-history-row" onClick={()=>setSelected(current=>current===exam.id?undefined:exam.id)}><span><BookOpen/></span><div><b>{exam.title}</b><small>{dateTime(exam.created_at)}{exam.duration_minutes>0?` · ${exam.duration_minutes.toLocaleString('fa-IR')} دقیقه`:''}</small></div><em>{exam.status==='analyzed'?'تحلیل‌شده':exam.answer_uploaded_at?'پاسخ تحویل شد':exam.question_downloaded_at?'دانلودشده':'جدید'}</em><ChevronDown/></button>
      {selected===exam.id&&<div className="exam-history-details">
        {exam.duration_minutes>0&&<p className="exam-duration"><Clock3/> زمان پیشنهادی آزمون: {exam.duration_minutes.toLocaleString('fa-IR')} دقیقه</p>}
        {exam.instructions&&<div className="exam-note"><b>توضیحات مشاور</b><p>{exam.instructions}</p></div>}
        <div className="exam-file-line"><div><b>{exam.question_filename}</b><small>زمان دانلود به وقت ایران: {dateTime(exam.question_downloaded_at)}</small></div><button className="btn btn-outline" onClick={()=>download.mutate({id:exam.id,kind:'question'})} disabled={download.isPending}><Download/> دانلود سؤالات</button></div>
        {!exam.answer_uploaded_at?<form className="exam-answer-form" onSubmit={event=>{event.preventDefault();answer.mutate({id:exam.id,form:event.currentTarget})}}><label>فایل پاسخنامه PDF<input name="answer" type="file" accept="application/pdf,.pdf" required/></label><label>توضیحات شما درباره آزمون<textarea name="notes" maxLength={5000} placeholder="بخش‌های دشوار یا توضیحی برای مشاور..."/></label><button className="btn btn-primary" disabled={answer.isPending}><Upload/> بارگذاری پاسخنامه</button><ExamError error={answer.error}/></form>:
        <div className="exam-submission"><FileCheck2/><div><b>پاسخنامه تحویل شده است</b><p>{exam.student_notes||'بدون توضیح'}</p><small>زمان دانلود سؤال به وقت ایران: {dateTime(exam.question_downloaded_at)}</small><small>زمان تحویل پاسخنامه به وقت ایران: {dateTime(exam.answer_uploaded_at)}</small><strong>فاصله اجرا: {(exam.elapsed_minutes??0).toLocaleString('fa-IR')} دقیقه</strong></div></div>}
        {exam.analyzed_at&&<div className="exam-analysis"><h3>تحلیل و پیشنهاد مشاور</h3><p>{exam.analysis_text||'تحلیل متنی ثبت نشده است.'}</p>{exam.resource_links.length>0&&<div className="exam-links">{exam.resource_links.map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer"><Link2/> منبع آموزشی {index+1}</a>)}</div>}{exam.lesson_filename&&<button className="btn btn-outline" onClick={()=>download.mutate({id:exam.id,kind:'lesson'})}><Download/> دانلود درسنامه PDF</button>}</div>}
      </div>}
    </article>)}</div>
  </section>
}
