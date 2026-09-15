// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
import { PlanBuilder } from './OperationalPages'
vi.mock('../api',()=>({api:vi.fn(async(path:string)=>path==='/plans'?[]:null)}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear()})
test('time and three-line descriptions are edited on the chart, with new ranges empty',()=>{
 client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 const {container}=render(<QueryClientProvider client={client}><PlanBuilder studentId="student"/></QueryClientProvider>)
 const add=screen.getAllByRole('button',{name:/افزودن بازه برای/})[0]
 function time(label:string,hour:string){fireEvent.change(screen.getByLabelText(label+' ساعت'),{target:{value:hour}});fireEvent.change(screen.getByLabelText(label+' دقیقه'),{target:{value:'00'}})}
 fireEvent.click(add);time('از','08');time('تا','09')
 fireEvent.change(screen.getByLabelText('توضیحات (تا ۳ خط)'),{target:{value:'مطالعه\nتمرین\nمرور'}})
 expect(screen.getByRole('dialog').closest('.editable-chart-surface')).not.toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'ثبت بازه'}))
 expect(screen.queryByRole('dialog')).toBeNull()
 fireEvent.click(add)
 for(const label of ['از ساعت','از دقیقه','تا ساعت','تا دقیقه'])expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('')
 time('از','12');time('تا','13')
 fireEvent.change(screen.getByLabelText('توضیحات (تا ۳ خط)'),{target:{value:'دوم'}})
 fireEvent.click(screen.getByRole('button',{name:'ثبت بازه'}))
 fireEvent.click(screen.getByRole('button',{name:/ویرایش بازه مطالعه/}))
 expect((screen.getByLabelText('از ساعت') as HTMLInputElement).value).toBe('08')
 expect((screen.getByLabelText('توضیحات (تا ۳ خط)') as HTMLTextAreaElement).value).toBe('مطالعه\nتمرین\nمرور')
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'حذف بازه'}))
 expect(screen.queryByRole('button',{name:/ویرایش بازه مطالعه/})).toBeNull()
 expect(screen.getByRole('button',{name:'ویرایش بازه دوم'})).toBeTruthy()
 expect(container.querySelector('.timeline-item-editors')).toBeNull()
})
