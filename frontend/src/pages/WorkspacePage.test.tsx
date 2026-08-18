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
    if(path==='/profile')return Promise.resolve({...student,goal:'پزشکی'})
    if(path==='/students/advisor')return Promise.resolve({id:'advisor-1',phone:'09120000002',full_name:'مریم احمدی',role:'advisor',status:'active'})
    if(path==='/students/dashboard')return Promise.resolve({user:student,profile:{goal:'پزشکی'},progress:0,study_minutes:0,activities:[],exams:[],insights:[]})
    if(path==='/plans')return Promise.resolve([{id:'plan-1',student_id:'student-1',title:'برنامه هفتگی',week_label:'هفته جاری',version:2,status:'published',day_start_time:'08:00',day_end_time:'24:00',weekly_mission:'مرور کامل فصل سوم',days:[{label:'شنبه',date:'۱۴۰۵/۰۵/۲۷'}],time_slots:[],activities:[{id:'activity-1',day:'شنبه',subject:'برنامه',title:'مطالعه ریاضی',start_time:'08:00',end_time:'10:00',planned_minutes:120,actual_minutes:0,test_count:0,status:'pending',note:''}]}])
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
  expect(await screen.findByText('مطالعه ریاضی')).toBeTruthy()
  expect(screen.getByText('۱۴۰۵/۰۵/۲۷')).toBeTruthy()
  expect(screen.getByText(/مباحث هفتگی.*پارسا رضایی/)).toBeTruthy()
  expect(screen.getByText(/مشاور و برنامه‌ریز درسی.*مریم احمدی/)).toBeTruthy()
  expect(screen.getByText('مرور کامل فصل سوم',{selector:'.student-mission-card p'})).toBeTruthy()
  expect(screen.getByText(/افراد با انگیزه/)).toBeTruthy()
  expect(screen.getByText('مطالعه ریاضی').closest('.timeline-block')?.className).toContain('pdf-font-md')
  expect(screen.getByRole('button',{name:/دانلود PDF/})).toBeTruthy()
  expect(screen.getByRole('button',{name:/برنامه من/}).className).toContain('selected')
})
