import { useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BrainCircuit, Sparkles, Send, LockKeyhole, Unlock, RefreshCw, ChevronDown, Search, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react'
import { api } from '../api'
import '../styles/ai-workspace.css'

type Usage={limit:number;used:number;remaining:number;reset_at:string;locked:boolean;enabled:boolean;override:number|null;default_limit:number}
type Turn={id:string;message:string;reply:string;status:string;error:string;created_at:string}
type ChatData={turns:Turn[];next_cursor:string|null;usage:Usage}
type Evidence={point:string;evidence:string}
type Review={id:string;student_id:string;student_name:string;kind:string;week:string;status:string;error:string;created_at:string;completed_at:string|null;coverage:{plans?:number;reports?:number;messages?:number;ai_messages?:number;exams?:number;note?:string};result:{summary:string;risk:string;data_quality:string;strengths:Evidence[];weaknesses:Evidence[];changes:string[];next_week_plan:{day:string;focus:string;minutes:number;reason:string}[];advisor_actions:string[];questions:string[];data_gaps:string[]}}
type Student={id:string;full_name:string;status:string;usage:Usage;latest:Review|null}
const fa=(n:number)=>n.toLocaleString('fa-IR')
const date=(s:string)=>new Date(s).toLocaleString('fa-IR',{dateStyle:'medium',timeStyle:'short'})
const request=(body:unknown,method='POST')=>({method,body:JSON.stringify(body)})
function ErrorMessage({error}:{error:unknown}){return error?<p className="ai-error" role="alert">{error instanceof Error?error.message:'دریافت اطلاعات ناموفق بود'}</p>:null}
function Intro({title,children}:{title:string;children:React.ReactNode}){return <header className="ai-intro"><span className="ai-icon"><BrainCircuit/></span><div><span className="ai-eyebrow">دستیار درسی مسیر هوشمند</span><h1>{title}</h1><p>{children}</p></div></header>}
function UsageBar({usage}:{usage:Usage}){return <div className="ai-usage"><div><b>{fa(usage.remaining)} پیام باقی‌مانده</b><span>از {fa(usage.limit)} پیام هفتگی</span></div><progress max={Math.max(1,usage.limit)} value={Math.min(usage.used,usage.limit)} aria-label="پیام‌های مصرف‌شده"/><small>تجدید سهمیه: {date(usage.reset_at)} · ابتدای شنبه</small></div>}

export function AIChat({studentId}:{studentId?:string}){
 const qc=useQueryClient(),[text,setText]=useState(''),[notice,setNotice]=useState('')
 const id=useRef<string|null>(null)
 const path=studentId?'/ai/students/'+studentId+'/chat':'/ai/chat'
 const key=['ai-chat',studentId||'self']
 const query=useInfiniteQuery({queryKey:key,queryFn:({pageParam})=>api<ChatData>(path+(pageParam?'?before='+encodeURIComponent(pageParam):'')),initialPageParam:null as string|null,getNextPageParam:last=>last.next_cursor||undefined,refetchInterval:10000})
 const state=query.data?.pages[0]?.usage
 const send=useMutation({mutationFn:()=>api<{turn:Turn;usage:Usage}>('/ai/chat',request({message:text,request_id:id.current||(id.current=crypto.randomUUID())})),
   onSuccess:result=>{if(result.turn.status==='completed'){setText('');id.current=null;setNotice('')}
     else if(result.turn.status==='failed'){id.current=null;setNotice(result.turn.error+'؛ برای تلاش دوباره ارسال را بزنید')}
     else setNotice('پیام شما ثبت شده و پاسخ در حال آماده شدن است.')
     void qc.invalidateQueries({queryKey:key})},
   onError:()=>{void qc.invalidateQueries({queryKey:key})}})
 const turns=query.data?.pages.slice().reverse().flatMap(p=>p.turns)||[]
 const pending=turns.some(t=>t.status==='pending')
 const disabled=!state||!state.enabled||state.locked||state.remaining<=0||send.isPending||pending
 return <section className="ai-chat-panel">
  {state&&<UsageBar usage={state}/>}
  {query.isLoading&&<p className="ai-empty">در حال دریافت گفت‌وگو…</p>}
  <ErrorMessage error={query.error}/>
  {query.hasNextPage&&<button className="ai-secondary" disabled={query.isFetchingNextPage} onClick={()=>void query.fetchNextPage()}>نمایش پیام‌های قدیمی‌تر</button>}
  <div className="ai-conversation" aria-live="polite">
   {!turns.length&&!query.isLoading&&<div className="ai-empty"><Sparkles/><h3>از یک قدم کوچک شروع کنیم</h3><p>{studentId?'هنوز گفت‌وگویی ثبت نشده است.':'درباره اجرای برنامه، درس‌ها، آزمون یا تمرکزت بنویس؛ پاسخ متناسب با اطلاعات درسی خودت دریافت می‌کنی.'}</p></div>}
   {turns.map(t=><article className="ai-turn" key={t.id}><div className="ai-bubble ai-user-bubble"><small>دانش‌آموز · {date(t.created_at)}</small><p>{t.message}</p></div>{t.reply&&<div className="ai-bubble ai-assistant-bubble"><small><Sparkles size={15}/> دستیار درسی</small><p>{t.reply}</p></div>}{t.status==='pending'&&<p className="ai-pending"><Clock3 size={16}/> در حال بررسی و آماده‌سازی پاسخ…</p>}{t.status==='failed'&&<p className="ai-error">{t.error} · این پیام از سهمیه کم نشده است.</p>}</article>)}
  </div>
  {!studentId&&<form className="ai-composer" onSubmit={e=>{e.preventDefault();if(text.trim()&&!disabled)send.mutate()}}>
   <p className="ai-disclosure"><ShieldCheck size={16}/> مشاور شما این گفت‌وگو را می‌بیند. برای پاسخ شخصی، اطلاعات درسی و گفت‌وگوهای شما به سرویس هوش مصنوعی منتخب مدیر ارسال می‌شود.</p>
   {state?.locked?<p className="ai-locked"><LockKeyhole/> مشاور شما این گفت‌وگو را قفل کرده است.</p>:state&&!state.enabled?<p className="ai-locked">این بخش پس از فعال‌سازی هوش مصنوعی توسط مدیر آماده می‌شود.</p>:state?.remaining===0?<p className="ai-locked">سهمیه این هفته تمام شده است؛ زمان تجدید سهمیه در بالا مشخص است.</p>:null}
   <label htmlFor="ai-message">پیام درسی شما</label><textarea id="ai-message" rows={3} maxLength={3000} value={text} disabled={disabled} onChange={e=>{setText(e.target.value);id.current=null;setNotice('')}} placeholder="مثلاً: در اجرای برنامه ریاضی عقب افتادم؛ از کجا شروع کنم؟"/>
   <div className="ai-composer-actions"><small>هر پیام، حتی پیام نامرتبط، یک سهمیه مصرف می‌کند.</small><button className="btn btn-primary" disabled={disabled||!text.trim()}><Send size={18}/>{send.isPending||pending?'در حال دریافت پاسخ…':'ارسال پیام'}</button></div>
   {notice&&<p role="status">{notice}</p>}<ErrorMessage error={send.error}/>
  </form>}
 </section>
}
export function StudentAIPage(){return <div className="content-page ai-page"><Intro title="صحبت با هوش مصنوعی">همراهی برای اجرای بهتر برنامه و پیدا کردن قدم بعدی در درس‌ها.</Intro><AIChat/></div>}

function EvidenceCards({title,items,tone}:{title:string;items:Evidence[];tone:string}){return <section className={'ai-review-section '+tone}><h3>{title}</h3>{items.length?items.map((x,i)=><article key={i}><b>{x.point}</b><p>{x.evidence}</p></article>):<p>شواهد کافی برای نتیجه‌گیری وجود ندارد.</p>}</section>}
function TextList({title,items}:{title:string;items:string[]}){return items.length?<section className="ai-review-section"><h3>{title}</h3><ul>{items.map((x,i)=><li key={i}>{x}</li>)}</ul></section>:null}
export function AIReview({review}:{review:Review}){
 if(review.status!=='completed')return <p className={review.status==='failed'?'ai-error':'ai-pending'}>{review.status==='failed'?review.error:'تحلیل در حال آماده شدن است…'}</p>
 const r=review.result
 return <div className="ai-review">
  <div className="ai-identity"><ShieldCheck/><div><strong>این بررسی مربوط به دانش‌آموز {review.student_name} است.</strong><small>اطلاعات و شواهد این گزارش به همین دانش‌آموز اختصاص دارد.</small></div></div>
  <div className="ai-review-meta"><span>{review.kind==='weekly'?'بررسی خودکار هفتگی':'بررسی در لحظه'}</span><span>{date(review.completed_at||review.created_at)}</span><span>کفایت اطلاعات: {{limited:'محدود',moderate:'متوسط',good:'خوب'}[r.data_quality]||'نامشخص'}</span><span className={'ai-risk '+r.risk}>اولویت پیگیری: {{low:'عادی',medium:'نیازمند توجه',high:'بالا'}[r.risk]||'نامشخص'}</span></div>
  <section className="ai-summary"><h3>شرح حال درسی</h3><p>{r.summary}</p></section>
  <div className="ai-review-grid"><EvidenceCards title="نقاط قوت و شواهد" items={r.strengths} tone="ai-positive"/><EvidenceCards title="نیازهای بهبود و شواهد" items={r.weaknesses} tone="ai-attention"/></div>
  <TextList title="تغییرات عملکرد" items={r.changes}/>
  <section className="ai-week-proposal"><h3>پیشنهاد اجرایی هفته پیش رو</h3><p>پیش‌نویس برای بررسی مشاور؛ این پیشنهاد خودکار جایگزین برنامه دانش‌آموز نمی‌شود.</p><div>{r.next_week_plan.map((d,i)=><article key={i}><header><b>{d.day}</b><span>{fa(d.minutes)} دقیقه</span></header><strong>{d.focus}</strong><p>{d.reason}</p></article>)}</div></section>
  <div className="ai-review-grid"><TextList title="اقدام‌های پیشنهادی مشاور" items={r.advisor_actions}/><TextList title="پرسش‌های پیشنهادی برای گفت‌وگو" items={r.questions}/></div>
  <TextList title="اطلاعاتی که هنوز لازم است" items={r.data_gaps}/>
  <details className="ai-coverage"><summary>اطلاعات استفاده‌شده در این تحلیل</summary><p>{fa(review.coverage.plans||0)} برنامه · {fa(review.coverage.reports||0)} گزارش · {fa(review.coverage.exams||0)} نتیجه آزمون · {fa(review.coverage.messages||0)} پیام · {fa(review.coverage.ai_messages||0)} گفت‌وگوی هوش مصنوعی</p><p>{review.coverage.note}</p></details>
 </div>
}
function AdvisorStudentAI({student}:{student:Student}){
 const qc=useQueryClient(),[tab,setTab]=useState<'analysis'|'chat'>('analysis'),[open,setOpen]=useState<string|null>(null)
 const reviews=useQuery({queryKey:['ai-analyses',student.id],queryFn:()=>api<Review[]>('/ai/students/'+student.id+'/analyses'),refetchInterval:15000})
 const generate=useMutation({mutationFn:()=>api<Review>('/ai/students/'+student.id+'/analyze',request({})),onSuccess:r=>{setOpen(r.id);void qc.invalidateQueries({queryKey:['ai-analyses',student.id]});void qc.invalidateQueries({queryKey:['ai-students']})},onError:()=>{void qc.invalidateQueries({queryKey:['ai-analyses',student.id]})}})
 const lock=useMutation({mutationFn:()=>api('/ai/students/'+student.id+'/lock',request({locked:!student.usage.locked},'PUT')),onSuccess:()=>{void qc.invalidateQueries({queryKey:['ai-students']});void qc.invalidateQueries({queryKey:['ai-chat',student.id]})}})
 const expanded=open===null?reviews.data?.[0]?.id:open
 return <section className="ai-student-detail"><header className="ai-student-heading"><div><span className="ai-eyebrow">پرونده اختصاصی هوش مصنوعی</span><h2>{student.full_name}</h2></div><button className="btn btn-primary" disabled={generate.isPending||!student.usage.enabled} onClick={()=>{setTab('analysis');generate.mutate()}}><RefreshCw size={18} className={generate.isPending?'ai-spin':''}/>{generate.isPending?'در حال بررسی اطلاعات…':'بررسی وضعیت دانش‌آموز'}</button></header>
  <ErrorMessage error={generate.error}/>{!student.usage.enabled&&<p className="ai-locked">برای تحلیل جدید، مدیر باید اتصال هوش مصنوعی را فعال کند.</p>}
  <div className="ai-tabs"><button aria-pressed={tab==='analysis'} onClick={()=>setTab('analysis')}><Sparkles size={18}/>تحلیل‌ها و پیشنهاد هفته</button><button aria-pressed={tab==='chat'} onClick={()=>setTab('chat')}><BrainCircuit size={18}/>گفت‌وگو با هوش مصنوعی</button></div>
  {tab==='analysis'?<><p className="ai-helper">بررسی خودکار هر هفته یک بار انجام می‌شود؛ بررسی در لحظه سهمیه چت دانش‌آموز را مصرف نمی‌کند.</p><ErrorMessage error={reviews.error}/>{reviews.isLoading&&<p>در حال دریافت تحلیل‌ها…</p>}{reviews.data?.length===0&&<div className="ai-empty"><Sparkles/><h3>اولین تصویر جامع از وضعیت دانش‌آموز</h3><p>با «بررسی وضعیت دانش‌آموز» شرح حال و پیشنهاد هفته آینده را دریافت کنید.</p></div>}{reviews.data?.map(r=><article className="ai-review-entry" key={r.id}><button className="ai-review-toggle" aria-expanded={expanded===r.id} onClick={()=>setOpen(expanded===r.id?'':r.id)}><div><b>{r.kind==='weekly'?'بررسی خودکار هفتگی':'بررسی وضعیت دانش‌آموز'}</b><small>{date(r.created_at)} · {{completed:'آماده',pending:'در حال بررسی',failed:'نیازمند تلاش دوباره'}[r.status]}</small></div><ChevronDown/></button>{expanded===r.id&&<AIReview review={r}/>}</article>)}</>:<><div className="ai-chat-control"><p>گفت‌وگوی {student.full_name} با دستیار درسی</p><button className="ai-secondary" disabled={lock.isPending} onClick={()=>lock.mutate()}>{student.usage.locked?<Unlock size={17}/>:<LockKeyhole size={17}/>} {student.usage.locked?'باز کردن گفت‌وگو':'قفل کردن گفت‌وگو'}</button></div><ErrorMessage error={lock.error}/><AIChat studentId={student.id}/></>}
 </section>
}
export function AdvisorAIPage(){
 const [search,setSearch]=useState(''),[selected,setSelected]=useState('')
 const students=useQuery({queryKey:['ai-students'],queryFn:()=>api<Student[]>('/ai/students'),refetchInterval:15000})
 const rows=students.data||[],current=rows.find(x=>x.id===selected)
 return <div className="content-page ai-page"><Intro title="پیشنهادهای AI">تصویری روشن از وضعیت هر دانش‌آموز، همراه با شواهد و پیشنهاد قابل اجرا برای هفته آینده.</Intro>
  <div className="ai-metrics"><article><span>دانش‌آموزان شما</span><b>{fa(rows.length)}</b></article><article><span>تحلیل‌های آماده</span><b>{fa(rows.filter(x=>x.latest?.status==='completed').length)}</b></article><article><span>نیازمند توجه بیشتر</span><b>{fa(rows.filter(x=>x.latest?.result?.risk==='high').length)}</b></article><article><span>گفت‌وگوهای قفل‌شده</span><b>{fa(rows.filter(x=>x.usage.locked).length)}</b></article></div>
  <ErrorMessage error={students.error}/><div className="ai-advisor-layout"><aside className="ai-student-list"><label className="ai-search"><Search size={18}/><input aria-label="جست‌وجوی دانش‌آموز" value={search} onChange={e=>setSearch(e.target.value)} placeholder="نام دانش‌آموز…"/></label>{students.isLoading&&<p>در حال دریافت…</p>}{rows.filter(s=>s.full_name.includes(search)).map(s=><button key={s.id} aria-pressed={selected===s.id} onClick={()=>setSelected(s.id)}><span className="ai-avatar">{s.full_name[0]}</span><span><b>{s.full_name}</b><small>{s.latest?.status==='completed'?'تحلیل آماده است':'در انتظار بررسی'} · {fa(s.usage.remaining)} پیام باقی‌مانده</small></span>{s.usage.locked&&<LockKeyhole size={15}/>}</button>)}{!students.isLoading&&!rows.length&&<p>هنوز دانش‌آموزی به شما اختصاص نیافته است.</p>}</aside><main>{current?<AdvisorStudentAI key={current.id} student={current}/>:<div className="ai-select-student"><BrainCircuit/><h2>یک دانش‌آموز را انتخاب کنید</h2><p>تحلیل‌ها، پیشنهاد هفته آینده و گفت‌وگوی اختصاصی او اینجا نمایش داده می‌شود.</p></div>}</main></div>
 </div>
}

type Provider='gapgpt'|'mistral'
type ProviderConfig={label:string;model:string;token_configured:boolean;base_url:string}
type Config={enabled:boolean;model:string;weekly_limit:number;token_configured:boolean;base_url:string;provider:Provider;providers:Record<Provider,ProviderConfig>}
function SettingsForm({config}:{config:Config}){
 const qc=useQueryClient(),[notice,setNotice]=useState('')
 const [provider,setProvider]=useState<Provider>(config.provider||'gapgpt')
 const selected=config.providers?.[provider]||{...config,label:'گپ‌جی‌پی‌تی'}
 const form=useRef<HTMLFormElement>(null)
 const save=useMutation({mutationFn:(body:unknown)=>api<Config>('/ai/settings',request(body,'PUT')),onSuccess:()=>{setNotice('تنظیمات ذخیره شد.');const token=form.current?.elements.namedItem('token') as HTMLInputElement|null;if(token)token.value='';const clear=form.current?.elements.namedItem('clear') as HTMLInputElement|null;if(clear)clear.checked=false;void qc.invalidateQueries({queryKey:['ai-settings']});void qc.invalidateQueries({queryKey:['ai-students']})}})
 const test=useMutation({mutationFn:()=>api<{message:string}>('/ai/settings/test',request({})),onSuccess:r=>setNotice(r.message)})
 return <form ref={form} className="ai-settings-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);save.mutate({provider,enabled:f.get('enabled')==='on',model:f.get('model'),weekly_limit:Number(f.get('limit')),api_key:f.get('token')||null,clear_token:f.get('clear')==='on'})}}>
  <p>آدرس اتصال: <code dir="ltr">{selected.base_url}</code></p>
  <h2>انتخاب سرویس هوش مصنوعی</h2><p>سرویس ذخیره‌شده: {config.provider==='mistral'?'میسترال':'گپ‌جی‌پی‌تی'} · {config.enabled?'فعال':'غیرفعال'}</p>
  <label>سرویس مورد استفاده<select disabled={save.isPending||test.isPending} value={provider} onChange={e=>{setProvider(e.target.value as Provider);setNotice('');save.reset();test.reset()}}><option value="gapgpt">گپ‌جی‌پی‌تی</option><option value="mistral">میسترال</option></select></label>
  <p>برای تغییر سرویس، آن را انتخاب و تنظیمات را ذخیره کنید. توکن و مدل هر سرویس جداگانه حفظ می‌شوند. در فیلد نام مدل، آدرس سایت وارد نکنید؛ آدرس اتصال از قبل تنظیم شده است.</p><p>توکن فقط در سرور نگهداری می‌شود و پس از ذخیره نمایش داده نمی‌شود.</p>
  <label className="ai-check"><input type="checkbox" name="enabled" defaultChecked={config.enabled}/> فعال‌سازی چت درسی و تحلیل خودکار هفتگی</label>
  <div className="ai-settings-grid" key={provider}><label>توکن {selected.label}<input type="password" name="token" autoComplete="new-password" maxLength={500} placeholder={selected.token_configured?'توکن ذخیره شده؛ برای حفظ آن خالی بگذارید':'توکن سرویس انتخاب‌شده را وارد کنید'}/></label><label>نام مدل<input placeholder={provider==='gapgpt'?'gpt-4o-mini':'mistral-small-latest'} name="model" defaultValue={selected.model} required pattern="[a-zA-Z0-9._:\/\-]+" dir="ltr"/></label><label>سهمیه پیش‌فرض پیام در هفته<input name="limit" type="number" min={0} max={1000} defaultValue={config.weekly_limit} required/></label></div>
  {selected.token_configured&&<label key={provider+"-clear"} className="ai-check"><input type="checkbox" name="clear"/> حذف توکن ذخیره‌شده (ابتدا فعال‌سازی را خاموش کنید)</label>}
  <p className="ai-helper">هفته از ساعت ۰۰:۰۰ شنبه به وقت ایران شروع می‌شود. سهمیهٔ اختصاصی هر دانش‌آموز بر پیش‌فرض اولویت دارد؛ صفر یعنی ارسال پیام غیرفعال.</p>
  <div className="ai-settings-actions"><button className="btn btn-primary" disabled={save.isPending}>ذخیره تنظیمات</button><button type="button" className="ai-secondary" disabled={test.isPending||save.isPending||provider!==config.provider||!config.enabled||!config.token_configured} onClick={()=>test.mutate()}>{test.isPending?'در حال بررسی اتصال…':'آزمایش اتصال ذخیره‌شده'}</button></div>
  {notice&&<p className="ai-success" role="status"><CheckCircle2 size={18}/>{notice}</p>}<ErrorMessage error={save.error||test.error}/>
 </form>
}
function StudentLimit({student}:{student:Student}){
 const qc=useQueryClient()
 const save=useMutation({mutationFn:(limit:number|null)=>api('/ai/students/'+student.id+'/limit',request({weekly_limit:limit},'PUT')),onSuccess:()=>void qc.invalidateQueries({queryKey:['ai-students']})})
 return <article className="ai-limit-row"><div><b>{student.full_name}</b><small>مصرف این هفته: {fa(student.usage.used)} از {fa(student.usage.limit)} · {student.usage.override===null?'سهمیه پیش‌فرض':'سهمیه اختصاصی'}</small></div><form onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('limit');save.mutate(value===''?null:Number(value))}}><input aria-label={'سهمیه هفتگی '+student.full_name} name="limit" type="number" min={0} max={1000} defaultValue={student.usage.override??''} placeholder={'پیش‌فرض: '+student.usage.default_limit}/><button className="ai-secondary" disabled={save.isPending}>ذخیره</button>{student.usage.override!==null&&<button type="button" className="ai-secondary" disabled={save.isPending} onClick={()=>save.mutate(null)}>بازگشت به پیش‌فرض</button>}</form><ErrorMessage error={save.error}/></article>
}
export function AdminAIPage(){
 const [search,setSearch]=useState('')
 const config=useQuery({queryKey:['ai-settings'],queryFn:()=>api<Config>('/ai/settings')})
 const students=useQuery({queryKey:['ai-students'],queryFn:()=>api<Student[]>('/ai/students')})
 return <div className="content-page ai-page"><Intro title="مدیریت هوش مصنوعی">اتصال گپ‌جی‌پی‌تی و میسترال و کنترل سهمیهٔ گفت‌وگوی درسی دانش‌آموزان.</Intro><ErrorMessage error={config.error}/>{config.data&&<SettingsForm config={config.data}/>}<section className="ai-limit-panel"><h2>سهمیه اختصاصی دانش‌آموزان</h2><p>برای استفاده از پیش‌فرض عمومی، فیلد سهمیه را خالی بگذارید.</p><label className="ai-search"><Search size={18}/><input aria-label="جست‌وجوی سهمیه دانش‌آموز" placeholder="جست‌وجوی نام…" value={search} onChange={e=>setSearch(e.target.value)}/></label><ErrorMessage error={students.error}/>{students.data?.filter(s=>s.full_name.includes(search)).map(s=><StudentLimit key={s.id+':'+s.usage.override+':'+s.usage.default_limit} student={s}/>)}</section></div>
}
