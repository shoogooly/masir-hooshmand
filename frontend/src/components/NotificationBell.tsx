import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export type NotificationSummary={unread_messages:number;unread_by_sender:Record<string,number>;unread_notifications:number;unseen_plans:number;expired_student_ids:string[]}
type NotificationItem={id:string;kind:string;title:string;body:string;link:string;read_at?:string;created_at:string}

export function useNotificationSummary(){
  return useQuery({queryKey:['notification-summary'],queryFn:()=>api<NotificationSummary>('/notifications/summary'),refetchInterval:5000})
}

export default function NotificationBell(){
  const [open,setOpen]=useState(false),nav=useNavigate(),qc=useQueryClient()
  const summary=useNotificationSummary()
  const notes=useQuery({queryKey:['notifications'],queryFn:()=>api<NotificationItem[]>('/notifications'),enabled:open,refetchInterval:open?5000:false})
  const read=useMutation({mutationFn:(id:string)=>api(`/notifications/${id}/read`,{method:'POST'}),onSuccess:()=>{qc.invalidateQueries({queryKey:['notifications']});qc.invalidateQueries({queryKey:['notification-summary']})}})
  const all=useMutation({mutationFn:()=>api('/notifications/read-all',{method:'POST'}),onSuccess:()=>{qc.invalidateQueries({queryKey:['notifications']});qc.invalidateQueries({queryKey:['notification-summary']})}})
  const count=summary.data?.unread_notifications||0
  return <div className="notification-wrap"><button className="notification-trigger" aria-label="اعلان‌ها" onClick={()=>setOpen(v=>!v)}><Bell/>{count>0&&<i/>}{count>0&&<b>{count>99?'۹۹+':count.toLocaleString('fa-IR')}</b>}</button>{open&&<section className="notification-popover"><header><strong>اعلان‌ها</strong><button disabled={!count||all.isPending} onClick={()=>all.mutate()}><CheckCheck/> خواندن همه</button></header><div>{notes.isLoading?<p className="notification-empty">در حال دریافت...</p>:!notes.data?.length?<p className="notification-empty">اعلان تازه‌ای ندارید.</p>:notes.data.map(item=><button key={item.id} className={item.read_at?'':'unread'} onClick={()=>{if(!item.read_at)read.mutate(item.id);if(item.link)nav(item.link);setOpen(false)}}><span>{item.title}</span><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString('fa-IR')}</small></button>)}</div></section>}</div>
}
