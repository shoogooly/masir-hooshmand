import { useQuery } from '@tanstack/react-query'
import { BookOpen, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Brand from '../components/Brand'
import '../styles/public-content.css'

type Article={id:string;title:string;body:string;author_name:string;published_at?:string}
export default function PublicArticlesPage(){const {data=[],isLoading}=useQuery({queryKey:['public-articles'],queryFn:()=>api<Article[]>('/public/articles')});const [open,setOpen]=useState('');return <div className="public-content-shell" dir="rtl"><header><Link to="/"><Brand light/></Link><nav><Link to="/">صفحه اصلی</Link><Link to="/advisors">معرفی مشاورین</Link><Link className="public-action" to="/register">شروع ثبت‌نام</Link></nav></header><main><div className="public-hero"><span><BookOpen/> دانش و تجربه</span><h1>مقالات مسیر هوشمند</h1><p>مطالب آموزشی و مشاوره‌ای منتشرشده توسط تیم مسیر هوشمند را بخوانید.</p></div><div className="public-articles">{data.map(item=><article key={item.id} className={open===item.id?'open':''}><button onClick={()=>setOpen(open===item.id?'':item.id)} aria-expanded={open===item.id}><div><b>{item.title}</b><small>نویسنده: {item.author_name}</small></div><ChevronDown/></button>{open===item.id&&<div className="article-body">{item.body.split('\n').map((line,i)=><p key={i}>{line||' '}</p>)}</div>}</article>)}</div>{isLoading&&<p className="empty-public">در حال دریافت مقالات…</p>}{!isLoading&&!data.length&&<p className="empty-public">هنوز مقاله‌ای منتشر نشده است.</p>}</main></div>}
