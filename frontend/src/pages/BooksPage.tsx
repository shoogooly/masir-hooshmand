import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {BookOpen,Plus,ChevronDown,Save} from 'lucide-react'
import {api} from '../api'
import '../styles/books.css'
export type BookTopic={id:string;title:string;question_type:'test'|'written';question_count:number;completed:number;remaining:number;reserved:number;available:number}
export type LibraryBook={id:string;title:string;publication_year:number;active:boolean;owned:boolean;topics:BookTopic[]}
const send=(body:unknown,method='POST')=>({method,body:JSON.stringify(body)})
const fa=(n:number)=>n.toLocaleString('fa-IR')
function ErrorNote({error}:{error:unknown}){return error?<p role="alert" className="books-error">{error instanceof Error?error.message:'ذخیره ناموفق بود'}</p>:null}
function TopicForm({bookId,topic,onSaved}:{bookId:string;topic?:BookTopic;onSaved:()=>void}){
 const save=useMutation({mutationFn:(body:unknown)=>api('/books/'+bookId+'/topics'+(topic?'/'+topic.id:''),send(body,topic?'PUT':'POST')),onSuccess:onSaved})
 return <form className="book-topic-form" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);save.mutate({title:data.get('title'),question_count:Number(data.get('count')),question_type:data.get('kind')})}}>
 <label>عنوان مبحث<input name="title" required maxLength={60} defaultValue={topic?.title} placeholder="مثلاً حرکت‌شناسی"/></label>
 <label>تعداد سؤال<input name="count" type="number" min={0} max={100000} required defaultValue={topic?.question_count}/></label>
 <label>نوع سؤال<select name="kind" defaultValue={topic?.question_type||'test'}><option value="test">تستی</option><option value="written">تشریحی</option></select></label>
 <button className="btn btn-primary" disabled={save.isPending}><Save size={16}/>{topic?'ذخیره مبحث':'افزودن مبحث'}</button><ErrorNote error={save.error}/>
 </form>
}
function BookMetadata({book,onSaved}:{book?:LibraryBook;onSaved:()=>void}){
 const save=useMutation({mutationFn:(body:unknown)=>api('/books'+(book?'/'+book.id:''),send(body,book?'PUT':'POST')),onSuccess:onSaved})
 return <form className="book-meta-form" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);save.mutate({title:data.get('title'),publication_year:Number(data.get('year')),active:book?data.get('active')==='on':true})}}>
 <label>عنوان کتاب<input name="title" required maxLength={60} defaultValue={book?.title} placeholder="مثلاً فیزیک خیلی سبز"/></label>
 <label>سال انتشار<input name="year" type="number" min={1300} max={2100} required defaultValue={book?.publication_year} placeholder="۱۴۰۵"/></label>
 {book&&<label className="book-check"><input name="active" type="checkbox" defaultChecked={book.active}/> قابل انتخاب برای دانش‌آموز</label>}
 <button className="btn btn-primary" disabled={save.isPending}>{book?'ذخیره مشخصات':'افزودن کتاب'}</button><ErrorNote error={save.error}/>
 </form>
}
export default function BooksPage({mode,studentId}:{mode:'admin'|'student'|'advisor';studentId?:string}){
 const qc=useQueryClient(),[open,setOpen]=useState<string|null>(null),[adding,setAdding]=useState(false),[topicBook,setTopicBook]=useState<string|null>(null),[search,setSearch]=useState('')
 const path=mode==='advisor'?'/advisors/students/'+studentId+'/books':'/books'
 const query=useQuery({queryKey:['books',mode,studentId],queryFn:()=>api<LibraryBook[]>(path)})
 const refresh=()=>{void qc.invalidateQueries({queryKey:['books']})}
 const own=useMutation({mutationFn:({id,owned}:{id:string;owned:boolean})=>api('/books/'+id+'/ownership',send({owned},'PUT')),onSuccess:refresh})
 const books=(query.data||[]).filter(b=>(mode==='admin'||b.active||b.owned)&&b.title.includes(search))
 return <div className="content-page books-page"><header className="books-intro"><BookOpen/><div><h1>{mode==='admin'?'بخش کتاب‌ها':mode==='advisor'?'کتاب‌های دانش‌آموز':'کتاب‌های من'}</h1><p>{mode==='admin'?'کتاب‌ها، سال انتشار و موجودی سؤال هر مبحث را ثبت کنید.':mode==='advisor'?'منابع در دسترس دانش‌آموز و موجودی سؤال‌های هر مبحث را ببینید.':'کتاب‌هایی را که دارید انتخاب کنید تا برنامهٔ درسی با منابع شما هماهنگ شود.'}</p></div>{mode==='admin'&&<button className="btn btn-primary" onClick={()=>setAdding(!adding)}><Plus/> افزودن کتاب</button>}</header>
 {mode==='admin'&&adding&&<section className="book-card"><BookMetadata onSaved={()=>{setAdding(false);refresh()}}/></section>}
 <label className="book-search">جست‌وجوی کتاب<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="عنوان کتاب…"/></label>
 {mode!=='admin'&&<p className="books-help">«باقی‌مانده» از گزارش‌های انجام‌شده محاسبه می‌شود. سؤال‌های برنامه‌های در حال اجرا در ستون «در برنامه» قرار می‌گیرند و دوباره پیشنهاد نمی‌شوند.</p>}
 <ErrorNote error={query.error||own.error}/>{query.isLoading&&<p>در حال دریافت کتاب‌ها…</p>}
 {!query.isLoading&&!books.length&&<p className="books-empty">{mode==='advisor'?'این دانش‌آموز هنوز کتابی انتخاب نکرده است.':'کتابی برای نمایش وجود ندارد.'}</p>}
 {books.map(book=><article className={'book-card '+(book.owned?'book-owned':'')} key={book.id}>
 <div className="book-heading">{mode==='student'&&<input type="checkbox" aria-label={'این کتاب را دارم: '+book.title} checked={book.owned} disabled={own.isPending} onChange={e=>own.mutate({id:book.id,owned:e.target.checked})}/>}<button className="book-toggle" aria-expanded={open===book.id} onClick={()=>setOpen(open===book.id?null:book.id)}><span><b>{book.title}</b><small>انتشار {fa(book.publication_year)} · {fa(book.topics.length)} مبحث{!book.active?' · غیرفعال':''}</small></span><ChevronDown/></button></div>
 {open===book.id&&<div className="book-content">{mode==='admin'&&<BookMetadata book={book} onSaved={refresh}/>}
 {!book.topics.length&&<p className="books-empty">هنوز مبحثی برای این کتاب ثبت نشده است.</p>}
 {book.topics.map(topic=>mode==='admin'?<div className="book-topic-admin" key={topic.id}><TopicForm bookId={book.id} topic={topic} onSaved={refresh}/></div>:<section className="book-topic" key={topic.id}><h3>{topic.title}<small>{topic.question_type==='test'?'تستی':'تشریحی'}</small></h3><div className="book-counts">{[['کل سؤال',topic.question_count],['انجام‌شده',topic.completed],['باقی‌مانده',topic.remaining],['در برنامه',topic.reserved],['قابل برنامه‌ریزی',topic.available]].map(([label,value])=><span key={label}><b>{fa(Number(value))}</b><small>{label}</small></span>)}</div></section>)}
 {mode==='admin'&&<><button className="small-secondary" onClick={()=>setTopicBook(topicBook===book.id?null:book.id)}><Plus size={17}/> اضافه کردن مبحث</button>{topicBook===book.id&&<TopicForm bookId={book.id} onSaved={()=>{setTopicBook(null);refresh()}}/>}</>}
 </div>}</article>)}
 </div>
}

