// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
import UniversalChatPage from './UniversalChatPage'
import { api } from '../api'
import type { User } from '../types'
vi.mock('../api',()=>({api:vi.fn()}))
const student:User={id:'student',full_name:'دانش آموز آزمایشی',phone:'09120000001',role:'student',status:'active'}
const admin={id:'admin',full_name:'مدیر سایت',phone:'09120000003',role:'super_admin',status:'active',locked:true,chat_request_allowed:true,chat_requested_today:false}
let client:QueryClient
function setup(){client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});render(<QueryClientProvider client={client}><UniversalChatPage user={student}/></QueryClientProvider>)}
afterEach(()=>{cleanup();client?.clear();vi.resetAllMocks()})
test('locked student can request once, without unlocking the composer',async()=>{
 let requested=false
 vi.mocked(api).mockImplementation(async(path)=>{
  if(path==='/chat/contacts')return [{...admin,chat_request_allowed:!requested,chat_requested_today:requested}] as never
  if(path==='/notifications/summary')return {unread_by_sender:{}} as never
  if(path==='/chat/access-requests/admin'){requested=true;return {sent:true} as never}
  return [] as never
 })
 setup();fireEvent.click(await screen.findByRole('button',{name:/مدیر سایت/}))
 expect(screen.queryByPlaceholderText('پیام خود را بنویسید...')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'درخواست چت با مدیریت سایت را دارم'}))
 await waitFor(()=>expect((screen.getByRole('button',{name:'درخواست امروز ثبت شده است'}) as HTMLButtonElement).disabled).toBe(true))
 expect(vi.mocked(api).mock.calls.filter(([path])=>path==='/chat/access-requests/admin')).toHaveLength(1)
 expect(screen.queryByPlaceholderText('پیام خود را بنویسید...')).toBeNull()
})
test('selected conversation reflects an admin unlock and relock without reselection',async()=>{
 vi.mocked(api).mockImplementation(async(path)=>path==='/chat/contacts'?[admin] as never:path==='/notifications/summary'?{unread_by_sender:{}} as never:[] as never)
 setup();fireEvent.click(await screen.findByRole('button',{name:/مدیر سایت/}))
 await act(async()=>{client.setQueryData(['chat-contacts'],[{...admin,locked:false,chat_request_allowed:false}])})
 expect(await screen.findByPlaceholderText('پیام خود را بنویسید...')).toBeTruthy()
 await act(async()=>{client.setQueryData(['chat-contacts'],[admin])})
 await waitFor(()=>expect(screen.queryByPlaceholderText('پیام خود را بنویسید...')).toBeNull())
})
