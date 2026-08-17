// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import WorkspacePage from './WorkspacePage'
import type { User } from '../types'

vi.mock('../api',()=>({
  auth:{logout:vi.fn()},
  api:vi.fn((path:string)=>{
    if(path==='/students/dashboard')return Promise.resolve({user:student,profile:{goal:'پزشکی'},progress:0,study_minutes:0,activities:[],exams:[],insights:[]})
    if(path==='/plans')return Promise.resolve([])
    return Promise.resolve([])
  }),
}))

const student:User={id:'student-1',phone:'09120000001',full_name:'پارسا رضایی',role:'student',status:'active'}

function setup(){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/app/student/overview']}><WorkspacePage user={student}/></MemoryRouter></QueryClientProvider>)
}

test('student sidebar opens the real plan route',async()=>{
  setup()
  fireEvent.click(screen.getByRole('button',{name:/برنامه من/}))
  expect(await screen.findByText('هنوز برنامه‌ای برای شما منتشر نشده است.')).toBeTruthy()
  expect(screen.getByRole('button',{name:/برنامه من/}).className).toContain('selected')
})
