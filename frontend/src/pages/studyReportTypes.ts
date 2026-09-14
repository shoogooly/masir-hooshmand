export type ActivityValues = {status?:'done'|'not_done'|null;actual_minutes?:number|null;question_count?:number|null;correct?:number|null;wrong?:number|null;unanswered?:number|null;quality?:string|null;not_done_reason?:string|null}
export type DayValues = {focus?:number|null;distractions?:string|null;energy?:number|null;sleep_hours?:number|null;stress?:number|null;stress_source?:string|null}
export type ReportRecord<T> = {values:T;version:number;updated_at?:string}
export type StudyReports = {activities:Record<string,ReportRecord<ActivityValues>>;days:Record<string,ReportRecord<DayValues>>;editable:boolean;editable_until:string;starts_at:string;ends_at:string;server_time:string}
const value=(n:number)=>n.toLocaleString('fa-IR')
export function activityLines(r:ActivityValues = {},unansweredLabel='بی‌پاسخ'){
 const lines:string[]=[]
 if(r.status)lines.push(r.status==='done'?'انجام شد':'انجام نشد')
 if(r.status==='not_done'){if(r.not_done_reason)lines.push('دلیل انجام نشدن: '+r.not_done_reason);return lines}
 if(r.actual_minutes!=null)lines.push('زمان انجام: '+value(r.actual_minutes)+' دقیقه')
 if(r.question_count!=null)lines.push('تعداد سؤال: '+value(r.question_count))
 const counts=([['correct','درست'],['wrong','غلط'],['unanswered',unansweredLabel]] as const).filter(([k])=>r[k]!=null).map(([k,label])=>label+': '+value(r[k]!))
 if(counts.length)lines.push(counts.join(' · '))
 if(r.quality)lines.push('ارزیابی کیفیت: '+r.quality)
 return lines
}
export function dayLines(r:DayValues = {}){
 const lines:string[]=[]
 if(r.focus!=null)lines.push('تمرکز: '+value(r.focus)+' از ۵')
 if(r.energy!=null)lines.push('انرژی: '+value(r.energy)+' از ۵')
 if(r.sleep_hours!=null)lines.push('خواب شب قبل: '+value(r.sleep_hours)+' ساعت')
 if(r.stress!=null)lines.push('استرس: '+value(r.stress)+' از ۵')
 if(r.distractions)lines.push('عوامل حواس‌پرتی: '+r.distractions)
 if(r.stress_source)lines.push('منشأ استرس: '+r.stress_source)
 return lines
}
