export type Role = 'student' | 'advisor' | 'content_editor' | 'reviewer' | 'exam_designer' | 'support' | 'finance' | 'operations_admin' | 'super_admin'

export interface User { id: string; phone: string; full_name: string; role: Role; status: string }
export interface ApiResponse<T> { success: boolean; data: T; meta: Record<string, unknown>; error?: { message: string } }
export interface Activity { id: string; day: string; subject: string; title: string; planned_minutes: number; actual_minutes: number; status: string }
export interface Insight { id: string; kind: string; title: string; evidence: string; recommendation: string; confidence: number; status: string }

