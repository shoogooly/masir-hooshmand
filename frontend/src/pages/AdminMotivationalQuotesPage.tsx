import {useEffect,useState} from 'react'
import {useMutation,useQuery} from '@tanstack/react-query'
import {Save,Sparkles} from 'lucide-react'
import {api} from '../api'
import '../styles/motivational-quotes.css'

export default function AdminMotivationalQuotesPage(){
 const [quotes,setQuotes]=useState<string[]>(Array(31).fill(''))
 const query=useQuery({queryKey:['motivational-quotes'],queryFn:()=>api<string[]>('/admin/motivational-quotes')})
 useEffect(()=>{if(query.data)setQuotes(query.data)},[query.data])
 const save=useMutation({mutationFn:()=>api<string[]>('/admin/motivational-quotes',{method:'PUT',body:JSON.stringify({quotes})}),onSuccess:data=>setQuotes(data)})
 return <div className="content-page motivation-page" dir="rtl"><header className="motivation-intro"><Sparkles/><div><h1>جملات انگیزشی برنامه‌ها</h1><p>برای هر روز ماه شمسی یک جمله بنویسید. هنگام انتشار برنامه، جملهٔ همان روز در بالای نسخهٔ رنگی و سیاه‌وسفید ثبت می‌شود.</p></div></header>
 {query.isLoading?<p>در حال دریافت جمله‌ها…</p>:query.error?<p role="alert">دریافت جمله‌ها ممکن نشد.</p>:<><div className="motivation-grid">{quotes.map((quote,index)=><label key={index}><span>روز {String(index+1).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])}</span><textarea value={quote} maxLength={240} rows={3} placeholder="جملهٔ انگیزشی این روز…" onChange={event=>setQuotes(current=>current.map((item,i)=>i===index?event.target.value:item))}/></label>)}</div><div className="motivation-save"><span>{quotes.filter(item=>item.trim()).length.toLocaleString('fa-IR')} از ۳۱ روز تکمیل شده</span><button className="btn btn-primary" disabled={save.isPending} onClick={()=>save.mutate()}><Save size={18}/>{save.isPending?'در حال ذخیره…':'ذخیره جمله‌ها'}</button>{save.isSuccess&&<p role="status">جمله‌ها ذخیره شدند.</p>}{save.error&&<p role="alert">ذخیره جمله‌ها ممکن نشد.</p>}</div></>}
 </div>
}
