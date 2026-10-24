import type { ApiResponse, User } from './types'

export const SUBSCRIPTION_REQUIRED_EVENT = 'masir:subscription-required'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

let refreshInFlight: Promise<boolean> | null = null

const AUTH_ROUTES_WITHOUT_SESSION = new Set([
  '/auth/login',
  '/auth/staff-login',
  '/auth/register',
  '/auth/request-otp',
  '/auth/verify-otp',
  '/auth/password-recovery/request',
  '/auth/password-recovery/complete',
  '/auth/refresh',
])

function csrf() {
  return document.cookie.split('; ').find((row) => row.startsWith('csrf_cookie='))?.split('=')[1] || ''
}

async function readResponse<T>(response: Response): Promise<{ body?: ApiResponse<T>; error?: Error }> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    if (response.status === 502 || response.status === 503)
      return { error: new Error('سرویس موقتاً در دسترس نیست؛ چند لحظه دیگر دوباره تلاش کنید.') }
    return { error: new Error('پاسخ نامعتبر از سرور دریافت شد.') }
  }
  return { body: (await response.json()) as ApiResponse<T> }
}

async function renewSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
        })
        const { body } = await readResponse(response)
        return Boolean(response.ok && body?.success)
      } catch {
        return false
      }
    })().finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

function needsSessionRenewal<T>(path: string, response: Response, body?: ApiResponse<T>) {
  if (AUTH_ROUTES_WITHOUT_SESSION.has(path)) return false
  return response.status === 401 ||
    (response.status === 403 && body?.error?.message === 'توکن CSRF معتبر نیست')
}

async function request<T>(path: string, init: RequestInit): Promise<{ response: Response; body?: ApiResponse<T>; error?: Error }> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      'X-CSRF-Token': csrf(),
      ...init.headers,
    },
  })
  return { response, ...(await readResponse<T>(response)) }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let result = await request<T>(path, init)
  if (needsSessionRenewal(path, result.response, result.body) && await renewSession())
    result = await request<T>(path, init)
  const { response, body, error } = result
  if (error) throw error
  if (!body) throw new Error('پاسخ نامعتبر از سرور دریافت شد.')
  if (!response.ok || !body.success) {
    if (body.error?.code === 'SUBSCRIPTION_REQUIRED')
      window.dispatchEvent(new Event(SUBSCRIPTION_REQUIRED_EVENT))
    throw new Error(body.error?.message || 'خطایی رخ داد')
  }
  return body.data
}

export const auth = {
  me: () => api<User>('/auth/me'),
  requestOtp: (phone: string) => api<{ sent: boolean; dev_code?: string }>('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string, role: string, mfa_code?: string) => api<{ user: User; csrf_token: string }>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code, role, mfa_code }) }),
  register: (phone: string, role: string, sms_code: string, password: string, password_confirm: string) => api<{ user: User; message: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ phone, role, sms_code, password, password_confirm }) }),
  login: (phone: string, password: string) => api<{ user: User; csrf_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
  staffLogin: (phone: string, code: string) => api<{ user: User; csrf_token: string }>('/auth/staff-login', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  onboarding: () => api<{ user: User; step: string }>('/onboarding/status'),
  refresh: () => api<{ user: User; csrf_token: string }>('/auth/refresh', { method: 'POST' }),
  logout: () => api('/auth/logout', { method: 'POST' }),
}
