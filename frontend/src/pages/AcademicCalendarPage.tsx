import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {CalendarDays,CheckCircle2,Eye,Plus,Save,Trash2,Pencil,RotateCcw} from 'lucide-react'
import {api} from '../api'
import type {User} from '../types'
import {persianMonths} from '../utils/jalali'
import CalendarTreeEditor, {type CalendarNode} from './CalendarTreeEditor'
import '../styles/academic-calendar.css'

type Row={id?:string;month:number;day:number;subject:string;topics:string}
type Calendar={id:string;version:number;grade:string;major:string;title:string;designer_name:string;designer_role_label:string;selected:boolean;customized?:boolean;items:Row[];nodes:CalendarNode[];original_nodes?:CalendarNode[];original_items?:Row[]}
type StudentData={student_id:string;grade:string;major:string;selected_id:string|null;calendars:Calendar[]}
const grades=['هفتم','هشتم','نهم','دهم','یازدهم','دوازدهم','پشت کنکوری']
const majors=['ریاضی','تجربی','انسانی','هنر','فنی','سایر']

export default function AcademicCalendarPage({mode,user,studentId}:{mode:'student'|'advisor'|'management';user:User;studentId?:string}){
 const qc=useQueryClient(),[grade,setGrade]=useState('دوازدهم'),[major,setMajor]=useState('تجربی'),[customMajor,setCustomMajor]=useState('')
 const [creating,setCreating]=useState(false),[title,setTitle]=useState('')
 const [nodes,setNodes]=useState<CalendarNode[]>([])
 const [openId,setOpenId]=useState<string|null>(null),[notice,setNotice]=useState('')
 const [editingId,setEditingId]=useState<string|null>(null),[editNodes,setEditNodes]=useState<CalendarNode[]>([]),[showOriginal,setShowOriginal]=useState(false)
 const [sharedEditingId,setSharedEditingId]=useState<string|null>(null),[sharedTitle,setSharedTitle]=useState(''),[sharedVersion,setSharedVersion]=useState(1),[sharedNodes,setSharedNodes]=useState<CalendarNode[]>([])
 const lower=['هفتم','هشتم','نهم'].includes(grade)
 const effectiveMajor=lower?'عمومی':major==='سایر'?customMajor.trim():major
 const studentPath=`/students/${studentId||user.id}/academic-calendar`
 const query=useQuery<Calendar[]|StudentData>({queryKey:['academic-calendars',mode,studentId||grade,effectiveMajor],
  queryFn:()=>mode==='management'?api<Calendar[]>(`/academic-calendars?grade=${encodeURIComponent(grade)}&major=${encodeURIComponent(effectiveMajor)}`):api<StudentData>(studentPath),
  enabled:mode!=='management'||effectiveMajor.length>=2})
 const calendars:Calendar[]=Array.isArray(query.data)?query.data:(query.data as StudentData|undefined)?.calendars||[]
 const actualGrade=Array.isArray(query.data)?grade:query.data?.grade||''
 const actualMajor=Array.isArray(query.data)?effectiveMajor:query.data?.major||''
 const invalidate=()=>{void qc.invalidateQueries({queryKey:['academic-calendars']});void qc.invalidateQueries({queryKey:['calendar-topics-catalog']});void qc.invalidateQueries({queryKey:['planner-topics']})}
 const create=useMutation({mutationFn:()=>api<Calendar>('/academic-calendars',{method:'POST',body:JSON.stringify({title,
   grade:mode==='management'?grade:undefined,major:mode==='management'?effectiveMajor:undefined,
   student_id:mode==='advisor'?studentId:undefined,items:[],nodes})}),
   onSuccess:value=>{setCreating(false);setTitle('');setNodes([]);setOpenId(value.id);setNotice('تقویم آموزشی ذخیره شد و برای همه دانش‌آموزان همین پایه و رشته قابل انتخاب است.');invalidate()}})
 const select=useMutation({mutationFn:(id:string)=>api<Calendar>(`${studentPath}/${id}`,{method:'PUT'}),onSuccess:()=>{setNotice('تقویم آموزشی برای دانش‌آموز انتخاب شد.');invalidate()}})
 const remove=useMutation({mutationFn:(id:string)=>api<{deleted:boolean;student_selections_removed:number}>(`/academic-calendars/${id}?confirmed=true`,{method:'DELETE'}),
   onSuccess:data=>{setOpenId(null);setNotice(data.student_selections_removed?`تقویم حذف شد و انتخاب آن برای ${data.student_selections_removed.toLocaleString('fa-IR')} دانش‌آموز نیز برداشته شد.`:'تقویم آموزشی حذف شد.');invalidate()}})
 const customize=useMutation({mutationFn:()=>api<Calendar>(`${studentPath}/customization/current`,{method:'PUT',body:JSON.stringify({nodes:editNodes,items:[]})}),onSuccess:()=>{setEditingId(null);setShowOriginal(false);setNotice('تغییرات تقویم فقط برای همین دانش‌آموز ذخیره شد.');invalidate()}})
 const restore=useMutation({mutationFn:()=>api<Calendar>(`${studentPath}/customization/current`,{method:'DELETE'}),onSuccess:()=>{setEditingId(null);setShowOriginal(false);setNotice('تقویم اصلی سایت برای دانش‌آموز بازگردانده شد.');invalidate()}})
 const updateShared=useMutation({mutationFn:()=>api<Calendar>(`/academic-calendars/${sharedEditingId}`,{method:'PUT',body:JSON.stringify({title:sharedTitle,version:sharedVersion,nodes:sharedNodes})}),onSuccess:value=>{setSharedEditingId(null);setOpenId(value.id);setNotice('تغییرات تقویم برای مشاوران و دانش‌آموزانی که نسخهٔ اصلی را انتخاب کرده‌اند ذخیره شد.');invalidate()}})
 const beginEdit=(calendar:Calendar)=>{setEditingId(calendar.id);setOpenId(calendar.id);setEditNodes(calendar.nodes.map(node=>({...node})));setShowOriginal(false)}
 const beginSharedEdit=(calendar:Calendar)=>{setSharedEditingId(calendar.id);setOpenId(calendar.id);setSharedTitle(calendar.title);setSharedVersion(calendar.version);setSharedNodes(calendar.nodes.map(node=>({...node}))) }
 const selected=calendars.find(calendar=>calendar.selected)
 const canDelete=mode==='management'&&['super_admin','operations_admin','upper_secondary_manager','lower_secondary_manager'].includes(user.role)
 return <div className="content-page academic-calendar-page">
  <div className="section-head"><div><h1>تقویم آموزشی</h1><p>{mode==='student'?'مسیر آموزشی انتخاب‌شده توسط مشاور را مشاهده کنید.':mode==='advisor'?`تقویم‌های قابل انتخاب برای پایه ${actualGrade||'دانش‌آموز'} و رشته ${actualMajor}`:'ساخت و مدیریت تقویم‌های پایه، رشته و درس'}</p></div>{mode!=='student'&&<button className="btn btn-primary" onClick={()=>setCreating(value=>!value)}><Plus/> طراحی تقویم جدید</button>}</div>
  {mode==='management'&&<div className="calendar-filters"><label className="calendar-grade-filter">پایه تحصیلی<select value={grade} onChange={e=>{setGrade(e.target.value);setOpenId(null)}}>{grades.map(item=><option key={item}>{item}</option>)}</select></label>{!lower&&<><label className="calendar-grade-filter">رشته تحصیلی<select value={major} onChange={e=>{setMajor(e.target.value);setOpenId(null)}}>{majors.map(item=><option key={item}>{item}</option>)}</select></label>{major==='سایر'&&<label className="calendar-grade-filter">نام رشته<input aria-label="نام رشته دیگر" required minLength={2} maxLength={40} value={customMajor} onChange={e=>{setCustomMajor(e.target.value);setOpenId(null)}} placeholder="نام رشته را بنویسید"/></label>}</>}</div>}
  {notice&&<p className="success-note" role="status">{notice}</p>}
  {creating&&<form className="panel calendar-builder" onSubmit={e=>{e.preventDefault();create.mutate()}}>
   <div className="calendar-designer"><CalendarDays/><span><small>طراح تقویم</small><b>{user.full_name}</b><em>{user.role==='advisor'?'مشاور':user.role==='expert'?'کارشناس':'مدیر'}</em></span></div>
   <label>عنوان تقویم آموزشی<input required minLength={2} maxLength={180} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <CalendarTreeEditor nodes={nodes} onChange={setNodes}/>
   <div className="calendar-form-actions"><button className="btn btn-primary" disabled={create.isPending||(mode==='management'&&effectiveMajor.length<2)||!nodes.length}><Save/> ذخیره تقویم</button></div>{create.error&&<p role="alert">{(create.error as Error).message}</p>}
  </form>}
  {query.isLoading&&<div className="panel">در حال دریافت تقویم‌ها…</div>}{query.error&&<p role="alert">{(query.error as Error).message}</p>}
  {mode==='student'&&!selected&&!query.isLoading&&<div className="panel empty-state">هنوز تقویم آموزشی برای شما انتخاب نشده است.</div>}
  {mode!=='student'&&!calendars.length&&!query.isLoading&&<div className="panel empty-state">برای این پایه هنوز تقویمی طراحی نشده است.</div>}
  <div className="calendar-cards">{calendars.map(calendar=><article className={`panel calendar-card ${calendar.selected?'selected':''}`} key={calendar.id}>
   <header><div><h2>{calendar.title}</h2><p>پایه {calendar.grade} · رشته {calendar.major} · طراح: {calendar.designer_name} ({calendar.designer_role_label})</p></div>{calendar.selected&&<span className="selected-calendar"><CheckCircle2/> تقویم فعال</span>}</header>
   <div className="calendar-card-actions"><button className="btn btn-outline" onClick={()=>setOpenId(openId===calendar.id?null:calendar.id)}><Eye/> {openId===calendar.id?'بستن جزئیات':'مشاهده کامل'}</button>{mode==='advisor'&&!calendar.selected&&<button className="btn btn-primary" disabled={select.isPending} onClick={()=>select.mutate(calendar.id)}>انتخاب برای دانش‌آموز</button>}{mode==='advisor'&&calendar.selected&&<><button className="btn btn-outline" onClick={()=>editingId===calendar.id?setEditingId(null):beginEdit(calendar)}><Pencil/> ویرایش برای این دانش‌آموز</button>{calendar.customized&&<button className="btn btn-outline" disabled={restore.isPending} onClick={()=>{if(window.confirm('تغییرات اختصاصی این دانش‌آموز حذف و تقویم اصلی سایت بازگردانده شود؟'))restore.mutate()}}><RotateCcw/> بازگرداندن به تقویم اصلی سایت</button>}</>}{canDelete&&<><button className="btn btn-outline" onClick={()=>sharedEditingId===calendar.id?setSharedEditingId(null):beginSharedEdit(calendar)}><Pencil/> ویرایش تقویم</button><button className="btn btn-outline calendar-delete" disabled={remove.isPending} onClick={()=>{if(window.confirm(`تقویم «${calendar.title}» به‌طور قطعی حذف شود؟ اگر برای دانش‌آموزی انتخاب شده باشد، انتخاب او نیز برداشته می‌شود.`))remove.mutate(calendar.id)}}><Trash2/> حذف تقویم</button></>}</div>
   {sharedEditingId===calendar.id&&<form className="calendar-customize calendar-shared-edit" onSubmit={e=>{e.preventDefault();updateShared.mutate()}}><p>تغییرات این تقویم برای همهٔ استفاده‌کنندگان نسخهٔ اصلی اعمال می‌شود. مباحث متصل به کتاب که حذف شوند از کتاب جدا می‌شوند.</p><label>عنوان تقویم آموزشی<input required minLength={2} maxLength={180} value={sharedTitle} onChange={e=>setSharedTitle(e.target.value)}/></label><CalendarTreeEditor nodes={sharedNodes} onChange={setSharedNodes}/><div className="calendar-card-actions"><button type="submit" className="btn btn-primary" disabled={updateShared.isPending||!sharedNodes.length}><Save/> ذخیره تغییرات تقویم</button><button type="button" className="btn btn-outline" onClick={()=>setSharedEditingId(null)}>انصراف</button></div>{updateShared.error&&<p role="alert">{(updateShared.error as Error).message}</p>}</form>}
   {editingId===calendar.id&&<form className="calendar-customize" onSubmit={e=>{e.preventDefault();customize.mutate()}}><p>این ویرایش فقط برای همین دانش‌آموز است. می‌توانید تاریخ، درس و مبحث را در نمودار درختی تغییر دهید یا حذف و اضافه کنید.</p><CalendarTreeEditor nodes={editNodes} onChange={setEditNodes}/><div className="calendar-card-actions"><button type="submit" className="btn btn-primary" disabled={customize.isPending||!editNodes.length}><Save/> ذخیره تغییرات دانش‌آموز</button><button type="button" className="btn btn-outline" onClick={()=>setEditingId(null)}>انصراف</button></div>{customize.error&&<p role="alert">{(customize.error as Error).message}</p>}</form>}
   {openId===calendar.id&&editingId!==calendar.id&&sharedEditingId!==calendar.id&&<div className="calendar-preview">{calendar.customized&&<div className="calendar-card-actions"><span>نسخه اختصاصی این دانش‌آموز</span><button type="button" className="small-secondary" onClick={()=>setShowOriginal(value=>!value)}>{showOriginal?'نمایش نسخه اختصاصی':'نمایش تقویم اصلی سایت'}</button></div>}{(showOriginal&&calendar.original_nodes?calendar.original_nodes:calendar.nodes)?.length>0&&<div className="calendar-tree-list">{(showOriginal&&calendar.original_nodes?calendar.original_nodes:calendar.nodes).map(node=><div className="calendar-tree-preview-node" key={node.id} style={{marginInlineStart:`${((node.depth||1)-1)*18}px`}}><b>{node.title}</b>{node.month&&node.day&&<small>تا {node.day.toLocaleString('fa-IR')} {persianMonths[node.month-1]}</small>}</div>)}</div>}</div>}
  </article>)}</div>{remove.error&&<p role="alert">{(remove.error as Error).message}</p>}{restore.error&&<p role="alert">{(restore.error as Error).message}</p>}
 </div>
}
