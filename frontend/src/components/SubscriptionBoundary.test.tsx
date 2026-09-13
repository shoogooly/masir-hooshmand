// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SubscriptionBoundary from './SubscriptionBoundary'
import { auth, SUBSCRIPTION_REQUIRED_EVENT } from '../api'
import type { User } from '../types'

vi.mock('../api', () => ({ auth: { me: vi.fn(), logout: vi.fn() }, SUBSCRIPTION_REQUIRED_EVENT: 'masir:subscription-required' }))
vi.mock('../pages/RenewalPage', () => ({ default: () => <h1>Renew subscription</h1> }))
const me = vi.mocked(auth.me)
const student: User = { id:'student',phone:'09123456789',full_name:'Student',role:'student',status:'active',subscription_expired:true,subscription:null }
const validSubscription = () => ({ server_time:new Date().toISOString(), subscription_expired:false, subscription:{status:'active', expires_at:new Date(Date.now()+60_000).toISOString()} })
const clients: QueryClient[] = []
function Path() { return <span data-testid="path">{useLocation().pathname}</span> }
function setup(path='/app/student/overview', cached?:User) {
  const client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})
  clients.push(client)
  if(cached) client.setQueryData(['me'],cached)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Path/><SubscriptionBoundary><Routes>
    <Route path="/app/*" element={<h1>Private workspace</h1>}/>
    <Route path="*" element={<h1>Public page</h1>}/>
  </Routes></SubscriptionBoundary></MemoryRouter></QueryClientProvider>)
  return client
}
beforeEach(()=>vi.resetAllMocks())
afterEach(()=>{cleanup();clients.splice(0).forEach(client=>client.clear())})

test.each(['/app','/app/student/subscription','/app/student/subscription-offer','/app/student/plans','/app/anything/subscription','/','/register'])('expired account is locked on %s',async path=>{
  me.mockResolvedValue(student)
  setup(path)
  expect(await screen.findByRole('heading',{name:'Renew subscription'})).toBeTruthy()
  expect(screen.queryByText('Private workspace')).toBeNull()
  expect(screen.getByTestId('path').textContent).toBe('/app/renewal')
})

test('valid subscription can enter the workspace',async()=>{
  me.mockResolvedValue({...student,subscription_expired:false,server_time:new Date().toISOString(),subscription:{status:'active',expires_at:new Date(Date.now()+60_000).toISOString()}})
  setup()
  expect(await screen.findByText('Private workspace')).toBeTruthy()
})

test('missing subscription flag cannot unlock an active student',async()=>{
  me.mockResolvedValue({...student,subscription_expired:undefined})
  setup()
  expect(await screen.findByText('Renew subscription')).toBeTruthy()
})

test('API denial immediately removes the workspace and cached private data',async()=>{
  const active={...student,...validSubscription()}
  me.mockResolvedValue(active)
  const client=setup()
  expect(await screen.findByText('Private workspace')).toBeTruthy()
  client.setQueryData(['plans'],[{secret:'private material'}])
  me.mockResolvedValue(student)
  act(()=>window.dispatchEvent(new Event(SUBSCRIPTION_REQUIRED_EVENT)))
  expect(await screen.findByText('Renew subscription')).toBeTruthy()
  await waitFor(()=>expect(client.getQueryData(['plans'])).toBeUndefined())
})

test('expiry while the page is open locks without navigation',async()=>{
  me.mockResolvedValueOnce({...student,subscription_expired:false,server_time:new Date().toISOString(),subscription:{status:'active',expires_at:new Date(Date.now()+300).toISOString()}}).mockResolvedValue(student)
  setup()
  expect(await screen.findByText('Private workspace')).toBeTruthy()
  expect(await screen.findByText('Renew subscription',{}, {timeout:2000})).toBeTruthy()
})

test('verified renewal returns to the workspace',async()=>{
  me.mockResolvedValue(student)
  const client=setup('/app/renewal')
  expect(await screen.findByText('Renew subscription')).toBeTruthy()
  me.mockResolvedValue({...student,...validSubscription()})
  await act(async()=>{await client.invalidateQueries({queryKey:['me']})})
  expect(await screen.findByText('Private workspace')).toBeTruthy()
  expect(screen.getByTestId('path').textContent).toBe('/app/student/overview')
})

test('failed verification does not reveal a cached workspace or loop redirects',async()=>{
  me.mockRejectedValue(new Error('offline'))
  setup('/app/student/overview',{...student,...validSubscription()})
  expect(await screen.findByText('بررسی دسترسی ممکن نشد. لطفاً دوباره تلاش کنید.')).toBeTruthy()
  expect(screen.queryByText('Private workspace')).toBeNull()
})

test('advisor does not need a student subscription',async()=>{
  me.mockResolvedValue({...student,role:'advisor'})
  setup('/app/advisor/overview')
  expect(await screen.findByText('Private workspace')).toBeTruthy()
})
