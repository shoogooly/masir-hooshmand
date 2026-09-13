// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../api'
import PasswordRecoveryPage from './PasswordRecoveryPage'
import PasswordChange from '../components/PasswordChange'
vi.mock('../api', () => ({ api: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
function setup(component: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{component}</MemoryRouter></QueryClientProvider>)
}
test('demo recovery validates matching passwords and submits challenge', async () => {
  vi.mocked(api).mockResolvedValueOnce({challenge_id:'challenge',dev_code:'748291',retry_after:60,message:'کد بازیابی'}).mockResolvedValueOnce({})
  setup(<PasswordRecoveryPage/>)
  fireEvent.change(screen.getByLabelText('شماره موبایل ثبت‌شده'), {target:{value:'09123456789'}})
  fireEvent.click(screen.getByRole('button',{name:'دریافت کد بازیابی'}))
  expect(await screen.findByText('748291')).toBeTruthy()
  expect(screen.getByText(/پیامکی ارسال نمی‌شود/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('کد تأیید'),{target:{value:'748291'}})
  fireEvent.change(screen.getByLabelText('رمز جدید'),{target:{value:'new-password'}})
  fireEvent.change(screen.getByLabelText('تکرار رمز جدید'),{target:{value:'different-password'}})
  fireEvent.click(screen.getByRole('button',{name:'تأیید کد و ثبت رمز جدید'}))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(api).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('تکرار رمز جدید'),{target:{value:'new-password'}})
  fireEvent.click(screen.getByRole('button',{name:'تأیید کد و ثبت رمز جدید'}))
  expect(await screen.findByText(/رمز با موفقیت تغییر کرد/)).toBeTruthy()
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toEqual({challenge_id:'challenge',code:'748291',password:'new-password',password_confirm:'new-password'})
})
test('change includes old password and handles rejection', async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error('رمز فعلی صحیح نیست')).mockResolvedValueOnce({})
  setup(<PasswordChange/>)
  fireEvent.click(screen.getByRole('button',{name:'تغییر رمز ورود'}))
  for (const [label,value] of [['رمز فعلی','old-password'],['رمز جدید','new-password'],['تکرار رمز جدید','new-password']]) fireEvent.change(screen.getByLabelText(label),{target:{value}})
  fireEvent.click(screen.getByRole('button',{name:'ثبت رمز جدید'}))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','رمز فعلی صحیح نیست')
  fireEvent.click(screen.getByRole('button',{name:'ثبت رمز جدید'}))
  expect(await screen.findByText(/نشست‌های قبلی بسته شدند/)).toBeTruthy()
})
