// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'
import {PlanBuilder} from './OperationalPages'
import {api} from '../api'
vi.mock('../api',()=>({api:vi.fn(async(path:string)=>path==='/plans'?[]:null)}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear()})
function setup(){client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><PlanBuilder studentId="student"/></QueryClientProvider>)}
function editDescription(value:string){const description=screen.getByRole('textbox',{name:'توضیحات بازه'}) as HTMLElement;description.textContent=value;description.innerText=value;fireEvent.input(description);return description}

test('three description lines stay editable in the range and its actions stay beside it',()=>{
 const {container}=setup()
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 const description=editDescription('مطالعه\nتمرین\nمرور')
 expect(description.textContent).toBe('مطالعه\nتمرین\nمرور')
 expect(screen.queryByRole('dialog')).toBeNull()
 const block=screen.getByRole('button',{name:/ویرایش بازه مطالعه/})
 expect(within(block).getByRole('button',{name:'حذف بازه'})).toBeTruthy()
 expect(within(block).getByRole('button',{name:'کپی بازه'})).toBeTruthy()
 expect(within(block).getByRole('button',{name:'رنگ بازه'})).toBeTruthy()
 expect(within(block).getByRole('button',{name:'کتاب بازه'})).toBeTruthy()
 expect(within(block).getByRole('button',{name:'مباحث بازه'})).toBeTruthy()
 fireEvent.click(within(block).getByRole('button',{name:'حذف بازه'}))
 expect(screen.queryByRole('button',{name:/ویرایش بازه مطالعه/})).toBeNull()
 expect(container.querySelector('.range-inline-tools')).toBeNull()
})

test('a manual range color can override and then restore its subject color',()=>{
 setup()
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 editDescription('فیزیک و ریاضی')
 const block=screen.getByRole('button',{name:'ویرایش بازه فیزیک و ریاضی'})
 fireEvent.click(within(block).getByRole('button',{name:'رنگ بازه'}))
 const color=screen.getByLabelText('رنگ دلخواه بازه')
 fireEvent.change(color,{target:{value:'#ffff00'}})
 expect((block.querySelector('.timeline-inline-description') as HTMLElement).style.background).toBe('rgb(255, 255, 184)')
 fireEvent.click(screen.getByRole('button',{name:'رنگ خودکار درس'}))
 expect((block.querySelector('.timeline-inline-description') as HTMLElement).style.background).not.toBe('rgb(255, 255, 184)')
})

test('topic picker shows only final branches with their full path and prior count',async()=>{
 vi.mocked(api).mockImplementation(async(path)=>path.endsWith('/planner-topics')?[
  {id:'root',subject:'فیزیک',title:'فیزیک',path:'فیزیک',grade:'دوازدهم',major:'تجربی',calendar_title:'تقویم',used_count:0,depth:1,is_leaf:false},
  {id:'chapter',subject:'فیزیک',title:'فصل ۱',path:'فیزیک ← فصل ۱',grade:'دوازدهم',major:'تجربی',calendar_title:'تقویم',used_count:0,depth:2,is_leaf:false},
  {id:'leaf',subject:'فیزیک',title:'حرکت',path:'فیزیک ← فصل ۱ ← درس ۱ ← حرکت',grade:'دوازدهم',major:'تجربی',calendar_title:'تقویم',used_count:2,depth:4,is_leaf:true}
 ] as never:path==='/plans'?[] as never:null as never)
 setup()
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 editDescription('فیزیک')
 const block=screen.getByRole('button',{name:/ویرایش بازه فیزیک/})
 fireEvent.click(within(block).getByRole('button',{name:'مباحث بازه'}))
 expect(await screen.findByText('دوازدهم · فصل ۱، درس ۱، حرکت')).toBeTruthy()
 expect(screen.getByText('۲ بار')).toBeTruthy()
 expect(screen.queryByText('دوازدهم · فصل ۱')).toBeNull()
 fireEvent.click(screen.getByRole('checkbox'))
 await waitFor(()=>expect(screen.getByRole('textbox',{name:'توضیحات بازه'}).textContent).toContain('حرکت'))
 expect(screen.getByRole('textbox',{name:'توضیحات بازه'}).textContent).not.toContain('فصل ۱')
})
