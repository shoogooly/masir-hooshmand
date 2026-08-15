import type { ApiResponse, User } from './types'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

function csrf() {
  return document.cookie.split('; ').find((row) => row.startsWith('csrf_cookie='))?.split('=')[1] || ''
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf(), ...init.headers },
  })
  const body = (await response.json()) as ApiResponse<T>
  if (!response.ok || !body.success) throw new Error(body.error?.message || 'خطایی رخ داد')
  return body.data
}

export const auth = {
  me: () => api<User>('/auth/me'),
  requestOtp: (phone: string) => api<{ sent: boolean; dev_code?: string }>('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string, role: string, mfa_code?: string) => api<{ user: User; csrf_token: string }>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code, role, mfa_code }) }),
  refresh: () => api<{ user: User; csrf_token: string }>('/auth/refresh', { method: 'POST' }),
  logout: () => api('/auth/logout', { method: 'POST' }),
}
