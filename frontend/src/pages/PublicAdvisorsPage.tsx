import { useQuery } from '@tanstack/react-query'
import { ChevronDown, GraduationCap, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Brand from '../components/Brand'
import type { ProfilePhoto } from '../types'
import { photoUrl } from '../utils/profilePhoto'
import '../styles/public-content.css'

type Advisor={id:string;full_name:string;profile_photo?:ProfilePhoto|null;work_levels:string[];education_degree:string;education_field:string;experience_years:number;bio:string;academic_year:string}

export default function PublicAdvisorsPage(){
 const {data=[],isLoading}=useQuery({queryKey:['public-advisors'],queryFn:()=>api<Advisor[]>('/public/advisors')});const [open,setOpen]=useState('')
 const section=(level:string,title:string)=><section><div className="public-section-title"><GraduationCap/><div><h2>{title}</h2><p>برای دیدن سابقه و معرفی هر مشاور، روی کارت او کلیک کنید.</p></div></div><div className="advisor-public-grid">{data.filter(x=>x.work_levels.includes(level)).map(item=><article className={open===item.id?'open':''} key={item.id}><button onClick={()=>setOpen(open===item.id?'':item.id)} aria-expanded={open===item.id}><div className="advisor-public-photo">{item.profile_photo?<img src={photoUrl(item.profile_photo)} alt={'عکس '+item.full_name}/>:<UserRound/>}</div><b>{item.full_name}</b><ChevronDown/></button>{open===item.id&&<div className="advisor-public-detail"><p><strong>مدرک تحصیلی:</strong> {item.education_degree}</p><p><strong>رشته تحصیلی:</strong> {item.education_field}</p><p><strong>سابقه کاری:</strong> {item.experience_years.toLocaleString('fa-IR')} سال</p><p><strong>معرفی مشاور:</strong> {item.bio}</p></div>}</article>)}</div>{!isLoading&&!data.some(x=>x.work_levels.includes(level))&&<p className="empty-public">هنوز مشاور فعالی در این مقطع معرفی نشده است.</p>}</section>
 return <div className="public-content-shell" dir="rtl"><header><Link to="/"><Brand light/></Link><nav><Link to="/">صفحه اصلی</Link><Link to="/articles">مقالات</Link><Link className="public-action" to="/register">شروع ثبت‌نام</Link></nav></header><main><div className="public-hero"><span>همراه مسیر تحصیلی شما</span><h1>معرفی مشاوران مسیر هوشمند</h1><p>پیش از ثبت‌نام، حوزه فعالیت و سابقه حرفه‌ای مشاوران تأییدشده را ببینید.</p></div>{isLoading?<p className="empty-public">در حال دریافت مشاوران…</p>:<>{section('upper_secondary','مشاوران متوسطه دوم')}{section('lower_secondary','مشاوران متوسطه اول')}</>}</main></div>
}
