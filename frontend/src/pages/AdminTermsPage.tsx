import { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, ScrollText } from 'lucide-react'
import { api } from '../api'

type Terms={student_text:string;student_version:number;advisor_text:string;advisor_version:number}
export default function AdminTermsPage(){
  const qc=useQueryClient();const q=useQuery({queryKey:['admin-terms'],queryFn:()=>api<Terms>('/admin/terms')});const save=useMutation({mutationFn:(body:object)=>api('/admin/terms',{method:'PATCH',body:JSON.stringify(body)}),onSuccess:()=>qc.invalidateQueries({queryKey:['admin-terms']})})
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);save.mutate({student_text:f.get('student_text'),advisor_text:f.get('advisor_text')})}
  if(!q.data)return <div className="page-state">در حال دریافت شرایط...</div>
  return <div className="content-page"><div className="section-head"><div><h1>شرایط ثبت‌نام</h1><p>متنی که دانش‌آموز و مشاور پس از تکمیل اطلاعات باید مطالعه و تأیید کنند.</p></div></div><form className="panel terms-admin" onSubmit={submit}><ScrollText/><label>شرایط دانش‌آموز — نسخه {q.data.student_version}<textarea name="student_text" defaultValue={q.data.student_text} required/></label><label>شرایط مشاور — نسخه {q.data.advisor_version}<textarea name="advisor_text" defaultValue={q.data.advisor_text} required/></label><button className="btn btn-primary" disabled={save.isPending}><Save/> ذخیره و انتشار نسخه جدید</button>{save.isSuccess&&<span className="success-note">شرایط ذخیره شد.</span>}</form></div>
}
