import { useMutation } from '@tanstack/react-query'
import { type ReactNode, isValidElement, cloneElement, useId, useRef, useState } from 'react'
import { FileUp, ArrowRight, X, Camera } from 'lucide-react'
import { api } from '../api'
import type { AdvisorDocument, ProfilePhoto, SchoolSchedule } from '../types'
import { photoUrl, prepareProfilePhoto } from '../utils/profilePhoto'
import {RequiredMark,StepError,registrationError} from '../components/RegistrationFeedback'
import BirthDateInput from '../components/BirthDateInput'
import '../styles/onboarding-flow.css'

type Props={refresh:()=>void;initial?:Record<string,unknown>;onPartChange?:(part:number)=>void}
const days=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه']
const values=(initial:Record<string,unknown>)=>Object.fromEntries(Object.entries(initial).filter(([,v])=>typeof v==='string'||typeof v==='number').map(([k,v])=>[k,String(v)]))
const normalizeSchedule=(initial:unknown):SchoolSchedule=>Object.fromEntries(days.map(day=>[day,Array.from({length:4},(_,i)=>(initial as SchoolSchedule)?.[day]?.[i]||'')]))
export function StudentProfileForm({refresh,initial={},onPartChange}:Props){
  const [data,setData]=useState<Record<string,string>>(()=>({grade:'دهم',...values(initial)}))
  const [part,setPart]=useState(1)
  const [formError,setFormError]=useState('')
  const first=useRef<HTMLFieldSetElement>(null)
  const [schedule,setSchedule]=useState(()=>normalizeSchedule(initial.school_schedule))
  const [extras,setExtras]=useState<Record<string,string>>(()=>initial.extra_classes as Record<string,string>||{})
  const [photo,setPhoto]=useState<ProfilePhoto|undefined>(()=>initial.profile_photo as ProfilePhoto|undefined)
  const [photoError,setPhotoError]=useState('')
  const save=useMutation({mutationFn:(body:Record<string,unknown>)=>api('/onboarding/student/profile',{method:'POST',body:JSON.stringify(body)}),onSuccess:refresh})
  const bind=(name:string)=>({name,value:data[name]||'',onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>setData({...data,[name]:e.target.value})})
  const lower=['هفتم','هشتم','نهم'].includes(data.grade)
  function next(){const issue=registrationError(first.current);setFormError(issue);if(issue)return;setPart(2);onPartChange?.(2)}
  function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(part===1){next();return}const issue=registrationError(e.currentTarget);setFormError(issue);if(issue)return;const body:Record<string,unknown>={...data,profile_photo:photo,major:lower?'عمومی':data.major,school_schedule:data.grade==='پشت کنکوری'?{}:schedule,extra_classes:extras};for(const n of [7,8,9,10,11,12])body['average_grade'+n]=data['average_grade'+n]?Number(data['average_grade'+n]):null;save.mutate(body)}
  return <form className="registration-form onboarding-card" noValidate onSubmit={submit}><Title title={part===1?'اطلاعات فردی دانش‌آموز':'سوابق تحصیلی و برنامه کلاسی'} text="اطلاعات ذخیره‌شده در بازگشت به مراحل قبلی حفظ می‌شود."/>
    <fieldset ref={first} hidden={part!==1} disabled={part!==1} className="onboarding-fieldset"><div className="form-grid">
      <div className="wide"><PhotoPicker photo={photo} optional error={photoError} onSelect={async file=>{setPhotoError('');try{setPhoto(await prepareProfilePhoto(file))}catch(e){setPhotoError(e instanceof Error?e.message:'عکس معتبر نیست')}}}/></div>
      <Field label="نام و نام خانوادگی"><input {...bind('full_name')} required minLength={3} maxLength={120}/></Field><Field label="کد ملی"><input {...bind('national_code')} required pattern="[0-9]{10}"/></Field>
      <BirthDateInput value={data.birth_date||''} onChange={birth_date=>setData({...data,birth_date})}/>
      <Field label="نام ولی"><input {...bind('parent_name')} required minLength={3} maxLength={120}/></Field><Field label="موبایل ولی"><input {...bind('parent_phone')} required pattern="09[0-9]{9}"/></Field><Field label="نشانی" wide><textarea {...bind('address')} required minLength={10} maxLength={1000}/></Field>
    </div></fieldset>
    <fieldset hidden={part!==2} disabled={part!==2} className="onboarding-fieldset"><div className="form-grid"><Field label="پایه"><select {...bind('grade')} required>{['هفتم','هشتم','نهم','دهم','یازدهم','دوازدهم','پشت کنکوری'].map(g=><option key={g}>{g}</option>)}</select></Field>
      {!lower&&<Field label="رشته تحصیلی"><input {...bind('major')} required/></Field>}<Field label="مدرسه"><input {...bind('school')} required minLength={2} maxLength={120}/></Field><Field label={lower?'هدف تحصیلی (اختیاری)':'هدف تحصیلی'}><input {...bind('goal')} required={!lower}/></Field></div>
      <AverageFields grade={data.grade} data={data} onChange={(name,value)=>setData({...data,[name]:value})}/>
      {data.grade!=='پشت کنکوری'&&<div className="registration-section"><h3>برنامه کلاسی (اختیاری)</h3><p>می‌توانید این بخش را خالی بگذارید یا فقط زنگ‌هایی را که می‌دانید وارد کنید.</p><div className="school-schedule-editor">{days.map(day=><section key={day}><b>{day}</b>{schedule[day].map((value,index)=><input key={index} aria-label={day+' زنگ '+(index+1)} value={value} placeholder={'زنگ '+(index+1)} onChange={e=>setSchedule({...schedule,[day]:schedule[day].map((item,i)=>i===index?e.target.value:item)})}/>)}<textarea value={extras[day]||''} placeholder="فوق‌العاده یا توضیحات (اختیاری)" onChange={e=>setExtras({...extras,[day]:e.target.value})}/></section>)}</div></div>}
    </fieldset>
    {save.error&&<ErrorText error={save.error}/>}<div className="onboarding-actions"><StepError message={formError}/>{part===1?<button type="button" className="btn btn-primary btn-lg" onClick={next}>مرحله بعد: سوابق تحصیلی</button>:<><button type="button" className="btn btn-outline" onClick={()=>{setFormError('');setPart(1);onPartChange?.(1)}}><ArrowRight/> مرحله قبل</button><button className="btn btn-primary btn-lg" disabled={save.isPending}>ذخیره و مرحله بعد</button></>}</div>
  </form>
}
export function AdvisorProfileForm({refresh,initial={},onPartChange}:Props){
  const [data,setData]=useState<Record<string,string>>(()=>({support_capacity:'20',academic_year:'۱۴۰۵-۱۴۰۶',...values(initial)}))
  const [part,setPart]=useState(1)
  const [formError,setFormError]=useState('')
  const first=useRef<HTMLFieldSetElement>(null)
  const [documents,setDocuments]=useState<(AdvisorDocument|File)[]>(()=>initial.documents as AdvisorDocument[]||[])
  const [photo,setPhoto]=useState<ProfilePhoto|undefined>(()=>initial.profile_photo as ProfilePhoto|undefined)
  const [levels,setLevels]=useState<string[]>(()=>initial.work_levels as string[]||[String(initial.education_level||'upper_secondary')])
  const [fileError,setFileError]=useState('')
  const save=useMutation({mutationFn:(body:FormData)=>api('/onboarding/advisor/profile-files',{method:'POST',body}),onSuccess:refresh})
  const bind=(name:string)=>({name,value:data[name]||'',onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>setData({...data,[name]:e.target.value})})
  function next(){const issue=registrationError(first.current)||(!photo?'عکس پرسنلی را انتخاب کنید.':'');setFormError(issue);if(issue)return;setPart(2);onPartChange?.(2)}
  function files(selected:FileList|null){setFileError('');try{const result=Array.from(selected||[]);for(const file of result){if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('فقط PDF یا تصویر JPG، PNG، WebP مجاز است.');if(file.size>4*1024*1024)throw new Error('حجم هر فایل باید کمتر از ۴ مگابایت باشد.')}if(documents.length+result.length>8)throw new Error('حداکثر ۸ مدرک مجاز است.');setDocuments([...documents,...result])}catch(error){setFileError(error instanceof Error?error.message:'فایل معتبر نیست')}}
  function submit(form:HTMLFormElement){
    const issue=registrationError(form)||(!levels.length?'حداقل یک مقطع فعالیت را انتخاب کنید.':documents.length<2?'حداقل دو مدرک بارگذاری کنید.':!photo?'عکس پرسنلی را انتخاب کنید.':'');setFormError(issue);if(issue)return
    if(!photo){setFileError('بارگذاری عکس پرسنلی الزامی است.');return}
    const body=new FormData()
    const existing=initial.documents as AdvisorDocument[]||[]
    body.append('payload',JSON.stringify({...data,work_levels:levels,profile_photo:photo,experience_years:Number(data.experience_years),support_capacity:Number(data.support_capacity),existing_document_indices:documents.filter(doc=>!(doc instanceof File)).map(doc=>existing.indexOf(doc as AdvisorDocument))}))
    for(const doc of documents)if(doc instanceof File)body.append('files',doc)
    save.mutate(body)
  }
  return <form className="registration-form onboarding-card" noValidate onSubmit={e=>{e.preventDefault();if(part===1){next();return}submit(e.currentTarget)}}><Title title={part===1?'اطلاعات فردی مشاور':'سوابق و مدارک مشاور'} text="اطلاعات و مدارک پس از پذیرش شرایط، مستقیم برای تأیید مدیر سایت ارسال می‌شود."/>
    <fieldset ref={first} hidden={part!==1} disabled={part!==1} className="onboarding-fieldset"><div className="form-grid"><div className="wide"><PhotoPicker photo={photo} error={fileError} onSelect={async file=>{setFileError('');try{setPhoto(await prepareProfilePhoto(file))}catch(e){setFileError(e instanceof Error?e.message:'عکس معتبر نیست')}}}/></div><Field label="نام و نام خانوادگی"><input {...bind('full_name')} required minLength={3} maxLength={120}/></Field><Field label="کد ملی"><input {...bind('national_code')} required pattern="[0-9]{10}"/></Field><BirthDateInput value={data.birth_date||''} initialYear={1370} onChange={birth_date=>setData({...data,birth_date})}/><Field label="نشانی" wide><textarea {...bind('address')} required minLength={10} maxLength={1000}/></Field></div></fieldset>
    <fieldset hidden={part!==2} disabled={part!==2} className="onboarding-fieldset"><div className="form-grid">
      <div className="wide work-levels"><span>مقطع فعالیت<RequiredMark/></span><small className="registration-field-hint">حداقل یک مقطع؛ انتخاب هر دو مجاز است.</small><label><input type="checkbox" checked={levels.includes('lower_secondary')} onChange={e=>setLevels(e.target.checked?[...levels,'lower_secondary']:levels.filter(x=>x!=='lower_secondary'))}/> متوسطه اول</label><label><input type="checkbox" checked={levels.includes('upper_secondary')} onChange={e=>setLevels(e.target.checked?[...levels,'upper_secondary']:levels.filter(x=>x!=='upper_secondary'))}/> متوسطه دوم</label>{levels.length===0&&<small>حداقل یک مقطع را انتخاب کنید.</small>}</div>
      <Field label="مدرک تحصیلی"><input {...bind('education_degree')} required minLength={2} maxLength={80}/></Field><Field label="رشته تحصیلی"><input {...bind('education_field')} required minLength={2} maxLength={120}/></Field><Field label="سابقه کار (سال)"><input {...bind('experience_years')} type="number" min="0" max="60" required/></Field><Field label="ظرفیت سالانه"><input {...bind('support_capacity')} type="number" min="1" max="500" required/></Field><Field label="سال تحصیلی"><input {...bind('academic_year')} required minLength={7} maxLength={20}/></Field><Field label="معرفی و سابقه" wide><textarea {...bind('bio')} required minLength={20} maxLength={2000}/></Field>
      <div className="wide"><label className="file-drop"><FileUp/><b>افزودن مدارک هویتی، تحصیلی و سابقه<RequiredMark/></b><small>۲ تا ۸ فایل PDF یا JPG، PNG، WebP؛ هر فایل حداکثر ۴ مگابایت</small><input type="file" multiple accept=".pdf,image/jpeg,image/png,image/webp" onChange={e=>{files(e.target.files);e.target.value=''}}/></label><ul className="onboarding-documents">{documents.map((doc,i)=><li key={i}>{doc.name}<button type="button" aria-label={'حذف '+doc.name} onClick={()=>setDocuments(documents.filter((_,index)=>index!==i))}><X size={16}/></button></li>)}</ul></div>
    </div></fieldset>{fileError&&part===2&&<div className="form-error">{fileError}</div>}{save.error&&<ErrorText error={save.error}/>}<div className="onboarding-actions"><StepError message={formError}/>{part===1?<button type="button" className="btn btn-primary" onClick={next}>مرحله بعد: سوابق و مدارک</button>:<><button type="button" className="btn btn-outline" disabled={save.isPending} onClick={()=>{setFormError('');setPart(1);onPartChange?.(1)}}><ArrowRight/> مرحله قبل</button><button className="btn btn-primary" disabled={save.isPending}>{save.isPending?'در حال بارگذاری و ثبت مدارک…':'ذخیره و مرحله بعد'}</button></>}</div>
  </form>
}
function AverageFields({grade,data,onChange}:{grade:string;data:Record<string,string>;onChange:(name:string,value:string)=>void}){
 const map:Record<string,[number,boolean][]>={هفتم:[],هشتم:[[7,true]],نهم:[[7,false],[8,true]],دهم:[[7,false],[8,false],[9,true]],یازدهم:[[10,true]],دوازدهم:[[10,false],[11,true]],'پشت کنکوری':[[10,false],[11,true],[12,true]]}
 const names:Record<number,string>={7:'هفتم',8:'هشتم',9:'نهم',10:'دهم',11:'یازدهم',12:'دوازدهم'}
 return <div className="registration-section"><h3>سوابق تحصیلی</h3><div className="form-grid">{(map[grade]||[]).map(([n,required])=><Field key={n} label={'معدل '+names[n]+(required?' (الزامی)':' (اختیاری)')}><input name={'average_grade'+n} type="number" min="0" max="20" step="0.01" required={required} value={data['average_grade'+n]||''} onChange={e=>onChange('average_grade'+n,e.target.value)}/></Field>)}</div>{grade==='هفتم'&&<p>برای پایه هفتم نیازی به ثبت معدل سال قبل نیست.</p>}</div>
}
function Field({label,wide,children}:{label:string;wide?:boolean;children:ReactNode}){
 const id=useId()
 const control=isValidElement<{required?:boolean;name?:string;minLength?:number;min?:string;max?:string;type?:string;'aria-label'?:string;'aria-describedby'?:string;'data-field-label'?:string}>(children)?children:null
 const props=control?.props||{}
 const hint=props.name==='national_code'?'۱۰ رقم بدون خط تیره':props.name==='parent_phone'?'۱۱ رقم با شروع 09':props.name==='academic_year'?'مثلاً ۱۴۰۵-۱۴۰۶':props.type==='number'?`بین ${props.min} تا ${props.max}${props.name?.startsWith('average_grade')?'؛ تا دو رقم اعشار':''}`:props.minLength?`حداقل ${props.minLength.toLocaleString('fa-IR')} نویسه`:''
 return <label className={wide?'wide':''}><span>{label}{props.required&&<RequiredMark/>}</span>{control?cloneElement(control,{'aria-label':label,'data-field-label':label,'aria-describedby':hint?id:undefined}):children}{hint&&<small id={id} className="registration-field-hint">{hint}</small>}</label>
}
function Title({title,text}:{title:string;text:string}){return <div className="form-title"><div><h2>{title}</h2><p>{text}</p></div></div>}
function ErrorText({error}:{error:unknown}){return <div className="form-error">{error instanceof Error?error.message:'خطایی رخ داد'}</div>}
function PhotoPicker({photo,optional,error,onSelect}:{photo?:ProfilePhoto;optional?:boolean;error:string;onSelect:(file:File)=>void}){return <div className="profile-photo-picker"><div className="profile-photo-preview">{photo?<img src={photoUrl(photo)} alt="پیش‌نمایش عکس پرسنلی"/>:<Camera/>}</div><label className="btn btn-outline"><Camera size={18}/>{photo?'تغییر عکس':'انتخاب عکس پرسنلی'}{!optional&&<RequiredMark/>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void onSelect(file);e.target.value=''}}/></label><small>{optional?'اختیاری؛ ':'الزامی؛ '}JPG، PNG یا WebP؛ حداکثر ۸ مگابایت</small>{error&&<em>{error}</em>}</div>}
