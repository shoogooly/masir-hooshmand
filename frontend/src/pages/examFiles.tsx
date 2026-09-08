import {formatIranDateTime} from '../utils/jalali'
export type PdfPayload={filename:string;content_type:string;content_base64:string}
export type FileResult=PdfPayload&{downloaded_at?:string}
export type AssignedExam={id:string;title:string;duration_minutes:number;instructions:string;status:string;advisor?:{id:string;full_name:string};student?:{id:string;full_name:string};question_filename:string;question_downloaded_at?:string;answer_filename?:string;student_notes:string;answer_uploaded_at?:string;elapsed_minutes?:number;analysis_text:string;resource_links:string[];lesson_filename?:string;analyzed_at?:string;created_at:string}

export const dateTime=(value?:string)=>value?formatIranDateTime(value):'ثبت نشده'

export async function pdfPayload(file:File):Promise<PdfPayload>{
  if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw new Error('فقط فایل PDF قابل بارگذاری است.')
  if(file.size>15*1024*1024)throw new Error('حجم فایل نباید بیشتر از ۱۵ مگابایت باشد.')
  const bytes=new Uint8Array(await file.arrayBuffer())
  let binary=''
  for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768))
  return {filename:file.name,content_type:'application/pdf',content_base64:btoa(binary)}
}

export function saveFile(file:FileResult){
  const bytes=Uint8Array.from(atob(file.content_base64),char=>char.charCodeAt(0))
  const url=URL.createObjectURL(new Blob([bytes],{type:file.content_type}))
  const link=document.createElement('a');link.href=url;link.download=file.filename;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export function ExamError({error}:{error:unknown}){
  return error?<div className="form-error">{error instanceof Error?error.message:'عملیات ناموفق بود'}</div>:null
}
