export type Role = 'student' | 'advisor' | 'secretary' | 'upper_secondary_manager' | 'lower_secondary_manager' | 'content_editor' | 'reviewer' | 'exam_designer' | 'support' | 'finance' | 'operations_admin' | 'super_admin'

export interface User { id: string; phone: string; full_name: string; role: Role; status: string; onboarding_step?: string; referred_by_advisor_id?:string; subscription_expired?:boolean; subscription?:{expires_at:string;status:string}|null }
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
export type SchoolSchedule = Record<string,string[]>
export type ExtraClasses = Record<string,string>

export interface Profile extends User {
  grade?:string; major?:string; school?:string; goal?:string; national_code?:string; birth_date?:string
  parent_name?:string; parent_phone?:string; address?:string
  average_grade7?:number|null; average_grade8?:number|null; average_grade9?:number|null; average_grade10?:number|null; average_grade11?:number|null; average_grade12?:number|null
  education_level?:'lower_secondary'|'upper_secondary';lead_approval_status?:string;admin_approval_status?:string
  registration_review_status?:string;registration_review_note?:string;correction_return_step?:string
  lead_reviewed_by?:string;admin_reviewed_by?:string
  review_note?:string
  school_schedule?:SchoolSchedule; extra_classes?:ExtraClasses
  education_degree?:string; education_field?:string; experience_years?:number; bio?:string
  support_capacity?:number; academic_year?:string; approval_status?:string
  assigned_students?:number; remaining_capacity?:number; is_full?:boolean
}

export interface SubscriptionPlanOption { id:string;name:string;period:string;price:number;referral_price:number;features:string[];active?:boolean }
export interface AdvisorOption extends User {
  education_degree?:string;education_field?:string;experience_years?:number;bio?:string
  education_level?:'lower_secondary'|'upper_secondary'
  support_capacity:number;assigned_students:number;remaining_capacity:number;is_full:boolean
}
export interface RegistrationOptions { plans:SubscriptionPlanOption[];advisors:AdvisorOption[];school_days:string[] }

export interface AdminStudent extends User {
  created_at:string
  profile:Omit<Profile,keyof User>
  advisor?:User|null
  subscription?:{id:string;plan_name:string;expires_at:string;status:string}|null
  report?:ReportData
}
export interface AdvisorDocument {kind:string;name:string;content_type:string;content_base64:string}
export interface AdminAdvisor extends User {
  created_at:string
  profile:Omit<Profile,keyof User>&{documents_count:number;documents?:AdvisorDocument[];review_note?:string}
  students?:User[]
}
export interface AdminAudit {id:string;actor_id?:string;action:string;resource_type:string;resource_id?:string;reason:string;created_at:string}

