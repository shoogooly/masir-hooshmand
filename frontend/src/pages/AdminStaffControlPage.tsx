import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, ShieldCheck, UserCheck, UserPlus, Users } from 'lucide-react'
import { api } from '../api'
import type { User } from '../types'
import '../styles/staff-access.css'

type Level = 'none' | 'view' | 'edit'
type AccessData = { areas: Record<string,string>; matrix: Record<'expert'|'secretary',Record<string,Level>> }
type ExpertAdvisors = { expert:User;selected_ids:string[];advisors:User[] }
const roleNames:Record<string,string>={expert:'کارشناس',secretary:'منشی',super_admin:'مدیر'}
const levelNames:Record<Level,string>={none:'عدم دسترسی',view:'قابل مشاهده',edit:'قابل ویرایش'}

export default function AdminStaffControlPage(){
 const qc=useQueryClient()
 const {data:me}=useQuery({queryKey:['me'],queryFn:()=>api<User>('/auth/me')})
 const {data:staff=[],error}=useQuery({queryKey:['admin-staff'],queryFn:()=>api<(User&{created_at:string})[]>('/admin/staff')})
 const {data:access}=useQuery({queryKey:['staff-access'],queryFn:()=>api<AccessData>('/admin/staff-access')})
 const [matrix,setMatrix]=useState<AccessData['matrix']>()
 const [selectedExpert,setSelectedExpert]=useState('')
 const [selectedAdvisors,setSelectedAdvisors]=useState<string[]>([])
 useEffect(()=>{if(access)setMatrix(access.matrix)},[access])
 const expertInfo=useQuery({queryKey:['expert-advisors',selectedExpert],queryFn:()=>api<ExpertAdvisors>('/admin/experts/'+selectedExpert+'/advisors'),enabled:Boolean(selectedExpert)})
 useEffect(()=>{if(expertInfo.data)setSelectedAdvisors(expertInfo.data.selected_ids)},[expertInfo.data])
 const create=useMutation({mutationFn:(body:Record<string,unknown>)=>api('/admin/staff',{method:'POST',body:JSON.stringify(body)}),onSuccess:()=>qc.invalidateQueries({queryKey:['admin-staff']})})
 const status=useMutation({mutationFn:({id,value}:{id:string;value:string})=>api('/admin/users/'+id+'/status',{method:'PATCH',body:JSON.stringify({status:value})}),onSuccess:()=>qc.invalidateQueries({queryKey:['admin-staff']})})
 const saveAccess=useMutation({mutationFn:()=>api('/admin/staff-access',{method:'PUT',body:JSON.stringify({matrix})}),onSuccess:()=>qc.invalidateQueries({queryKey:['staff-access']})})
 const saveAdvisors=useMutation({mutationFn:()=>api('/admin/experts/'+selectedExpert+'/advisors',{method:'PUT',body:JSON.stringify({advisor_ids:selectedAdvisors})}),onSuccess:()=>qc.invalidateQueries({queryKey:['expert-advisors',selectedExpert]})})
 const experts=staff.filter(item=>item.role==='expert')
 return <div className="content-page staff-control-page">
  <div className="section-head"><div><h1>مدیران، کارشناسان، منشی‌ها و دسترسی‌ها</h1><p>تعریف مدیران و کارکنان، تعیین مشاوران تحت نظر هر کارشناس و کنترل سطح دسترسی هر نقش از یک بخش.</p></div></div>
  <form className="panel staff-create-form" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);create.mutate(Object.fromEntries(form));event.currentTarget.reset()}}>
   <UserPlus/><input name="full_name" required placeholder="نام و نام خانوادگی"/><input name="phone" required pattern="09[0-9]{9}" placeholder="شماره موبایل"/>
   <select name="role"><option value="expert">کارشناس</option><option value="secretary">منشی</option><option value="super_admin">مدیر</option></select><button className="btn btn-primary">افزودن کاربر مدیریتی</button>
  </form>
  <section className="panel"><h2><Users/> فهرست مدیران و کارکنان</h2><div className="staff-list">{staff.map(item=>{const protectedAdmin=item.phone==='09399506609'||(item.role==='super_admin'&&item.id===me?.id);return <article key={item.id}><div><b>{item.full_name}</b><small>{roleNames[item.role]||item.role} · <bdi>{item.phone}</bdi></small></div><em className={item.status}>{item.status==='active'?'فعال':'غیرفعال'}</em>{item.role==='expert'&&<button className="btn btn-soft" onClick={()=>setSelectedExpert(item.id)}>تعیین مشاوران تحت نظر</button>}{protectedAdmin?<span className="protected-account">حساب محافظت‌شده</span>:<button className="btn btn-outline" onClick={()=>status.mutate({id:item.id,value:item.status==='active'?'suspended':'active'})}>{item.status==='active'?'غیرفعال‌کردن':'فعال‌کردن'}</button>}</article>})}</div></section>
  {selectedExpert&&expertInfo.data&&<section className="panel expert-advisor-assignment"><header><div><UserCheck/><span><h2>مشاوران تحت نظر {expertInfo.data.expert.full_name}</h2><p>این کارشناس فقط اطلاعات، برنامه‌ها، گفت‌وگوها و دانش‌آموزان مشاوران انتخاب‌شده را می‌بیند.</p></span></div><button onClick={()=>setSelectedExpert('')}>بستن</button></header><div>{expertInfo.data.advisors.map(advisor=><label key={advisor.id} className={selectedAdvisors.includes(advisor.id)?'selected':''}><input type="checkbox" checked={selectedAdvisors.includes(advisor.id)} onChange={event=>setSelectedAdvisors(current=>event.target.checked?[...current,advisor.id]:current.filter(id=>id!==advisor.id))}/><span className="avatar">{advisor.full_name[0]}</span><b>{advisor.full_name}</b></label>)}</div><button className="btn btn-primary" disabled={saveAdvisors.isPending} onClick={()=>saveAdvisors.mutate()}><Save/> ذخیره ارتباط‌ها</button></section>}
  {matrix&&access&&<section className="panel access-matrix"><header><div><ShieldCheck/><span><h2>ماتریس سطح دسترسی نقش‌ها</h2><p>هر قابلیت را برای کارشناس و منشی روی یکی از سه حالت تنظیم کنید.</p></span></div></header><div className="access-matrix-table"><div className="access-matrix-head"><b>بخش سامانه</b><b>کارشناس</b><b>منشی</b></div>{Object.entries(access.areas).map(([area,label])=><div className="access-matrix-row" key={area}><strong>{label}</strong>{(['expert','secretary'] as const).map(role=><select key={role} value={matrix[role][area]} onChange={event=>setMatrix({...matrix,[role]:{...matrix[role],[area]:event.target.value as Level}})}>{(Object.keys(levelNames) as Level[]).map(level=><option value={level} key={level}>{levelNames[level]}</option>)}</select>)}</div>)}</div><button className="btn btn-primary" disabled={saveAccess.isPending} onClick={()=>saveAccess.mutate()}><Save/> ذخیره سطح دسترسی‌ها</button>{saveAccess.isSuccess&&<span className="success-note">سطح دسترسی‌ها ذخیره شد.</span>}</section>}
  {(error||create.error||saveAccess.error||saveAdvisors.error)&&<div className="error-box">انجام عملیات ناموفق بود؛ اطلاعات را دوباره بررسی کنید.</div>}
 </div>
}
