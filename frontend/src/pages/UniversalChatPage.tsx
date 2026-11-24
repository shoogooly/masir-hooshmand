import { Fragment, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, CheckCheck, Lock, MessagesSquare, Search, Send, Unlock } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Message, User } from '../types'
import { faNumber, formatJalali, parseApiDate } from '../utils/jalali'
import { MESSENGER_CONTACT_PARAM } from '../utils/chatRoutes'
import '../styles/messenger.css'

type Contact = User & {last_message?:string; locked:boolean; chat_request_allowed?:boolean; chat_requested_today?:boolean}
const roles:Record<string,string>={student:'دانش‌آموز',advisor:'مشاور',secretary:'منشی',expert:'کارشناس',finance:'مدیر مالی',operations_admin:'مدیر عملیات',super_admin:'مدیر سایت',support:'پشتیبان',content_editor:'کارشناس محتوا',reviewer:'بازبین علمی',exam_designer:'طراح آزمون'}
const clock=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'})

function Avatar({person}:{person:Contact}){
  const words=person.full_name.trim().split(/\s+/)
  const initials=words.length>1?words[0][0]+words[words.length-1][0]:words[0].slice(0,1)
  const color=Array.from(person.id).reduce((sum,c)=>sum+c.charCodeAt(0),0)%5
  return <span className={'mm-avatar tone-'+color} aria-hidden="true">{initials}</span>
}

export default function UniversalChatPage({user}:{user:User}){
  const [params,setParams]=useSearchParams()
  const [search,setSearch]=useState(''),[unreadOnly,setUnreadOnly]=useState(false)
  const contacts=useQuery({queryKey:['chat-contacts'],queryFn:()=>api<Contact[]>('/chat/contacts'),refetchInterval:5000})
  const alerts=useQuery({queryKey:['notification-summary'],queryFn:()=>api<{unread_by_sender:Record<string,number>}>('/notifications/summary'),refetchInterval:15000})
  const counts=alerts.data?.unread_by_sender||{}
  const all=contacts.data||[]
  const id=params.get(MESSENGER_CONTACT_PARAM)
  const selected=all.find(item=>item.id===id)
  const rows=all.filter(item=>(!unreadOnly||counts[item.id]>0)&&[item.full_name,item.phone,roles[item.role]].some(value=>value?.includes(search.trim())))
  function choose(contactId?:string){
    setParams(previous=>{
      const next=new URLSearchParams(previous)
      if(contactId)next.set(MESSENGER_CONTACT_PARAM,contactId)
      else next.delete(MESSENGER_CONTACT_PARAM)
      return next
    })
  }
  return <section dir="rtl" className="mahyaad-messenger" data-open={Boolean(selected)}>
    <aside className="mm-inbox">
      <header className="mm-mast"><span><MessagesSquare/></span><h1>پیامرسان مهیاد</h1></header>
      <div className="mm-tools">
        <label className="mm-search"><Search size={18}/><input aria-label="جست‌وجوی مخاطب" placeholder="جست‌وجوی نام، شماره یا نقش…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <div className="mm-filters">{['همه گفتگوها','خوانده‌نشده'].map((title,i)=><button key={title} aria-pressed={unreadOnly===Boolean(i)} onClick={()=>setUnreadOnly(Boolean(i))}>{title}</button>)}</div>
      </div>
      <div className="mm-contacts">{rows.map(person=><button key={person.id} aria-current={person.id===id?'true':undefined} onClick={()=>choose(person.id)}>
        <Avatar person={person}/><span className="mm-person"><strong>{person.full_name}</strong><small>{person.last_message||roles[person.role]||person.role}</small></span>
        {person.locked&&<Lock size={14} aria-label="گفتگوی قفل‌شده"/>}{counts[person.id]>0&&<span className="mm-counter" aria-label={faNumber(counts[person.id])+' پیام خوانده‌نشده'}>{faNumber(counts[person.id])}</span>}
      </button>)}{!rows.length&&<p className="mm-status">{contacts.isPending?'در حال دریافت مخاطبان…':contacts.isError?'دریافت مخاطبان ناموفق بود.':unreadOnly?'گفتگوی خوانده‌نشده‌ای پیدا نشد.':'مخاطبی پیدا نشد.'}</p>}</div>
    </aside>
    {selected?<Thread key={selected.id} user={user} person={selected} unread={counts[selected.id]||0} back={()=>choose()}/>:<div className="mm-idle mm-wall"><span><MessagesSquare/></span><h2>گفتگوهای شما</h2><p>{id&&!contacts.isPending?'این مخاطب در فهرست شما نیست.':'برای دیدن پیام‌ها یک گفتگو را انتخاب کنید.'}</p></div>}
  </section>
}

