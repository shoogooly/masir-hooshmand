import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api} from '../api'
import type {User} from '../types'
import AdvisorAssignedExamsPage from './AdvisorAssignedExamsPage'
import '../styles/advisor-enhancements.css'

export default function GroupExamsPage(){
 const [selected,setSelected]=useState<string[]>([]),[recipients,setRecipients]=useState<string[]|null>(null),[search,setSearch]=useState('')
 const {data=[],isLoading,error}=useQuery({queryKey:['group-exam-students'],queryFn:()=>api<User[]>('/advisors/group-exam-students')})
 const visible=data.filter(s=>s.full_name.includes(search)||s.phone.includes(search))
 return <div className="content-page"><div className="section-head"><div><h1>آزمون گروهی</h1><p>۱. انتخاب دانش‌آموزان · ۲. طراحی و ارسال آزمون</p></div></div>
 {recipients?<><div className="panel group-recipients"><b>گیرندگان: </b>{data.filter(s=>recipients.includes(s.id)).map(s=>s.full_name).join('، ')}<button className="btn btn-outline" onClick={()=>{if(window.confirm('به انتخاب دانش‌آموزان برگردید؟ اطلاعات فرم آزمون پاک می‌شود.'))setRecipients(null)}}>تغییر دانش‌آموزان</button></div><AdvisorAssignedExamsPage key={recipients.join(',')} studentIds={recipients}/></>:
 <section className="panel group-student-selection"><h2>انتخاب دانش‌آموزان</h2><input aria-label="جست‌وجوی دانش‌آموز" placeholder="جست‌وجو با نام یا شماره…" value={search} onChange={e=>setSearch(e.target.value)}/>
 {isLoading&&<p>در حال دریافت دانش‌آموزان…</p>}{error&&<p role="alert">{(error as Error).message}</p>}
 <div className="group-select-actions"><button className="btn btn-outline" disabled={!visible.length} onClick={()=>setSelected(current=>Array.from(new Set([...current,...visible.map(s=>s.id)])))}>انتخاب همه نتایج</button><button className="btn btn-outline" onClick={()=>setSelected([])}>لغو انتخاب‌ها</button><b>{selected.length.toLocaleString('fa-IR')} نفر انتخاب شده</b></div>
 <div className="group-student-grid">{visible.map(student=><label key={student.id} className={selected.includes(student.id)?'selected':''}><input type="checkbox" checked={selected.includes(student.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,student.id]:current.filter(id=>id!==student.id))}/><span><b>{student.full_name}</b><small dir="ltr">{student.phone}</small></span></label>)}</div>
 {!isLoading&&!visible.length&&<p>دانش‌آموزی یافت نشد.</p>}<button className="btn btn-primary" disabled={!selected.length} onClick={()=>setRecipients([...selected])}>مرحله بعد</button></section>}
 </div>
}
