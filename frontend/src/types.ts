export type Role = 'student' | 'advisor' | 'content_editor' | 'reviewer' | 'exam_designer' | 'support' | 'finance' | 'operations_admin' | 'super_admin'

export interface User { id: string; phone: string; full_name: string; role: Role; status: string }
export interface ApiResponse<T> { success: boolean; data: T; meta: Record<string, unknown>; error?: { message: string } }
export interface Activity { id: string; day: string; subject: string; title: string; planned_minutes: number; actual_minutes: number; status: string }
export interface Insight { id: string; kind: string; title: string; evidence: string; recommendation: string; confidence: number; status: string }

export interface PlanActivity extends Activity { start_time:string; end_time:string; test_count:number; note:string }
export interface PlanDay { label:string; date:string }
export interface TimeSlot { start:string; end:string }
export interface WeeklyPlan { id:string; student_id:string; title:string; week_label:string; version:number; status:string; published_at?:string; day_start_time?:string; day_end_time?:string; weekly_mission?:string; days:PlanDay[]; time_slots:TimeSlot[]; activities:PlanActivity[] }
export interface ReportData { summary:{progress:number;planned_minutes:number;actual_minutes:number;test_count:number;completed:number;total:number}; subjects:{subject:string;planned_minutes:number;actual_minutes:number;tests:number;completed:number;total:number}[]; activities:PlanActivity[]; results:{id:string;exam_id:string;title:string;score:number;correct:number;wrong:number;unanswered:number;submitted_at:string}[]; insights:{id:string;title:string;recommendation:string;confidence:number}[] }
export interface Message { id:string;sender_id:string;recipient_id:string;body:string;created_at:string;read_at?:string }
export interface ExamListItem { id:string;title:string;duration_minutes:number;version:number;question_count:number;session?:{id:string;status:string;score?:number} }
export interface Profile extends User { grade?:string;major?:string;school?:string;goal?:string }

