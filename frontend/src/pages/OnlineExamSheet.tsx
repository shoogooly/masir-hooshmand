import {useEffect,useRef,useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {ExamError} from './examFiles'
import {parseApiDate} from '../utils/jalali'
import type {AnswerSectionDraft,OnlineDefinition,OnlineResult,OnlineSheet} from './onlineExamTypes'
import '../styles/online-exams.css'

const fa=(n:number)=>n.toLocaleString('fa-IR')
const statusLabel={correct:'درست',wrong:'غلط',unanswered:'بی‌پاسخ'}
const draftKey=(id:string)=>'online-exam-draft:'+id
function restoreDraft(sheet:OnlineSheet){
 try{const saved=JSON.parse(localStorage.getItem(draftKey(sheet.exam_id))||'null');if(saved?.version===sheet.version&&Array.isArray(saved.answers)&&saved.answers.length===sheet.answers.length&&saved.answers.every((a:unknown)=>a===null||Number.isInteger(a)&&Number(a)>=1&&Number(a)<=4))return saved.answers as (number|null)[]}catch{}
 return sheet.answers
}
export function QuestionChoices({number,value,onChange,disabled=false}:{number:number;value:number|null;onChange:(n:number|null)=>void;disabled?:boolean}){
 return <fieldset className="online-question" disabled={disabled}><legend>سؤال {fa(number)}</legend><div role="radiogroup" aria-label={'پاسخ سؤال '+number}>{[1,2,3,4].map(choice=><button type="button" role="radio" aria-checked={value===choice} aria-label={'گزینه '+choice} className={value===choice?'selected':''} key={choice} onClick={()=>onChange(value===choice?null:choice)}><span className="choice-square" aria-hidden="true">{value===choice?'✓':''}</span>{fa(choice)}</button>)}</div></fieldset>
}
export function AnswerKeyBuilder({sections,setSections,negative,setNegative}:{sections:AnswerSectionDraft[];setSections:(value:AnswerSectionDraft[])=>void;negative:boolean;setNegative:(value:boolean)=>void}){
 const total=sections.reduce((sum,s)=>sum+s.correct_answers.length,0)
 let offset=0
 return <section className="online-key-builder full"><h3>طراحی پاسخنامه آنلاین</h3><p>عنوان درس و تعداد سؤال را مشخص کنید، سپس گزینه صحیح هر سؤال را علامت بزنید. شماره‌ها بین درس‌ها پیوسته‌اند.</p><label className="online-check"><input type="checkbox" checked={negative} onChange={e=>setNegative(e.target.checked)}/> نمره منفی: هر سه پاسخ غلط، یک پاسخ درست را کسر کند</label>
 {sections.map((section,index)=>{const start=offset;offset+=section.correct_answers.length;return <section className="online-subject" key={section.id}><header><label>عنوان درس<input required maxLength={120} value={section.title} onChange={e=>setSections(sections.map(s=>s.id===section.id?{...s,title:e.target.value}:s))}/></label><label>تعداد سؤال<input aria-label={'تعداد سؤال درس '+(index+1)} required type="number" min="1" max={1000-total+section.correct_answers.length} value={section.correct_answers.length} onChange={e=>{const count=Math.max(1,Math.min(1000-total+section.correct_answers.length,Number(e.target.value)||1));setSections(sections.map(s=>s.id===section.id?{...s,correct_answers:Array.from({length:count},(_,i)=>s.correct_answers[i]??null)}:s))}}/></label><button type="button" className="btn btn-outline" disabled={sections.length===1} onClick={()=>setSections(sections.filter(s=>s.id!==section.id))}>حذف درس</button></header><div className="online-question-grid">{section.correct_answers.map((answer,i)=><QuestionChoices key={i} number={start+i+1} value={answer} onChange={value=>setSections(sections.map(s=>s.id===section.id?{...s,correct_answers:s.correct_answers.map((a,n)=>n===i?value:a)}:s))}/>)}</div></section>})}
 <button type="button" className="btn btn-outline" disabled={total>=1000||sections.length>=50} onClick={()=>setSections([...sections,{id:crypto.randomUUID(),title:'',correct_answers:[null]}])}>افزودن درس</button><p>{fa(total)} سؤال · {fa(sections.flatMap(s=>s.correct_answers).filter(a=>a===null).length)} کلید باقی‌مانده</p></section>
}
export function validateAnswerKey(definition:OnlineDefinition){
 if(!definition.sections.length)throw new Error('حداقل یک درس اضافه کنید.')
 if(definition.sections.some(s=>!s.title.trim()||s.correct_answers.some(a=>a===null)))throw new Error('عنوان درس‌ها و پاسخ صحیح تمام سؤال‌ها را وارد کنید.')
 if(new Set(definition.sections.map(s=>s.title.trim())).size!==definition.sections.length)throw new Error('عنوان درس‌ها نباید تکراری باشد.')
}
export function ExamResult({result}:{result:OnlineResult}){
 return <section className="online-result"><h3>نتیجه پاسخنامه آنلاین</h3><div className="online-result-summary"><span>درصد کل <b>{fa(result.percentage)}٪</b></span><span>درست <b>{fa(result.correct)}</b></span><span>غلط <b>{fa(result.wrong)}</b></span><span>بی‌پاسخ <b>{fa(result.unanswered)}</b></span><span>زمان اجرا <b>{fa(Math.floor(result.elapsed_seconds/60))} دقیقه و {fa(result.elapsed_seconds%60)} ثانیه</b></span><span>دقت پاسخ‌ها <b>{fa(result.accuracy)}٪</b></span></div><p>{result.negative_marking?'درصد = (تعداد درست − یک‌سوم تعداد غلط) ÷ تعداد سؤال × ۱۰۰؛ درصد منفی امکان‌پذیر است.':'بدون نمره منفی؛ درصد = تعداد درست ÷ تعداد سؤال × ۱۰۰.'} دقت، نسبت پاسخ درست به سؤال‌های پاسخ‌داده‌شده است.</p><p>میانگین زمان به‌ازای هر سؤال: {fa(result.average_seconds_per_question)} ثانیه{result.overtime_seconds>0?' · زمان اضافه نسبت به زمان پیشنهادی: '+fa(Math.ceil(result.overtime_seconds/60))+' دقیقه':''}</p><div className="online-result-table"><table><thead><tr><th>درس</th><th>تعداد</th><th>درست</th><th>غلط</th><th>بی‌پاسخ</th><th>درصد</th><th>دقت</th></tr></thead><tbody>{result.sections.map(s=><tr key={s.title}><th>{s.title}</th><td>{fa(s.total)}</td><td>{fa(s.correct)}</td><td>{fa(s.wrong)}</td><td>{fa(s.unanswered)}</td><td>{fa(s.percentage)}٪</td><td>{fa(s.accuracy)}٪</td></tr>)}</tbody></table></div><details><summary>مشاهده پاسخ و نتیجه تک‌تک سؤال‌ها</summary><div className="online-result-table"><table><thead><tr><th>سؤال</th><th>درس</th><th>پاسخ شما</th><th>پاسخ صحیح</th><th>نتیجه</th></tr></thead><tbody>{result.questions.map(q=><tr className={q.status} key={q.number}><th>{fa(q.number)}</th><td>{q.subject}</td><td>{q.answer===null?'—':fa(q.answer)}</td><td>{fa(q.correct_answer)}</td><td>{statusLabel[q.status]}</td></tr>)}</tbody></table></div></details></section>
}
export default function OnlineExamSheet({examId,advisor=false}:{examId:string;advisor?:boolean}){
 const qc=useQueryClient()
 const sheet=useQuery({queryKey:['online-sheet',examId],queryFn:()=>api<OnlineSheet>('/assigned-exams/'+examId+'/online-sheet'),refetchOnWindowFocus:false,refetchInterval:advisor?10000:false})
 useEffect(()=>{if(sheet.data?.submitted_at){try{localStorage.removeItem(draftKey(examId))}catch{}}},[examId,sheet.data?.submitted_at])
 if(sheet.isLoading)return <p>در حال دریافت پاسخنامه...</p>
 if(sheet.error)return <ExamError error={sheet.error}/>
 if(!sheet.data)return null
 const data=sheet.data
 if(data.result)return <ExamResult result={data.result}/>
 if(advisor)return <section className="online-key-review"><h3>کلید پاسخنامه ثبت‌شده</h3><p>در انتظار اتمام آزمون توسط دانش‌آموز</p>{data.sections.map(s=><details key={s.start_number}><summary>{s.title} · {fa(s.question_count)} سؤال</summary><p>{data.answer_key?.slice(s.start_number-1,s.start_number-1+s.question_count).map((answer,i)=>'سؤال '+fa(s.start_number+i)+': گزینه '+fa(answer)).join(' | ')}</p></details>)}</section>
 if(!data.started_at)return <p className="online-start-note">برای شروع پاسخنامه آنلاین، ابتدا فایل سؤالات را دانلود کنید. زمان از اولین دانلود محاسبه می‌شود.</p>
 return <StudentSheetEditor key={examId+':'+data.started_at} initial={data} onFinish={result=>{qc.setQueryData(['online-sheet',examId],result);void qc.invalidateQueries({queryKey:['assigned-exams']})}}/>
}
function StudentSheetEditor({initial,onFinish}:{initial:OnlineSheet;onFinish:(sheet:OnlineSheet)=>void}){
 const [answers,setAnswers]=useState(()=>restoreDraft(initial)),[version,setVersion]=useState(initial.version),[saved,setSaved]=useState(JSON.stringify(initial.answers)),[confirm,setConfirm]=useState(false)
 const [seconds,setSeconds]=useState(0)
 const origin=useRef({server:parseApiDate(initial.server_time).getTime(),local:Date.now()})
 const dirty=JSON.stringify(answers)!==saved
 useEffect(()=>{try{localStorage.setItem(draftKey(initial.exam_id),JSON.stringify({answers,version}))}catch{}},[answers,version,initial.exam_id])
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn)},[dirty])
 const path='/assigned-exams/'+initial.exam_id+'/online-sheet'
 const save=useMutation({mutationFn:({snapshot,revision}:{snapshot:(number|null)[];revision:number})=>api<OnlineSheet>(path,{method:'PUT',body:JSON.stringify({answers:snapshot,version:revision})}),onSuccess:data=>{setVersion(data.version);setSaved(JSON.stringify(data.answers))}})
 const finish=useMutation({mutationFn:()=>api<OnlineSheet>(path+'/finish',{method:'POST',body:JSON.stringify({answers,version})}),onSuccess:onFinish})
 const reload=useMutation({mutationFn:()=>api<OnlineSheet>(path),onSuccess:data=>{if(data.result){onFinish(data);return}setAnswers(data.answers);setVersion(data.version);setSaved(JSON.stringify(data.answers));setConfirm(false);save.reset();finish.reset()}})
 useEffect(()=>{if(!dirty||save.isPending||save.error||confirm||finish.isPending)return;const timer=setTimeout(()=>save.mutate({snapshot:answers,revision:version}),800);return ()=>clearTimeout(timer)},[answers,version,dirty,save.isPending,save.error,confirm,finish.isPending])
 useEffect(()=>{const tick=()=>setSeconds(Math.max(0,Math.floor((origin.current.server+Date.now()-origin.current.local-parseApiDate(initial.started_at!).getTime())/1000)));tick();const timer=setInterval(tick,1000);return ()=>clearInterval(timer)},[initial.started_at])
 const blanks=answers.filter(a=>a===null).length
 return <section className="student-online-sheet"><header><h3>پاسخنامه آنلاین</h3><b>زمان سپری‌شده: {fa(Math.floor(seconds/60))}:{String(seconds%60).padStart(2,'0')}</b></header><p>{initial.negative_marking?'این آزمون نمره منفی دارد: هر سه پاسخ غلط، یک پاسخ درست را کسر می‌کند.':'این آزمون نمره منفی ندارد.'} با کلیک دوباره روی گزینه انتخاب‌شده، پاسخ پاک می‌شود.</p>
 {initial.sections.map(s=><section className="online-subject" key={s.start_number}><h4>{s.title}</h4><div className="online-question-grid">{Array.from({length:s.question_count},(_,i)=>{const index=s.start_number-1+i;return <QuestionChoices key={index} number={index+1} value={answers[index]} disabled={finish.isPending||confirm} onChange={value=>setAnswers(current=>current.map((a,n)=>n===index?value:a))}/>})}</div></section>)}
 <div className="online-sheet-actions"><span role="status">{save.isPending?'در حال ذخیره پاسخ‌ها...':save.error?'ذخیره ناموفق بود؛ پاسخ‌ها هنوز در این صفحه هستند.':dirty?'تغییرات ذخیره‌نشده دارید.':'پاسخ‌ها ذخیره شده‌اند.'}</span><button type="button" className="btn btn-outline" disabled={save.isPending||finish.isPending||!dirty} onClick={()=>save.mutate({snapshot:answers,revision:version})}>ذخیره پاسخ‌ها</button><button type="button" className="btn btn-primary" disabled={save.isPending||finish.isPending} onClick={()=>setConfirm(true)}>اتمام آزمون</button></div>
 <ExamError error={save.error||finish.error||reload.error}/>
 {(save.error||finish.error)&&<button type="button" className="btn btn-outline" disabled={reload.isPending||save.isPending||finish.isPending} onClick={()=>reload.mutate()}>دریافت پاسخ‌های ذخیره‌شده در سرور</button>}
 {confirm&&<section className="online-finish-confirm" role="alert"><p>{fa(blanks)} سؤال بی‌پاسخ مانده است. پس از ثبت نهایی، امکان تغییر پاسخ‌ها وجود ندارد.</p><button type="button" className="btn btn-primary" disabled={finish.isPending||save.isPending} onClick={()=>finish.mutate()}>{finish.isPending?'در حال ثبت...':'تأیید و ثبت نهایی آزمون'}</button><button type="button" className="btn btn-outline" disabled={finish.isPending} onClick={()=>setConfirm(false)}>بازگشت به پاسخنامه</button></section>}
 </section>
}
