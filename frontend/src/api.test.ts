// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { api } from './api'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'csrf_cookie=; Max-Age=0; path=/'
})

describe('automatic session renewal', () => {
  test('refreshes an expired CSRF cookie and repeats the original write', async () => {
    document.cookie = 'csrf_cookie=old; path=/'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(403, { success: false, error: { message: 'توکن CSRF معتبر نیست' } }))
      .mockImplementationOnce(() => {
        document.cookie = 'csrf_cookie=new; path=/'
        return Promise.resolve(json(200, { success: true, data: { user: {} } }))
      })
      .mockResolvedValueOnce(json(200, { success: true, data: { saved: true } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api<{saved:boolean}>('/profile', { method: 'PATCH', body: '{}' })).resolves.toEqual({ saved: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh')
    expect((fetchMock.mock.calls[2][1].headers as Record<string,string>)['X-CSRF-Token']).toBe('new')
  })

  test('refreshes an expired access session before repeating a read', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, { success: false, error: { message: 'نشست معتبر نیست' } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { user: {} } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { name: 'مهیاد' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api<{name:string}>('/auth/me')).resolves.toEqual({ name: 'مهیاد' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('does not loop when the refresh session has ended', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, { success: false, error: { message: 'نشست معتبر نیست' } }))
      .mockResolvedValueOnce(json(401, { success: false, error: { message: 'نشست قابل تمدید نیست' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api('/auth/me')).rejects.toThrow('نشست معتبر نیست')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
