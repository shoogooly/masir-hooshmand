// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
import { PlanBuilder } from './OperationalPages'
vi.mock('../api',()=>({api:vi.fn(async(path:string)=>path==='/plans'?[]:null)}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear()})
test('new ranges are empty and stay after the last entry, even when earlier gaps exist',()=>{
 client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 render(<QueryClientProvider client={client}><PlanBuilder studentId="student"/></QueryClientProvider>)
 const add=screen.getAllByRole('button',{name:/افزودن بازه برای/})[0]
 const day=add.closest('section')!
 function rows(){return Array.from(day.querySelectorAll<HTMLElement>('.timeline-item-editor'))}
 function time(row:HTMLElement,label:string,hour:string){fireEvent.change(within(row).getByLabelText(label+' ساعت'),{target:{value:hour}});fireEvent.change(within(row).getByLabelText(label+' دقیقه'),{target:{value:'00'}})}
 fireEvent.click(add);time(rows()[0],'از','08');time(rows()[0],'تا','09')
 fireEvent.change(within(rows()[0]).getByRole('textbox',{name:'توضیحات (تا ۳ خط)'}),{target:{value:'مطالعه\nتمرین\nمرور'}})
 fireEvent.click(add);time(rows()[1],'از','12');time(rows()[1],'تا','13')
 fireEvent.click(add)
 expect(rows()).toHaveLength(3)
 for(const label of ['از ساعت','از دقیقه','تا ساعت','تا دقیقه'])expect((within(rows()[2]).getByLabelText(label) as HTMLInputElement).value).toBe('')
 expect((within(rows()[0]).getByLabelText('از ساعت') as HTMLInputElement).value).toBe('08')
 expect((within(rows()[1]).getByLabelText('از ساعت') as HTMLInputElement).value).toBe('12')
 time(rows()[2],'از','10');time(rows()[2],'تا','11')
 expect((within(rows()[2]).getByLabelText('از ساعت') as HTMLInputElement).value).toBe('10')
 const text=day.querySelector('.timeline-block b')!
 expect(text.textContent).toBe('مطالعه\nتمرین\nمرور')
 expect(text.nextElementSibling?.tagName).toBe('SMALL')
 expect(day.querySelector('.timeline-detail-cards')).toBeNull()
})