function Thread({user,person,unread,back}:{user:User;person:Contact;unread:number;back:()=>void}){
  const qc=useQueryClient(),[draft,setDraft]=useState('')
  const list=useRef<HTMLDivElement>(null),follow=useRef(true)
  const id=person.id
  const messages=useQuery({queryKey:['universal-messages',id],queryFn:()=>api<Message[]>('/messages?counterpart_id='+encodeURIComponent(id)),refetchInterval:5000})
  const items=messages.data||[],latest=items.at(-1)?.id
  const pendingRead=items.filter(row=>row.sender_id===id&&!row.read_at).at(-1)?.id
  useEffect(()=>{
    if(messages.isSuccess&&(pendingRead||unread))api('/messages/'+encodeURIComponent(id)+'/read',{method:'POST'}).then(()=>{
      for(const key of [['notification-summary'],['notifications'],['universal-messages',id]])void qc.invalidateQueries({queryKey:key})
    }).catch(()=>{})
  },[id,pendingRead,unread,messages.isSuccess,qc])
  useEffect(()=>{if(list.current&&follow.current)list.current.scrollTop=list.current.scrollHeight},[latest])
  const refresh=()=>qc.invalidateQueries({queryKey:['chat-contacts']})
  const send=useMutation({mutationFn:(body:string)=>api('/messages',{method:'POST',body:JSON.stringify({recipient_id:id,body})}),onSuccess:async()=>{
    setDraft('');follow.current=true;await qc.invalidateQueries({queryKey:['universal-messages',id]});await refresh()
  }})
  const request=useMutation({mutationFn:()=>api('/chat/access-requests/'+id,{method:'POST'}),onSettled:refresh})
  const lock=useMutation({mutationFn:()=>api('/admin/chat-locks/'+id,{method:'PATCH',body:JSON.stringify({locked:!person.locked})}),onSettled:refresh})
  const blocked=person.locked&&user.role!=='super_admin'
  function submit(){if(draft.trim()&&!send.isPending&&!blocked)send.mutate(draft.trim())}
  return <div className="mm-thread">
    <header className="mm-header"><button className="mm-back" onClick={back} aria-label="بازگشت به گفتگوها"><ArrowRight/></button><Avatar person={person}/><span className="mm-person"><strong>{person.full_name}</strong><small>{roles[person.role]||person.role} · <bdi>{faNumber(person.phone)}</bdi></small></span>
      {user.role==='super_admin'&&<button className="mm-lock" disabled={lock.isPending} onClick={()=>lock.mutate()}>{person.locked?<Unlock size={15}/>:<Lock size={15}/>} {person.locked?'بازکردن گفتگو':'قفل پاسخ کاربر'}</button>}</header>
    <div className="mm-stream mm-wall" ref={list} onScroll={e=>{const box=e.currentTarget;follow.current=box.scrollHeight-box.scrollTop-box.clientHeight<80}}>
      {items.map((m,i)=>{const day=formatJalali(m.created_at),mine=m.sender_id===user.id;return <Fragment key={m.id}>
        {(!i||formatJalali(items[i-1].created_at)!==day)&&<div className="mm-date">{day}</div>}
        <article className={'mm-bubble '+(mine?'out':'in')}><p dir="auto">{m.body}</p><footer><time dateTime={m.created_at}>{clock.format(parseApiDate(m.created_at))}</time>{mine&&(m.read_at?<CheckCheck size={16} aria-label="خوانده شد"/>:<Check size={15} aria-label="ارسال شد"/>)}</footer></article></Fragment>})}
      {!items.length&&<p className="mm-status">{messages.isPending?'در حال دریافت پیام‌ها…':messages.isError?'دریافت پیام‌ها ناموفق بود.':'هنوز پیامی در این گفتگو ثبت نشده است.'}</p>}
    </div>
    <div className="mm-bottom">{blocked?<div className="mm-block"><Lock size={16}/> پاسخ‌دادن به این گفتگو قفل است.
      {user.role==='student'&&person.role==='super_admin'&&<button disabled={request.isPending||!person.chat_request_allowed} onClick={()=>request.mutate()}>{person.chat_requested_today?'درخواست امروز ثبت شده است':request.isPending?'در حال ثبت درخواست…':'درخواست چت با مدیریت سایت را دارم'}</button>}</div>:
      <form className="mm-compose" onSubmit={e=>{e.preventDefault();submit()}}><textarea dir="auto" aria-label="متن پیام" rows={1} maxLength={3000} readOnly={send.isPending} value={draft} placeholder="پیام خود را بنویسید..." onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit()}}}/><button disabled={!draft.trim()||send.isPending} aria-label="ارسال پیام"><Send size={20}/></button></form>}
      {(send.isError||request.isError||lock.isError)&&<p role="alert">عملیات انجام نشد. دوباره تلاش کنید.</p>}
    </div>
  </div>
}
