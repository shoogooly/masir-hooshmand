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

test('multiple lessons prompt for a saved choice, and a manual color can override it',()=>{
 client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 render(<QueryClientProvider client={client}><PlanBuilder studentId="student"/></QueryClientProvider>)
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 for(const [label,value] of [['از ساعت','08'],['از دقیقه','00'],['تا ساعت','09'],['تا دقیقه','00']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
 fireEvent.change(screen.getByLabelText('توضیحات (تا ۳ خط)'),{target:{value:'فیزیک و ریاضی'}})
 fireEvent.click(screen.getByRole('button',{name:'ثبت بازه'}))
 const choice=screen.getByRole('group',{name:'انتخاب رنگ درس'})
 fireEvent.click(within(choice).getByRole('button',{name:'ریاضی'}))
 const block=screen.getByRole('button',{name:'ویرایش بازه فیزیک و ریاضی'})
 const description=block.querySelector('b') as HTMLElement
 const timeBox=block.querySelector('small') as HTMLElement
 expect(description.style.background).toBe('rgb(181, 45, 64)')
 expect(timeBox.querySelectorAll('span')).toHaveLength(3)
 fireEvent.click(block)
 fireEvent.change(screen.getByLabelText('رنگ دلخواه بازه'),{target:{value:'#ffff00'}})
 expect(description.style.background).toBe('rgb(255, 255, 0)')
 expect(description.style.color).toBe('rgb(0, 0, 0)')
 fireEvent.click(screen.getByRole('button',{name:'ثبت بازه'}))
 expect(screen.queryByRole('group',{name:'انتخاب رنگ درس'})).toBeNull()
 fireEvent.click(block)
 fireEvent.click(screen.getByRole('button',{name:'بازگشت به رنگ خودکار'}))
 expect(description.style.background).toBe('rgb(181, 45, 64)')
})
