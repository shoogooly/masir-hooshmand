import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock3, UserRound, X } from 'lucide-react'
import { api } from '../api'
import type { ProfilePhoto } from '../types'
import { photoUrl } from '../utils/profilePhoto'
import '../styles/profile-photo-review.css'
import '../styles/profile-change-review.css'

type ChangeRequest = {
  id:string; full_name:string; phone:string; role:string
  profile_photo?:ProfilePhoto|null; pending_profile_photo?:ProfilePhoto|null
  old_values:Record<string,unknown>; new_values:Record<string,unknown>
  field_labels:Record<string,string>; requested_at?:string
}

const valueText=(value:unknown)=>{
  if(Array.isArray(value))return value.map(item=>item==='lower_secondary'?'متوسطه اول':item==='upper_secondary'?'متوسطه دوم':String(item)).join('، ')
  if(value===null||value===undefined||value==='')return 'ثبت نشده'
  return String(value)
}

export default function AdminProfilePhotoReviewsPage(){
  const qc=useQueryClient()
  const {data=[],isLoading,error}=useQuery({queryKey:['profile-change-requests'],queryFn:()=>api<ChangeRequest[]>('/admin/profile-change-requests')})
  const review=useMutation({mutationFn:({id,status}:{id:string;status:'approved'|'rejected'})=>api(`/admin/users/${id}/profile-change-review`,{method:'PATCH',body:JSON.stringify({status})}),onSuccess:()=>{qc.invalidateQueries({queryKey:['profile-change-requests']});qc.invalidateQueries({queryKey:['admin-users']});qc.invalidateQueries({queryKey:['admin-advisors']})}})
  return <div className="content-page"><div className="page-head"><div><h1>تأیید اطلاعات جدید</h1><p>اطلاعات فعلی و پیشنهادی مشاوران و عکس‌های جدید را مقایسه و نتیجه را ثبت کنید.</p></div></div>
    {isLoading&&<div className="panel photo-review-empty">در حال دریافت درخواست‌ها…</div>}
    {error&&<div className="error-box">دریافت درخواست‌ها ناموفق بود.</div>}
    {!isLoading&&!data.length&&<div className="panel photo-review-empty"><Check/> هیچ تغییری در انتظار بررسی نیست.</div>}
    <div className="photo-review-grid">{data.map(item=><article className="panel photo-review-card profile-change-card" key={item.id}><header><div className="photo-review-user"><span><Clock3/></span><div><h2>{item.full_name}</h2><p>{item.role==='advisor'?'مشاور':'دانش‌آموز'} · <bdi>{item.phone}</bdi></p></div></div></header>
      {item.pending_profile_photo&&<div className="photo-compare"><figure><div>{item.profile_photo?<img src={photoUrl(item.profile_photo)} alt="عکس فعلی"/>:<UserRound/>}</div><figcaption>عکس فعلی</figcaption></figure><figure className="proposed"><div><img src={photoUrl(item.pending_profile_photo)} alt="عکس پیشنهادی"/></div><figcaption>عکس پیشنهادی</figcaption></figure></div>}
      {!!Object.keys(item.new_values).length&&<div className="profile-change-table"><div className="profile-change-head"><b>مشخصه</b><b>مقدار قبلی</b><b>مقدار پیشنهادی</b></div>{Object.entries(item.new_values).map(([key,value])=><div key={key}><strong>{item.field_labels[key]||key}</strong><span>{valueText(item.old_values[key])}</span><span className="new-value">{valueText(value)}</span></div>)}</div>}
      <div className="photo-review-actions"><button className="btn btn-primary" disabled={review.isPending} onClick={()=>review.mutate({id:item.id,status:'approved'})}><Check/> تأیید و انتشار</button><button className="btn btn-danger" disabled={review.isPending} onClick={()=>review.mutate({id:item.id,status:'rejected'})}><X/> رد تغییرات</button></div>
    </article>)}</div>{review.error&&<div className="error-box">ثبت نتیجه بررسی ناموفق بود.</div>}</div>
}
