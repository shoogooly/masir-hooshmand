import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Lock, MessageSquare, Search, Send, Unlock } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Message, User } from '../types'
import { formatJalaliDateTime } from '../utils/jalali'
import { MESSENGER_CONTACT_PARAM } from '../utils/chatRoutes'
type Contact=User&{last_message?:string;locked:boolean;chat_request_allowed?:boolean;chat_requested_today?:boolean}
const roleName:Record<string,string>={student:'دانش‌آموز',advisor:'مشاور',secretary:'منشی',expert:'کارشناس',finance:'مدیر مالی',operations_admin:'مدیر عملیات',super_admin:'مدیر سایت',support:'پشتیبان',content_editor:'کارشناس محتوا',reviewer:'بازبین علمی',exam_designer:'طراح آزمون'}
export default function UniversalChatPage({user}:{user:User}){
 const qc=useQueryClient(),[selection,setSelected]=useState<Contact>(),[search,setSearch]=useState('')
 const contacts=useQuery({queryKey:['chat-contacts'],queryFn:()=>api<Contact[]>('/chat/contacts'),refetchInterval:5000})
 const [params,setParams]=useSearchParams()
 const contactId=params.get(MESSENGER_CONTACT_PARAM)??selection?.id
 const selected=contacts.data?.find(item=>item.id===contactId)??(user.role==='advisor'?undefined:selection)
 function openContact(contact:Contact){
  if(user.role==='advisor')setParams(previous=>{
   const next=new URLSearchParams(previous)
   next.set(MESSENGER_CONTACT_PARAM,contact.id)
   return next
  })
  else setSelected(contact)
 }
 const alerts=useQuery({queryKey:['notification-summary'],queryFn:()=>api<{unread_by_sender:Record<string,number>}>('/notifications/summary'),refetchInterval:15000})
 const messages=useQuery({queryKey:['universal-messages',selected?.id],queryFn:()=>api<Message[]>('/messages?counterpart_id='+encodeURIComponent(selected!.id)),enabled:Boolean(selected),refetchInterval:5000})
 const selectedId=selected?.id
 const newestUnread=messages.data?.filter(item=>item.sender_id===selectedId&&!item.read_at).at(-1)?.id
 const summaryUnread=selectedId?alerts.data?.unread_by_sender?.[selectedId]??0:0
 const messagesReady=messages.isSuccess
 useEffect(()=>{
  if(!selectedId||!messagesReady||(!newestUnread&&!summaryUnread))return
  api('/messages/'+encodeURIComponent(selectedId)+'/read',{method:'POST'}).then(()=>{
   void qc.invalidateQueries({queryKey:['universal-messages',selectedId]})
   void qc.invalidateQueries({queryKey:['notification-summary']})
   void qc.invalidateQueries({queryKey:['notifications']})
  }).catch(()=>{})
 },[selectedId,newestUnread,summaryUnread,messagesReady,qc])
 const send=useMutation({mutationFn:(body:string)=>api('/messages',{method:'POST',body:JSON.stringify({recipient_id:selected!.id,body})}),onSuccess:()=>qc.invalidateQueries({queryKey:['universal-messages',selected?.id]})})
 const requestChat=useMutation({mutationFn:(adminId:string)=>api('/chat/access-requests/'+adminId,{method:'POST'}),onSettled:()=>{void qc.invalidateQueries({queryKey:['chat-contacts']});void qc.invalidateQueries({queryKey:['universal-messages']})}})
 const lock=useMutation({mutationFn:(locked:boolean)=>api<{locked:boolean;chat_request_allowed?:boolean;chat_requested_today?:boolean}>('/admin/chat-locks/'+selected!.id,{method:'PATCH',body:JSON.stringify({locked})}),onSuccess:data=>{setSelected(current=>current?{...current,locked:data.locked}:current);qc.invalidateQueries({queryKey:['chat-contacts']})}})
 const rows=useMemo(()=>(contacts.data||[]).filter(item=>item.full_name.includes(search)||item.phone.includes(search)||String(roleName[item.role]||item.role).includes(search)),[contacts.data,search])
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget),body=String(form.get('body')||'').trim();if(body){send.mutate(body);event.currentTarget.reset()}}
 const blocked=Boolean(selected?.locked&&user.role!=='super_admin')
 return <div className="content-page"><div className="section-head"><div><h1>پیامرسان مهیاد</h1><p>{user.role==='super_admin'?'ارتباط مستقیم با همه نقش‌ها و مدیریت دسترسی هر گفتگو':'پیام‌های مشاور، مدیر و مخاطبان مجاز شما در یک صندوق مشترک'}</p></div></div><div className="messages-layout universal-chat" data-thread-open={Boolean(selected)}><aside><div className="chat-contact-search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجوی نام، شماره یا نقش..."/></div>{rows.map(item=><button className={selected?.id===item.id?'active':''} key={item.id} onClick={()=>openContact(item)}><span className="avatar">{item.full_name[0]}</span><div className="chat-contact-details"><b className="chat-contact-name">{item.full_name}</b><small>{roleName[item.role]||item.role} · {item.phone}</small><small>{item.last_message||'شروع گفت‌وگو'}</small></div>{item.locked&&<Lock className="contact-lock"/>}{!!alerts.data?.unread_by_sender[item.id]&&<i className="conversation-alert-dot"/>}</button>)}</aside><main>{selected?<div className="chat-shell"><header><button type="button" className="chat-back" aria-label="بازگشت به گفتگوها" onClick={()=>{setSelected(undefined);setParams(previous=>{const next=new URLSearchParams(previous);next.delete(MESSENGER_CONTACT_PARAM);return next})}}><ArrowRight/></button><span className="chat-avatar">{selected.full_name.trim().charAt(0)}</span><div><b>{selected.full_name}</b><small>{roleName[selected.role]||selected.role}</small></div>{user.role==='super_admin'&&<button className={'chat-lock-button '+(selected.locked?'locked':'')} onClick={()=>lock.mutate(!selected.locked)}>{selected.locked?<><Unlock/> بازکردن گفتگو</>:<><Lock/> قفل پاسخ کاربر</>}</button>}</header><div className="message-list">{messages.data?.map(item=><article className={item.sender_id===user.id?'mine':''} key={item.id}><p dir="auto">{item.body}</p><small><time dateTime={item.created_at}>{formatJalaliDateTime(item.created_at)}</time>{item.sender_id===user.id&&(item.read_at?' · خوانده شد':' · ارسال شد')}</small></article>)}</div>{blocked?<div className="chat-blocked"><Lock/><span>این گفتگو قفل است؛ امکان ارسال پیام ندارید.</span>{user.role==='student'&&selected.role==='super_admin'&&<button className="btn btn-primary" disabled={requestChat.isPending||!selected.chat_request_allowed} onClick={()=>requestChat.mutate(selected.id)}>{selected.chat_requested_today?'درخواست امروز ثبت شده است':requestChat.isPending?'در حال ثبت درخواست…':'درخواست چت با مدیریت سایت را دارم'}</button>}</div>:<form className="message-compose" onSubmit={submit}><input name="body" required maxLength={3000} placeholder="پیام خود را بنویسید..."/><button aria-label="ارسال پیام" disabled={send.isPending}><Send/></button></form>}{requestChat.error&&<div className="error-box">{requestChat.error instanceof Error?requestChat.error.message:'ثبت درخواست ناموفق بود'}</div>}{lock.error&&<div className="error-box">تغییر دسترسی ناموفق بود؛ دوباره تلاش کنید.</div>}{send.error&&<div className="error-box">{send.error instanceof Error?send.error.message:'ارسال پیام ناموفق بود'}</div>}</div>:<div className="page-state chat-placeholder"><MessageSquare aria-hidden="true"/>{contacts.isPending?'در حال دریافت مخاطبان…':contactId?'این مخاطب در فهرست گفت‌وگوهای شما نیست.':'یک مخاطب را انتخاب کنید.'}</div>}</main></div></div>
}
